import { useQueryClient } from '@tanstack/react-query';
import type { Project, Team, WorkflowState, Workspace } from '../api.ts';
import type { ArchivedLabel } from '../archiveApi.ts';
import type { ArchiveRestoreTarget } from './useArchiveRestore.ts';
import { useArchiveRestore } from './useArchiveRestore.ts';
import { useArchivedResourceQueries } from './useArchivedResourceQueries.ts';
import type { ArchiveSection } from './useWorkspaceState.ts';
import type { useWorkspaceController } from './useWorkspaceController.ts';
import { ArchiveResourceTabs } from '../components/ArchiveResourceTabs.tsx';
import {
  ArchiveEmpty,
  ArchivedLabelRows,
  ArchivedProjectRows,
  ArchivedStatusRows,
  ArchivedTeamRows,
  ArchivedWorkspaceRows,
} from '../components/ArchiveResourceRows.tsx';
import { ErrorNotice, Loading } from '../components/ui.tsx';

type Controller = ReturnType<typeof useWorkspaceController>;
type Restore = (target: ArchiveRestoreTarget) => void;
type ResourceSection = Exclude<ArchiveSection, 'issues' | 'workspaces'>;

export function ArchivedResourcesRoute({
  controller,
}: {
  controller: Controller;
}) {
  const { archiveSection: section, workspace, me, metadata } = controller;
  const queries = useArchivedResourceQueries(workspace?.id, section);
  const restore = useArchiveRestore(useQueryClient(), workspace?.id);
  if (!section || section === 'issues' || !workspace || !me.data) return null;
  return (
    <main className="archive-pane">
      <header className="settings-header">
        <div>
          <span className="eyebrow">Archived · {workspace.name}</span>
          <h1>Archived</h1>
        </div>
      </header>
      <ArchiveResourceTabs
        selected={section}
        onSelect={(next) => {
          if (next !== 'issues') controller.setSelectedIssueId(undefined);
          controller.setArchiveSection(next);
        }}
      />
      <section className="archive-content" aria-labelledby="archive-heading">
        <h2 id="archive-heading">{capitalized(section)}</h2>
        {restore.error ? (
          <ErrorNotice message={messageFor(restore.error)} />
        ) : null}
        <ArchivedResourceContent
          section={section}
          workspaces={me.data.workspaces}
          queries={queries}
          activeTeams={metadata.data?.teams ?? []}
          restore={restore}
        />
      </section>
    </main>
  );
}

function ArchivedResourceContent({
  section,
  workspaces,
  queries,
  activeTeams,
  restore,
}: {
  section: Exclude<ArchiveSection, 'issues'>;
  workspaces: Workspace[];
  queries: ReturnType<typeof useArchivedResourceQueries>;
  activeTeams: Team[];
  restore: ReturnType<typeof useArchiveRestore>;
}) {
  if (section === 'workspaces')
    return (
      <ArchivedWorkspaceRows
        items={workspaces.filter((item) => item.archivedAt)}
        pendingId={restore.variables?.id}
        onRestore={(target) => restore.mutate(target)}
      />
    );
  return (
    <ResourceContent
      section={section}
      query={selectedResourceQuery(section, queries)}
      projects={queries.projects.data ?? []}
      teams={queries.teams.data ?? []}
      labels={queries.labels.data ?? []}
      statuses={queries.statuses.data ?? []}
      activeTeams={activeTeams}
      pendingId={restore.variables?.id}
      onRestore={(target) => restore.mutate(target)}
    />
  );
}

function ResourceContent({
  section,
  query,
  projects,
  teams,
  labels,
  statuses,
  activeTeams,
  pendingId,
  onRestore,
}: {
  section: ResourceSection;
  query: ReturnType<typeof selectedResourceQuery>;
  projects: Project[];
  teams: Team[];
  labels: ArchivedLabel[];
  statuses: WorkflowState[];
  activeTeams: Team[];
  pendingId?: string;
  onRestore: Restore;
}) {
  if (query?.isLoading)
    return <Loading label={`Loading archived ${section}`} />;
  if (query?.isError) return <ErrorNotice message={messageFor(query.error)} />;
  if (!query?.isSuccess) return null;
  return (
    <ArchivedResourceRows
      section={section}
      projects={projects}
      teams={teams}
      labels={labels}
      statuses={statuses}
      activeTeams={activeTeams}
      pendingId={pendingId}
      onRestore={onRestore}
    />
  );
}

function ArchivedResourceRows({
  section,
  projects,
  teams,
  labels,
  statuses,
  activeTeams,
  pendingId,
  onRestore,
}: {
  section: ResourceSection;
  projects: Project[];
  teams: Team[];
  labels: ArchivedLabel[];
  statuses: WorkflowState[];
  activeTeams: Team[];
  pendingId?: string;
  onRestore: Restore;
}) {
  switch (section) {
    case 'projects':
      return (
        <ArchivedProjectRows
          items={projects}
          pendingId={pendingId}
          onRestore={onRestore}
        />
      );
    case 'teams':
      return (
        <ArchivedTeamRows
          items={teams}
          pendingId={pendingId}
          onRestore={onRestore}
        />
      );
    case 'labels':
      return (
        <ArchivedLabelRows
          items={labels}
          pendingId={pendingId}
          onRestore={onRestore}
        />
      );
    case 'statuses':
      return (
        <ArchivedStatusRows
          items={statuses}
          teams={activeTeams}
          pendingId={pendingId}
          onRestore={onRestore}
        />
      );
    default: {
      const exhaustive: never = section;
      return <ArchiveEmpty kind={exhaustive} />;
    }
  }
}

function selectedResourceQuery(
  section: ArchiveSection | undefined,
  queries: ReturnType<typeof useArchivedResourceQueries>,
) {
  switch (section) {
    case 'projects':
      return queries.projects;
    case 'teams':
      return queries.teams;
    case 'labels':
      return queries.labels;
    case 'statuses':
      return queries.statuses;
    default:
      return undefined;
  }
}

function capitalized(value: string) {
  return value[0]?.toUpperCase() + value.slice(1);
}

function messageFor(error: unknown) {
  return error instanceof Error
    ? error.message
    : 'Could not load archived items';
}
