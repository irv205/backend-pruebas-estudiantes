import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Cart, CartItem, Product, Space, SpaceType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AddCartItemDto } from './dto/add-cart-item.dto';
import { UpdateCartItemDto } from './dto/update-cart-item.dto';

type CartItemWithProduct = CartItem & { product: Product };

export interface CartItemView {
  id: string;
  productId: string;
  quantity: number;
  /** Precio actual del producto; el pedido guardará su propio snapshot. */
  unitPrice: number;
  subtotal: number;
  product: {
    id: string;
    name: string;
    description: string | null;
    price: number;
    currency: string;
    stock: number;
    status: Product['status'];
    images: string[];
  };
}

export interface CartView {
  id: string;
  currency: string | null;
  itemCount: number;
  subtotal: number;
  total: number;
  items: CartItemView[];
}

/**
 * Carrito por (espacio, usuario). Todos los importes son enteros en unidad
 * mínima de moneda y se calculan aquí, nunca en el cliente.
 */
@Injectable()
export class CartService {
  constructor(private readonly prisma: PrismaService) {}

  async get(spaceId: string, userId: string): Promise<{ data: CartView; meta: Record<string, unknown> }> {
    const cart = await this.ensureCart(spaceId, userId);
    const view = this.render(cart, cart.items);
    return {
      data: view,
      meta: {
        currency: view.currency,
        itemCount: view.itemCount,
        subtotal: view.subtotal,
        total: view.total,
      },
    };
  }

  async addItem(
    space: Space,
    userId: string,
    dto: AddCartItemDto,
  ): Promise<{ data: CartView; meta: Record<string, unknown> }> {
    this.assertWritable(space);
    const cart = await this.ensureCart(space.id, userId);
    const product = await this.visibleProduct(space.id, dto.productId);

    const existing = cart.items.find((item) => item.productId === product.id);
    const nextQuantity = (existing?.quantity ?? 0) + dto.quantity;
    this.assertStock(product, nextQuantity);
    this.assertCurrency(cart.items, product.currency);

    await this.prisma.cartItem.upsert({
      where: { cartId_productId: { cartId: cart.id, productId: product.id } },
      create: { cartId: cart.id, productId: product.id, quantity: dto.quantity },
      update: { quantity: { increment: dto.quantity } },
    });

    return this.get(space.id, userId);
  }

  async updateItem(
    space: Space,
    userId: string,
    productId: string,
    dto: UpdateCartItemDto,
  ): Promise<{ data: CartView; meta: Record<string, unknown> }> {
    this.assertWritable(space);
    const cart = await this.ensureCart(space.id, userId);
    const item = cart.items.find((entry) => entry.productId === productId);
    if (!item) throw this.itemNotFound();
    this.assertStock(item.product, dto.quantity);

    await this.prisma.cartItem.update({ where: { id: item.id }, data: { quantity: dto.quantity } });
    return this.get(space.id, userId);
  }

  async removeItem(space: Space, userId: string, productId: string): Promise<void> {
    this.assertWritable(space);
    const cart = await this.ensureCart(space.id, userId);
    const result = await this.prisma.cartItem.deleteMany({
      where: { cartId: cart.id, productId },
    });
    if (result.count === 0) throw this.itemNotFound();
  }

  async clear(space: Space, userId: string): Promise<void> {
    this.assertWritable(space);
    const cart = await this.ensureCart(space.id, userId);
    await this.prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
  }

  // ── Internos ───────────────────────────────────────────────────────────────

  private async ensureCart(
    spaceId: string,
    userId: string,
  ): Promise<Cart & { items: CartItemWithProduct[] }> {
    await this.prisma.cart.upsert({
      where: { spaceId_userId: { spaceId, userId } },
      create: { spaceId, userId },
      update: {},
    });
    return this.prisma.cart.findUniqueOrThrow({
      where: { spaceId_userId: { spaceId, userId } },
      include: { items: { include: { product: true }, orderBy: { createdAt: 'asc' } } },
    });
  }

  private render(cart: Cart, items: CartItemWithProduct[]): CartView {
    const views: CartItemView[] = items.map((item) => ({
      id: item.id,
      productId: item.productId,
      quantity: item.quantity,
      unitPrice: item.product.price,
      subtotal: item.product.price * item.quantity,
      product: {
        id: item.product.id,
        name: item.product.name,
        description: item.product.description,
        price: item.product.price,
        currency: item.product.currency,
        stock: item.product.stock,
        status: item.product.status,
        images: item.product.images,
      },
    }));
    const currency = views[0]?.product.currency ?? null;
    const subtotal = views.reduce((sum, item) => sum + item.subtotal, 0);
    return {
      id: cart.id,
      currency,
      itemCount: views.reduce((sum, item) => sum + item.quantity, 0),
      subtotal,
      total: subtotal,
      items: views,
    };
  }

  private async visibleProduct(spaceId: string, productId: string): Promise<Product> {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, spaceId },
    });
    if (!product) {
      throw new NotFoundException({
        code: 'PRODUCT_NOT_FOUND',
        message: 'El producto no existe en este espacio.',
      });
    }
    if (product.status !== 'ACTIVE') {
      throw new ConflictException({
        code: 'PRODUCT_UNAVAILABLE',
        message: 'El producto no está disponible.',
      });
    }
    return product;
  }

  private assertStock(product: Product, quantity: number): void {
    if (product.stock < quantity) {
      throw new ConflictException({
        code: 'INSUFFICIENT_STOCK',
        message: `Stock insuficiente: hay ${product.stock} unidades disponibles.`,
        fields: { quantity: [`No hay más de ${product.stock} unidades.`] },
      });
    }
  }

  /** Un carrito solo puede contener una moneda; evita mezclar importes. */
  private assertCurrency(items: CartItemWithProduct[], currency: string): void {
    const current = items[0]?.product.currency;
    if (current && current !== currency) {
      throw new ConflictException({
        code: 'CURRENCY_MISMATCH',
        message: `El carrito usa ${current}; no puedes añadir un producto en ${currency}.`,
      });
    }
  }

  private itemNotFound(): NotFoundException {
    return new NotFoundException({
      code: 'CART_ITEM_NOT_FOUND',
      message: 'Ese producto no está en tu carrito.',
    });
  }

  private assertWritable(space: Space): void {
    if (space.type === SpaceType.DEMO) {
      throw new ForbiddenException({
        code: 'DEMO_READ_ONLY',
        message: 'La demo pública es de solo lectura.',
      });
    }
  }
}
