import 'server-only';

import { Resend } from 'resend';

import { env } from '@/lib/env';

import type { EmailMessage, EmailProvider, SendResult } from './provider';

/**
 * Resend transport.
 *
 * Note the deliberate absence of `throw`. Every failure path returns a
 * `SendResult` with `ok: false` and a message, which the outbox persists. The
 * complaint update that triggered the email has already committed by the time
 * this runs; nothing here can undo it.
 */
export class ResendEmailProvider implements EmailProvider {
  readonly name = 'resend' as const;
  private client: Resend;

  constructor() {
    this.client = new Resend(env.RESEND_API_KEY);
  }

  async send(message: EmailMessage): Promise<SendResult> {
    try {
      const { data, error } = await this.client.emails.send({
        from: env.EMAIL_FROM,
        to: [message.to],
        subject: message.subject,
        html: message.html,
        text: message.text,
      });

      if (error) {
        return { ok: false, error: `${error.name}: ${error.message}` };
      }
      return { ok: true, providerMessageId: data?.id };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Unknown email transport failure.',
      };
    }
  }
}

/**
 * Console transport — the default when no API key is configured.
 *
 * Renders the message to the server log instead of sending it. Combined with
 * the outbox and the admin Email Log screen, this means the entire
 * notification pipeline is observable and demonstrable with no third-party
 * account: you can see which email was generated, for whom, and why.
 */
export class ConsoleEmailProvider implements EmailProvider {
  readonly name = 'console' as const;

  async send(message: EmailMessage): Promise<SendResult> {
    console.info(
      [
        '',
        '┌─ email (console transport — no RESEND_API_KEY configured) ─────────',
        `│ to:      ${message.toName ? `${message.toName} <${message.to}>` : message.to}`,
        `│ subject: ${message.subject}`,
        '│',
        ...message.text.split('\n').map((line) => `│ ${line}`),
        '└───────────────────────────────────────────────────────────────────',
        '',
      ].join('\n'),
    );

    return { ok: true, providerMessageId: `console-${Date.now()}` };
  }
}

let cached: EmailProvider | undefined;

export function getEmailProvider(): EmailProvider {
  if (!cached) {
    cached = env.hasResend ? new ResendEmailProvider() : new ConsoleEmailProvider();
  }
  return cached;
}
