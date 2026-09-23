import { Hash, Plus, Settings } from 'lucide-react';
import type { ReactNode } from 'react';
import type { Workspace } from '../api.ts';
import type { SettingsSection, SidebarView } from './Sidebar.tsx';

const settingsSections: SettingsSection[] = [
  'overview',
  'workspaces',
  'teams',
  'projects',
  'members',
  'labels',
  'statuses',
];

export function SidebarSettings({
  view,
  section,
  onViewChange,
  onSettingsChange,
}: {
  view: SidebarView;
  section: SettingsSection;
  onViewChange: (view: SidebarView) => void;
  onSettingsChange: (section: SettingsSection) => void;
}) {
  return (
    <div className="sidebar-settings">
      <button
        className={view === 'settings' ? 'nav-item active' : 'nav-item'}
        onClick={() => {
          onViewChange('settings');
          onSettingsChange('overview');
        }}
      >
        <Settings size={16} />
        <span>Settings</span>
      </button>
      {view === 'settings' ? (
        <nav className="settings-nav" aria-label="Settings sections">
          {settingsSections.map((item) => (
            <button
              key={item}
              className={
                section === item
                  ? 'settings-nav-item active'
                  : 'settings-nav-item'
              }
              onClick={() => onSettingsChange(item)}
            >
              {item[0].toUpperCase() + item.slice(1)}
            </button>
          ))}
        </nav>
      ) : null}
    </div>
  );
}

export function SidebarFooter({
  workspace,
  onCreateWorkspace,
}: {
  workspace: Workspace;
  onCreateWorkspace: () => void;
}) {
  return (
    <div className="sidebar-footer">
      <Hash size={13} />
      <span>{workspace.slug}</span>
      <button
        className="footer-add"
        onClick={onCreateWorkspace}
        aria-label="Create workspace"
      >
        <Plus size={13} />
      </button>
    </div>
  );
}

export function ResourceSection({
  title,
  onAdd,
  children,
}: {
  title: string;
  onAdd: () => void;
  children: ReactNode;
}) {
  return (
    <div className="sidebar-section">
      <div className="sidebar-section-heading">
        <span>{title}</span>
        <button
          aria-label={`Add ${title.toLowerCase().slice(0, -1)}`}
          onClick={onAdd}
        >
          <Plus size={14} />
        </button>
      </div>
      {children}
    </div>
  );
}
