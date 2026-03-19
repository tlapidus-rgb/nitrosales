// Logger Estructurado — NitroSales [FASE 1.1]
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
  records_skipped?: number;
  error?: string;
  details?: Record<string, unknown>;
}

export function createLogger(service: string, orgId?: string) {
  const startTimes: Record<string, number> = {};
  return {
    start(action: string, details?: Record<string, unknown>) {
      startTimes[action] = Date.now();
      console.log(JSON.stringify({
        timestamp: new Date().toISOString(), level: 'info', service,
        action: action + ':start', orgId, details
      }));
    },
    end(action: string, result?: Partial<LogEntry>) {
      const duration_ms = startTimes[action] ? Date.now() - startTimes[action] : undefined;
      delete startTimes[action];
      console.log(JSON.stringify({
        timestamp: new Date().toISOString(), level: 'info', service,
        action: action + ':end', orgId, duration_ms, ...result
      }));
    },
    info(action: string, details?: Record<string, unknown>) {
      console.log(JSON.stringify({
        timestamp: new Date().toISOString(), level: 'info', service, action, orgId, details
      }));
    },
    warn(action: string, details?: Record<string, unknown>) {
      console.warn(JSON.stringify({
        timestamp: new Date().toISOString(), level: 'warn', service, action, orgId, details
      }));
    },
    error(action: string, error: unknown, details?: Record<string, unknown>) {
      console.error(JSON.stringify({
        timestamp: new Date().toISOString(), level: 'error', service, action, orgId,
        error: error instanceof Error ? error.message : String(error), details
      }));
    },
  };
}
