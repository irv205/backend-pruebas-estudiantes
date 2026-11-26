import { existsSync } from 'fs';
import { join } from 'path';
import * as dotenv from 'dotenv';

/**
 * Las e2e usan .env.test si existe (recomendado: BD separada), si no .env.
 * Nunca apuntes las pruebas a la base de datos de los estudiantes.
 */
const root = join(__dirname, '..');
const testEnv = join(root, '.env.test');
dotenv.config({ path: existsSync(testEnv) ? testEnv : join(root, '.env') });
process.env.NODE_ENV = 'test';
// Las e2e no necesitan Redis: el procesador se ejecuta en el mismo proceso.
process.env.JOBS_QUEUE_MODE = 'inline';
process.env.WORKER_MODE = 'false';
