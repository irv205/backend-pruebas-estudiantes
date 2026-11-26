import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface MailpitAddress {
  Address?: string;
  Name?: string;
}

interface MailpitMessage {
  ID?: string;
  Subject?: string;
  From?: MailpitAddress;
  To?: MailpitAddress[];
  Cc?: MailpitAddress[];
  Bcc?: MailpitAddress[];
  Created?: string;
  Read?: boolean;
  Attachments?: number;
}

interface MailpitSearchResponse {
  messages?: MailpitMessage[];
}

interface InboxMessage {
  id: string;
  subject: string;
  from: string;
  to: string[];
  createdAt: string;
  read: boolean;
  attachments: number;
}

const INBOX_LIMIT = 20;
const MAILPIT_TIMEOUT_MS = 3000;

/**
 * Bandeja mediada: la API consulta Mailpit por su API interna y devuelve SOLO
 * los mensajes cuyo destinatario (To/Cc/Bcc) es el correo del usuario autenticado.
 * La UI de Mailpit nunca se expone a estudiantes; tampoco se devuelven cuerpos
 * ni snippets, porque contienen tokens de verificación/recuperación.
 */
@Injectable()
export class MailInboxService {
  private readonly apiUrl: string;

  constructor(config: ConfigService) {
    const configured = config.get<string>('MAILPIT_API_URL');
    const fromSmtp = `http://${config.getOrThrow<string>('SMTP_HOST')}:8025/api/v1`;
    this.apiUrl = (configured?.trim() || fromSmtp).replace(/\/$/, '');
  }

  async listFor(email: string) {
    const query = `to:${email.toLowerCase()}`;
    const url = `${this.apiUrl}/search?query=${encodeURIComponent(query)}&limit=${INBOX_LIMIT}`;

    let response: globalThis.Response;
    try {
      response = await fetch(url, { signal: AbortSignal.timeout(MAILPIT_TIMEOUT_MS) });
    } catch {
      throw this.unavailable();
    }
    if (!response.ok) throw this.unavailable();

    let payload: MailpitSearchResponse;
    try {
      payload = (await response.json()) as MailpitSearchResponse;
    } catch {
      throw this.unavailable();
    }

    const messages = Array.isArray(payload.messages) ? payload.messages : [];
    // Defensa en profundidad: Mailpit filtra por `to:` pero repetimos la
    // comprobación aquí para no filtrar jamás correos de otro estudiante.
    const mine = messages
      .filter((message) => this.isAddressedTo(message, email))
      .map<InboxMessage>((message) => ({
        id: typeof message.ID === 'string' ? message.ID : '',
        subject: typeof message.Subject === 'string' ? message.Subject : '(sin asunto)',
        from: message.From?.Address ?? 'desconocido',
        to: (message.To ?? []).map((entry) => entry.Address ?? '').filter(Boolean),
        createdAt: typeof message.Created === 'string' ? message.Created : '',
        read: Boolean(message.Read),
        attachments: Number(message.Attachments ?? 0),
      }));

    return {
      data: {
        email,
        count: mine.length,
        limit: INBOX_LIMIT,
        messages: mine,
      },
    };
  }

  private isAddressedTo(message: MailpitMessage, email: string): boolean {
    const wanted = email.toLowerCase();
    const addresses = [...(message.To ?? []), ...(message.Cc ?? []), ...(message.Bcc ?? [])];
    return addresses.some((entry) => typeof entry.Address === 'string' && entry.Address.toLowerCase() === wanted);
  }

  private unavailable(): ServiceUnavailableException {
    return new ServiceUnavailableException({
      code: 'MAIL_INBOX_UNAVAILABLE',
      message: 'No se pudo consultar la bandeja de correos de prueba. Inténtalo de nuevo.',
    });
  }
}
