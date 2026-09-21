import { Command } from 'commander';
import { z } from 'zod';
import { requestRecord, type ApiContext } from './api.ts';
import {
  apiFor,
  fileContents,
  operationId,
  printResult,
  workspaceFor,
} from './command-utils.ts';
import {
  getIssue,
  parseRepeated,
  resolveAssigneeId,
  resolveIssueId,
  resolveLabel,
  resolveProject,
  resolveState,
} from './resolve.ts';
import { issueSchema, type Issue } from './types.ts';

const updateOptions = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  descriptionFile: z.string().optional(),
  clearDescription: z.boolean().default(false),
  state: z.string().optional(),
  priority: z.coerce.number().int().min(0).max(4).optional(),
  assignee: z.string().optional(),
  unassign: z.boolean().default(false),
  project: z.string().optional(),
  clearProject: z.boolean().default(false),
  parent: z.string().optional(),
  clearParent: z.boolean().default(false),
  estimate: z.coerce.number().optional(),
  clearEstimate: z.boolean().default(false),
  dueDate: z.string().optional(),
  clearDueDate: z.boolean().default(false),
  label: z.array(z.string()).optional(),
  expectedVersion: z.coerce.number().int().positive().optional(),
});

export function registerIssueUpdateCommands(issue: Command): void {
  registerIssueUpdate(issue);
  registerIssueDelete(issue);
  registerIssueRestore(issue);
}

function registerIssueUpdate(issue: Command): void {
  const update = issue
    .command('update')
    .argument('<identifier>')
    .option('--title <title>')
    .option('--description <text>')
    .option('--description-file <path>')
    .option('--clear-description')
    .option('--state <state>')
    .option('--priority <number>')
    .option('--assignee <member>')
    .option('--unassign')
    .option('--project <project>')
    .option('--clear-project')
    .option('--parent <issue>')
    .option('--clear-parent')
    .option('--estimate <number>')
    .option('--clear-estimate')
    .option('--due-date <date>')
    .option('--clear-due-date')
    .option('--label <label...>')
    .option('--expected-version <number>');
  update.action(async (identifier, _options, command) => {
    const { api, options } = apiFor(command);
    const workspace = await workspaceFor(api, options);
    const current = await getIssue(api, workspace.id, identifier);
    const input = updateOptions.parse(command.opts());
    const patch = await issuePatch(api, workspace.id, current, input);
    if (Object.keys(patch).length === 1)
      throw new Error('Provide an issue field to update.');
    printResult(
      await requestRecord(
        api,
        `/workspaces/${workspace.id}/issues/${current.id}`,
        issueSchema,
        { method: 'PATCH', body: patch, operationId: operationId() },
      ),
      options.json,
    );
  });
}

async function issuePatch(
  api: ApiContext,
  workspaceId: string,
  current: Issue,
  input: z.infer<typeof updateOptions>,
): Promise<Record<string, unknown>> {
  const description = await fileContents(
    input.descriptionFile,
    input.description,
  );
  const patch: Record<string, unknown> = {
    expectedVersion: input.expectedVersion ?? current.version,
  };
  addTextPatch(patch, input, description);
  await addStatePatch(api, workspaceId, patch, input);
  await addAssignmentPatch(api, workspaceId, patch, input);
  await addRelationPatch(api, workspaceId, patch, input);
  addDatePatch(patch, input);
  await addLabelPatch(api, workspaceId, patch, input);
  return patch;
}

function addTextPatch(
  patch: Record<string, unknown>,
  input: z.infer<typeof updateOptions>,
  description: string | null | undefined,
): void {
  if (input.title !== undefined) patch.title = input.title;
  if (description !== undefined) patch.description = description;
  if (input.clearDescription) patch.description = null;
}

async function addStatePatch(
  api: ApiContext,
  workspaceId: string,
  patch: Record<string, unknown>,
  input: z.infer<typeof updateOptions>,
): Promise<void> {
  if (input.state !== undefined)
    patch.stateId = (await resolveState(api, workspaceId, input.state)).id;
  if (input.priority !== undefined) patch.priority = input.priority;
}

async function addAssignmentPatch(
  api: ApiContext,
  workspaceId: string,
  patch: Record<string, unknown>,
  input: z.infer<typeof updateOptions>,
): Promise<void> {
  if (input.assignee !== undefined)
    patch.assigneeId = await resolveAssigneeId(
      api,
      workspaceId,
      input.assignee,
    );
  if (input.unassign) patch.assigneeId = null;
}

async function addRelationPatch(
  api: ApiContext,
  workspaceId: string,
  patch: Record<string, unknown>,
  input: z.infer<typeof updateOptions>,
): Promise<void> {
  if (input.project !== undefined)
    patch.projectId = (
      await resolveProject(api, workspaceId, input.project)
    ).id;
  if (input.clearProject) patch.projectId = null;
  if (input.parent !== undefined)
    patch.parentId = await resolveIssueId(api, workspaceId, input.parent);
  if (input.clearParent) patch.parentId = null;
}

function addDatePatch(
  patch: Record<string, unknown>,
  input: z.infer<typeof updateOptions>,
): void {
  if (input.estimate !== undefined) patch.estimate = input.estimate;
  if (input.clearEstimate) patch.estimate = null;
  if (input.dueDate !== undefined) patch.dueDate = input.dueDate;
  if (input.clearDueDate) patch.dueDate = null;
}

async function addLabelPatch(
  api: ApiContext,
  workspaceId: string,
  patch: Record<string, unknown>,
  input: z.infer<typeof updateOptions>,
): Promise<void> {
  if (input.label !== undefined)
    patch.labelIds = await Promise.all(
      parseRepeated(input.label).map(
        async (ref) => (await resolveLabel(api, workspaceId, ref)).id,
      ),
    );
}

function registerIssueDelete(issue: Command): void {
  const remove = issue
    .command('delete')
    .argument('<identifier>')
    .option('--expected-version <number>');
  remove.action(async (identifier, _options, command) => {
    const { api, options } = apiFor(command);
    const workspace = await workspaceFor(api, options);
    const current = await getIssue(api, workspace.id, identifier);
    const input = z
      .object({
        expectedVersion: z.coerce.number().int().positive().optional(),
      })
      .parse(command.opts());
    printResult(
      await requestRecord(
        api,
        `/workspaces/${workspace.id}/issues/${current.id}`,
        issueSchema,
        {
          method: 'DELETE',
          body: { expectedVersion: input.expectedVersion ?? current.version },
          operationId: operationId(),
        },
      ),
      options.json,
    );
  });
}

function registerIssueRestore(issue: Command): void {
  const restore = issue
    .command('restore')
    .argument('<identifier>')
    .option('--expected-version <number>');
  restore.action(async (identifier, _options, command) => {
    const { api, options } = apiFor(command);
    const workspace = await workspaceFor(api, options);
    const current = await getIssue(api, workspace.id, identifier);
    const input = z
      .object({
        expectedVersion: z.coerce.number().int().positive().optional(),
      })
      .parse(command.opts());
    printResult(
      await requestRecord(
        api,
        `/workspaces/${workspace.id}/issues/${current.id}/restore`,
        issueSchema,
        {
          method: 'POST',
          body: { expectedVersion: input.expectedVersion ?? current.version },
          operationId: operationId(),
        },
      ),
      options.json,
    );
  });
}
