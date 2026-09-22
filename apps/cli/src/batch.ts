import { createInterface } from 'node:readline';
import type { Command } from 'commander';
import { z } from 'zod';
import { apiFor, workspaceIdFor } from './command-utils.ts';
import { optionsFor, printError, type GlobalOptions } from './output.ts';

const argumentsSchema = z.array(z.string()).min(1);
const valueOptions = new Set(['--url', '--workspace', '--test-email']);

type ProgramFactory = () => Command;

function parseArguments(line: string): string[] {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    throw new Error('Each line must be a non-empty JSON array of strings.');
  }
  const parsed = argumentsSchema.safeParse(value);
  if (!parsed.success)
    throw new Error('Each line must be a non-empty JSON array of strings.');
  return parsed.data;
}

function commandWords(args: string[]): string[] {
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (valueOptions.has(value)) {
      index += 1;
      continue;
    }
    if (
      value === '--json' ||
      [...valueOptions].some((option) => value.startsWith(`${option}=`))
    )
      continue;
    if (value.startsWith('-')) continue;
    return args.slice(index, index + 2);
  }
  return [];
}

function rejectForbiddenCommand(args: string[]): void {
  if (args.includes('--help') || args.includes('-h'))
    throw new Error('Batch commands cannot request help.');
  const [command] = commandWords(args);
  if (command === 'batch')
    throw new Error('Batch commands cannot run nested batch.');
  if (command === 'auth')
    throw new Error('Batch commands cannot run auth commands.');
  if (command === 'import')
    throw new Error('Batch commands cannot run import commands.');
}

function globalArguments(
  options: GlobalOptions,
  workspaceId: string | undefined,
): string[] {
  return [
    '--url',
    options.url,
    ...(workspaceId ? ['--workspace', workspaceId] : []),
    '--json',
    ...(options.testEmail ? ['--test-email', options.testEmail] : []),
  ];
}

async function runBatch(
  command: Command,
  createProgram: ProgramFactory,
): Promise<void> {
  const options = optionsFor(command);
  const workspaceId = options.workspace
    ? await workspaceIdFor(apiFor(command).api, options)
    : undefined;
  const inherited = globalArguments(options, workspaceId);
  const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
  for await (const line of lines) {
    try {
      const args = parseArguments(line);
      rejectForbiddenCommand(args);
      await createProgram().parseAsync([
        process.execPath,
        'linc',
        ...inherited,
        ...args,
      ]);
      if (process.exitCode !== undefined && process.exitCode !== 0) {
        lines.close();
        return;
      }
    } catch (error) {
      process.exitCode = printError(error, true);
      lines.close();
      return;
    }
  }
}

export function registerBatchCommand(
  program: Command,
  createProgram: ProgramFactory,
): void {
  program
    .command('batch')
    .description(
      'Run newline-delimited JSON argument arrays from standard input',
    )
    .action(async (_, command) => {
      try {
        await runBatch(command, createProgram);
      } catch (error) {
        process.exitCode = printError(error, true);
      }
    });
}
