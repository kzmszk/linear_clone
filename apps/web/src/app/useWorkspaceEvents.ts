import { useEffect, useState } from 'react';
import type { QueryClient } from '@tanstack/react-query';

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
      const url = new URL(
        `/api/v1/workspaces/${workspaceId}/events`,
        window.location.href,
      );
      url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
      socket = new WebSocket(url);
      socket.onmessage = (message) => {
        if (!active || !isChangeNotice(message.data)) return;
        setConnected(true);
        refreshWorkspace();
      };
      socket.onclose = () => {
        if (!active) return;
        setConnected(false);
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

function isChangeNotice(data: unknown): boolean {
  if (typeof data !== 'string') return false;
  try {
    const value: unknown = JSON.parse(data);
    return (
      typeof value === 'object' &&
      value !== null &&
      (('kind' in value && value.kind === 'ready') ||
        ('entityKind' in value && typeof value.entityKind === 'string'))
    );
  } catch {
    return false;
  }
}
