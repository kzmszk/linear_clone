import { Command } from 'commander';
import { z } from 'zod';
import { requestRecord } from './api.ts';
import {
  apiFor,
  operationId,
  printResult,
  workspaceIdFor,
} from './command-utils.ts';
import { listLabels, resolveLabel } from './resolve.ts';
import { labelSchema } from './types.ts';

const createOptions = z.object({
  name: z.string().min(1),
  color: z.string().default('#8b80f9'),
});
const updateOptions = z.object({
  name: z.string().optional(),
  color: z.string().optional(),
  expectedVersion: z.coerce.number().int().positive().optional(),
});

function expectedVersion(
  value: number | undefined,
  current: { version: number },
): number {
  return value ?? current.version;
}

export function registerLabelCommands(root: Command): void {
  const label = root.command('label').description('Manage labels');
  label.command('list').action(async (_, command) => {
    const { api, options } = apiFor(command);
    const workspaceId = await workspaceIdFor(api, options);
    printResult(await listLabels(api, workspaceId), options.json);
  });
  label
    .command('create')
    .requiredOption('--name <name>')
    .option('--color <color>', '#8b80f9')
    .action(async (_, command) => {
      const { api, options } = apiFor(command);
      const workspaceId = await workspaceIdFor(api, options);
      const input = createOptions.parse(command.opts());
      printResult(
        await requestRecord(
          api,
          `/workspaces/${workspaceId}/labels`,
          labelSchema,
          { method: 'POST', body: input, operationId: operationId() },
        ),
        options.json,
      );
    });
  registerLabelUpdate(label);
}

function registerLabelUpdate(label: Command): void {
  const update = label
    .command('update')
    .argument('<label>')
    .option('--name <name>')
    .option('--color <color>')
    .option('--expected-version <number>');
  update.action(async (ref, _options, command) => {
    const { api, options } = apiFor(command);
    const workspaceId = await workspaceIdFor(api, options);
    const current = await resolveLabel(api, workspaceId, ref);
    const input = updateOptions.parse(command.opts());
    const body = {
      ...input,
      expectedVersion: expectedVersion(input.expectedVersion, current),
    };
    if (body.name === undefined && body.color === undefined)
      throw new Error('Provide --name or --color.');
    printResult(
      await requestRecord(
        api,
        `/workspaces/${workspaceId}/labels/${current.id}`,
        labelSchema,
        { method: 'PATCH', body, operationId: operationId() },
      ),
      options.json,
    );
  });
}
