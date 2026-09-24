import type { LabelActions } from './LabelPanel.tsx';
import type { StateActions } from './StatePanel.tsx';

export type ClassificationSettingsActions = {
  onCreateLabel: LabelActions['onCreate'];
  onUpdateLabel: LabelActions['onUpdate'];
  onArchiveLabel: LabelActions['onArchive'];
  onCreateState: StateActions['onCreate'];
  onUpdateState: StateActions['onUpdate'];
  onArchiveState: StateActions['onArchive'];
};
