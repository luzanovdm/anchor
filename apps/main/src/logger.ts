/** Single logging entry point for the main process (no stray `console.*`). */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

class Logger {
  private readonly enabled: boolean = process.env['ANCHOR_DEBUG'] === '1';

  debug(scope: string, message: string, meta?: unknown): void {
    if (this.enabled) this.write('debug', scope, message, meta);
  }
  info(scope: string, message: string, meta?: unknown): void {
    this.write('info', scope, message, meta);
  }
  warn(scope: string, message: string, meta?: unknown): void {
    this.write('warn', scope, message, meta);
  }
  error(scope: string, message: string, meta?: unknown): void {
    this.write('error', scope, message, meta);
  }

  private write(level: LogLevel, scope: string, message: string, meta?: unknown): void {
    const line = `[${level}] ${scope}: ${message}`;
    const stream = level === 'error' || level === 'warn' ? process.stderr : process.stdout;
    stream.write(meta === undefined ? `${line}\n` : `${line} ${safe(meta)}\n`);
  }
}

function safe(meta: unknown): string {
  try {
    return JSON.stringify(meta);
  } catch {
    return String(meta);
  }
}

export const logger = new Logger();
