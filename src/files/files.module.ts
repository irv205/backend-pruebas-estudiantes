import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SpaceAccessModule } from '../access/space-access.module';
import { FilesController } from './files.controller';
import { FilesService } from './files.service';
import { LocalStorageProvider } from './storage/local-storage.provider';
import { S3StorageProvider } from './storage/s3-storage.provider';
import { STORAGE_PROVIDER } from './storage/storage-provider';

@Module({
  imports: [SpaceAccessModule],
  controllers: [FilesController],
  providers: [
    FilesService,
    {
      provide: STORAGE_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        config.get<string>('FILES_STORAGE') === 's3'
          ? new S3StorageProvider(config)
          : new LocalStorageProvider(config),
    },
  ],
  exports: [FilesService, STORAGE_PROVIDER],
})
export class FilesModule {}
