import { IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class ChatSendDto {
  @IsUUID()
  roomId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  content!: string;

  /** Espacio opcional para `events:replay`; en `chat:send` se ignora. */
  @IsOptional()
  @IsUUID()
  spaceId?: string;
}
