import { Component, type ReactNode } from 'react';

export class AppErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="app-loading">
        <section className="empty-card" role="alert">
          <h1>Could not open this view</h1>
          <p>
            The app may have been updated. Reload to get the current version.
          </p>
          <button
            className="button button-primary"
            onClick={() => window.location.reload()}
          >
            Reload app
          </button>
        </section>
      </main>
    );
  }
}
