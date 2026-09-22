import { Command } from 'commander';
import { z } from 'zod';
import { listRecords, requestRecord } from './api.ts';
import {
  apiFor,
  operationId,
  printResult,
  workspaceFor,
  workspaceIdFor,
} from './command-utils.ts';
import { listTeams, resolveTeam } from './resolve.ts';
import { teamSchema, workspaceSchema } from './types.ts';
import { registerLabelCommands } from './management-labels.ts';
import { registerMemberCommands } from './management-members.ts';
import { registerProjectCommands } from './management-projects.ts';

function versionFrom(
  value: number | undefined,
  current: { version: number },
): number {
  return value ?? current.version;
}

const workspaceCreateOptions = z.object({
  slug: z.string().min(1),
  name: z.string().min(1),
});
const workspaceUpdateOptions = z.object({
  slug: z.string().optional(),
  name: z.string().optional(),
  expectedVersion: z.coerce.number().int().positive().optional(),
});
const teamCreateOptions = z.object({
  key: z.string().min(1),
  name: z.string().min(1),
  private: z.boolean().default(false),
});
const teamUpdateOptions = z.object({
  key: z.string().optional(),
  name: z.string().optional(),
  private: z.boolean().optional(),
  expectedVersion: z.coerce.number().int().positive().optional(),
});
export function registerManagementCommands(root: Command): void {
  registerWorkspaceCommands(root);
  registerTeamCommands(root);
  registerProjectCommands(root);
  registerMemberCommands(root);
  registerLabelCommands(root);
}

function registerWorkspaceCommands(root: Command): void {
  const workspace = root.command('workspace').description('Manage workspaces');
  workspace.command('list').action(async (_, command) => {
    const { api, options } = apiFor(command);
    printResult(
      await listRecords(api, '/workspaces', workspaceSchema),
      options.json,
    );
  });
  workspace
    .command('create')
    .requiredOption('--name <name>')
    .requiredOption('--slug <slug>')
    .action(async (_, command) => {
      const { api, options } = apiFor(command);
      const input = workspaceCreateOptions.parse(command.opts());
      const result = await requestRecord(api, '/workspaces', workspaceSchema, {
        method: 'POST',
        body: input,
        operationId: operationId(),
      });
      printResult(result, options.json);
    });
  const update = workspace
    .command('update')
    .argument('<workspace>')
    .option('--name <name>')
    .option('--slug <slug>')
    .option('--expected-version <number>');
  update.action(async (ref, _options, command) => {
    const { api, options } = apiFor(command);
    const current = await workspaceFor(api, { ...options, workspace: ref });
    const input = workspaceUpdateOptions.parse(command.opts());
    const body = {
      ...input,
      expectedVersion: versionFrom(input.expectedVersion, current),
    };
    if (body.name === undefined && body.slug === undefined)
      throw new Error('Provide --name or --slug.');
    printResult(
      await requestRecord(api, `/workspaces/${current.id}`, workspaceSchema, {
        method: 'PATCH',
        body,
        operationId: operationId(),
      }),
      options.json,
    );
  });
  const archive = workspace
    .command('archive')
    .argument('<workspace>')
    .option('--expected-version <number>');
  archive.action(async (ref, _options, command) => {
    const { api, options } = apiFor(command);
    const current = await workspaceFor(api, { ...options, workspace: ref });
    const input = z
      .object({
        expectedVersion: z.coerce.number().int().positive().optional(),
      })
      .parse(command.opts());
    printResult(
      await requestRecord(api, `/workspaces/${current.id}`, workspaceSchema, {
        method: 'PATCH',
        body: {
          expectedVersion: versionFrom(input.expectedVersion, current),
          archivedAt: new Date().toISOString(),
        },
        operationId: operationId(),
      }),
      options.json,
    );
  });
}

function registerTeamCommands(root: Command): void {
  const team = root.command('team').description('Manage teams');
  team.command('list').action(async (_, command) => {
    const { api, options } = apiFor(command);
    const workspaceId = await workspaceIdFor(api, options);
    printResult(await listTeams(api, workspaceId), options.json);
  });
  team
    .command('create')
    .requiredOption('--key <key>')
    .requiredOption('--name <name>')
    .option('--private')
    .action(async (_, command) => {
      const { api, options } = apiFor(command);
      const workspaceId = await workspaceIdFor(api, options);
      const input = teamCreateOptions.parse(command.opts());
      printResult(
        await requestRecord(
          api,
          `/workspaces/${workspaceId}/teams`,
          teamSchema,
          { method: 'POST', body: input, operationId: operationId() },
        ),
        options.json,
      );
    });
  const update = team
    .command('update')
    .argument('<team>')
    .option('--key <key>')
    .option('--name <name>')
    .option('--private')
    .option('--expected-version <number>');
  update.action(async (ref, _options, command) => {
    const { api, options } = apiFor(command);
    const workspaceId = await workspaceIdFor(api, options);
    const current = await resolveTeam(api, workspaceId, ref);
    const input = teamUpdateOptions.parse(command.opts());
    const body = {
      ...input,
      expectedVersion: versionFrom(input.expectedVersion, current),
    };
    if (
      body.key === undefined &&
      body.name === undefined &&
      body.private === undefined
    )
      throw new Error('Provide a team field to update.');
    printResult(
      await requestRecord(
        api,
        `/workspaces/${workspaceId}/teams/${current.id}`,
        teamSchema,
        { method: 'PATCH', body, operationId: operationId() },
      ),
      options.json,
    );
  });
}
