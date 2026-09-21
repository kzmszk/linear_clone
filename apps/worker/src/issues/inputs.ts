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
