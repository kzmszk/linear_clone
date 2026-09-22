import { Command } from 'commander';
import { z } from 'zod';
import { requestRecord } from './api.ts';
import {
  apiFor,
  fileContents,
  operationId,
  printResult,
  workspaceIdFor,
} from './command-utils.ts';
import {
  getIssue,
  listIssues,
  parseRepeated,
  resolveAssigneeId,
  resolveIssueMutationStateId,
  resolveIssueId,
  resolveLabel,
  resolveProject,
  resolveState,
  resolveTeam,
} from './resolve.ts';
import { registerCommentCommands } from './issue-comments.ts';
import { registerIssueUpdateCommands } from './issue-updates.ts';
import { issueSchema } from './types.ts';

const createOptions = z.object({
  team: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
  descriptionFile: z.string().optional(),
  state: z.string().optional(),
  priority: z.coerce.number().int().min(0).max(4).default(0),
  assignee: z.string().optional(),
  project: z.string().optional(),
  parent: z.string().optional(),
  estimate: z.coerce.number().optional(),
  dueDate: z.string().optional(),
  label: z.array(z.string()).default([]),
});
const listOptions = z.object({
  team: z.string().optional(),
  state: z.string().optional(),
  assignee: z.string().optional(),
  project: z.string().optional(),
  search: z.string().optional(),
  cursor: z.string().optional(),
  archived: z.boolean().default(false),
  deleted: z.boolean().default(false),
});
export function registerIssueCommands(root: Command): void {
  const issue = root.command('issue').description('Manage issues');
  registerIssueCreate(issue);
  registerIssueList(issue);
  registerIssueGet(issue);
  registerIssueUpdateCommands(issue);
  registerCommentCommands(issue);
}

function registerIssueCreate(issue: Command): void {
  issue
    .command('create')
    .requiredOption('--team <team>')
    .requiredOption('--title <title>')
    .option('--description <text>')
    .option('--description-file <path>')
    .option('--state <state>')
    .option('--priority <number>', '0')
    .option('--assignee <member>')
    .option('--project <project>')
    .option('--parent <issue>')
    .option('--estimate <number>')
    .option('--due-date <date>')
    .option('--label <label...>')
    .action(async (_, command) => {
      const { api, options } = apiFor(command);
      const workspaceId = await workspaceIdFor(api, options);
      const input = createOptions.parse(command.opts());
      const description =
        (await fileContents(input.descriptionFile, input.description)) ?? null;
      const team = await resolveTeam(api, workspaceId, input.team);
      const stateId = input.state
        ? await resolveIssueMutationStateId(api, workspaceId, input.state)
        : undefined;
      const assigneeId = input.assignee
        ? await resolveAssigneeId(api, workspaceId, input.assignee)
        : null;
      const projectId = input.project
        ? (await resolveProject(api, workspaceId, input.project)).id
        : null;
      const parentId = input.parent
        ? await resolveIssueId(api, workspaceId, input.parent)
        : null;
      const labelIds = await Promise.all(
        parseRepeated(input.label).map(
          async (ref) => (await resolveLabel(api, workspaceId, ref)).id,
        ),
      );
      const body = {
        teamId: team.id,
        title: input.title,
        description,
        stateId,
        priority: input.priority,
        assigneeId,
        projectId,
        parentId,
        estimate: input.estimate ?? null,
        dueDate: input.dueDate ?? null,
        labelIds,
      };
      printResult(
        await requestRecord(
          api,
          `/workspaces/${workspaceId}/issues`,
          issueSchema,
          { method: 'POST', body, operationId: operationId() },
        ),
        options.json,
      );
    });
}

function registerIssueList(issue: Command): void {
  issue
    .command('list')
    .option('--team <team>')
    .option('--state <state>')
    .option('--assignee <member>')
    .option('--project <project>')
    .option('--search <text>')
    .option('--cursor <cursor>')
    .option('--archived', 'show archived issues')
    .option('--deleted', 'show deleted issues')
    .action(async (_, command) => {
      const { api, options } = apiFor(command);
      const workspaceId = await workspaceIdFor(api, options);
      const input = listOptions.parse(command.opts());
      const teamId = input.team
        ? (await resolveTeam(api, workspaceId, input.team)).id
        : undefined;
      const stateId = input.state
        ? (await resolveState(api, workspaceId, input.state)).id
        : undefined;
      const assigneeId = input.assignee
        ? await resolveAssigneeId(api, workspaceId, input.assignee)
        : undefined;
      const projectId = input.project
        ? (await resolveProject(api, workspaceId, input.project)).id
        : undefined;
      const items = await listIssues(api, workspaceId, {
        teamId,
        stateId,
        assigneeId,
        projectId,
        q: input.search,
        cursor: input.cursor,
        archived: String(input.archived),
        deleted: String(input.deleted),
      });
      printResult(items, options.json);
    });
}

function registerIssueGet(issue: Command): void {
  issue
    .command('get')
    .argument('<identifier>')
    .action(async (identifier, _options, command) => {
      const { api, options } = apiFor(command);
      const workspaceId = await workspaceIdFor(api, options);
      printResult(await getIssue(api, workspaceId, identifier), options.json);
    });
}
