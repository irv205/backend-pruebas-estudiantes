import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Category, Prisma, Space, SpaceType } from '@prisma/client';
import { SpaceAccessService } from '../access/space-access.service';
import { getPageParams, paginate } from '../common/pagination/pagination';
import { slugify } from '../common/utils/slug.util';
import { PrismaService } from '../prisma/prisma.service';
import { ProductsService } from '../products/products.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { QueryCategoriesDto } from './dto/query-categories.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

/** Categorías por espacio, con nombre único (slug) y control optimista. */
@Injectable()
export class CategoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: SpaceAccessService,
    private readonly products: ProductsService,
  ) {}

  async list(spaceId: string, query: QueryCategoriesDto, activeOnly = false) {
    const { page, limit, skip, take } = getPageParams(query);
    const where: Prisma.CategoryWhereInput = { spaceId };
    if (activeOnly || query.isActive !== undefined) {
      where.isActive = activeOnly ? true : query.isActive;
    }
    if (query.search) {
      where.name = { contains: query.search, mode: 'insensitive' };
    }
    const orderBy: Prisma.CategoryOrderByWithRelationInput = {
      [query.sort ?? 'name']: query.order ?? 'asc',
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.category.findMany({
        where,
        orderBy,
        skip,
        take,
        include: { _count: { select: { products: true } } },
      }),
      this.prisma.category.count({ where }),
    ]);
    return paginate(items, total, page, limit);
  }

  async findOne(spaceId: string, id: string, activeOnly = false): Promise<Category> {
    const category = await this.prisma.category.findFirst({
      where: { id, spaceId, ...(activeOnly ? { isActive: true } : {}) },
    });
    if (!category) {
      throw new NotFoundException({
        code: 'CATEGORY_NOT_FOUND',
        message: 'La categoría no existe en este espacio.',
      });
    }
    return category;
  }

  /** Productos de una categoría; reutiliza la paginación/filtros de products. */
  async productsOf(
    spaceId: string,
    id: string,
    query: QueryCategoriesDto,
    activeOnly = false,
  ) {
    await this.findOne(spaceId, id, activeOnly);
    return this.products.list(spaceId, { ...query, categoryId: id });
  }

  async create(space: Space, dto: CreateCategoryDto): Promise<Category> {
    this.access.assertWritable(space);
    const slug = slugify(dto.name);
    await this.assertNameAvailable(space.id, slug);
    return this.prisma.category.create({
      data: {
        spaceId: space.id,
        name: dto.name.trim(),
        slug,
        isActive: dto.isActive ?? true,
      },
    });
  }

  async update(space: Space, id: string, dto: UpdateCategoryDto): Promise<Category> {
    this.access.assertWritable(space);
    const current = await this.findOne(space.id, id);
    const slug = dto.name === undefined ? current.slug : slugify(dto.name);
    if (slug !== current.slug) await this.assertNameAvailable(space.id, slug, id);

    const { version, ...patch } = dto;
    const result = await this.prisma.category.updateMany({
      where: { id, spaceId: space.id, version },
      data: {
        ...patch,
        ...(dto.name !== undefined ? { name: dto.name.trim(), slug } : {}),
        version: { increment: 1 },
      },
    });
    if (result.count === 0) {
      throw new ConflictException({
        code: 'VERSION_CONFLICT',
        message: 'La categoría cambió desde que la consultaste. Recárgala y reintenta.',
        fields: { version: ['La versión enviada no coincide con la actual.'] },
      });
    }
    return this.findOne(space.id, id);
  }

  async remove(space: Space, id: string): Promise<void> {
    this.access.assertWritable(space);
    const result = await this.prisma.category.deleteMany({ where: { id, spaceId: space.id } });
    if (result.count === 0) {
      throw new NotFoundException({
        code: 'CATEGORY_NOT_FOUND',
        message: 'La categoría no existe en este espacio.',
      });
    }
  }

  private async assertNameAvailable(spaceId: string, slug: string, exceptId?: string): Promise<void> {
    const existing = await this.prisma.category.findFirst({
      where: { spaceId, slug, ...(exceptId ? { id: { not: exceptId } } : {}) },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException({
        code: 'CATEGORY_NAME_CONFLICT',
        message: 'Ya existe una categoría con ese nombre en este espacio.',
        fields: { name: ['Debe ser único por espacio.'] },
      });
    }
  }

  /** Solo se usa para exponer el estado de solo lectura de la demo en Swagger. */
  static isReadOnly(space: Space): boolean {
    return space.type === SpaceType.DEMO;
  }
}
