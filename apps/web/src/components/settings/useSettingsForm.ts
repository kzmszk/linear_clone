import { useState } from 'react';
import {
  editDraftFromTarget,
  type EditDraft,
  type EditTarget,
} from './types.ts';

export function useSettingsForm() {
  const [editDraft, setEditDraft] = useState<EditDraft | null>(null);
  const [formError, setFormError] = useState('');
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [teamKey, setTeamKey] = useState('');
  const [teamPrivate, setTeamPrivate] = useState(false);
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState('planned');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'owner' | 'admin' | 'member'>('member');
  const [teamIds, setTeamIds] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  function resetForm() {
    setName('');
    setSlug('');
    setTeamKey('');
    setTeamPrivate(false);
    setDescription('');
    setStatus('planned');
    setEmail('');
    setRole('member');
    setTeamIds([]);
    setFormError('');
  }

  function beginEdit(target: EditTarget) {
    setEditDraft(editDraftFromTarget(target));
    setFormError('');
  }

  function closeEdit() {
    setEditDraft(null);
    resetForm();
  }

  return {
    editDraft,
    formError,
    setFormError,
    name,
    setName,
    slug,
    setSlug,
    teamKey,
    setTeamKey,
    teamPrivate,
    setTeamPrivate,
    description,
    setDescription,
    status,
    setStatus,
    email,
    setEmail,
    role,
    setRole,
    teamIds,
    setTeamIds,
    submitting,
    setSubmitting,
    resetForm,
    beginEdit,
    setEditDraft,
    closeEdit,
  };
}
