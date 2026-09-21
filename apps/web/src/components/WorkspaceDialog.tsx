import { useState } from 'react';
import { Button, Dialog, ErrorNotice } from './ui.tsx';

export function WorkspaceDialog({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (input: { name: string; slug: string }) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  async function submit() {
    setSaving(true);
    setError('');
    try {
      await onCreate({ name: name.trim(), slug: slug.trim().toLowerCase() });
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : 'Could not create workspace',
      );
    } finally {
      setSaving(false);
    }
  }
  return (
    <Dialog title="Create workspace" onClose={onClose}>
      {error ? <ErrorNotice message={error} /> : null}
      <form
        className="create-form"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <label className="form-field">
          <span>Name</span>
          <input
            data-dialog-autofocus
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Operations"
          />
        </label>
        <label className="form-field">
          <span>Slug</span>
          <input
            required
            pattern="[a-z0-9-]{1,40}"
            value={slug}
            onChange={(event) => setSlug(event.target.value)}
            placeholder="operations"
          />
        </label>
        <footer className="dialog-footer">
          <Button type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            tone="primary"
            disabled={saving || !name.trim() || !slug.trim()}
          >
            {saving ? 'Creating…' : 'Create workspace'}
          </Button>
        </footer>
      </form>
    </Dialog>
  );
}
