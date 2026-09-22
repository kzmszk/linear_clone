export type NewIssueInput = {
  teamId: string;
  title: string;
  description: string | null;
  stateId?: string;
  priority: number;
  assigneeId: string | null;
  projectId: string | null;
  parentId: string | null;
  estimate: number | null;
  dueDate: string | null;
  labelIds: string[];
};
export type IssueEdit = Partial<Omit<NewIssueInput, 'teamId'>> & {
  expectedVersion: number;
  archivedAt?: string | null;
};

export type IssueLifecycle = 'open' | 'closed' | 'all';

export type IssueListFilter = {
  teamId: string | null;
  team: string | null;
  projectId: string | null;
  project: string | null;
  stateId: string | null;
  state: string | null;
  assigneeId: string | null;
  assignee: string | null;
  query: string | null;
  cursor: string | null;
  deleted: boolean;
  archived: boolean;
  lifecycle: IssueLifecycle | null;
};

export type ResolvedIssueListFilter = Omit<
  IssueListFilter,
  'team' | 'project' | 'state' | 'assignee'
>;
