import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { StorageProvider } from './storage-provider';

/** Cliente S3 compatible (MinIO). Endpoints internos y públicos separados. */
@Injectable()
export class S3StorageProvider implements StorageProvider {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly internalEndpoint: string;
  private readonly publicEndpoint?: string;

  constructor(config: ConfigService) {
    const endpoint = config.get<string>('S3_ENDPOINT');
    const accessKeyId = config.get<string>('S3_ACCESS_KEY');
    const secretAccessKey = config.get<string>('S3_SECRET_KEY');
    if (!endpoint || !accessKeyId || !secretAccessKey) {
      throw new Error(
        'FILES_STORAGE=s3 requiere S3_ENDPOINT, S3_ACCESS_KEY y S3_SECRET_KEY en el entorno.',
      );
    }
    this.bucket = config.getOrThrow<string>('S3_BUCKET');
    this.internalEndpoint = endpoint;
    this.publicEndpoint = config.get<string>('S3_PUBLIC_ENDPOINT') || undefined;
    this.client = new S3Client({
      endpoint,
      region: config.getOrThrow<string>('S3_REGION'),
      forcePathStyle: config.get<boolean>('S3_FORCE_PATH_STYLE') ?? true,
      credentials: { accessKeyId, secretAccessKey },
    });
  }

  async put(key: string, body: Buffer, mimeType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: mimeType,
      }),
    );
  }

  async get(key: string): Promise<Buffer> {
    const result = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    if (!result.Body) throw new Error('EMPTY_OBJECT');
    const bytes = await result.Body.transformToByteArray();
    return Buffer.from(bytes);
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  async presignedUrl(key: string, ttlSeconds: number): Promise<string | null> {
    if (!this.publicEndpoint) return null;
    const command = new GetObjectCommand({ Bucket: this.bucket, Key: key });
    const relative = await getSignedUrl(this.client, command, { expiresIn: ttlSeconds });
    // S3 firma contra el endpoint interno; se reescribe al público para el cliente.
    return relative.replace(
      this.internalEndpoint.replace(/\/$/, ''),
      this.publicEndpoint.replace(/\/$/, ''),
    );
  }
}
