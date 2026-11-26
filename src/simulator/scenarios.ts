/** Escenarios reales (Etapas 1-3). `failedAsyncJob` queda para Etapa 4. */
export const SCENARIO_KEYS = [
  'slowResponse',
  'timeout',
  'temporary503',
  'sessionExpired',
  'insufficientPermission',
  'emptyList',
  'largeVolume',
  'concurrentEdit',
  'rateLimit',
  'invalidFile',
  'duplicateOrder',
] as const;

export type ScenarioKey = (typeof SCENARIO_KEYS)[number];

export const SCENARIO_DESCRIPTIONS: Record<ScenarioKey, string> = {
  slowResponse: 'Respuesta lenta (~1 s) para probar indicadores de carga y cancelación.',
  timeout: 'Latencia superior al timeout del cliente (tope duro configurado).',
  temporary503: 'Error temporal 503 para probar reintentos con backoff.',
  sessionExpired: '401 AUTH_TOKEN_EXPIRED para probar renovación de sesión.',
  insufficientPermission: '403 INSUFFICIENT_ROLE para distinguir autenticación de autorización.',
  emptyList: 'Fuerza una lista vacía con meta.total=0 para probar estados vacíos.',
  largeVolume: 'Devuelve una lista grande acotada para probar paginación/rendimiento.',
  concurrentEdit: '409 VERSION_CONFLICT en PATCH/PUT para probar edición simultánea.',
  rateLimit: '429 RATE_LIMITED con cabecera Retry-After.',
  invalidFile: '400 INVALID_FILE_TYPE en subidas multipart/form-data.',
  duplicateOrder:
    'Pedido repetido: fuerza la clave `duplicate-order-<spaceId>` en POST /orders; ' +
    'el primer pedido se crea y los reintentos devuelven el mismo pedido sin descontar stock dos veces. ' +
    'Límites: solo POST /orders, una clave por espacio y body máximo del carrito.',
};

/**
 * Clave determinista del escenario. Como la idempotencia se persiste por
 * (spaceId, userId, key), el efecto queda acotado a UN pedido por espacio.
 */
export const DUPLICATE_ORDER_KEY_PREFIX = 'duplicate-order-';

export function duplicateOrderKey(spaceId: string): string {
  return `${DUPLICATE_ORDER_KEY_PREFIX}${spaceId}`;
}
