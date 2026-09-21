import {
  Building2,
  CircleDot,
  FolderKanban,
  ShieldCheck,
  Users,
} from 'lucide-react';
import type { ReactNode } from 'react';
import type { Member, Project, Team, Workspace } from '../../api.ts';

export function OverviewPanel({
  workspace,
  teams,
  projects,
  members,
}: {
  workspace: Workspace;
  teams: Team[];
  projects: Project[];
  members: Member[];
}) {
  return (
    <div className="settings-overview">
      <div className="settings-hero">
        <div className="workspace-avatar">
          <Building2 size={24} />
        </div>
        <div>
          <h2>{workspace.name}</h2>
          <p>
            /{workspace.slug} · Created{' '}
            {new Date(workspace.createdAt).toLocaleDateString()}
          </p>
        </div>
      </div>
      <div className="settings-stat-grid">
        <Stat icon={<CircleDot />} value={teams.length} label="Teams" />
        <Stat
          icon={<FolderKanban />}
          value={projects.length}
          label="Projects"
        />
        <Stat icon={<Users />} value={members.length} label="Members" />
      </div>
      <div className="settings-callout">
        <ShieldCheck size={18} />
        <div>
          <strong>Keep your workspace tidy</strong>
          <p>
            Use teams for ownership and projects for outcomes. Every change is
            saved to the shared workspace.
          </p>
        </div>
      </div>
    </div>
  );
}

function Stat({
  icon,
  value,
  label,
}: {
  icon: ReactNode;
  value: number;
  label: string;
}) {
  return (
    <div className="settings-stat">
      <span>{icon}</span>
      <strong>{value}</strong>
      <small>{label}</small>
    </div>
  );
}
