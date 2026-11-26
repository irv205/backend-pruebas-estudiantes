# Propuesta de backend de práctica para estudiantes

**Estado:** propuesta funcional y técnica, sin implementación.

## 1. Objetivo

Construir una API de práctica con datos persistentes, módulos independientes y escenarios configurables para estudiantes que desarrollan aplicaciones web, Android, iOS o escritorio.

El servicio permitirá practicar integraciones completas: operaciones CRUD, autenticación, permisos, archivos, relaciones, reglas de negocio y manejo de errores. Los cambios se guardarán y cada estudiante podrá trabajar sin afectar los datos de otros.

## 2. Stack propuesto

| Componente | Tecnología | Propósito |
|---|---|---|
| Lenguaje | TypeScript | Contratos y lógica consistentes |
| Framework | NestJS | Organización por módulos |
| API | REST con JSON y prefijo `/api/v1` | Integración desde cualquier cliente |
| Base de datos | PostgreSQL | Persistencia, relaciones y transacciones |
| ORM | Prisma | Acceso a datos y migraciones |
| Autenticación | JWT de acceso y refresh tokens | Inicio, renovación y cierre de sesión |
| Contraseñas | Argon2id | Almacenamiento mediante hash |
| Documentación | OpenAPI y Swagger UI | Explorar y probar endpoints |
| Archivos | Almacenamiento compatible con S3 | Avatares, imágenes y adjuntos |
| Correo de pruebas | Mailpit | Verificación y recuperación sin correos reales |
| Entorno local | Docker Compose | Ejecución reproducible |
| Pruebas | Jest y Supertest | Reglas, permisos y flujos completos |
| Observabilidad | Logs JSON con identificador de petición | Diagnóstico de errores |

Las versiones concretas se fijarán al iniciar la implementación.

### Arquitectura

Un **monolito modular**: una aplicación desplegable con módulos que exponen servicios definidos y mantienen separada su lógica de negocio. Las capas comunes resolverán configuración, acceso a datos, validación, autorización, errores y logs.

Las integraciones asíncronas podrán incorporar un worker y una cola cuando se implemente la etapa avanzada. La primera etapa no necesita esa infraestructura.

## 3. Espacios de práctica y aislamiento

| Modalidad | Acceso | Comportamiento |
|---|---|---|
| Demo pública | Sin cuenta | Datos de lectura disponibles inmediatamente |
| Sandbox anónimo | Sin login, con identificador de espacio | CRUD aislado, temporal y con cuotas |
| Espacio personal | Usuario autenticado | Datos privados y persistentes |
| Espacio de equipo | Autenticación y membresía | Datos compartidos con roles |

El identificador del sandbox separa datos, pero no representa una identidad autenticada. Los datos anónimos serán desechables y no deberán contener información personal.

Los recursos estarán asociados a un espacio y, cuando corresponda, a un propietario. El backend comprobará estas relaciones en cada operación. Reiniciar un espacio solo afectará sus propios datos.

## 4. Catálogo de módulos

| Módulo | Funcionalidades | Aprendizaje |
|---|---|---|
| Autenticación | Registro, login, renovación, logout, verificación y recuperación | Formularios, sesiones y rutas protegidas |
| Usuarios y perfil | Consultar y editar perfil, contraseña, avatar y eliminación | Validación y datos personales |
| Productos públicos | Lectura de catálogo y CRUD en sandbox anónimo | Primeras peticiones HTTP sin login |
| Productos privados | CRUD, categorías, imágenes, precio, stock y estados | Permisos y reglas de negocio |
| Notas | CRUD privado, etiquetas, favoritos, archivo y búsqueda | Propiedad de datos y persistencia |
| Tareas | CRUD, prioridades, fechas límite, estados y subtareas | Filtros y transiciones |
| Archivos | Subida, consulta, eliminación y validación | Multipart y progreso |
| Carrito y pedidos | Carrito, totales, creación y cancelación | Transacciones e idempotencia |
| Notificaciones | Bandeja, contador y marcado de lectura | Sincronización de interfaz |
| Tiempo real | Chat por salas y eventos de actualización | WebSockets y reconexión |
| Trabajos asíncronos | Exportaciones y consulta de estado | Polling y descargas |
| Simulador | Latencia, errores y expiraciones controladas | Timeouts y reintentos |
| Administración de práctica | Reinicio, datos iniciales y actividad | Preparación de ejercicios |

Los módulos podrán habilitarse por espacio según el nivel del curso.

## 5. Autenticación y usuarios

| Método | Endpoint | Función |
|---|---|---|
| POST | `/auth/register` | Crear cuenta |
| POST | `/auth/login` | Iniciar sesión |
| POST | `/auth/refresh` | Renovar sesión |
| POST | `/auth/logout` | Cerrar sesión actual |
| POST | `/auth/forgot-password` | Solicitar recuperación |
| POST | `/auth/reset-password` | Establecer nueva contraseña |
| POST | `/auth/verify-email` | Verificar correo |
| GET | `/users/me` | Consultar perfil |
| PATCH | `/users/me` | Editar perfil |
| PUT | `/users/me/password` | Cambiar contraseña |
| DELETE | `/users/me` | Eliminar cuenta |

Todas las rutas anteriores llevan el prefijo `/api/v1`.

### Comportamiento

- Tokens de acceso con expiración y refresh tokens rotativos y revocables.
- Logout revoca la capacidad de renovar la sesión. La vigencia del token de acceso se documentará explícitamente.
- Para web, renovación mediante cookies `HttpOnly`, con configuración de CORS y protección CSRF correspondiente.
- Para móvil, flujo de tokens documentado y almacenamiento seguro en el cliente.
- Contraseñas almacenadas mediante hash; tokens de recuperación de un solo uso y con expiración.
- Errores de credenciales incorrectas, correo duplicado, acceso vencido y recuperación expirada.
- Correo de pruebas accesible únicamente dentro del entorno y espacio autorizado.

## 6. Productos públicos y privados

### Rutas

- `/api/v1/public/products`: operaciones dentro del sandbox anónimo.
- `/api/v1/products`: operaciones autenticadas dentro del espacio seleccionado.

En ambas variantes se expondrán operaciones de listado, detalle, creación, actualización parcial y eliminación.

### Modelo propuesto

| Campo | Descripción |
|---|---|
| `id` | UUID del producto |
| `name` | Nombre |
| `description` | Descripción |
| `price` | Importe entero en unidad mínima de la moneda |
| `currency` | Código de moneda |
| `stock` | Existencias enteras no negativas |
| `categoryId` | Categoría relacionada |
| `images` | Referencias a imágenes |
| `status` | Estado activo o inactivo |
| `createdAt` | Fecha de creación |
| `updatedAt` | Fecha de modificación |
| `version` | Versión para control de concurrencia |

### Funcionalidades

- Paginación, búsqueda, filtros y ordenamiento.
- Validación de precio, stock y campos obligatorios.
- Categorías y subida de imágenes.
- Activación y desactivación.
- Detección de cambios simultáneos mediante versión; conflicto `409` cuando corresponda.

```http
GET /api/v1/products?page=1&limit=20&search=keyboard&sort=price&order=asc
```

### Roles en espacios de equipo

| Rol | Permisos |
|---|---|
| Lector | Consultar recursos compartidos |
| Editor | Consultar, crear, editar y eliminar productos |
| Administrador | Gestionar recursos, miembros y reinicios |

En un espacio personal, el propietario administra sus propios recursos.

## 7. Notas

Cada nota pertenece a un usuario. Conocer su identificador no autoriza a consultarla o modificarla.

Campos: `id`, `title`, `content`, `tags`, `color`, `isFavorite`, `isArchived`, `createdAt`, `updatedAt` y `version`.

Funcionalidades:

- CRUD en `/api/v1/notes`.
- Búsqueda por título y contenido.
- Filtros por etiquetas, favoritas y archivadas.
- Archivo y restauración.
- Ordenamiento por creación y modificación.
- Conflictos de edición entre dispositivos.

## 8. Módulos complementarios

### Tareas

CRUD de tareas con prioridades, fechas límite, estados y subtareas. Se validarán las transiciones de estado y la propiedad de cada recurso.

### Archivos

Subida multipart, consulta de metadatos, descarga y eliminación. Se establecerán límites de tamaño, tipos permitidos, cuotas y permisos de acceso.

### Carrito y pedidos

- Agregar, actualizar y eliminar elementos del carrito.
- Calcular totales en el servidor.
- Registrar el precio comprado dentro del pedido.
- Validar y descontar stock mediante transacciones.
- Evitar pedidos duplicados con una clave de idempotencia.
- Definir transiciones permitidas y reglas de cancelación y reposición de stock.
- Simular pagos aprobados, rechazados y pendientes, sin cobros reales.

### Notificaciones

Bandeja interna, contador de pendientes y marcado individual o conjunto como leído.

### Tiempo real

Chat por salas y eventos sobre cambios de recursos. Incluir autenticación de conexiones, autorización por sala y estrategias documentadas para reconexión y recuperación de eventos.

### Trabajos asíncronos

Exportaciones con estados `pending`, `processing`, `completed` y `failed`. El cliente podrá consultar progreso y obtener una descarga temporal autorizada al finalizar.

## 9. Contrato común de API

| Aspecto | Convención |
|---|---|
| Prefijo | `/api/v1` |
| Formato | JSON; multipart para archivos |
| Identificadores | UUID |
| Fechas | ISO 8601 en UTC |
| Importes | Enteros en unidad mínima y moneda explícita |
| Listados | `data` y `meta` con paginación |
| Detalle | `data` con el recurso |
| Creación | `201 Created` |
| Actualización parcial | PATCH |
| Eliminación exitosa | `204 No Content`, sin cuerpo |
| Errores | Código estable, mensaje, campos y `requestId` |
| Permisos | Validación por recurso y espacio |
| Límites | Cuotas documentadas y `429` |

### Listado paginado

```json
{
  "data": [
    {
      "id": "07c66f8b-505b-4e51-b810-c93e8150d490",
      "name": "Teclado",
      "price": 49900,
      "currency": "MXN",
      "stock": 10
    }
  ],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 1,
    "totalPages": 1
  }
}
```

### Error de validación

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Revisa los campos enviados.",
    "fields": {
      "price": ["Debe ser mayor que cero."]
    }
  },
  "requestId": "f72ed910-120f-4e32-8c70-f796dd47ceba"
}
```

### Estados de error

| Estado | Uso propuesto |
|---|---|
| 400 | Petición mal formada |
| 401 | Autenticación ausente, inválida o vencida |
| 403 | Permisos insuficientes |
| 404 | Recurso inexistente o no visible para el solicitante |
| 409 | Conflicto de versión, duplicado o estado incompatible |
| 422 | Campos o reglas de entrada inválidos |
| 429 | Cuota o límite de peticiones alcanzado |
| 500 | Fallo interno inesperado |
| 503 | Indisponibilidad temporal, incluida la simulación controlada |

## 10. Simulador de escenarios

Los escenarios se activarán explícitamente por espacio. Por defecto, la API tendrá un comportamiento estable. Cada escenario tendrá configuración y condiciones reproducibles.

| Escenario | Ejercicio |
|---|---|
| Respuesta lenta | Indicadores de carga y cancelación |
| Latencia superior al timeout | Manejo de timeout y reintento |
| Error temporal 503 | Recuperación y backoff |
| Sesión vencida | Renovación y repetición controlada |
| Permiso insuficiente | Distinguir autenticación de autorización |
| Lista vacía | Estados vacíos |
| Miles de registros | Paginación y rendimiento de interfaz |
| Edición simultánea | Resolución de conflictos 409 |
| Límite alcanzado | Respetar `Retry-After` |
| Archivo inválido | Errores de tipo y tamaño |
| Pedido repetido | Idempotencia |
| Trabajo asíncrono fallido | Consulta de estado y recuperación |

La configuración de fallos solo afectará al espacio autorizado y tendrá límites para evitar perjudicar al servicio compartido.

## 11. Experiencia del estudiante

Un portal sencillo permitirá:

- Crear y seleccionar espacios de práctica.
- Consultar URL base y credenciales de prueba.
- Abrir Swagger y descargar una colección de Postman.
- Cargar datos iniciales y reiniciar el espacio.
- Activar escenarios de error.
- Consultar correos de prueba propios.
- Seguir ejercicios con objetivos y resultados esperados.

Se incluirán ejemplos con `curl`, JavaScript/TypeScript y Kotlin con Retrofit. Las guías cubrirán autenticación, renovación de sesión, CRUD, paginación, archivos y manejo de errores.

### Progresión de ejercicios

| Nivel | Proyecto sugerido |
|---|---|
| Inicial | Catálogo público con listado y detalle |
| Básico | CRUD de productos en sandbox anónimo |
| Intermedio | Registro, login, perfil y notas privadas |
| Intermedio avanzado | Archivos, filtros, roles y conflictos |
| Avanzado | Carrito, pedidos, idempotencia y pagos simulados |
| Integraciones | Tiempo real, notificaciones y trabajos asíncronos |

## 12. Calidad y operación

- Datos iniciales reproducibles y reinicios limitados al espacio solicitado.
- Cuotas de almacenamiento y peticiones por modalidad.
- Política documentada de expiración y limpieza de sandboxes anónimos.
- Configuración validada al arrancar y secretos fuera del código.
- Logs con `requestId`, sin contraseñas ni tokens.
- Documentación de retención y eliminación de datos.
- Pruebas de flujos completos y aislamiento entre usuarios y espacios.
- Pruebas de renovación y revocación de sesiones, permisos, concurrencia e idempotencia.
- Endpoints de salud para operación del servicio.

## 13. Etapas de desarrollo

| Etapa | Entregables |
|---|---|
| 1. Base utilizable | Espacios aislados, autenticación, perfil, productos públicos y privados, notas, documentación y reinicio |
| 2. Práctica intermedia | Categorías, archivos, tareas, roles y simulación de errores |
| 3. Flujos de negocio | Carrito, pedidos, pagos simulados e idempotencia |
| 4. Integraciones avanzadas | Tiempo real, notificaciones y trabajos asíncronos |

## 14. Criterio de aceptación de la primera versión

La primera versión estará completa cuando un estudiante pueda construir una aplicación que permita registrarse, iniciar sesión, consultar y editar su perfil, gestionar productos y notas, mantener su sesión y mostrar errores correctamente.

También deberá poder empezar con un CRUD sin login y reiniciar sus datos sin afectar a otros estudiantes. La documentación y los datos de ejemplo deberán permitir completar estos flujos sin intervención manual del administrador.

## 15. Referencias técnicas

- [Módulos de NestJS](https://docs.nestjs.com/modules)
- [Validación en NestJS](https://docs.nestjs.com/techniques/validation)
- [OpenAPI en NestJS](https://docs.nestjs.com/openapi/introduction)
- [Documentación de Prisma](https://www.prisma.io/docs/)

Las rutas, campos y comportamientos de este documento son propuestas de diseño para el servicio.
