import { useState } from 'react';
import type { NewIssue } from '../api.ts';

export function useCreateIssueSubmit({
  teamId,
  title,
  description,
  stateId,
  priority,
  assigneeId,
  projectId,
  onCreate,
  onClose,
}: {
  teamId: string;
  title: string;
  description: string;
  stateId: string;
  priority: string;
  assigneeId: string;
  projectId: string;
  onCreate: (input: NewIssue) => Promise<void>;
  onClose: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  async function submit() {
    if (!title.trim() || !teamId) return;
    setSubmitting(true);
    setError('');
    try {
      await onCreate({
        teamId,
        title: title.trim(),
        description: description || null,
        stateId: stateId || undefined,
        priority: Number(priority),
        assigneeId: assigneeId || null,
        projectId: projectId || null,
        parentId: null,
        estimate: null,
        dueDate: null,
        labelIds: [],
      });
      onClose();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : 'Could not create the issue',
      );
    } finally {
      setSubmitting(false);
    }
  }
  return { submitting, error, submit };
}
