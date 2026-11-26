/**
 * Resumen de la guía `docs/coding-challenges.md` (niveles 0-6) para el portal.
 * Es un índice, no una copia: la guía completa sigue siendo la fuente de verdad.
 */
export interface PortalChallengeExample {
  curl: string;
  javascript: string;
  kotlin: string;
}

export interface PortalChallenge {
  level: number;
  title: string;
  focus: string;
  examples: PortalChallengeExample;
}

const api = '$API'; // el portal sustituye este marcador por la URL base real
const token = '$TOKEN'; // NUNCA un token real: solo un marcador en la guía

export const PORTAL_CHALLENGES: PortalChallenge[] = [
  {
    level: 0,
    title: 'Preparación del entorno',
    focus: 'Health, Swagger, Postman y portal',
    examples: {
      curl: `curl http://localhost:3100/health/live`,
      javascript: `await fetch('http://localhost:3100/health/live')`,
      kotlin: `val health = client.get<String>("http://localhost:3100/health/live")`,
    },
  },
  {
    level: 1,
    title: 'Inicial — catálogo público',
    focus: 'Listado y detalle de /public/products con meta de paginación',
    examples: {
      curl: `curl '${api}/public/products?page=1&limit=20'`,
      javascript: `const res = await fetch(\`\${API}/public/products?page=1&limit=20\`);\nconst { data, meta } = await res.json();`,
      kotlin: `@GET("public/products")\nsuspend fun products(@Query("page") page: Int = 1): CatalogResponse`,
    },
  },
  {
    level: 2,
    title: 'Básico — sandbox anónimo',
    focus: 'Crear sandbox y CRUD con la cabecera x-space-id',
    examples: {
      curl: `curl -X POST ${api}/public/sandboxes`,
      javascript: `const { data } = await fetch(\`\${API}/public/sandboxes\`, { method: 'POST' }).then(r => r.json());`,
      kotlin: `@POST("public/sandboxes")\nsuspend fun sandbox(): SandboxResponse`,
    },
  },
  {
    level: 3,
    title: 'Intermedio — cuenta y notas',
    focus: 'Registro, login, perfil y notas privadas con Bearer',
    examples: {
      curl: `curl -H "Authorization: Bearer ${token}" ${api}/users/me`,
      javascript: `fetch(\`\${API}/users/me\`, { headers: { Authorization: \`Bearer \${token}\` } });`,
      kotlin: `@GET("users/me")\nsuspend fun me(): UserResponse`,
    },
  },
  {
    level: 4,
    title: 'Intermedio avanzado — recursos y roles',
    focus: 'Categorías, tareas, archivos, equipos y los 12 escenarios',
    examples: {
      curl: `curl -H "Authorization: Bearer ${token}" ${api}/spaces/me/scenarios`,
      javascript: `fetch(\`\${API}/spaces/me/scenarios\`, { headers: { Authorization: \`Bearer \${token}\` } });`,
      kotlin: `@GET("spaces/me/scenarios")\nsuspend fun scenarios(): ScenariosResponse`,
    },
  },
  {
    level: 5,
    title: 'Avanzado — pedidos e idempotencia',
    focus: 'Carrito, stock, pagos simulados e Idempotency-Key',
    examples: {
      curl: `curl -X POST -H "Authorization: Bearer ${token}" -H "Idempotency-Key: 9c1e..." ${api}/orders`,
      javascript: `fetch(\`\${API}/orders\`, { method: 'POST', headers: { Authorization: \`Bearer \${token}\`, 'Idempotency-Key': key } });`,
      kotlin: `@POST("orders")\nsuspend fun order(@Header("Idempotency-Key") key: String): OrderResponse`,
    },
  },
  {
    level: 6,
    title: 'Integraciones — realtime y trabajos',
    focus: 'WebSocket/chat con replay, notificaciones y exportaciones CSV',
    examples: {
      curl: `curl -H "Authorization: Bearer ${token}" ${api}/notifications`,
      javascript: `io(HOST, { auth: { token } }).on('notification:new', console.log);`,
      kotlin: `val socket = IO.socket(HOST, IO.Options().apply { auth = JSONObject().put("token", token) })`,
    },
  },
];
