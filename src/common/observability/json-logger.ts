import { currentRequestId } from './request-context';

type LogLevel = 'info' | 'warn' | 'error';

export function logJson(
  level: LogLevel,
  event: string,
  fields: Record<string, unknown> = {},
): void {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    event,
    ...fields,
    requestId: currentRequestId() ?? null,
  };
  process.stdout.write(`${JSON.stringify(entry)}\n`);
}
