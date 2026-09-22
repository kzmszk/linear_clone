import { useEffect, useMemo, useState } from 'react';
import type { Metadata } from '../api.ts';

export function useCreateIssueDraft({
  metadata,
  defaultTeamId,
  defaultProjectId,
}: {
  metadata: Metadata;
  defaultTeamId?: string;
  defaultProjectId?: string;
}) {
  const initial = initialIssueContext(
    metadata,
    defaultTeamId,
    defaultProjectId,
  );
  const [teamId, setTeamId] = useState(initial.teamId);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [stateId, setStateId] = useState('');
  const [priority, setPriority] = useState('0');
  const [assigneeId, setAssigneeId] = useState('');
  const [projectId, setProjectId] = useState(initial.projectId);
  const teamStates = useMemo(
    () =>
      metadata.states
        .filter((state) => state.teamId === teamId)
        .sort((a, b) => a.position - b.position),
    [metadata.states, teamId],
  );
  useEffect(() => {
    setStateId((current) =>
      teamStates.some((state) => state.id === current)
        ? current
        : (teamStates[0]?.id ?? ''),
    );
    setProjectId((current) =>
      metadata.projects.some(
        (project) => project.id === current && project.teamIds.includes(teamId),
      )
        ? current
        : '',
    );
  }, [metadata.projects, teamId, teamStates]);
  return {
    teamId,
    title,
    description,
    stateId,
    priority,
    assigneeId,
    projectId,
    teamStates,
    setTeamId,
    setTitle,
    setDescription,
    setStateId,
    setPriority,
    setAssigneeId,
    setProjectId,
  };
}

function initialIssueContext(
  metadata: Metadata,
  defaultTeamId: string | undefined,
  defaultProjectId: string | undefined,
): { teamId: string; projectId: string } {
  const project = metadata.projects.find(
    (item) => item.id === defaultProjectId,
  );
  const selectedTeam = metadata.teams.some((team) => team.id === defaultTeamId)
    ? defaultTeamId
    : undefined;
  const projectTeam = project?.teamIds.find((id) =>
    metadata.teams.some((team) => team.id === id),
  );
  const teamId =
    (project && projectTeam && !project.teamIds.includes(selectedTeam ?? '')
      ? projectTeam
      : selectedTeam) ??
    metadata.teams[0]?.id ??
    '';
  return {
    teamId,
    projectId: project && project.teamIds.includes(teamId) ? project.id : '',
  };
}
