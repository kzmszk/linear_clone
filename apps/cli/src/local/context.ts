import type { Command } from 'commander';
import { localPrincipalKey } from './identity.ts';
import { closeStore, openStore, type LocalStore } from './store.ts';
import { findStorePath } from './workspace-store.ts';
import { optionsFor, printValue } from '../output.ts';
import type { SyncOptions } from './sync.ts';

export async function withLocalStore(
  command: Command,
  action: (store: LocalStore, json: boolean) => void,
): Promise<void> {
  const { path, options } = await localPathFor(command);
  const store = await openStore(path);
  try {
    action(store, options.json);
  } finally {
    closeStore(store);
  }
}

export async function localPathFor(command: Command) {
  const options = optionsFor(command);
  const principal = await localPrincipalKey(options.url, options.testEmail);
  return {
    path: await findStorePath(options.url, principal, options.workspace),
    options,
  };
}

export function syncOptionsFor(
  options: ReturnType<typeof optionsFor>,
): SyncOptions {
  return { url: options.url, testEmail: options.testEmail };
}

export function printLocalRecord(
  current: object,
  operationId: string,
  json: boolean,
): void {
  if (json) printValue({ ...current, operationId }, true);
  else printValue([current], false);
}
