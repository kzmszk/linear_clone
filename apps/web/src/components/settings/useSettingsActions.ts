import { useCallback } from 'react';
import type { EditTarget } from './types.ts';
import {
  createSettingsResource,
  updateSettingsResource,
  type SettingsFormValues,
  type SettingsSubmitActions,
} from './useSettingsSubmit.ts';

export function useSettingsActions(
  form: SettingsFormValues & {
    editing: EditTarget | null;
    resetForm: () => void;
    setEditing: (target: EditTarget | null) => void;
    setFormError: (message: string) => void;
    setSubmitting: (value: boolean) => void;
  },
  actions: SettingsSubmitActions,
) {
  const submitCreate = useCallback(
    async (kind: 'workspace' | 'team' | 'project' | 'member') => {
      const succeeded = await runSubmit(form, () =>
        createSettingsResource(kind, form, actions),
      );
      if (succeeded) form.resetForm();
      return succeeded;
    },
    [actions, form],
  );
  const submitEdit = useCallback(
    async (deactivate = false) => {
      const editing = form.editing;
      if (!editing) return;
      const succeeded = await runSubmit(form, () =>
        updateSettingsResource(editing, form, actions, deactivate),
      );
      if (succeeded) {
        form.setEditing(null);
        form.resetForm();
      }
    },
    [actions, form],
  );
  return { submitCreate, submitEdit };
}

async function runSubmit(
  form: SettingsFormValues & {
    setFormError: (message: string) => void;
    setSubmitting: (value: boolean) => void;
  },
  operation: () => Promise<void>,
): Promise<boolean> {
  form.setSubmitting(true);
  form.setFormError('');
  try {
    await operation();
    return true;
  } catch (reason) {
    form.setFormError(
      reason instanceof Error ? reason.message : 'Could not save changes',
    );
    return false;
  } finally {
    form.setSubmitting(false);
  }
}
