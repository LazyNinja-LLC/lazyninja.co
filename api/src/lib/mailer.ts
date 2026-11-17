import nodemailer from 'nodemailer';
import type { Config } from '../config';
import { REASON_LABELS, type ContactInput } from './contact-schema';

export interface Mailer {
  sendContact(input: ContactInput): Promise<void>;
}

/** SMTP mailer: from no-reply@lazyninja.co to MAIL_TO, Reply-To set to the visitor. */
export function createMailer(config: Config): Mailer | null {
  if (!config.smtp) return null;
  const transport = nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.port === 465,
    auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  });
  return {
    async sendContact(input) {
      await transport.sendMail({
        from: { name: 'lazyninja.co', address: config.mail.from },
        to: config.mail.to,
        replyTo: { name: input.name, address: input.email },
        subject: `[lazyninja.co] ${REASON_LABELS[input.reason]}: ${input.name}`,
        text: [
          `Name:   ${input.name}`,
          `Email:  ${input.email}`,
          `Reason: ${REASON_LABELS[input.reason]}`,
          '',
          input.message,
          '',
          '--',
          'Sent from the contact form on lazyninja.co. Reply to this email to answer directly.',
        ].join('\n'),
      });
    },
  };
}

/** Dev-only mailer that prints messages instead of sending them. */
export const consoleMailer: Mailer = {
  async sendContact(input) {
    console.log(
      `[dev mail] ${REASON_LABELS[input.reason]} from ${input.name} <${input.email}>:\n${input.message}`,
    );
  },
};
