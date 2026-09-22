import { Command } from 'commander';
import { z } from 'zod';
import { listRecords, requestRecord } from './api.ts';
import {
  apiFor,
  fileContents,
  operationId,
  printResult,
  workspaceIdFor,
} from './command-utils.ts';
import { resolveIssueId } from './resolve.ts';
import { commentSchema } from './types.ts';

const commentCreateOptions = z.object({
  body: z.string().optional(),
  bodyFile: z.string().optional(),
  parent: z.string().optional(),
});
const commentUpdateOptions = z.object({
  body: z.string().optional(),
  bodyFile: z.string().optional(),
  expectedVersion: z.coerce.number().int().positive().optional(),
});

export function registerCommentCommands(issue: Command): void {
  const comments = issue
    .command('comment')
    .description('Manage issue comments');
  registerCommentList(comments);
  registerCommentCreate(comments);
  registerCommentUpdate(comments);
  registerCommentDelete(comments);
}

function registerCommentList(comments: Command): void {
  comments
    .command('list')
    .argument('<identifier>')
    .action(async (identifier, _options, command) => {
      const { api, options } = apiFor(command);
      const workspaceId = await workspaceIdFor(api, options);
      const issueId = await resolveIssueId(api, workspaceId, identifier);
      printResult(
        await listRecords(
          api,
          `/workspaces/${workspaceId}/issues/${issueId}/comments`,
          commentSchema,
        ),
        options.json,
      );
    });
}

function registerCommentCreate(comments: Command): void {
  comments
    .command('create')
    .argument('<identifier>')
    .option('--body <text>')
    .option('--body-file <path>')
    .option('--parent <comment>')
    .action(async (identifier, _options, command) => {
      const { api, options } = apiFor(command);
      const workspaceId = await workspaceIdFor(api, options);
      const issueId = await resolveIssueId(api, workspaceId, identifier);
      const input = commentCreateOptions.parse(command.opts());
      const body = await fileContents(input.bodyFile, input.body);
      if (!body) throw new Error('Provide --body or --body-file.');
      printResult(
        await requestRecord(
          api,
          `/workspaces/${workspaceId}/issues/${issueId}/comments`,
          commentSchema,
          {
            method: 'POST',
            body: { body, parentCommentId: input.parent ?? null },
            operationId: operationId(),
          },
        ),
        options.json,
      );
    });
}

function registerCommentUpdate(comments: Command): void {
  const update = comments
    .command('update')
    .argument('<identifier>')
    .argument('<comment>')
    .option('--body <text>')
    .option('--body-file <path>')
    .option('--expected-version <number>');
  update.action(async (identifier, commentId, _options, command) => {
    const { api, options } = apiFor(command);
    const workspaceId = await workspaceIdFor(api, options);
    const issueId = await resolveIssueId(api, workspaceId, identifier);
    const input = commentUpdateOptions.parse(command.opts());
    const body = await fileContents(input.bodyFile, input.body);
    const path = `/workspaces/${workspaceId}/issues/${issueId}/comments/${commentId}`;
    const current = await requestRecord(api, path, commentSchema);
    const existing = 'current' in current ? current.current : current;
    const patch = {
      expectedVersion: input.expectedVersion ?? existing.version,
      ...(body === undefined ? {} : { body }),
    };
    if (Object.keys(patch).length === 1)
      throw new Error('Provide --body or --body-file.');
    printResult(
      await requestRecord(api, path, commentSchema, {
        method: 'PATCH',
        body: patch,
        operationId: operationId(),
      }),
      options.json,
    );
  });
}

function registerCommentDelete(comments: Command): void {
  const remove = comments
    .command('delete')
    .argument('<identifier>')
    .argument('<comment>')
    .option('--expected-version <number>');
  remove.action(async (identifier, commentId, _options, command) => {
    const { api, options } = apiFor(command);
    const workspaceId = await workspaceIdFor(api, options);
    const issueId = await resolveIssueId(api, workspaceId, identifier);
    const path = `/workspaces/${workspaceId}/issues/${issueId}/comments/${commentId}`;
    const current = await requestRecord(api, path, commentSchema);
    const existing = 'current' in current ? current.current : current;
    const input = z
      .object({
        expectedVersion: z.coerce.number().int().positive().optional(),
      })
      .parse(command.opts());
    printResult(
      await requestRecord(api, path, commentSchema, {
        method: 'DELETE',
        body: { expectedVersion: input.expectedVersion ?? existing.version },
        operationId: operationId(),
      }),
      options.json,
    );
  });
}
