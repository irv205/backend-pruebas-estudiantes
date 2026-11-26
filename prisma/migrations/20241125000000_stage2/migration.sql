-- Migración incremental de la Etapa 2.NO modifica la migración inicial.
--Se aplica con `prisma migrate deploy` sobre una BD ya migrada a Etapa 1.

-- ── Roles: alinear los valores con la propuesta ─────────────────────────────
-- READER -> LECTOR, EDITOR -> EDITOR, ADMIN -> ADMINISTRADOR.
-- Se recrea el tipo porque PostgreSQL no permite renombrar valores de enum.
ALTER TYPE "MembershipRole" RENAME TO "MembershipRole_old";
CREATE TYPE "MembershipRole" AS ENUM ('LECTOR', 'EDITOR', 'ADMINISTRADOR');

ALTER TABLE "SpaceMembership" ADD COLUMN "role_new" "MembershipRole" NOT NULL DEFAULT 'EDITOR';
UPDATE "SpaceMembership"
SET "role_new" = CASE "role"::text
  WHEN 'ADMIN' THEN 'ADMINISTRADOR'
  WHEN 'READER' THEN 'LECTOR'
  ELSE 'EDITOR'
END::"MembershipRole";
ALTER TABLE "SpaceMembership" DROP COLUMN "role";
ALTER TABLE "SpaceMembership" RENAME COLUMN "role_new" TO "role";
DROP TYPE "MembershipRole_old";

-- ── Categorías: estado activo y control de versión ──────────────────────────
ALTER TABLE "Category" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Category" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;

-- ── Enums de la Etapa 2 ─────────────────────────────────────────────────────
CREATE TYPE "TaskStatus" AS ENUM ('TODO', 'IN_PROGRESS', 'DONE', 'CANCELLED');
CREATE TYPE "TaskPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');
CREATE TYPE "FileKind" AS ENUM ('AVATAR', 'IMAGE', 'DOCUMENT', 'OTHER');

-- ── Tareas y subtareas ──────────────────────────────────────────────────────
CREATE TABLE "Task" (
    "id" UUID NOT NULL,
    "spaceId" UUID NOT NULL,
    "ownerId" UUID,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "priority" "TaskPriority" NOT NULL DEFAULT 'MEDIUM',
    "status" "TaskStatus" NOT NULL DEFAULT 'TODO',
    "dueAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Subtask" (
    "id" UUID NOT NULL,
    "taskId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "isDone" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subtask_pkey" PRIMARY KEY ("id")
);

-- ── Archivos: metadatos en PostgreSQL, objeto en S3 o almacenamiento local ──
CREATE TABLE "FileObject" (
    "id" UUID NOT NULL,
    "spaceId" UUID NOT NULL,
    "ownerId" UUID,
    "key" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "kind" "FileKind" NOT NULL DEFAULT 'OTHER',
    "entityType" TEXT,
    "entityId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FileObject_pkey" PRIMARY KEY ("id")
);

-- ── Simulador: una fila por espacio con escenarios activables ───────────────
CREATE TABLE "SpaceScenarioConfig" (
    "id" UUID NOT NULL,
    "spaceId" UUID NOT NULL,
    "slowResponse" BOOLEAN NOT NULL DEFAULT false,
    "timeout" BOOLEAN NOT NULL DEFAULT false,
    "temporary503" BOOLEAN NOT NULL DEFAULT false,
    "sessionExpired" BOOLEAN NOT NULL DEFAULT false,
    "insufficientPermission" BOOLEAN NOT NULL DEFAULT false,
    "emptyList" BOOLEAN NOT NULL DEFAULT false,
    "largeVolume" BOOLEAN NOT NULL DEFAULT false,
    "concurrentEdit" BOOLEAN NOT NULL DEFAULT false,
    "rateLimit" BOOLEAN NOT NULL DEFAULT false,
    "invalidFile" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SpaceScenarioConfig_pkey" PRIMARY KEY ("id")
);

-- ── Índices ─────────────────────────────────────────────────────────────────
CREATE INDEX "Task_spaceId_status_idx" ON "Task"("spaceId", "status");
CREATE INDEX "Task_spaceId_priority_idx" ON "Task"("spaceId", "priority");
CREATE INDEX "Task_spaceId_dueAt_idx" ON "Task"("spaceId", "dueAt");
CREATE INDEX "Subtask_taskId_idx" ON "Subtask"("taskId");
CREATE UNIQUE INDEX "FileObject_key_key" ON "FileObject"("key");
CREATE INDEX "FileObject_spaceId_idx" ON "FileObject"("spaceId");
CREATE INDEX "FileObject_entityType_entityId_idx" ON "FileObject"("entityType", "entityId");
CREATE UNIQUE INDEX "SpaceScenarioConfig_spaceId_key" ON "SpaceScenarioConfig"("spaceId");

-- ── Claves foráneas ─────────────────────────────────────────────────────────
ALTER TABLE "Task" ADD CONSTRAINT "Task_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Task" ADD CONSTRAINT "Task_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Subtask" ADD CONSTRAINT "Subtask_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FileObject" ADD CONSTRAINT "FileObject_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FileObject" ADD CONSTRAINT "FileObject_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SpaceScenarioConfig" ADD CONSTRAINT "SpaceScenarioConfig_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE CASCADE ON UPDATE CASCADE;
