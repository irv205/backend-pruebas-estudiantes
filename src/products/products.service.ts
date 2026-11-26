import {
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, Product, Space, SpaceType } from '@prisma/client';
import { getPageParams, paginate } from '../common/pagination/pagination';
import { isUuid } from '../common/utils/uuid.util';
import { FilesService } from '../files/files.service';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeEventsService } from '../realtime/realtime-events.service';
import { CreateProductDto } from './dto/create-product.dto';
import { QueryProductsDto } from './dto/query-products.dto';
import { UpdateProductDto } from './dto/update-product.dto';

/**
 * Productos de un espacio. TODAS las consultas llevan `spaceId`: conocer un id
 * de producto de otro espacio nunca autoriza a verlo ni a modificarlo.
 */
@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly files: FilesService,
    private readonly realtime: RealtimeEventsService,
  ) {}

  async list(spaceId: string, query: QueryProductsDto) {
    const { page, limit, skip, take } = getPageParams(query);
    const where: Prisma.ProductWhereInput = { spaceId };

    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { description: { contains: query.search, mode: 'insensitive' } },
      ];
    }
    if (query.status) where.status = query.status;
    if (query.categoryId) where.categoryId = query.categoryId;

    const orderBy: Prisma.ProductOrderByWithRelationInput = {
      [query.sort ?? 'createdAt']: query.order ?? 'desc',
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        where,
        orderBy,
        skip,
        take,
        include: { category: { select: { id: true, name: true, slug: true } } },
      }),
      this.prisma.product.count({ where }),
    ]);

    return paginate(items, total, page, limit);
  }

  async findOne(spaceId: string, id: string): Promise<Product> {
    const product = await this.prisma.product.findFirst({
      where: { id, spaceId },
      include: { category: { select: { id: true, name: true, slug: true } } },
    });
    if (!product) {
      throw new NotFoundException({
        code: 'PRODUCT_NOT_FOUND',
        message: 'El producto no existe en este espacio.',
      });
    }
    return product;
  }

  async create(
    space: Space,
    ownerId: string | null,
    dto: CreateProductDto,
  ): Promise<Product> {
    this.assertWritable(space);
    await this.assertQuota(space);
    const categoryId = await this.resolveCategory(space.id, dto.categoryId);

    const product = await this.prisma.product.create({
      data: {
        spaceId: space.id,
        ownerId,
        name: dto.name,
        description: dto.description,
        price: dto.price,
        currency: dto.currency ?? 'MXN',
        stock: dto.stock ?? 0,
        status: dto.status ?? 'ACTIVE',
        categoryId,
        images: dto.images ?? [],
      },
    });
    await this.realtime.recordSafely(space.id, 'PRODUCT', {
      action: 'created',
      resourceType: 'PRODUCT',
      resourceId: product.id,
      version: product.version,
    });
    return product;
  }

  /**
   * Actualización con control de concurrencia optimista: el `version` enviado
   * debe coincidir con el almacenado; si no, responde 409 VERSION_CONFLICT.
   */
  async update(
    space: Space,
    id: string,
    dto: UpdateProductDto,
  ): Promise<Product> {
    this.assertWritable(space);
    const categoryId =
      dto.categoryId === undefined
        ? undefined
        : await this.resolveCategory(space.id, dto.categoryId);

    const { version, ...patch } = dto;
    const data: Prisma.ProductUncheckedUpdateManyInput = {
      ...patch,
      ...(categoryId !== undefined ? { categoryId } : {}),
      version: { increment: 1 },
    };

    const result = await this.prisma.product.updateMany({
      where: { id, spaceId: space.id, version },
      data,
    });

    if (result.count === 0) {
      const existing = await this.prisma.product.findFirst({
        where: { id, spaceId: space.id },
        select: { version: true },
      });
      if (!existing) {
        throw new NotFoundException({
          code: 'PRODUCT_NOT_FOUND',
          message: 'El producto no existe en este espacio.',
        });
      }
      throw new ConflictException({
        code: 'VERSION_CONFLICT',
        message: 'El producto cambió desde que lo consultaste. Recárgalo y reintenta.',
        fields: { version: ['La versión enviada no coincide con la actual.'] },
      });
    }

    const updated = await this.findOne(space.id, id);
    await this.realtime.recordSafely(space.id, 'PRODUCT', {
      action: 'updated',
      resourceType: 'PRODUCT',
      resourceId: updated.id,
      version: updated.version,
    });
    return updated;
  }

  async remove(space: Space, id: string): Promise<void> {
    this.assertWritable(space);
    const product = await this.prisma.product.findFirst({
      where: { id, spaceId: space.id },
      select: { images: true },
    });
    let result: Prisma.BatchPayload;
    try {
      result = await this.prisma.product.deleteMany({
        where: { id, spaceId: space.id },
      });
    } catch (error: unknown) {
      // Un producto con pedidos no se borra: el snapshot del pedido es histórico.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
        throw new ConflictException({
          code: 'PRODUCT_IN_USE',
          message: 'El producto aparece en pedidos; cancélalos antes de eliminarlo.',
        });
      }
      throw error;
    }
    if (result.count === 0) {
      throw new NotFoundException({
        code: 'PRODUCT_NOT_FOUND',
        message: 'El producto no existe en este espacio.',
      });
    }
    // Objetos asociados: ids en `images` y archivos enlazados a la entidad.
    await this.files.deleteByIds((product?.images ?? []).filter((value) => isUuid(value)));
    await this.files.deleteByEntity('PRODUCT', id);
    await this.realtime.recordSafely(space.id, 'PRODUCT', {
      action: 'deleted',
      resourceType: 'PRODUCT',
      resourceId: id,
    });
  }

  // ── Internos ────────────────────────────────────────────────────────────────

  /** La demo pública es de solo lectura; sandbox y espacio personal sí escriben. */
  private assertWritable(space: Space): void {
    if (space.type === SpaceType.DEMO) {
      throw new ForbiddenException({
        code: 'DEMO_READ_ONLY',
        message: 'La demo pública es de solo lectura. Crea un sandbox con POST /api/v1/public/sandboxes.',
      });
    }
  }

  private async assertQuota(space: Space): Promise<void> {
    if (space.type !== SpaceType.SANDBOX) return;
    const quota = this.config.getOrThrow<number>('SANDBOX_PRODUCT_QUOTA');
    const count = await this.prisma.product.count({ where: { spaceId: space.id } });
    if (count >= quota) {
      throw new HttpException(
        {
          code: 'QUOTA_EXCEEDED',
          message: `El sandbox alcanzó el límite de ${quota} productos. Reinicia el espacio.`,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  /** Una categoría de otro espacio nunca puede asociarse a este producto. */
  private async resolveCategory(
    spaceId: string,
    categoryId: string | undefined,
  ): Promise<string | undefined | null> {
    if (categoryId === undefined) return undefined;
    if (categoryId === null) return null;
    const category = await this.prisma.category.findFirst({
      where: { id: categoryId, spaceId },
      select: { id: true },
    });
    if (!category) {
      throw new NotFoundException({
        code: 'CATEGORY_NOT_FOUND',
        message: 'La categoría no existe en este espacio.',
      });
    }
    return category.id;
  }
}
