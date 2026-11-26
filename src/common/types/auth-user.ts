/** Usuario autenticado disponible en `req.user` tras JwtAuthGuard. */
export interface AuthUser {
  id: string;
  email: string;
  /** Espacio personal del usuario (Etapa 1: un espacio por usuario). */
  spaceId: string;
}
