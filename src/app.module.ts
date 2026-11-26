import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SpaceAccessModule } from './access/space-access.module';
import { AuthModule } from './auth/auth.module';
import { CartModule } from './cart/cart.module';
import { CategoriesModule } from './categories/categories.module';
import { CommonModule } from './common/common.module';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';
import { envValidationSchema } from './config/env.validation';
import { FilesModule } from './files/files.module';
import { HealthModule } from './health/health.module';
import { MailModule } from './mail/mail.module';
import { NotesModule } from './notes/notes.module';
import { OrdersModule } from './orders/orders.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProductsModule } from './products/products.module';
import { SimulatorModule } from './simulator/simulator.module';
import { SpacesModule } from './spaces/spaces.module';
import { TasksModule } from './tasks/tasks.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    // Fallo rápido: si falta una variable obligatoria, el proceso no arranca.
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: envValidationSchema,
      envFilePath: ['.env'],
    }),
    CommonModule,
    PrismaModule,
    MailModule,
    HealthModule,
    SpaceAccessModule,
    AuthModule,
    UsersModule,
    SpacesModule,
    ProductsModule,
    CartModule,
    OrdersModule,
    NotesModule,
    CategoriesModule,
    TasksModule,
    FilesModule,
    SimulatorModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
