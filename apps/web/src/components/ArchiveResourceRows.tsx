import {
  Building2,
  FolderKanban,
  RotateCcw,
  Tag,
  Users,
  Workflow,
} from 'lucide-react';
import type { ReactNode } from 'react';
import type { Project, Team, WorkflowState, Workspace } from '../api.ts';
import type { ArchivedLabel } from '../archiveApi.ts';
import type { ArchiveRestoreTarget } from '../app/useArchiveRestore.ts';
import { Button } from './ui.tsx';

export function ArchivedWorkspaceRows({
  items,
  pendingId,
  onRestore,
}: {
  items: Workspace[];
  pendingId?: string;
  onRestore: (target: ArchiveRestoreTarget) => void;
}) {
  if (items.length === 0) return <ArchiveEmpty kind="workspaces" />;
  return (
    <ArchiveTable>
      {items.map((item) => (
        <ArchiveResourceRow
          key={item.id}
          icon={<Building2 size={16} />}
          name={item.name}
          detail={`/${item.slug}`}
          disabled={pendingId === item.id}
          onRestore={() =>
            onRestore({ kind: 'workspace', id: item.id, version: item.version })
          }
        />
      ))}
    </ArchiveTable>
  );
}

export function ArchivedProjectRows({
  items,
  pendingId,
  onRestore,
}: {
  items: Project[];
  pendingId?: string;
  onRestore: (target: ArchiveRestoreTarget) => void;
}) {
  if (items.length === 0) return <ArchiveEmpty kind="projects" />;
  return (
    <ArchiveTable>
      {items.map((item) => (
        <ArchiveResourceRow
          key={item.id}
          icon={<FolderKanban size={16} />}
          name={item.name}
          detail={item.status}
          disabled={pendingId === item.id}
          onRestore={() =>
            onRestore({ kind: 'project', id: item.id, version: item.version })
          }
        />
      ))}
    </ArchiveTable>
  );
}

export function ArchivedTeamRows({
  items,
  pendingId,
  onRestore,
}: {
  items: Team[];
  pendingId?: string;
  onRestore: (target: ArchiveRestoreTarget) => void;
}) {
  if (items.length === 0) return <ArchiveEmpty kind="teams" />;
  return (
    <ArchiveTable>
      {items.map((item) => (
        <ArchiveResourceRow
          key={item.id}
          icon={<Users size={16} />}
          name={item.name}
          detail={item.key}
          disabled={pendingId === item.id}
          onRestore={() =>
            onRestore({ kind: 'team', id: item.id, version: item.version })
          }
        />
      ))}
    </ArchiveTable>
  );
}

export function ArchivedLabelRows({
  items,
  pendingId,
  onRestore,
}: {
  items: ArchivedLabel[];
  pendingId?: string;
  onRestore: (target: ArchiveRestoreTarget) => void;
}) {
  if (items.length === 0) return <ArchiveEmpty kind="labels" />;
  return (
    <ArchiveTable>
      {items.map((item) => (
        <ArchiveResourceRow
          key={item.id}
          icon={<Tag size={16} color={item.color} />}
          name={item.name}
          disabled={pendingId === item.id}
          onRestore={() =>
            onRestore({ kind: 'label', id: item.id, version: item.version })
          }
        />
      ))}
    </ArchiveTable>
  );
}

export function ArchivedStatusRows({
  items,
  teams,
  pendingId,
  onRestore,
}: {
  items: WorkflowState[];
  teams: Team[];
  pendingId?: string;
  onRestore: (target: ArchiveRestoreTarget) => void;
}) {
  if (items.length === 0) return <ArchiveEmpty kind="statuses" />;
  return (
    <ArchiveTable>
      {items.map((item) => (
        <ArchiveResourceRow
          key={item.id}
          icon={<Workflow size={16} color={item.color} />}
          name={item.name}
          detail={teams.find((team) => team.id === item.teamId)?.name}
          disabled={pendingId === item.id}
          onRestore={() =>
            onRestore({ kind: 'status', id: item.id, version: item.version })
          }
        />
      ))}
    </ArchiveTable>
  );
}

export function ArchiveEmpty({ kind }: { kind: string }) {
  return <p className="archive-empty">No archived {kind}.</p>;
}

function ArchiveTable({ children }: { children: ReactNode }) {
  return <div className="settings-table archive-table">{children}</div>;
}

function ArchiveResourceRow({
  icon,
  name,
  detail,
  disabled,
  onRestore,
}: {
  icon: ReactNode;
  name: string;
  detail?: string;
  disabled: boolean;
  onRestore: () => void;
}) {
  return (
    <div className="settings-row archive-row">
      <div className="settings-row-icon">{icon}</div>
      <div>
        <strong>{name}</strong>
        {detail ? <span>{detail}</span> : null}
      </div>
      <span className="row-spacer" />
      <Button disabled={disabled} onClick={onRestore}>
        <RotateCcw size={14} /> Restore
      </Button>
    </div>
  );
}
