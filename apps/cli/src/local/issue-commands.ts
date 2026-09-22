import { readFile } from 'node:fs/promises';
import type { Command } from 'commander';
import * as z from 'zod';
import { printValue } from '../output.ts';
import { commitLocalOperation } from './projection.ts';
import {
  commentCreateOperation,
  filterIssues,
  issueCreateOperation,
  issueLifecycleOperation,
  issueUpdateOperation,
  resolveIssue,
  type CreateIssueValues,
  type UpdateIssueValues,
} from './domain.ts';
import { printLocalRecord, withLocalStore } from './context.ts';
import { readComments, readIssues, readSnapshot } from './store.ts';

const createOptionsSchema = z.object({
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
const listOptionsSchema = z.object({
  team: z.string().optional(),
  state: z.string().optional(),
  assignee: z.string().optional(),
  project: z.string().optional(),
  search: z.string().optional(),
  archived: z.boolean().default(false),
  deleted: z.boolean().default(false),
  all: z.boolean().default(false),
  closed: z.boolean().default(false),
});
const updateOptionsSchema = z.object({
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

export async function createLocalIssue(command: Command): Promise<void> {
  const input = createOptionsSchema.parse(command.opts());
  const description = await fileValue(input.descriptionFile, input.description);
  await withLocalStore(command, (store, json) => {
    const values: CreateIssueValues = {
      ...input,
      description: description ?? null,
      labels: splitValues(input.label),
    };
    const result = commitLocalOperation(store, (context) =>
      issueCreateOperation(context, values),
    );
    printLocalRecord(result.current, result.operationId, json);
  });
}

export async function updateLocalIssue(
  command: Command,
  identifier: string,
): Promise<void> {
  const input = updateOptionsSchema.parse(command.opts());
  const description = await fileValue(input.descriptionFile, input.description);
  await withLocalStore(command, (store, json) => {
    const result = commitLocalOperation(store, (context) =>
      issueUpdateOperation(
        context,
        identifier,
        updateValues(input, description),
      ),
    );
    printLocalRecord(result.current, result.operationId, json);
  });
}

export async function changeLocalIssueLifecycle(
  command: Command,
  identifier: string,
  action: 'delete' | 'restore',
): Promise<void> {
  const input = z
    .object({ expectedVersion: z.coerce.number().int().positive().optional() })
    .parse(command.opts());
  await withLocalStore(command, (store, json) => {
    const result = commitLocalOperation(store, (context) =>
      issueLifecycleOperation(
        context,
        identifier,
        action === 'delete' ? 'issue.delete' : 'issue.restore',
        input.expectedVersion,
      ),
    );
    printLocalRecord(result.current, result.operationId, json);
  });
}

export async function listLocalIssues(command: Command): Promise<void> {
  const input = listOptionsSchema.parse(command.opts());
  await withLocalStore(command, (store, json) => {
    const snapshot = readSnapshot(store);
    printValue(filterIssues(readIssues(store), snapshot.metadata, input), json);
  });
}

export async function getLocalIssue(
  command: Command,
  identifier: string,
): Promise<void> {
  await withLocalStore(command, (store, json) => {
    const projection = { issues: readIssues(store), comments: [] };
    printValue(resolveIssue(projection, identifier), json);
  });
}

export async function createLocalComment(
  command: Command,
  identifier: string,
): Promise<void> {
  const input = z
    .object({
      body: z.string().optional(),
      bodyFile: z.string().optional(),
      parent: z.string().uuid().optional(),
    })
    .parse(command.opts());
  const body = await fileValue(input.bodyFile, input.body);
  if (!body) throw new Error('Provide --body or --body-file.');
  await withLocalStore(command, (store, json) => {
    const result = commitLocalOperation(store, (context) =>
      commentCreateOperation(context, identifier, body, input.parent ?? null),
    );
    printLocalRecord(result.current, result.operationId, json);
  });
}

export async function listLocalComments(
  command: Command,
  identifier: string,
): Promise<void> {
  await withLocalStore(command, (store, json) => {
    const issue = resolveIssue(
      { issues: readIssues(store), comments: [] },
      identifier,
    );
    printValue(readComments(store, issue.id), json);
  });
}

function updateValues(
  input: z.infer<typeof updateOptionsSchema>,
  description: string | null | undefined,
): UpdateIssueValues {
  return {
    expectedVersion: input.expectedVersion,
    title: input.title,
    description: input.clearDescription ? null : description,
    state: input.state,
    priority: input.priority,
    assignee: input.unassign ? null : input.assignee,
    project: input.clearProject ? null : input.project,
    parent: input.clearParent ? null : input.parent,
    estimate: input.clearEstimate ? null : input.estimate,
    dueDate: input.clearDueDate ? null : input.dueDate,
    labels: input.label === undefined ? undefined : splitValues(input.label),
  };
}

async function fileValue(
  path: string | undefined,
  inline: string | undefined,
): Promise<string | null | undefined> {
  if (path && inline !== undefined)
    throw new Error('Use only one inline value and file input.');
  return path ? readFile(path, 'utf8') : inline;
}

function splitValues(values: string[]): string[] {
  return values.flatMap((value) =>
    value
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean),
  );
}
