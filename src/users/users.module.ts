import { Module } from '@nestjs/common';
import { SpaceAccessModule } from '../access/space-access.module';
import { AuthModule } from '../auth/auth.module';
import { FilesModule } from '../files/files.module';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [AuthModule, FilesModule, SpaceAccessModule],
  controllers: [UsersController],
  providers: [UsersService],
})
export class UsersModule {}
