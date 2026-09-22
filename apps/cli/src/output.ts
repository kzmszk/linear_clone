import { ApiError } from '../../../packages/client/src/index.ts';
import { z } from 'zod';

const globalOptionsSchema = z.object({
  url: z.string(),
  workspace: z.string().optional(),
  json: z.boolean().default(false),
  testEmail: z.string().optional(),
});
export type GlobalOptions = z.infer<typeof globalOptionsSchema>;

export function optionsFor(command: {
  optsWithGlobals(): unknown;
}): GlobalOptions {
  return globalOptionsSchema.parse(command.optsWithGlobals());
}

function scalar(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  )
    return String(value);
  return JSON.stringify(value);
}

function table(rows: Record<string, unknown>[]): string {
  if (!rows.length) return '(no records)';
  const keys = [
    'identifier',
    'key',
    'name',
    'email',
    'title',
    'status',
    'role',
    'version',
    'id',
  ];
  const columns = keys.filter((key) => rows.some((row) => key in row));
  const widths = columns.map((key) =>
    Math.max(key.length, ...rows.map((row) => scalar(row[key]).length)),
  );
  const line = (row: Record<string, unknown>) =>
    columns
      .map((key, index) => scalar(row[key]).padEnd(widths[index]))
      .join('  ');
  return [
    line(Object.fromEntries(columns.map((key) => [key, key]))),
    ...rows.map(line),
  ].join('\n');
}

export function printValue(value: unknown, json: boolean): void {
  if (json) {
    process.stdout.write(`${JSON.stringify(value)}\n`);
    return;
  }
  if (
    Array.isArray(value) &&
    value.every((item) => typeof item === 'object' && item !== null)
  ) {
    process.stdout.write(`${table(value as Record<string, unknown>[])}\n`);
    return;
  }
  if (typeof value === 'object' && value !== null && 'current' in value) {
    const current = value.current;
    if (typeof current === 'object' && current !== null)
      process.stdout.write(`${table([current as Record<string, unknown>])}\n`);
    else process.stdout.write(`${scalar(current)}\n`);
    return;
  }
  process.stdout.write(
    `${typeof value === 'string' ? value : JSON.stringify(value, null, 2)}\n`,
  );
}

export function printError(error: unknown, json: boolean): number {
  const status = error instanceof ApiError ? error.status : 1;
  const payload =
    error instanceof ApiError
      ? {
          error: {
            code: error.code,
            message: error.message,
            ...(error.current === undefined ? {} : { current: error.current }),
          },
        }
      : {
          error: {
            code: 'cli_error',
            message: error instanceof Error ? error.message : 'Command failed',
          },
        };
  if (json) process.stderr.write(`${JSON.stringify(payload)}\n`);
  else process.stderr.write(`${payload.error.message}\n`);
  return status === 409 ? 2 : 1;
}
