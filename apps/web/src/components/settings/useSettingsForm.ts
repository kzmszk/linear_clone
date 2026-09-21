import { useState } from 'react';
import type { EditTarget } from './types.ts';

export function useSettingsForm() {
  const [editing, setEditing] = useState<EditTarget | null>(null);
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
  const [active, setActive] = useState(true);
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
    setActive(true);
    setFormError('');
  }

  function beginEdit(target: EditTarget) {
    setEditing(target);
    setFormError('');
    setName('name' in target.item ? target.item.name : '');
    setSlug(target.kind === 'workspace' ? target.item.slug : '');
    setTeamPrivate(target.kind === 'team' && target.item.private);
    setDescription(
      target.kind === 'project' ? (target.item.description ?? '') : '',
    );
    setStatus(target.kind === 'project' ? target.item.status : 'planned');
    setEmail(target.kind === 'member' ? target.item.email : '');
    setRole(target.kind === 'member' ? target.item.role : 'member');
    setTeamIds('teamIds' in target.item ? target.item.teamIds : []);
    setActive(target.kind === 'member' ? target.item.active : true);
  }

  return {
    editing,
    setEditing,
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
    active,
    setActive,
    submitting,
    setSubmitting,
    resetForm,
    beginEdit,
  };
}
