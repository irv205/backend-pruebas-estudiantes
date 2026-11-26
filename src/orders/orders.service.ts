import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  MembershipRole,
  NotificationType,
  Order,
  OrderItem,
  OrderStatus,
  PaymentOutcome,
  PaymentSimulation,
  Prisma,
  Space,
} from '@prisma/client';
import { AuthUser } from '../common/types/auth-user';
import { getPageParams, paginate } from '../common/pagination/pagination';
import { isUuid } from '../common/utils/uuid.util';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { RealtimeEventsService } from '../realtime/realtime-events.service';
import { QueryOrdersDto } from './dto/query-orders.dto';

const CREATE_OPERATION = 'CREATE_ORDER';

export interface OrderDetail extends Order {
  items: OrderItem[];
  payments: PaymentSimulation[];
}

export interface OrderResponse {
  data: OrderDetail;
}

/** La clave es obligatoria y acotada; se recomienda un UUID generado por el cliente. */
export function assertIdempotencyKey(value: string | undefined): string {
  const key = value?.trim();
  if (!key || key.length > 200) {
    throw new UnprocessableEntityException({
      code: 'VALIDATION_ERROR',
      message: 'Revisa los campos enviados.',
      fields: {
        'Idempotency-Key': [
          'La cabecera Idempotency-Key es obligatoria y no puede exceder 200 caracteres.',
        ],
      },
    });
  }
  return key;
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

/**
 * Pedidos: el stock se descuenta dentro de la transacción de creación, los
 * precios se guardan como snapshot y la idempotencia se persiste por
 * (spaceId, userId, key) con la respuesta completa.
 */
@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly realtime: RealtimeEventsService,
  ) {}

  async create(user: AuthUser, space: Space, key: string): Promise<OrderResponse> {
    const response = await this.createInternal(user, space, key);
    await this.realtime.recordSafely(space.id, 'ORDER', {
      action: 'created',
      resourceType: 'ORDER',
      resourceId: response.data.id,
      status: response.data.status,
    });
    return response;
  }

  private async createInternal(user: AuthUser, space: Space, key: string): Promise<OrderResponse> {
    const where = {
      spaceId_userId_key: { spaceId: space.id, userId: user.id, key },
    };

    const replayed = await this.prisma.idempotencyRecord.findUnique({ where });
    if (replayed) return this.replay(replayed.responseSnapshot, key);

    // Un reintento concurrente puede ganar/ceder la inserción de la clave;
    // en ese caso se devuelve la respuesta ya persistida (2 intentos como tope).
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        return await this.prisma.$transaction(async (tx) => {
          const existing = await tx.idempotencyRecord.findUnique({ where });
          if (existing) return this.replay(existing.responseSnapshot, key);

          const cart = await tx.cart.findUnique({
            where: { spaceId_userId: { spaceId: space.id, userId: user.id } },
            include: { items: { include: { product: true }, orderBy: { createdAt: 'asc' } } },
          });
          if (!cart || cart.items.length === 0) {
            throw new ConflictException({
              code: 'EMPTY_CART',
              message: 'Añade productos al carrito antes de crear el pedido.',
            });
          }

          const currency = cart.items[0].product.currency;
          let total = 0;
          const snapshots: Array<{
            productId: string;
            quantity: number;
            unitPrice: number;
            currency: string;
            name: string;
            description: string | null;
          }> = [];

          for (const item of cart.items) {
            const product = item.product;
            if (product.spaceId !== space.id || product.status !== 'ACTIVE') {
              throw new ConflictException({
                code: 'PRODUCT_UNAVAILABLE',
                message: `El producto ${product.name} ya no está disponible.`,
              });
            }
            if (product.currency !== currency) {
              throw new ConflictException({
                code: 'CURRENCY_MISMATCH',
                message: `El carrito mezcla ${currency} y ${product.currency}.`,
              });
            }
            // Comparación y descuento atómicos: nunca queda stock negativo.
            const updated = await tx.product.updateMany({
              where: {
                id: product.id,
                spaceId: space.id,
                stock: { gte: item.quantity },
              },
              data: { stock: { decrement: item.quantity } },
            });
            if (updated.count === 0) {
              throw new ConflictException({
                code: 'INSUFFICIENT_STOCK',
                message: `Stock insuficiente para ${product.name}.`,
                fields: { quantity: [`Quedan ${product.stock} unidades.`] },
              });
            }
            total += product.price * item.quantity;
            snapshots.push({
              productId: product.id,
              quantity: item.quantity,
              unitPrice: product.price,
              currency: product.currency,
              name: product.name,
              description: product.description,
            });
          }

          const order = await tx.order.create({
            data: {
              spaceId: space.id,
              ownerId: user.id,
              status: OrderStatus.PENDING_PAYMENT,
              currency,
              total,
              idempotencyKey: key,
              items: { create: snapshots },
            },
          });
          await tx.cartItem.deleteMany({ where: { cartId: cart.id } });

          const persistedItems = await tx.orderItem.findMany({
            where: { orderId: order.id },
            orderBy: { createdAt: 'asc' },
          });
          // Guardamos la respuesta exacta: un reintento con la misma clave la
          // devuelve idéntica (mismo id, mismo status y mismos ítems).
          const response: OrderResponse = {
            data: { ...order, items: persistedItems, payments: [] },
          };

          await tx.idempotencyRecord.create({
            data: {
              spaceId: space.id,
              userId: user.id,
              key,
              operation: CREATE_OPERATION,
              responseSnapshot: response as unknown as Prisma.InputJsonValue,
            },
          });
          return response;
        });
      } catch (error: unknown) {
        if (isUniqueViolation(error) && attempt === 0) {
          const winner = await this.prisma.idempotencyRecord.findUnique({ where });
          if (winner) return this.replay(winner.responseSnapshot, key);
        }
        throw error;
      }
    }
    throw new ConflictException({
      code: 'IDEMPOTENCY_CONFLICT',
      message: 'No se pudo registrar la clave de idempotencia. Reintenta con la misma clave.',
    });
  }

  async list(user: AuthUser, space: Space, role: MembershipRole, query: QueryOrdersDto) {
    const { page, limit, skip, take } = getPageParams(query);
    const where: Prisma.OrderWhereInput = { spaceId: space.id };
    if (role !== MembershipRole.ADMINISTRADOR) where.ownerId = user.id;
    if (query.status) where.status = query.status;

    const [orders, total] = await this.prisma.$transaction([
      this.prisma.order.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: { items: true, payments: { orderBy: { attempt: 'asc' } } },
      }),
      this.prisma.order.count({ where }),
    ]);
    return paginate(orders, total, page, limit);
  }

  async detail(user: AuthUser, space: Space, role: MembershipRole, id: string): Promise<OrderResponse> {
    this.assertUuid(id, 'id');
    return { data: await this.findOrder(space.id, user.id, role, id) };
  }

  async pay(
    user: AuthUser,
    space: Space,
    role: MembershipRole,
    id: string,
    outcome: PaymentOutcome,
  ): Promise<OrderResponse> {
    this.assertUuid(id, 'id');
    const result = await this.prisma.$transaction(async (tx) => {
      const order = await this.findOrderIn(tx, space.id, user.id, role, id);
      if (order.status !== OrderStatus.PENDING_PAYMENT) {
        throw this.invalidTransition(order.status);
      }

      const attempt = (await tx.paymentSimulation.count({ where: { orderId: order.id } })) + 1;
      const nextStatus =
        outcome === PaymentOutcome.APPROVED
          ? OrderStatus.PAID
          : outcome === PaymentOutcome.REJECTED
            ? OrderStatus.FAILED
            : OrderStatus.PENDING_PAYMENT;
      const restore = outcome === PaymentOutcome.REJECTED && !order.stockRestored;

      const updated = await tx.order.updateMany({
        where: { id: order.id, spaceId: space.id, status: OrderStatus.PENDING_PAYMENT },
        data: {
          status: nextStatus,
          version: { increment: 1 },
          ...(restore ? { stockRestored: true } : {}),
        },
      });
      if (updated.count === 0) throw this.invalidTransition(order.status);

      await tx.paymentSimulation.create({
        data: {
          orderId: order.id,
          outcome,
          attempt,
          message: this.paymentMessage(outcome),
        },
      });
      if (restore) await this.restoreStock(tx, order.id, space.id);

      return { data: await this.findOrderIn(tx, space.id, user.id, role, order.id) };
    });
    await this.realtime.recordSafely(space.id, 'ORDER', {
      action: 'updated',
      resourceType: 'ORDER',
      resourceId: result.data.id,
      status: result.data.status,
    });
    if (outcome === PaymentOutcome.APPROVED) {
      await this.notifySafely(
        space.id,
        result.data.ownerId,
        NotificationType.ORDER_APPROVED,
        'Pedido aprobado',
        `El pedido ${result.data.id} fue aprobado (pago simulado).`,
        result.data.id,
      );
    }
    return result;
  }

  async cancel(
    user: AuthUser,
    space: Space,
    role: MembershipRole,
    id: string,
  ): Promise<OrderResponse> {
    this.assertUuid(id, 'id');
    const result = await this.prisma.$transaction(async (tx) => {
      const order = await this.findOrderIn(tx, space.id, user.id, role, id);
      if (
        order.status !== OrderStatus.PENDING_PAYMENT &&
        order.status !== OrderStatus.PAID
      ) {
        throw this.invalidTransition(order.status);
      }

      const restore = !order.stockRestored;
      const updated = await tx.order.updateMany({
        where: {
          id: order.id,
          spaceId: space.id,
          status: { in: [OrderStatus.PENDING_PAYMENT, OrderStatus.PAID] },
        },
        data: {
          status: OrderStatus.CANCELLED,
          version: { increment: 1 },
          ...(restore ? { stockRestored: true } : {}),
        },
      });
      if (updated.count === 0) throw this.invalidTransition(order.status);
      if (restore) await this.restoreStock(tx, order.id, space.id);

      return { data: await this.findOrderIn(tx, space.id, user.id, role, order.id) };
    });
    await this.realtime.recordSafely(space.id, 'ORDER', {
      action: 'updated',
      resourceType: 'ORDER',
      resourceId: result.data.id,
      status: result.data.status,
    });
    await this.notifySafely(
      space.id,
      result.data.ownerId,
      NotificationType.ORDER_CANCELLED,
      'Pedido cancelado',
      `El pedido ${result.data.id} fue cancelado; el stock fue repuesto si aplicaba.`,
      result.data.id,
    );
    return result;
  }

  // ── Internos ───────────────────────────────────────────────────────────────

  private async notifySafely(
    spaceId: string,
    userId: string,
    type: NotificationType,
    title: string,
    body: string,
    orderId: string,
  ): Promise<void> {
    try {
      await this.notifications.create({
        spaceId,
        userId,
        type,
        title,
        body,
        resourceType: 'ORDER',
        resourceId: orderId,
      });
    } catch {
      // Las notificaciones son best-effort: el pedido ya se confirmó.
    }
  }

  private replay(snapshot: Prisma.JsonValue, key: string): OrderResponse {
    if (!snapshot || typeof snapshot !== 'object' || !('data' in snapshot)) {
      throw new ConflictException({
        code: 'IDEMPOTENCY_CONFLICT',
        message: `La clave ${key} ya se usó pero no se pudo recuperar la respuesta.`,
      });
    }
    return snapshot as unknown as OrderResponse;
  }

  private async findOrder(
    spaceId: string,
    userId: string,
    role: MembershipRole,
    id: string,
  ): Promise<OrderDetail> {
    return this.findOrderIn(this.prisma, spaceId, userId, role, id);
  }

  private async findOrderIn(
    client: PrismaService | Prisma.TransactionClient,
    spaceId: string,
    userId: string,
    role: MembershipRole,
    id: string,
  ): Promise<OrderDetail> {
    const order = await client.order.findFirst({
      where: {
        id,
        spaceId,
        // El propietario ve sus pedidos; el administrador del espacio ve todos.
        ...(role === MembershipRole.ADMINISTRADOR ? {} : { ownerId: userId }),
      },
      include: { items: true, payments: { orderBy: { attempt: 'asc' } } },
    });
    if (!order) {
      throw new NotFoundException({
        code: 'ORDER_NOT_FOUND',
        message: 'El pedido no existe en este espacio.',
      });
    }
    return order;
  }

  /** Repone cada unidad exactamente una vez, dentro de la transacción. */
  private async restoreStock(
    tx: Prisma.TransactionClient,
    orderId: string,
    spaceId: string,
  ): Promise<void> {
    const items = await tx.orderItem.findMany({ where: { orderId } });
    for (const item of items) {
      await tx.product.updateMany({
        where: { id: item.productId, spaceId },
        data: { stock: { increment: item.quantity } },
      });
    }
  }

  private paymentMessage(outcome: PaymentOutcome): string {
    if (outcome === PaymentOutcome.APPROVED) return 'Pago aprobado (simulado).';
    if (outcome === PaymentOutcome.REJECTED) return 'Pago rechazado (simulado); stock repuesto.';
    return 'Pago pendiente (simulado); se puede reintentar.';
  }

  private invalidTransition(status: OrderStatus): ConflictException {
    return new ConflictException({
      code: 'INVALID_STATUS_TRANSITION',
      message: `No se puede cambiar un pedido en estado ${status}.`,
      fields: { status: [status] },
    });
  }

  private assertUuid(value: string, field: string): void {
    if (!isUuid(value)) {
      throw new UnprocessableEntityException({
        code: 'VALIDATION_ERROR',
        message: 'Revisa los campos enviados.',
        fields: { [field]: ['Debe ser un UUID válido.'] },
      });
    }
  }
}
