import * as Joi from 'joi';

/**
 * Validación de variables de entorno al arrancar (fallo rápido).
 * Si falta algo obligatorio, la aplicación no inicia y el error es explícito.
 */
export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'production')
    .default('development'),
  PORT: Joi.number().port().default(3000),

  DATABASE_URL: Joi.string()
    .uri({ scheme: ['postgres', 'postgresql'] })
    .required()
    .messages({ 'any.required': 'DATABASE_URL es obligatoria (cadena de conexión PostgreSQL).' }),

  JWT_ACCESS_SECRET: Joi.string().min(32).required().messages({
    'any.required': 'JWT_ACCESS_SECRET es obligatorio.',
    'string.min': 'JWT_ACCESS_SECRET debe tener al menos 32 caracteres.',
  }),
  JWT_REFRESH_SECRET: Joi.string().min(32).required().messages({
    'any.required': 'JWT_REFRESH_SECRET es obligatorio.',
    'string.min': 'JWT_REFRESH_SECRET debe tener al menos 32 caracteres.',
  }),
  JWT_ACCESS_TTL: Joi.string()
    .pattern(/^\d+[smhd]$/)
    .default('15m'),
  JWT_REFRESH_TTL_DAYS: Joi.number().integer().min(1).default(30),

  CORS_ORIGIN: Joi.string().default('*'),

  SMTP_HOST: Joi.string().default('mailpit'),
  SMTP_PORT: Joi.number().port().default(1025),
  SMTP_FROM: Joi.string().default('Backend Prácticas <no-reply@practicas.local>'),

  PUBLIC_BASE_URL: Joi.string().uri({ scheme: ['http', 'https'] }).default('http://localhost:3000'),

  DEMO_SPACE_SLUG: Joi.string().default('demo-publico'),
  SANDBOX_TTL_HOURS: Joi.number().integer().min(1).default(72),
  SANDBOX_PRODUCT_QUOTA: Joi.number().integer().min(1).default(100),

  // ── Archivos (Etapa 2). Todo opcional: sin S3 se usa almacenamiento local ──
  FILES_STORAGE: Joi.string().valid('local', 's3').default('local'),
  FILES_LOCAL_DIR: Joi.string().default('./storage/uploads'),
  FILE_MAX_SIZE_BYTES: Joi.number().integer().min(1024).default(5242880),
  FILE_ALLOWED_MIME_TYPES: Joi.string().default(
    'image/png,image/jpeg,image/gif,image/webp,application/pdf,text/plain',
  ),
  SPACE_FILE_QUOTA_BYTES: Joi.number().integer().min(1).default(104857600),
  SPACE_FILE_QUOTA_COUNT: Joi.number().integer().min(1).default(50),

  S3_ENDPOINT: Joi.string().uri({ scheme: ['http', 'https'] }).allow('').optional(),
  // Endpoint público solo para firmar URLs que consumirá el navegador/móvil.
  // Si no se configura, las descargas se sirven siempre a través de la API.
  S3_PUBLIC_ENDPOINT: Joi.string().uri({ scheme: ['http', 'https'] }).allow('').optional(),
  S3_REGION: Joi.string().default('us-east-1'),
  S3_BUCKET: Joi.string().default('practicas'),
  S3_ACCESS_KEY: Joi.string().allow('').optional(),
  S3_SECRET_KEY: Joi.string().allow('').optional(),
  S3_FORCE_PATH_STYLE: Joi.boolean().default(true),
  S3_PRESIGN: Joi.boolean().default(false),
  S3_PRESIGN_TTL_SECONDS: Joi.number().integer().min(1).max(3600).default(300),

  // ── Simulador (Etapa 2): topes duros para no degradar el servicio ──────────
  SCENARIO_MAX_DELAY_MS: Joi.number().integer().min(100).max(10000).default(3000),
  SCENARIO_MAX_CONCURRENCY: Joi.number().integer().min(1).max(20).default(5),
  SCENARIO_LARGE_VOLUME_COUNT: Joi.number().integer().min(10).max(1000).default(500),

  // ── Etapa 4: cola de trabajos, replay y sesión web ─────────────────────────
  // Redis solo transporta mensajes; el estado vive en PostgreSQL.
  REDIS_URL: Joi.string().uri({ scheme: ['redis', 'rediss'] }).default('redis://redis:6379'),
  JOBS_QUEUE_MODE: Joi.string().valid('inline', 'redis').default('redis'),
  JOBS_RETENTION_HOURS: Joi.number().integer().min(1).max(720).default(24),
  WORKER_MODE: Joi.boolean().default(false),
});
