import type { QueryClient, QueryKey } from '@tanstack/react-query';
import { useMutation } from '@tanstack/react-query';
import type { Issue, IssuePatch, NewIssue } from '../api.ts';
import { api } from '../api.ts';
import { accessGeneration } from './workspaceAccess.ts';

type DraftPatch = Omit<IssuePatch, 'expectedVersion'>;
type IssuePage = Awaited<ReturnType<typeof api.listIssues>>;
type IssueInfiniteData = {
  pages: IssuePage[];
  pageParams: Array<string | null>;
};

export function useWorkspaceMutations(
  queryClient: QueryClient,
  setWorkspaceId: (id: string) => void,
  setShowWorkspaceCreate: (open: boolean) => void,
) {
  const createWorkspace = useMutation({
    mutationFn: api.createWorkspace,
    onSuccess: (result) => {
      queryClient.setQueryData(
        ['me'],
        (current: Awaited<ReturnType<typeof api.getMe>> | undefined) =>
          current
            ? {
                ...current,
                workspaces: [...current.workspaces, result.current],
              }
            : current,
      );
      queryClient.invalidateQueries({ queryKey: ['me'] });
      setWorkspaceId(result.current.id);
      setShowWorkspaceCreate(false);
    },
  });
  const bootstrap = useMutation({
    mutationFn: api.bootstrap,
    onSuccess: (result) => {
      queryClient.setQueryData(
        ['me'],
        (current: Awaited<ReturnType<typeof api.getMe>> | undefined) =>
          current
            ? {
                ...current,
                workspaces: [...current.workspaces, result.current],
              }
            : current,
      );
      queryClient.invalidateQueries({ queryKey: ['me'] });
      setWorkspaceId(result.current.id);
    },
  });
  return { createWorkspace, bootstrap };
}

export function useCreateIssueMutation(
  queryClient: QueryClient,
  workspaceId: string | undefined,
  onCreated: (id: string) => void,
) {
  return useMutation({
    mutationFn: (input: NewIssue) => api.createIssue(workspaceId ?? '', input),
    onMutate: () => accessGeneration(queryClient, workspaceId),
    onSuccess: (result, _input, generation) => {
      if (generation !== accessGeneration(queryClient, workspaceId)) return;
      queryClient.setQueryData(
        ['issue', workspaceId, result.current.id],
        result.current,
      );
      onCreated(result.current.id);
      void queryClient.invalidateQueries({ queryKey: ['issues', workspaceId] });
    },
  });
}

export function useUpdateIssueMutation(
  queryClient: QueryClient,
  workspaceId: string | undefined,
  filters: object,
) {
  return useMutation({
    mutationFn: ({
      issueId,
      patch,
      expectedVersion,
    }: {
      issueId: string;
      patch: DraftPatch;
      expectedVersion: number;
    }) =>
      api.updateIssue(workspaceId ?? '', issueId, {
        ...patch,
        expectedVersion,
      }),
    onMutate: (variables) =>
      optimisticIssueUpdate(queryClient, workspaceId, filters, variables),
    onError: (_error, _variables, context) => {
      if (
        context?.accessGeneration !== accessGeneration(queryClient, workspaceId)
      )
        return;
      restoreIssueUpdate(queryClient, workspaceId, filters, context);
    },
    onSuccess: (result, variables, context) => {
      if (
        context?.accessGeneration !== accessGeneration(queryClient, workspaceId)
      )
        return;
      queryClient.setQueryData(
        ['issue', workspaceId, variables.issueId],
        result.current,
      );
    },
    onSettled: (_data, _error, variables) => {
      queryClient.invalidateQueries({ queryKey: ['issues', workspaceId] });
      queryClient.invalidateQueries({
        queryKey: ['issue', workspaceId, variables.issueId],
      });
      queryClient.invalidateQueries({
        queryKey: ['activity', workspaceId, variables.issueId],
      });
    },
  });
}

type UpdateVariables = {
  issueId: string;
  patch: DraftPatch;
  expectedVersion: number;
};
type UpdateContext = {
  accessGeneration: number;
  previousList: IssueInfiniteData | undefined;
  previousIssue: Issue | undefined;
  issueId: string;
};

async function optimisticIssueUpdate(
  queryClient: QueryClient,
  workspaceId: string | undefined,
  filters: object,
  variables: UpdateVariables,
): Promise<UpdateContext> {
  await queryClient.cancelQueries({ queryKey: ['issues', workspaceId] });
  await queryClient.cancelQueries({
    queryKey: ['issue', workspaceId, variables.issueId],
  });
  const generation = accessGeneration(queryClient, workspaceId);
  const previousList = queryClient.getQueryData<IssueInfiniteData>([
    'issues',
    workspaceId,
    filters,
  ]);
  const previousIssue = queryClient.getQueryData<Issue>([
    'issue',
    workspaceId,
    variables.issueId,
  ]);
  if (previousList)
    queryClient.setQueryData<IssueInfiniteData>(
      ['issues', workspaceId, filters],
      {
        ...previousList,
        pages: previousList.pages.map((page) => ({
          ...page,
          items: page.items.map((item) =>
            item.id === variables.issueId
              ? { ...item, ...variables.patch }
              : item,
          ),
        })),
      },
    );
  if (previousIssue)
    queryClient.setQueryData(['issue', workspaceId, variables.issueId], {
      ...previousIssue,
      ...variables.patch,
    });
  return {
    accessGeneration: generation,
    previousList,
    previousIssue,
    issueId: variables.issueId,
  };
}

function restoreIssueUpdate(
  queryClient: QueryClient,
  workspaceId: string | undefined,
  filters: object,
  context: UpdateContext | undefined,
) {
  if (context?.previousList)
    queryClient.setQueryData(
      ['issues', workspaceId, filters],
      context.previousList,
    );
  if (context?.previousIssue)
    queryClient.setQueryData(
      ['issue', workspaceId, context.issueId],
      context.previousIssue,
    );
}

export function useIssueLifecycleMutations(
  queryClient: QueryClient,
  workspaceId: string | undefined,
  issueId: string | undefined,
  version: number | undefined,
) {
  const deleteIssue = useMutation({
    mutationFn: () =>
      api.deleteIssue(workspaceId ?? '', issueId ?? '', version ?? 1),
    onMutate: () => optimisticIssueDelete(queryClient, workspaceId, issueId),
    onError: (_error, _variables, context) => {
      if (
        context?.accessGeneration !== accessGeneration(queryClient, workspaceId)
      )
        return;
      restoreIssueDelete(queryClient, workspaceId, issueId, context);
    },
    onSuccess: (result, _variables, context) => {
      if (
        context?.accessGeneration !== accessGeneration(queryClient, workspaceId)
      )
        return;
      queryClient.setQueryData(['issue', workspaceId, issueId], result.current);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['issues', workspaceId] });
      void queryClient.invalidateQueries({
        queryKey: ['issue', workspaceId, issueId],
      });
    },
  });
  const restoreIssue = useMutation({
    mutationFn: () =>
      api.restoreIssue(workspaceId ?? '', issueId ?? '', version ?? 1),
    onMutate: () => accessGeneration(queryClient, workspaceId),
    onSuccess: (result, _variables, generation) => {
      if (generation !== accessGeneration(queryClient, workspaceId)) return;
      queryClient.setQueryData(['issue', workspaceId, issueId], result.current);
      queryClient.invalidateQueries({ queryKey: ['issues', workspaceId] });
    },
  });
  return { deleteIssue, restoreIssue };
}

type DeleteContext = {
  accessGeneration: number;
  previousLists: Array<[QueryKey, IssueInfiniteData | undefined]>;
  previousIssue: Issue | undefined;
};

async function optimisticIssueDelete(
  queryClient: QueryClient,
  workspaceId: string | undefined,
  issueId: string | undefined,
): Promise<DeleteContext> {
  await queryClient.cancelQueries({ queryKey: ['issues', workspaceId] });
  await queryClient.cancelQueries({
    queryKey: ['issue', workspaceId, issueId],
  });
  const generation = accessGeneration(queryClient, workspaceId);
  const previousLists = queryClient.getQueriesData<IssueInfiniteData>({
    queryKey: ['issues', workspaceId],
  });
  const previousIssue = queryClient.getQueryData<Issue>([
    'issue',
    workspaceId,
    issueId,
  ]);
  previousLists.forEach(([key, data]) => {
    if (!data) return;
    queryClient.setQueryData(key, {
      ...data,
      pages: data.pages.map((page) => ({
        ...page,
        items: page.items.filter((item) => item.id !== issueId),
      })),
    });
  });
  if (previousIssue) {
    queryClient.setQueryData<Issue>(['issue', workspaceId, issueId], {
      ...previousIssue,
      deletedAt: new Date().toISOString(),
    });
  }
  return { accessGeneration: generation, previousLists, previousIssue };
}

function restoreIssueDelete(
  queryClient: QueryClient,
  workspaceId: string | undefined,
  issueId: string | undefined,
  context: DeleteContext | undefined,
) {
  if (!context) return;
  context.previousLists.forEach(([key, data]) =>
    queryClient.setQueryData(key, data),
  );
  if (context.previousIssue) {
    queryClient.setQueryData(
      ['issue', workspaceId, issueId],
      context.previousIssue,
    );
  }
}
