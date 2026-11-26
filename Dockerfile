# ─────────────────────────────────────────────────────────────────────────────
# Imagen multi-stage. Versiones fijadas: Node 20.18.1 (ver .nvmrc).
# Etapas:
#   full-deps  → dependencias completas + cliente Prisma generado
#   builder    → compilación TypeScript
#   prod-deps  → solo dependencias de producción (prune)
#   production → imagen final, usuario no root, SIN devDependencies
#   development→ etapa usada por docker-compose (bind mount + watch)
# ─────────────────────────────────────────────────────────────────────────────

FROM node:20.18.1-alpine AS base
WORKDIR /app
COPY package.json package-lock.json ./

FROM base AS full-deps
# OpenSSL es requerido por el schema engine de Prisma en Alpine; el resto es
# para compilar módulos nativos (argon2) si no hay prebuild disponible.
RUN apk add --no-cache openssl python3 make g++
RUN npm ci
COPY prisma ./prisma
RUN npx prisma generate

FROM base AS builder
COPY --from=full-deps /app/node_modules ./node_modules
COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src
RUN npm run build

FROM full-deps AS prod-deps
RUN npm prune --omit=dev

FROM node:20.18.1-alpine AS production
ENV NODE_ENV=production
WORKDIR /app
RUN addgroup -S nodejs && adduser -S nestjs -G nodejs
COPY --from=prod-deps --chown=nestjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nestjs:nodejs /app/dist ./dist
COPY --from=full-deps --chown=nestjs:nodejs /app/prisma ./prisma
COPY --chown=nestjs:nodejs package.json ./
USER nestjs
EXPOSE 3000
CMD ["node", "dist/main.js"]

# Desarrollo: el código se monta desde el host; /app/node_modules se conserva
# como volumen anónimo en compose para no mezclar binarios host/container.
FROM full-deps AS development
COPY . .
EXPOSE 3000
CMD ["npm", "run", "start:dev"]
