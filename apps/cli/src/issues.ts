import { Command } from 'commander';
import * as z from 'zod';
import { requestRecord } from './api.ts';
import {
  apiFor,
  fileContents,
  operationId,
  printResult,
  workspaceRefFor,
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
  all: z.boolean().default(false),
  closed: z.boolean().default(false),
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
      const workspaceRef = await workspaceRefFor(api, options);
      const input = createOptions.parse(command.opts());
      const description =
        (await fileContents(input.descriptionFile, input.description)) ?? null;
      const team = await resolveTeam(api, workspaceRef, input.team);
      const stateId = input.state
        ? await resolveIssueMutationStateId(api, workspaceRef, input.state)
        : undefined;
      const assigneeId = input.assignee
        ? await resolveAssigneeId(api, workspaceRef, input.assignee)
        : null;
      const projectId = input.project
        ? (await resolveProject(api, workspaceRef, input.project)).id
        : null;
      const parentId = input.parent
        ? await resolveIssueId(api, workspaceRef, input.parent)
        : null;
      const labelIds = await Promise.all(
        parseRepeated(input.label).map(
          async (ref) => (await resolveLabel(api, workspaceRef, ref)).id,
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
          `/workspaces/${encodeURIComponent(workspaceRef)}/issues`,
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
    .option('--closed', 'show completed and canceled issues')
    .option('--all', 'show open, completed, and canceled issues')
    .action(async (_, command) => {
      const { api, options } = apiFor(command);
      const workspaceRef = await workspaceRefFor(api, options);
      const input = listOptions.parse(command.opts());
      if (input.all && input.closed)
        throw new Error('Use only one of --all and --closed.');
      const lifecycle = listLifecycle(input);
      const items = await listIssues(api, workspaceRef, {
        team: input.team,
        state: input.state,
        assignee: input.assignee,
        project: input.project,
        q: input.search,
        cursor: input.cursor,
        archived: String(input.archived),
        deleted: String(input.deleted),
        lifecycle,
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
      const workspaceRef = await workspaceRefFor(api, options);
      printResult(await getIssue(api, workspaceRef, identifier), options.json);
    });
}

function listLifecycle(input: z.infer<typeof listOptions>) {
  if (input.closed) return 'closed';
  if (input.all) return 'all';
  if (input.state || input.archived || input.deleted) return undefined;
  return 'open';
}
