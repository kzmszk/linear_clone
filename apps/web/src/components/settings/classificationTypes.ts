import type { LabelActions } from './LabelPanel.tsx';
import type { StateActions } from './StatePanel.tsx';

export type ClassificationSettingsActions = {
  onCreateLabel: LabelActions['onCreate'];
  onUpdateLabel: LabelActions['onUpdate'];
  onDeleteLabel: LabelActions['onDelete'];
  onCreateState: StateActions['onCreate'];
  onUpdateState: StateActions['onUpdate'];
  onDeleteState: StateActions['onDelete'];
};
