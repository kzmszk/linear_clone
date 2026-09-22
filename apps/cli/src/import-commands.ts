import { Command } from 'commander';
import {
  applyImport,
  buildImportPlan,
  exportLinear,
  verifyExport,
  verifyImport,
} from '../../../packages/linear-import/src/index.ts';
import { apiFor, printResult, workspaceIdFor } from './command-utils.ts';
import { listIssues } from './resolve.ts';

export function registerImportCommands(root: Command): void {
  const linear = root
    .command('import')
    .description('Import data from an external tracker')
    .command('linear')
    .description('Export, plan, apply, and verify Linear data');
  registerExport(linear);
  registerPlan(linear);
  registerApply(linear);
  registerVerify(linear);
}

function directoryFrom(
  command: Command,
  directory: string | undefined,
): string {
  const options: unknown = command.opts();
  const output =
    options &&
    typeof options === 'object' &&
    'output' in options &&
    typeof options.output === 'string'
      ? options.output
      : directory;
  if (!output)
    throw new Error('Provide an export directory or --output <directory>.');
  return output;
}

function registerExport(linear: Command): void {
  linear
    .command('export')
    .argument('[directory]')
    .option('--output <directory>')
    .option('--source-workspace <workspace>')
    .option('--linear-command <command>')
    .option('--skip-files')
    .action(async (directory, _options, command) => {
      const outputDir = directoryFrom(command, directory);
      const opts: Record<string, unknown> = command.opts();
      const result = await exportLinear({
        outputDir,
        workspace:
          typeof opts.sourceWorkspace === 'string'
            ? opts.sourceWorkspace
            : undefined,
        linearCommand:
          typeof opts.linearCommand === 'string'
            ? opts.linearCommand
            : undefined,
        downloadFiles: opts.skipFiles !== true,
      });
      const globals: Record<string, unknown> = command.optsWithGlobals();
      printResult(result, globals.json === true);
    });
}

function registerPlan(linear: Command): void {
  linear
    .command('plan')
    .argument('[directory]')
    .option('--output <directory>')
    .action(async (directory, _options, command) => {
      const result = await buildImportPlan(directoryFrom(command, directory));
      const globals: Record<string, unknown> = command.optsWithGlobals();
      printResult(result, globals.json === true);
    });
}

function registerApply(linear: Command): void {
  linear
    .command('apply')
    .argument('[directory]')
    .option('--output <directory>')
    .option('--destination-workspace <workspace>')
    .action(async (directory, _options, command) => {
      const outputDir = directoryFrom(command, directory);
      const { api, options } = apiFor(command);
      const commandOptions: Record<string, unknown> = command.opts();
      const destination =
        typeof commandOptions.destinationWorkspace === 'string'
          ? commandOptions.destinationWorkspace
          : options.workspace;
      const workspaceId = await workspaceIdFor(api, {
        ...options,
        workspace: destination,
      });
      const result = await applyImport({
        outputDir,
        workspaceId,
        destinationKey: `${api.url}|${workspaceId}`,
        transport: api.client,
        resolveDestinationIssueIds: (sourceIds) =>
          resolveDestinationIssueIds(api, workspaceId, sourceIds),
      });
      printResult(result, options.json);
    });
}

async function resolveDestinationIssueIds(
  api: Parameters<typeof listIssues>[0],
  workspaceId: string,
  sourceIds: string[],
): Promise<ReadonlyMap<string, string>> {
  const wanted = new Set(sourceIds);
  const found = new Map<string, string>();
  for (const filters of [
    { archived: 'false', deleted: 'false' },
    { archived: 'true', deleted: 'false' },
    { archived: 'false', deleted: 'true' },
    { archived: 'true', deleted: 'true' },
  ]) {
    const issues = await listIssues(api, workspaceId, filters);
    for (const issue of issues)
      if (issue.sourceId && wanted.has(issue.sourceId))
        found.set(issue.sourceId, issue.id);
    if (found.size === wanted.size) break;
  }
  return found;
}

function registerVerify(linear: Command): void {
  linear
    .command('verify')
    .argument('[directory]')
    .option('--output <directory>')
    .option('--destination-workspace <workspace>')
    .option('--local-only')
    .action(async (directory, _options, command) => {
      const outputDir = directoryFrom(command, directory);
      const commandOptions: Record<string, unknown> = command.opts();
      const globals: Record<string, unknown> = command.optsWithGlobals();
      if (commandOptions.localOnly === true) {
        const result = await verifyExport(outputDir);
        printResult(result, globals.json === true);
        if (!result.ok) process.exitCode = 1;
        return;
      }
      const { api, options } = apiFor(command);
      const destination =
        typeof commandOptions.destinationWorkspace === 'string'
          ? commandOptions.destinationWorkspace
          : options.workspace;
      const workspaceId = await workspaceIdFor(api, {
        ...options,
        workspace: destination,
      });
      const result = await verifyImport(outputDir, workspaceId, {
        ...api.client,
        downloadFile: api.downloadFile,
      });
      printResult(result, options.json);
      if (!result.ok) process.exitCode = 1;
    });
}
