// ponytail: provider log lokal (dev). Ganti ke SMTP/WA provider saat kredensial tersedia.
import { appendFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const logDir = path.join(process.cwd(), "vendor", "logs");

export interface MailProvider {
  send(to: string, subject: string, body: string): Promise<void>;
}

class LogMailProvider implements MailProvider {
  async send(to: string, subject: string, body: string) {
    mkdirSync(logDir, { recursive: true });
    appendFileSync(
      path.join(logDir, "mail-outbox.log"),
      `[${new Date().toISOString()}] to=${to} subject="${subject}"\n${body}\n---\n`
    );
    console.log(`[mail:log] to=${to} subject="${subject}"`);
  }
}

export const mailer: MailProvider = new LogMailProvider();
