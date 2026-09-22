import { Command } from 'commander';
import * as z from 'zod';
import { requestRecord } from './api.ts';
import {
  apiFor,
  operationId,
  printResult,
  workspaceIdFor,
} from './command-utils.ts';
import {
  listMembers,
  parseRepeated,
  resolveMember,
  resolveTeam,
} from './resolve.ts';
import { memberSchema } from './types.ts';

const createOptions = z.object({
  email: z.string().email(),
  name: z.string().default(''),
  role: z.enum(['owner', 'admin', 'member']).default('member'),
  team: z.array(z.string()).default([]),
});
const updateOptions = z.object({
  role: z.enum(['owner', 'admin', 'member']).optional(),
  team: z.array(z.string()).optional(),
  expectedVersion: z.coerce.number().int().positive().optional(),
});

function expectedVersion(
  value: number | undefined,
  current: { version: number },
): number {
  return value ?? current.version;
}

export function registerMemberCommands(root: Command): void {
  const member = root.command('member').description('Manage workspace members');
  member.command('list').action(async (_, command) => {
    const { api, options } = apiFor(command);
    const workspaceId = await workspaceIdFor(api, options);
    printResult(await listMembers(api, workspaceId), options.json);
  });
  member
    .command('invite')
    .requiredOption('--email <email>')
    .option('--name <name>', '', '')
    .option('--role <role>', 'member')
    .option('--team <team...>')
    .action(async (_, command) => {
      const { api, options } = apiFor(command);
      const workspaceId = await workspaceIdFor(api, options);
      const input = createOptions.parse(command.opts());
      const teamIds = await Promise.all(
        parseRepeated(input.team).map(
          async (teamRef) => (await resolveTeam(api, workspaceId, teamRef)).id,
        ),
      );
      printResult(
        await requestRecord(
          api,
          `/workspaces/${workspaceId}/members`,
          memberSchema,
          {
            method: 'POST',
            body: { ...input, teamIds },
            operationId: operationId(),
          },
        ),
        options.json,
      );
    });
  registerMemberUpdate(member);
  registerMemberRemove(member);
}

function registerMemberUpdate(member: Command): void {
  const update = member
    .command('update')
    .argument('<member>')
    .option('--role <role>')
    .option('--team <team...>')
    .option('--expected-version <number>');
  update.action(async (ref, _options, command) => {
    const { api, options } = apiFor(command);
    const workspaceId = await workspaceIdFor(api, options);
    const current = await resolveMember(api, workspaceId, ref);
    const input = updateOptions.parse(command.opts());
    const teamIds =
      input.team === undefined
        ? undefined
        : await Promise.all(
            parseRepeated(input.team).map(
              async (teamRef) =>
                (await resolveTeam(api, workspaceId, teamRef)).id,
            ),
          );
    const body = {
      role: input.role,
      teamIds,
      expectedVersion: expectedVersion(input.expectedVersion, current),
    };
    if (body.role === undefined && body.teamIds === undefined)
      throw new Error('Provide --role or --team.');
    printResult(
      await requestRecord(
        api,
        `/workspaces/${workspaceId}/members/${current.id}`,
        memberSchema,
        { method: 'PATCH', body, operationId: operationId() },
      ),
      options.json,
    );
  });
}

function registerMemberRemove(member: Command): void {
  const remove = member
    .command('remove')
    .argument('<member>')
    .option('--expected-version <number>');
  remove.action(async (ref, _options, command) => {
    const { api, options } = apiFor(command);
    const workspaceId = await workspaceIdFor(api, options);
    const current = await resolveMember(api, workspaceId, ref);
    const input = z
      .object({
        expectedVersion: z.coerce.number().int().positive().optional(),
      })
      .parse(command.opts());
    printResult(
      await requestRecord(
        api,
        `/workspaces/${workspaceId}/members/${current.id}`,
        memberSchema,
        {
          method: 'DELETE',
          body: {
            expectedVersion: expectedVersion(input.expectedVersion, current),
          },
          operationId: operationId(),
        },
      ),
      options.json,
    );
  });
}
