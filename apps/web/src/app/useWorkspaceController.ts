import { useEffect } from 'react';
import { useWorkspaceQueries } from './useWorkspaceQueries.ts';
import { useQueryClient } from '@tanstack/react-query';
import type { Issue } from '../api.ts';
import {
  useKeyboardShortcuts,
  useTheme,
  useWorkspaceSelection,
} from './useAppEffects.ts';
import {
  useCreateIssueMutation,
  useIssueLifecycleMutations,
  useUpdateIssueMutation,
  useWorkspaceMutations,
} from './useWorkspaceMutations.ts';
import { useCommentMutation } from './useCommentMutation.ts';
import { useWorkspaceState } from './useWorkspaceState.ts';

export function useWorkspaceController() {
  const queryClient = useQueryClient();
  const state = useWorkspaceState();
  const { me, workspace, metadata, filters, ...issueQueries } =
    useWorkspaceQueries(state, queryClient);
  useWorkspaceSelection(
    state.workspaceId,
    state.setWorkspaceId,
    me.data?.workspaces.filter((item) => !item.archivedAt),
  );
  useEffect(() => {
    const issue = issueQueries.selectedIssue.data;
    if (!state.selectedIssueId || !issue) return;
    if (issue.archivedAt && state.archiveSection !== 'issues') {
      state.setArchiveSection('issues');
    }
  }, [
    issueQueries.selectedIssue.data,
    state.selectedIssueId,
    state.setArchiveSection,
    state.archiveSection,
  ]);
  useTheme(state.darkMode);
  useKeyboardShortcuts(
    state.view,
    state.setShowCreate,
    state.setShowWorkspaceCreate,
    state.setSelectedIssueId,
  );
  const workspaceMutations = useWorkspaceMutations(
    queryClient,
    state.setWorkspaceId,
    state.setShowWorkspaceCreate,
  );
  const createIssue = useCreateIssueMutation(
    queryClient,
    workspace?.id,
    state.setSelectedIssueId,
  );
  const updateIssue = useUpdateIssueMutation(
    queryClient,
    workspace?.id,
    filters,
  );
  const lifecycle = useIssueLifecycleMutations(
    queryClient,
    workspace?.id,
    state.selectedIssueId,
    issueQueries.selectedIssue.data?.version,
  );
  const addComment = useCommentMutation(
    queryClient,
    workspace?.id,
    state.selectedIssueId,
  );
  function selectIssue(issue: Issue) {
    queryClient.setQueryData(['issue', workspace?.id, issue.id], issue);
    state.setSelectedIssueId(issue.id);
  }
  return {
    queryClient,
    ...state,
    selectIssue,
    me,
    workspace,
    metadata,
    filters,
    ...issueQueries,
    ...workspaceMutations,
    createIssue,
    updateIssue,
    ...lifecycle,
    addComment,
  };
}
