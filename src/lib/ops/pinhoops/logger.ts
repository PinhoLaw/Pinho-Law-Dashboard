/**
 * PinhoOps AI — Structured JSON Logger
 *
 * Provides structured logging for all PinhoOps components.
 * Outputs JSON to stdout for Vercel log drain compatibility.
 *
 * Features:
 *   - Structured JSON output (key=value pairs for Vercel/Datadog)
 *   - Child loggers with inherited context
 *   - Automatic timing via start()/end()
 *   - Error serialization with stack traces
 *   - Log level filtering via LOG_LEVEL env var
 */

// ─── Types ──────────────────────────────────────────────

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  level: LogLevel;
  component: string;
  msg: string;
  timestamp: string;
  [key: string]: unknown;
}

interface LogContext {
  [key: string]: unknown;
}

// ─── Level Priority ─────────────────────────────────────

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const MIN_LEVEL: LogLevel = (process.env.LOG_LEVEL as LogLevel) || 'info';

// ─── Logger Class ───────────────────────────────────────

export class OpsLogger {
  private component: string;
  private context: LogContext;
  private timers: Map<string, number> = new Map();

  constructor(component: string, context: LogContext = {}) {
    this.component = component;
    this.context = context;
  }

  /**
   * Create a child logger with additional context.
   * Inherits parent component name as prefix.
   */
  child(subComponent: string, extraContext: LogContext = {}): OpsLogger {
    return new OpsLogger(`${this.component}:${subComponent}`, {
      ...this.context,
      ...extraContext,
    });
  }

  /**
   * Start a timer for measuring operation duration.
   */
  startTimer(label: string): void {
    this.timers.set(label, Date.now());
  }

  /**
   * End a timer and return the duration in ms.
   */
  endTimer(label: string): number {
    const start = this.timers.get(label);
    if (!start) return 0;
    this.timers.delete(label);
    return Date.now() - start;
  }

  // ─── Log Methods ────────────────────────────────────

  debug(msg: string, data?: LogContext): void {
    this.write('debug', msg, data);
  }

  info(msg: string, data?: LogContext): void {
    this.write('info', msg, data);
  }

  warn(msg: string, data?: LogContext): void {
    this.write('warn', msg, data);
  }

  error(msg: string, data?: LogContext): void {
    this.write('error', msg, data);
  }

  /**
   * Log an API call with timing and status.
   * Use with startTimer/endTimer for automatic duration.
   */
  apiCall(service: string, method: string, path: string, data?: LogContext): void {
    this.info(`${service} API`, {
      service,
      method,
      path,
      ...data,
    });
  }

  /**
   * Log an API response with duration.
   */
  apiResponse(
    service: string,
    method: string,
    path: string,
    status: number,
    durationMs: number,
    data?: LogContext,
  ): void {
    const level: LogLevel = status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info';
    this.write(level, `${service} API response`, {
      service,
      method,
      path,
      status,
      duration_ms: durationMs,
      ...data,
    });
  }

  /**
   * Log an error with full context and optional cause chain.
   */
  logError(msg: string, err: unknown, data?: LogContext): void {
    const serialized = serializeError(err);
    this.error(msg, {
      ...serialized,
      ...data,
    });
  }

  // ─── Internal ───────────────────────────────────────

  private write(level: LogLevel, msg: string, data?: LogContext): void {
    if (LEVEL_PRIORITY[level] < LEVEL_PRIORITY[MIN_LEVEL]) return;

    const entry: LogEntry = {
      level,
      component: this.component,
      msg,
      timestamp: new Date().toISOString(),
      ...this.context,
      ...data,
    };

    // Clean undefined values
    for (const key of Object.keys(entry)) {
      if (entry[key] === undefined) delete entry[key];
    }

    const output = JSON.stringify(entry);

    switch (level) {
      case 'error':
        console.error(output);
        break;
      case 'warn':
        console.warn(output);
        break;
      case 'debug':
        console.debug(output);
        break;
      default:
        console.log(output);
    }
  }
}

// ─── Error Serialization ────────────────────────────────

function serializeError(err: unknown): LogContext {
  if (err instanceof Error) {
    const result: LogContext = {
      error_name: err.name,
      error_message: err.message,
    };

    if (err.stack) {
      // Only include first 5 stack frames for readability
      const frames = err.stack.split('\n').slice(0, 6);
      result.error_stack = frames.join('\n');
    }

    // Check for common error properties
    const anyErr = err as any;
    if (anyErr.status) result.error_status = anyErr.status;
    if (anyErr.statusCode) result.error_status_code = anyErr.statusCode;
    if (anyErr.code) result.error_code = anyErr.code;
    if (anyErr.cause) result.error_cause = serializeError(anyErr.cause);

    return result;
  }

  if (typeof err === 'string') {
    return { error_message: err };
  }

  return { error_raw: String(err) };
}

// ─── Singleton Loggers ──────────────────────────────────

/** Root PinhoOps logger */
export const opsLog = new OpsLogger('pinhoops');

/** Clio API logger */
export const clioLog = new OpsLogger('clio-api');

/** Microsoft Graph logger */
export const graphLog = new OpsLogger('ms-graph');

/** GitHub state logger */
export const githubLog = new OpsLogger('github-state');

// ─── Middleware-style request logger ────────────────────

/**
 * Log an incoming API request with timing.
 * Returns a function to call when the request completes.
 */
export function logRequest(
  method: string,
  path: string,
  data?: LogContext,
): (status: number, responseData?: LogContext) => void {
  const start = Date.now();
  const requestId = `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

  opsLog.info('Request started', {
    request_id: requestId,
    method,
    path,
    ...data,
  });

  return (status: number, responseData?: LogContext) => {
    const durationMs = Date.now() - start;
    const level: LogLevel = status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info';

    opsLog[level]('Request completed', {
      request_id: requestId,
      method,
      path,
      status,
      duration_ms: durationMs,
      ...responseData,
    });
  };
}
