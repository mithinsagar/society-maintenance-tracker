import 'server-only';

export interface EmailMessage {
  to: string;
  toName?: string | null;
  subject: string;
  html: string;
  text: string;
}

export interface SendResult {
  ok: boolean;
  providerMessageId?: string;
  error?: string;
}

/**
 * Email transport abstraction.
 *
 * Implementations must never throw: a delivery failure is a normal, expected
 * outcome that the outbox records and can retry. Throwing would push provider
 * problems into the caller's control flow, which is exactly the coupling the
 * outbox exists to prevent.
 */
export interface EmailProvider {
  readonly name: 'resend' | 'console';
  send(message: EmailMessage): Promise<SendResult>;
}
