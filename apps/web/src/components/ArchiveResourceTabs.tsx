import type { ArchiveSection } from '../app/useWorkspaceState.ts';

const sections: ArchiveSection[] = [
  'issues',
  'projects',
  'teams',
  'labels',
  'statuses',
  'workspaces',
];

export function ArchiveResourceTabs({
  selected,
  onSelect,
}: {
  selected: ArchiveSection;
  onSelect: (section: ArchiveSection) => void;
}) {
  return (
    <nav className="archive-tabs" aria-label="Archived resources">
      {sections.map((section) => (
        <button
          key={section}
          aria-current={selected === section ? 'page' : undefined}
          className={
            selected === section ? 'archive-tab active' : 'archive-tab'
          }
          onClick={() => onSelect(section)}
        >
          {section[0].toUpperCase() + section.slice(1)}
        </button>
      ))}
    </nav>
  );
}
