// ══════════════════════════════════════════════
// Logger Estructurado — NitroSales
// ══════════════════════════════════════════════
// [FASE 1.1] Logging con formato JSON consistente.
// Cada sync, chain y webhook loguea inicio, fin, y errores.

type LogLevel = 'info' | 'warn' | 'error';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  service: string;
  action: string;
  orgId?: string;
  duration_ms?: number;
  records_processed?: number;
  records_created?: number;
  records_updated?: number;
  records_skipped?: number;
  error?: string;
  details?: Record<string, unknown>;
}

function formatLog(entry: LogEntry): string {
  return JSON.stringify(entry);
}

export function createLogger(service: string, orgId?: string) {
  const startTimes: Record<string, number> = {};

  return {
    start(action: string, details?: Record<string, unknown>) {
      startTimes[action] = Date.now();
      const entry: LogEntry = {
        timestamp: new Date().toISOString(),
        level: 'info',
        service,
        action: `${action}:start`,
        orgId,
        details,
      };
      console.log(formatLog(entry));
    },

    end(action: string, result?: {
      records_processed?: number;
      records_created?: number;
      records_updated?: number;
      records_skipped?: number;
      details?: Record<string, unknown>;
    }) {
      const duration_ms = startTimes[action]
        ? Date.now() - startTimes[action]
        : undefined;
      delete startTimes[action];

      const entry: LogEntry = {
        timestamp: new Date().toISOString(),
        level: 'info',
        service,
        action: `${action}:end`,
        orgId,
        duration_ms,
        ...result,
      };
      console.log(formatLog(entry));
    },

    info(action: string, details?: Record<string, unknown>) {
      const entry: LogEntry = {
        timestamp: new Date().toISOString(),
        level: 'info',
        service,
        action,
        orgId,
        details,
      };
      console.log(formatLog(entry));
    },

    warn(action: string, details?: Record<string, unknown>) {
      const entry: LogEntry = {
        timestamp: new Date().toISOString(),
        level: 'warn',
        service,
        action,
        orgId,
        details,
      };
      console.warn(formatLog(entry));
    },

    error(action: string, error: unknown, details?: Record<string, unknown>) {
      const entry: LogEntry = {
        timestamp: new Date().toISOString(),
        level: 'error',
        service,
        action,
        orgId,
        error: error instanceof Error ? error.message : String(error),
        details,
      };
      console.error(formatLog(entry));
    },
  };
}
