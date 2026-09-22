import { Command } from 'commander';
import * as z from 'zod';
import { requestRecord, type ApiContext } from './api.ts';
import {
  apiFor,
  fileContents,
  operationId,
  printResult,
  workspaceRefFor,
} from './command-utils.ts';
import {
  getIssue,
  parseRepeated,
  resolveAssigneeId,
  resolveIssueMutationStateId,
  resolveIssueId,
  resolveLabel,
  resolveProject,
} from './resolve.ts';
import { issueSchema } from './types.ts';

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
    const workspaceRef = await workspaceRefFor(api, options);
    const input = updateOptions.parse(command.opts());
    const [current, fields] = await Promise.all([
      getIssue(api, workspaceRef, identifier),
      issuePatch(api, workspaceRef, input),
    ]);
    if (Object.keys(fields).length === 0)
      throw new Error('Provide an issue field to update.');
    const patch = {
      ...fields,
      expectedVersion: input.expectedVersion ?? current.version,
    };
    printResult(
      await requestRecord(
        api,
        `/workspaces/${encodeURIComponent(workspaceRef)}/issues/${current.id}`,
        issueSchema,
        { method: 'PATCH', body: patch, operationId: operationId() },
      ),
      options.json,
    );
  });
}

async function issuePatch(
  api: ApiContext,
  workspaceRef: string,
  input: z.infer<typeof updateOptions>,
): Promise<Record<string, unknown>> {
  const description = await fileContents(
    input.descriptionFile,
    input.description,
  );
  const patch: Record<string, unknown> = {};
  addTextPatch(patch, input, description);
  await addStatePatch(api, workspaceRef, patch, input);
  await addAssignmentPatch(api, workspaceRef, patch, input);
  await addRelationPatch(api, workspaceRef, patch, input);
  addDatePatch(patch, input);
  await addLabelPatch(api, workspaceRef, patch, input);
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
  workspaceRef: string,
  patch: Record<string, unknown>,
  input: z.infer<typeof updateOptions>,
): Promise<void> {
  if (input.state !== undefined)
    patch.stateId = await resolveIssueMutationStateId(
      api,
      workspaceRef,
      input.state,
    );
  if (input.priority !== undefined) patch.priority = input.priority;
}

async function addAssignmentPatch(
  api: ApiContext,
  workspaceRef: string,
  patch: Record<string, unknown>,
  input: z.infer<typeof updateOptions>,
): Promise<void> {
  if (input.assignee !== undefined)
    patch.assigneeId = await resolveAssigneeId(
      api,
      workspaceRef,
      input.assignee,
    );
  if (input.unassign) patch.assigneeId = null;
}

async function addRelationPatch(
  api: ApiContext,
  workspaceRef: string,
  patch: Record<string, unknown>,
  input: z.infer<typeof updateOptions>,
): Promise<void> {
  if (input.project !== undefined)
    patch.projectId = (
      await resolveProject(api, workspaceRef, input.project)
    ).id;
  if (input.clearProject) patch.projectId = null;
  if (input.parent !== undefined)
    patch.parentId = await resolveIssueId(api, workspaceRef, input.parent);
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
  workspaceRef: string,
  patch: Record<string, unknown>,
  input: z.infer<typeof updateOptions>,
): Promise<void> {
  if (input.label !== undefined)
    patch.labelIds = await Promise.all(
      parseRepeated(input.label).map(
        async (ref) => (await resolveLabel(api, workspaceRef, ref)).id,
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
    const workspaceRef = await workspaceRefFor(api, options);
    const current = await getIssue(api, workspaceRef, identifier);
    const input = z
      .object({
        expectedVersion: z.coerce.number().int().positive().optional(),
      })
      .parse(command.opts());
    printResult(
      await requestRecord(
        api,
        `/workspaces/${encodeURIComponent(workspaceRef)}/issues/${current.id}`,
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
    const workspaceRef = await workspaceRefFor(api, options);
    const current = await getIssue(api, workspaceRef, identifier);
    const input = z
      .object({
        expectedVersion: z.coerce.number().int().positive().optional(),
      })
      .parse(command.opts());
    printResult(
      await requestRecord(
        api,
        `/workspaces/${encodeURIComponent(workspaceRef)}/issues/${current.id}/restore`,
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
