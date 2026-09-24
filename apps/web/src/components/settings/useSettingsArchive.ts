import { useState } from 'react';
import type { ArchivableTarget } from './types.ts';

export type SettingsArchiveActions = {
  onArchiveWorkspace: (id: string, expectedVersion: number) => Promise<void>;
  onArchiveTeam: (id: string, expectedVersion: number) => Promise<void>;
  onArchiveProject: (id: string, expectedVersion: number) => Promise<void>;
};

export function useSettingsArchive(actions: SettingsArchiveActions) {
  const [target, setTarget] = useState<ArchivableTarget>();
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  function request(next: ArchivableTarget) {
    setError('');
    setTarget(next);
  }
  function close() {
    if (submitting) return;
    setTarget(undefined);
  }
  async function confirm() {
    if (!target || submitting) return;
    setError('');
    setSubmitting(true);
    try {
      await archiveResource(target, actions);
      setTarget(undefined);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : 'Could not archive resource',
      );
    } finally {
      setSubmitting(false);
    }
  }
  return { target, error, submitting, request, close, confirm };
}

function archiveResource(
  target: ArchivableTarget,
  actions: SettingsArchiveActions,
) {
  switch (target.kind) {
    case 'workspace':
      return actions.onArchiveWorkspace(target.item.id, target.item.version);
    case 'team':
      return actions.onArchiveTeam(target.item.id, target.item.version);
    case 'project':
      return actions.onArchiveProject(target.item.id, target.item.version);
    default: {
      const exhaustive: never = target;
      return exhaustive;
    }
  }
}
