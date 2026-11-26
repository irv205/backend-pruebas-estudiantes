/** Contrato mínimo de almacenamiento de objetos (S3/MinIO o disco local). */
export const STORAGE_PROVIDER = Symbol('STORAGE_PROVIDER');

export interface StorageProvider {
  put(key: string, body: Buffer, mimeType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  /** null cuando las descargas deben servirse a través de la API. */
  presignedUrl?(key: string, ttlSeconds: number): Promise<string | null>;
}
