import { useEffect, useState } from 'react';
import type { QueryClient } from '@tanstack/react-query';
import { resetWorkspaceAccess } from './workspaceAccess.ts';

export function useWorkspaceEvents(
  workspaceId: string | undefined,
  queryClient: QueryClient,
) {
  const [connected, setConnected] = useState(false);
  useEffect(() => {
    setConnected(false);
    if (!workspaceId) return;
    let active = true;
    let socket: WebSocket;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let refresh: ReturnType<typeof setTimeout> | undefined;
    let visibleTeamIds: string[] | undefined;
    let attemptedConnection = false;
    function refreshWorkspace() {
      if (refresh !== undefined) return;
      refresh = setTimeout(() => {
        refresh = undefined;
        void queryClient.invalidateQueries({
          predicate: (query) =>
            query.queryKey[1] === workspaceId || query.queryKey[0] === 'me',
        });
      }, 30);
    }
    function connect() {
      const reconnecting = attemptedConnection;
      attemptedConnection = true;
      const url = new URL(
        `/api/v1/workspaces/${workspaceId}/events`,
        window.location.href,
      );
      url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
      socket = new WebSocket(url);
      socket.onmessage = (message) => {
        if (!active) return;
        const notice = parseChangeNotice(message.data);
        if (notice === null) return;
        if (notice.kind === 'ready') {
          if (
            reconnecting &&
            (visibleTeamIds === undefined ||
              !sameTeamIds(visibleTeamIds, notice.visibleTeamIds))
          )
            resetWorkspaceAccess(queryClient, workspaceId);
          visibleTeamIds = notice.visibleTeamIds;
        }
        setConnected(true);
        refreshWorkspace();
      };
      socket.onclose = (event) => {
        if (!active) return;
        setConnected(false);
        if (event.code === 1008) resetWorkspaceAccess(queryClient, workspaceId);
        refreshWorkspace();
        retry = setTimeout(connect, 5_000);
      };
    }
    connect();
    return () => {
      active = false;
      clearTimeout(retry);
      clearTimeout(refresh);
      socket.close();
    };
  }, [workspaceId, queryClient]);
  return connected;
}

type ChangeNotice =
  | { kind: 'ready'; visibleTeamIds: string[] }
  | { kind: 'change' };

function parseChangeNotice(data: unknown): ChangeNotice | null {
  if (typeof data !== 'string') return null;
  try {
    const value: unknown = JSON.parse(data);
    if (typeof value !== 'object' || value === null) return null;
    if (
      'kind' in value &&
      value.kind === 'ready' &&
      'visibleTeamIds' in value &&
      Array.isArray(value.visibleTeamIds) &&
      value.visibleTeamIds.every((id) => typeof id === 'string')
    )
      return { kind: 'ready', visibleTeamIds: value.visibleTeamIds };
    if ('entityKind' in value && typeof value.entityKind === 'string')
      return { kind: 'change' };
    return null;
  } catch {
    return null;
  }
}

function sameTeamIds(left: string[], right: string[]): boolean {
  return (
    left.length === right.length &&
    left.every((teamId, index) => teamId === right[index])
  );
}
