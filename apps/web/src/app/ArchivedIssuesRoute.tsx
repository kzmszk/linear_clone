import { useArchiveRestore } from './useArchiveRestore.ts';
import type { useWorkspaceController } from './useWorkspaceController.ts';
import { ArchiveResourceTabs } from '../components/ArchiveResourceTabs.tsx';
import { ArchiveEmpty } from '../components/ArchiveResourceRows.tsx';
import { ErrorNotice, Loading } from '../components/ui.tsx';
import type { Issue } from '../api.ts';

type Controller = ReturnType<typeof useWorkspaceController>;

export function ArchivedIssuesRoute({
  controller,
}: {
  controller: Controller;
}) {
  const { workspace, archiveSection, setArchiveSection, queryClient } =
    controller;
  const restore = useArchiveRestore(queryClient, workspace?.id);
  if (!workspace) return null;
  return (
    <main className="archive-pane">
      <header className="settings-header">
        <div>
          <span className="eyebrow">Archived · {workspace.name}</span>
          <h1>Archived</h1>
        </div>
      </header>
      <ArchiveResourceTabs
        selected={archiveSection ?? 'issues'}
        onSelect={(section) => {
          if (section !== 'issues') controller.setSelectedIssueId(undefined);
          setArchiveSection(section);
        }}
      />
      <section className="archive-content" aria-labelledby="archive-heading">
        <h2 id="archive-heading">Issues</h2>
        {restore.error ? (
          <ErrorNotice message={messageFor(restore.error)} />
        ) : null}
        <ArchivedIssueContent controller={controller} restore={restore} />
      </section>
    </main>
  );
}

function ArchivedIssueContent({
  controller,
  restore,
}: {
  controller: Controller;
  restore: ReturnType<typeof useArchiveRestore>;
}) {
  const { issues, selectIssue } = controller;
  const items = issues.data?.pages.flatMap((page) => page.items) ?? [];
  if (issues.isError) return <ErrorNotice message={messageFor(issues.error)} />;
  if (issues.isLoading && items.length === 0)
    return <Loading label="Loading archived issues" />;
  return (
    <>
      {items.length === 0 ? (
        <ArchiveEmpty kind="issues" />
      ) : (
        <ArchivedIssueRows
          items={items}
          pendingId={restore.variables?.id}
          onSelect={selectIssue}
          onRestore={(issue) =>
            restore.mutate({
              kind: 'issue',
              id: issue.id,
              version: issue.version,
            })
          }
        />
      )}
      {issues.hasNextPage ? (
        <div className="load-more">
          <button
            className="button button-quiet"
            disabled={issues.isFetchingNextPage}
            onClick={() => void issues.fetchNextPage()}
          >
            {issues.isFetchingNextPage ? 'Loading…' : 'Load more issues'}
          </button>
        </div>
      ) : null}
    </>
  );
}

function ArchivedIssueRows({
  items,
  pendingId,
  onSelect,
  onRestore,
}: {
  items: Issue[];
  pendingId?: string;
  onSelect: (issue: Issue) => void;
  onRestore: (issue: Issue) => void;
}) {
  return (
    <div
      className="settings-table archive-table"
      role="list"
      aria-label="Archived issues"
    >
      {items.map((issue) => (
        <div
          className="settings-row archive-row"
          key={issue.id}
          role="listitem"
        >
          <button
            className="archive-issue-link"
            aria-label={`Open ${issue.identifier}: ${issue.title}`}
            onClick={() => onSelect(issue)}
          >
            <strong>{issue.identifier}</strong>
            <span>{issue.title}</span>
          </button>
          <span className="row-spacer" />
          <button
            className="button button-quiet"
            disabled={pendingId === issue.id}
            onClick={() => onRestore(issue)}
          >
            Restore
          </button>
        </div>
      ))}
    </div>
  );
}

function messageFor(error: unknown) {
  return error instanceof Error
    ? error.message
    : 'Could not load archived issues';
}
