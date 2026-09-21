import { Plus, Search, X } from 'lucide-react';
import { Button, IconButton } from '../components/ui.tsx';

export function Topbar({
  workspaceName,
  title,
  search,
  onSearch,
  onCreate,
}: {
  workspaceName: string;
  title: string;
  search: string;
  onSearch: (value: string) => void;
  onCreate: () => void;
}) {
  return (
    <header className="topbar">
      <div className="topbar-breadcrumb">
        <span>{workspaceName}</span>
        <span className="breadcrumb-slash">/</span>
        <strong>{title}</strong>
      </div>
      <div className="topbar-actions">
        <label className="search-box">
          <Search size={15} />
          <input
            data-search-input
            aria-label="Search issues"
            value={search}
            onChange={(event) => onSearch(event.target.value)}
            placeholder="Search"
          />
          <kbd>/</kbd>
          {search ? (
            <IconButton label="Clear search" onClick={() => onSearch('')}>
              <X size={13} />
            </IconButton>
          ) : null}
        </label>
        <Button tone="primary" className="top-new-button" onClick={onCreate}>
          <Plus size={15} />
          <span>New issue</span>
          <kbd>C</kbd>
        </Button>
      </div>
    </header>
  );
}
