import { Injectable } from '@nestjs/common';
import { Server } from 'socket.io';
import { roomName } from './realtime.constants';

/**
 * Emisor desacoplado del gateway: permite que los servicios de dominio
 * (pedidos, productos, notificaciones, jobs) publiquen eventos sin depender
 * del ciclo de vida del socket ni crear dependencias circulares.
 */
@Injectable()
export class RealtimeEmitter {
  private server: Server | null = null;

  setServer(server: Server): void {
    this.server = server;
  }

  toSpace(spaceId: string, event: string, payload: unknown): void {
    this.server?.to(roomName.space(spaceId)).emit(event, payload);
  }

  toChatRoom(roomId: string, event: string, payload: unknown): void {
    this.server?.to(roomName.chat(roomId)).emit(event, payload);
  }

  toUser(userId: string, event: string, payload: unknown): void {
    this.server?.to(roomName.user(userId)).emit(event, payload);
  }

  toSocket(socketId: string, event: string, payload: unknown): void {
    this.server?.to(socketId).emit(event, payload);
  }

  get connected(): boolean {
    return this.server !== null;
  }
}
