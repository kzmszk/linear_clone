import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { Command } from 'commander';
import { createApiContext, type ApiContext } from './api.ts';
import { optionsFor, printValue, type GlobalOptions } from './output.ts';
import { isUuid, resolveWorkspace } from './resolve.ts';
import { type Workspace } from './types.ts';

export function operationId(): string {
  return randomUUID();
}

export function apiFor(command: Command): {
  api: ApiContext;
  options: GlobalOptions;
} {
  const options = optionsFor(command);
  return { api: createApiContext(options.url, options.testEmail), options };
}

export async function workspaceFor(
  api: ApiContext,
  options: GlobalOptions,
): Promise<Workspace> {
  return resolveWorkspace(api, options.workspace);
}

export async function workspaceIdFor(
  api: ApiContext,
  options: GlobalOptions,
): Promise<string> {
  if (options.workspace && isUuid(options.workspace)) return options.workspace;
  return (await resolveWorkspace(api, options.workspace)).id;
}

export async function workspaceRefFor(
  api: ApiContext,
  options: GlobalOptions,
): Promise<string> {
  if (options.workspace) return options.workspace;
  return (await resolveWorkspace(api, undefined)).id;
}

export async function fileContents(
  path: string | undefined,
  inline: string | undefined,
): Promise<string | null | undefined> {
  if (path && inline !== undefined)
    throw new Error('Use only one of --description-file and --description.');
  if (path) return readFile(path, 'utf8');
  return inline;
}

export function printResult(
  value: unknown,
  options: GlobalOptions | boolean,
): void {
  printValue(value, typeof options === 'boolean' ? options : options.json);
}
