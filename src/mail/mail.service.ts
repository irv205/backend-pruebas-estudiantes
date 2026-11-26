import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import SMTPTransport from 'nodemailer/lib/smtp-transport';

/**
 * Envío de correos de prueba vía SMTP interno (Mailpit).
 * Los envíos son de mejor esfuerzo: un fallo de SMTP nunca rompe el flujo
 * de autenticación; se registra una advertencia con el requestId ajeno.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: nodemailer.Transporter<SMTPTransport.SentMessageInfo>;
  private readonly from: string;
  private readonly publicBaseUrl: string;

  constructor(config: ConfigService) {
    this.transporter = nodemailer.createTransport({
      host: config.getOrThrow<string>('SMTP_HOST'),
      port: config.getOrThrow<number>('SMTP_PORT'),
      secure: false,
    });
    this.from = config.getOrThrow<string>('SMTP_FROM');
    this.publicBaseUrl = config.getOrThrow<string>('PUBLIC_BASE_URL');
  }

  async sendVerificationEmail(to: string, token: string): Promise<void> {
    await this.send(
      to,
      'Verifica tu correo — Backend de práctica',
      [
        'Gracias por registrarte en el backend de práctica.',
        '',
        'Tu token de verificación (un solo uso, válido 24 h):',
        token,
        '',
        'Verifícalo con:',
        `curl -X POST ${this.publicBaseUrl}/api/v1/auth/verify-email \\`,
        '  -H "Content-Type: application/json" \\',
        `  -d '{"token": "${token}"}'`,
      ].join('\n'),
    );
  }

  async sendPasswordResetEmail(to: string, token: string): Promise<void> {
    await this.send(
      to,
      'Recuperación de contraseña — Backend de práctica',
      [
        'Recibimos una solicitud para restablecer tu contraseña.',
        '',
        'Tu token de recuperación (un solo uso, válido 1 h):',
        token,
        '',
        'Cámbiala con:',
        `curl -X POST ${this.publicBaseUrl}/api/v1/auth/reset-password \\`,
        '  -H "Content-Type: application/json" \\',
        `  -d '{"token": "${token}", "password": "TuNueva.Password1"}'`,
        '',
        'Si no fuiste tú, ignora este mensaje.',
      ].join('\n'),
    );
  }

  private async send(to: string, subject: string, text: string): Promise<void> {
    try {
      await this.transporter.sendMail({ from: this.from, to, subject, text });
    } catch (err) {
      this.logger.warn(
        `No se pudo enviar correo a ${to} (${subject}): ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }
}
