import net from 'net';
import tls from 'tls';
import { env } from '../config/env';
import { logger } from '../utils/logger';

export function isEmailConfigured(): boolean {
  return Boolean(env.email.host && env.email.port && env.email.user && env.email.password);
}

export interface SendEmailOptions {
  to: string;
  subject: string;
  text: string;
}

function readSmtpResponse(socket: net.Socket): Promise<string> {
  return new Promise((resolve, reject) => {
    let buffer = '';
    const onData = (chunk: Buffer) => {
      buffer += chunk.toString('utf8');
      const lines = buffer.split(/\r?\n/).filter((l) => l.length > 0);
      if (!lines.length) return;
      const last = lines[lines.length - 1];
      // Complete SMTP reply: "250 OK" (code + space) vs multiline "250-..."
      if (/^\d{3} /.test(last)) {
        cleanup();
        resolve(buffer);
      }
    };
    const onError = (err: Error) => {
      cleanup();
      reject(err);
    };
    const onClose = () => {
      cleanup();
      reject(new Error('SMTP connection closed unexpectedly'));
    };
    const cleanup = () => {
      socket.off('data', onData);
      socket.off('error', onError);
      socket.off('close', onClose);
    };
    socket.on('data', onData);
    socket.on('error', onError);
    socket.on('close', onClose);
  });
}

async function writeCommand(socket: net.Socket, command: string): Promise<string> {
  socket.write(command + '\r\n');
  return readSmtpResponse(socket);
}

function expectCode(response: string, ...codes: number[]): void {
  const code = parseInt(response.slice(0, 3), 10);
  if (!codes.includes(code)) {
    throw new Error(`SMTP unexpected reply ${code}: ${response.trim().slice(0, 200)}`);
  }
}

function connectPlain(host: string, port: number): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host, port }, () => resolve(socket));
    socket.once('error', reject);
  });
}

function upgradeToTls(socket: net.Socket, host: string): Promise<tls.TLSSocket> {
  return new Promise((resolve, reject) => {
    const secure = tls.connect(
      { socket, host, servername: host },
      () => resolve(secure)
    );
    secure.once('error', reject);
  });
}

function connectTls(host: string, port: number): Promise<tls.TLSSocket> {
  return new Promise((resolve, reject) => {
    const socket = tls.connect({ host, port, servername: host }, () => resolve(socket));
    socket.once('error', reject);
  });
}

function encodeAddressHeader(from: string, to: string, subject: string, text: string): string {
  const normalized = text.replace(/\r?\n/g, '\r\n');
  return [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: 8bit',
    '',
    normalized,
    '',
  ].join('\r\n');
}

/**
 * Minimal SMTP sender (no nodemailer). Supports STARTTLS (587) and implicit TLS (465).
 * No-ops when SMTP env is incomplete.
 */
export async function sendEmail(options: SendEmailOptions): Promise<boolean> {
  if (!isEmailConfigured()) {
    return false;
  }

  const host = env.email.host!;
  const port = env.email.port!;
  const user = env.email.user!;
  const password = env.email.password!;
  const from = env.email.from;
  const { to, subject, text } = options;

  let socket: net.Socket | tls.TLSSocket | null = null;

  try {
    if (port === 465) {
      socket = await connectTls(host, port);
    } else {
      socket = await connectPlain(host, port);
    }

    expectCode(await readSmtpResponse(socket), 220);
    expectCode(await writeCommand(socket, `EHLO tcgtracker`), 250);

    if (port !== 465) {
      expectCode(await writeCommand(socket, 'STARTTLS'), 220);
      socket = await upgradeToTls(socket, host);
      expectCode(await writeCommand(socket, `EHLO tcgtracker`), 250);
    }

    expectCode(await writeCommand(socket, 'AUTH LOGIN'), 334);
    expectCode(await writeCommand(socket, Buffer.from(user).toString('base64')), 334);
    expectCode(await writeCommand(socket, Buffer.from(password).toString('base64')), 235);

    expectCode(await writeCommand(socket, `MAIL FROM:<${from}>`), 250);
    expectCode(await writeCommand(socket, `RCPT TO:<${to}>`), 250, 251);
    expectCode(await writeCommand(socket, 'DATA'), 354);

    const message = encodeAddressHeader(from, to, subject, text);
    // Terminate DATA with <CRLF>.<CRLF>; escape lines starting with '.'
    const escaped = message
      .split(/\r?\n/)
      .map((line) => (line.startsWith('.') ? '.' + line : line))
      .join('\r\n');
    expectCode(await writeCommand(socket, escaped + '\r\n.'), 250);
    await writeCommand(socket, 'QUIT').catch(() => undefined);

    logger.info('Email sent', { to, subject });
    return true;
  } catch (err: any) {
    logger.warn('Failed to send email (non-fatal)', {
      to,
      subject,
      error: err?.message || String(err),
    });
    return false;
  } finally {
    try {
      socket?.destroy();
    } catch {
      /* ignore */
    }
  }
}

export function formatAlertEmail(alert: {
  card_name: string;
  card_id: string;
  alert_type?: string;
  condition?: string;
  target_price?: number;
  threshold_pct?: number | null;
}): { subject: string; text: string } {
  const type = alert.alert_type || 'price_threshold';
  const subject = `TCGTracker alert: ${alert.card_name}`;
  const lines = [
    `Your alert for "${alert.card_name}" (${alert.card_id}) was triggered.`,
    '',
    `Type: ${type}`,
  ];
  if (type === 'price_threshold' && alert.target_price != null) {
    lines.push(`Condition: ${alert.condition || 'n/a'} $${Number(alert.target_price).toFixed(2)}`);
  }
  if (alert.threshold_pct != null) {
    lines.push(`Threshold: ${alert.threshold_pct}%`);
  }
  lines.push('', '— TCGTracker');
  return { subject, text: lines.join('\n') };
}
