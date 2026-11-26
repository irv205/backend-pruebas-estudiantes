/** Nombres de eventos y salas del canal WebSocket (prefijo `/api/v1`). */
export const WS_EVENTS = {
  CHAT_SEND: 'chat:send',
  CHAT_MESSAGE: 'chat:message',
  RESOURCE_CHANGED: 'resource:changed',
  NOTIFICATION_NEW: 'notification:new',
  JOB_UPDATED: 'job:updated',
  EVENTS_REPLAY: 'events:replay',
  ERROR: 'ws:error',
} as const;

export type WsEventName = (typeof WS_EVENTS)[keyof typeof WS_EVENTS];

export const roomName = {
  user: (userId: string) => `user:${userId}`,
  space: (spaceId: string) => `space:${spaceId}`,
  chat: (roomId: string) => `chat:${roomId}`,
};

export interface ResourceChangedPayload {
  id: number;
  spaceId: string;
  type: string;
  action: 'created' | 'updated' | 'deleted' | 'reset';
  resourceType: string;
  resourceId: string | null;
  createdAt: string;
}

export interface ReplayEvent {
  id: number;
  spaceId: string;
  type: string;
  payload: unknown;
  createdAt: string;
}
