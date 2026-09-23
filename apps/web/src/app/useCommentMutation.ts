import type { QueryClient } from '@tanstack/react-query';
import { useMutation } from '@tanstack/react-query';
import type { Comment } from '../api.ts';
import { api } from '../api.ts';
import { accessGeneration } from './workspaceAccess.ts';

type CommentSubmission = {
  body: string;
  operationId: string;
};

type CommentContext = { optimisticId: string; accessGeneration: number };

export function useCommentMutation(
  queryClient: QueryClient,
  workspaceId: string | undefined,
  issueId: string | undefined,
) {
  const commentsKey = ['comments', workspaceId, issueId] as const;
  const activityKey = ['activity', workspaceId, issueId] as const;
  return useMutation({
    mutationFn: ({ body, operationId }: CommentSubmission) =>
      api.addComment(workspaceId ?? '', issueId ?? '', {
        body,
        parentCommentId: null,
        operationId,
      }),
    onMutate: async ({ body }) => {
      await queryClient.cancelQueries({ queryKey: commentsKey });
      const generation = accessGeneration(queryClient, workspaceId);
      const optimisticId = crypto.randomUUID();
      const timestamp = new Date().toISOString();
      const optimisticComment: Comment = {
        id: optimisticId,
        version: 1,
        createdAt: timestamp,
        updatedAt: timestamp,
        workspaceId: workspaceId ?? '',
        issueId: issueId ?? '',
        body,
        authorName: 'You',
        parentCommentId: null,
        deletedAt: null,
      };
      queryClient.setQueryData<Comment[]>(commentsKey, (current) => [
        ...(current ?? []),
        optimisticComment,
      ]);
      return {
        optimisticId,
        accessGeneration: generation,
      } satisfies CommentContext;
    },
    onError: (_error, _variables, context) => {
      if (
        !context ||
        context.accessGeneration !== accessGeneration(queryClient, workspaceId)
      )
        return;
      queryClient.setQueryData<Comment[]>(commentsKey, (current) =>
        current?.filter((comment) => comment.id !== context.optimisticId),
      );
    },
    onSuccess: (result, _variables, context) => {
      if (
        context?.accessGeneration !== accessGeneration(queryClient, workspaceId)
      )
        return;
      queryClient.setQueryData<Comment[]>(commentsKey, (current) => {
        const existing = (current ?? []).filter(
          (comment) =>
            comment.id !== context?.optimisticId &&
            comment.id !== result.current.id,
        );
        return [...existing, result.current];
      });
    },
    onSettled: (_result, _error) => {
      void queryClient.invalidateQueries({ queryKey: commentsKey });
      void queryClient.invalidateQueries({ queryKey: activityKey });
    },
  });
}
