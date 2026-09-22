import { useState } from 'react';
import { ArrowRight, Boxes, Sparkles } from 'lucide-react';
import { Button, ErrorNotice } from './ui.tsx';

export function BootstrapScreen({
  onBootstrap,
}: {
  onBootstrap: (input: { name: string; slug: string }) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  async function submit() {
    if (!name.trim() || !slug.trim()) return;
    setSubmitting(true);
    setError('');
    try {
      await onBootstrap({ name: name.trim(), slug: slug.trim().toLowerCase() });
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : 'Could not create workspace',
      );
    } finally {
      setSubmitting(false);
    }
  }
  return (
    <main className="bootstrap-screen">
      <div className="bootstrap-card">
        <div className="brand-mark">
          <Boxes size={24} />
        </div>
        <span className="eyebrow">Your workspace</span>
        <h1>Make space for focused work.</h1>
        <p className="bootstrap-lead">
          Set up the first workspace for your team. You can add teams and
          projects after you’re in. Add a team before creating your first issue.
        </p>
        {error ? <ErrorNotice message={error} /> : null}
        <BootstrapForm
          name={name}
          slug={slug}
          submitting={submitting}
          onName={setName}
          onSlug={setSlug}
          onSubmit={() => void submit()}
        />
        <div className="bootstrap-note">
          <Sparkles size={14} />
          <span>Designed for small teams who like to move quickly.</span>
        </div>
      </div>
    </main>
  );
}

function BootstrapForm({
  name,
  slug,
  submitting,
  onName,
  onSlug,
  onSubmit,
}: {
  name: string;
  slug: string;
  submitting: boolean;
  onName: (value: string) => void;
  onSlug: (value: string) => void;
  onSubmit: () => void;
}) {
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <label className="form-field">
        <span>
          Workspace name <em aria-hidden="true">Required</em>
        </span>
        <input
          aria-label="Workspace name"
          aria-required="true"
          autoFocus
          required
          value={name}
          onChange={(event) => onName(event.target.value)}
          placeholder="Acme"
        />
      </label>
      <label className="form-field">
        <span>
          Workspace URL <em aria-hidden="true">Required</em>
        </span>
        <div className="slug-input">
          <span>linear.local/</span>
          <input
            aria-label="Workspace URL"
            aria-required="true"
            required
            pattern="[a-z0-9-]{1,40}"
            value={slug}
            onChange={(event) => onSlug(event.target.value)}
            placeholder="acme"
          />
        </div>
      </label>
      <Button
        tone="primary"
        type="submit"
        disabled={submitting || !name.trim() || !slug.trim()}
      >
        {submitting ? (
          'Creating…'
        ) : (
          <>
            Create workspace <ArrowRight size={16} />
          </>
        )}
      </Button>
    </form>
  );
}
