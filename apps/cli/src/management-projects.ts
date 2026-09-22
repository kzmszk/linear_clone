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
  listProjects,
  parseRepeated,
  resolveProject,
  resolveTeam,
} from './resolve.ts';
import { projectSchema } from './types.ts';

const projectCreateOptions = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  status: z.string().default('planned'),
  team: z.array(z.string()).default([]),
});
const projectUpdateOptions = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  status: z.string().optional(),
  team: z.array(z.string()).optional(),
  expectedVersion: z.coerce.number().int().positive().optional(),
});

function versionFrom(
  value: number | undefined,
  current: { version: number },
): number {
  return value ?? current.version;
}

export function registerProjectCommands(root: Command): void {
  const project = root.command('project').description('Manage projects');
  registerProjectList(project);
  registerProjectCreate(project);
  registerProjectUpdate(project);
}

function registerProjectList(project: Command): void {
  project.command('list').action(async (_, command) => {
    const { api, options } = apiFor(command);
    const workspaceId = await workspaceIdFor(api, options);
    printResult(await listProjects(api, workspaceId), options.json);
  });
}

function registerProjectCreate(project: Command): void {
  project
    .command('create')
    .requiredOption('--name <name>')
    .option('--description <text>')
    .option('--status <status>', 'Project status', 'planned')
    .option('--team <team...>')
    .action(async (_, command) => {
      const { api, options } = apiFor(command);
      const workspaceId = await workspaceIdFor(api, options);
      const input = projectCreateOptions.parse(command.opts());
      const teamIds = await Promise.all(
        parseRepeated(input.team).map(
          async (ref) => (await resolveTeam(api, workspaceId, ref)).id,
        ),
      );
      const body = {
        name: input.name,
        description: input.description ?? null,
        status: input.status,
        teamIds,
      };
      printResult(
        await requestRecord(
          api,
          `/workspaces/${workspaceId}/projects`,
          projectSchema,
          { method: 'POST', body, operationId: operationId() },
        ),
        options.json,
      );
    });
}

function registerProjectUpdate(project: Command): void {
  const update = project
    .command('update')
    .argument('<project>')
    .option('--name <name>')
    .option('--description <text>')
    .option('--status <status>')
    .option('--team <team...>')
    .option('--expected-version <number>');
  update.action(async (ref, _options, command) => {
    const { api, options } = apiFor(command);
    const workspaceId = await workspaceIdFor(api, options);
    const current = await resolveProject(api, workspaceId, ref);
    const input = projectUpdateOptions.parse(command.opts());
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
      name: input.name,
      description: input.description,
      status: input.status,
      teamIds,
      expectedVersion: versionFrom(input.expectedVersion, current),
    };
    if (
      body.name === undefined &&
      body.description === undefined &&
      body.status === undefined &&
      body.teamIds === undefined
    )
      throw new Error('Provide a project field to update.');
    printResult(
      await requestRecord(
        api,
        `/workspaces/${workspaceId}/projects/${current.id}`,
        projectSchema,
        { method: 'PATCH', body, operationId: operationId() },
      ),
      options.json,
    );
  });
}
