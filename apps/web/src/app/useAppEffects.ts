import { useEffect } from 'react';

export function useWorkspaceSelection(
  workspaceId: string,
  setWorkspaceId: (id: string, replace?: boolean) => void,
  workspaces: Array<{ id: string }> | undefined,
) {
  useEffect(() => {
    if (!workspaceId && workspaces?.[0]) setWorkspaceId(workspaces[0].id, true);
    if (
      workspaceId &&
      workspaces &&
      !workspaces.some((item) => item.id === workspaceId)
    )
      setWorkspaceId(workspaces[0]?.id ?? '', true);
  }, [setWorkspaceId, workspaceId, workspaces]);
}

export function useTheme(darkMode: boolean) {
  useEffect(() => {
    document.documentElement.dataset.theme = darkMode ? 'dark' : 'light';
    window.localStorage.setItem(
      'linear-clone-theme',
      darkMode ? 'dark' : 'light',
    );
  }, [darkMode]);
}

export function useKeyboardShortcuts(
  view: 'issues' | 'settings',
  setCreateOpen: (open: boolean) => void,
  setWorkspaceOpen: (open: boolean) => void,
  setIssueId: (id: string | undefined) => void,
) {
  useEffect(() => {
    const isTextInput = (target: EventTarget | null) =>
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      (target instanceof HTMLElement && target.isContentEditable);
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.isComposing ||
        isTextInput(event.target)
      )
        return;
      if (document.querySelector('[role=dialog], [role=listbox]')) return;
      if (event.key.toLowerCase() === 'c' && view === 'issues') {
        event.preventDefault();
        setCreateOpen(true);
      }
      if (event.key === '/' && view === 'issues') {
        event.preventDefault();
        document
          .querySelector<HTMLInputElement>('[data-search-input]')
          ?.focus();
      }
      if (event.key === 'Escape') {
        setCreateOpen(false);
        setWorkspaceOpen(false);
        setIssueId(undefined);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [setCreateOpen, setIssueId, setWorkspaceOpen, view]);
}
