import { useCallback } from 'react';
import type { EditDraft } from './types.ts';
import {
  createSettingsResource,
  updateSettingsResource,
  type SettingsFormValues,
  type SettingsSubmitActions,
} from './useSettingsSubmit.ts';

export function useSettingsActions(
  form: SettingsFormValues & {
    editDraft: EditDraft | null;
    resetForm: () => void;
    closeEdit: () => void;
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
      const draft = form.editDraft;
      if (!draft) return;
      const succeeded = await runSubmit(form, () =>
        updateSettingsResource(draft, actions, deactivate),
      );
      if (succeeded) form.closeEdit();
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
