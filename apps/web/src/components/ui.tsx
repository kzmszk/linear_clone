import {
  AlertCircle,
  Archive,
  Check,
  Circle,
  CircleDot,
  CircleEllipsis,
  CircleOff,
  LoaderCircle,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import {
  forwardRef,
  useEffect,
  useRef,
  type ButtonHTMLAttributes,
  type ReactNode,
} from 'react';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  tone?: 'primary' | 'quiet' | 'danger';
};

export function Button({
  tone = 'quiet',
  className = '',
  children,
  ...props
}: ButtonProps) {
  return (
    <button className={`button button-${tone} ${className}`} {...props}>
      {children}
    </button>
  );
}

export const IconButton = forwardRef<
  HTMLButtonElement,
  ButtonProps & { label: string }
>(function IconButton({ label, className = '', children, ...props }, ref) {
  return (
    <button
      ref={ref}
      className={`icon-button ${className}`}
      aria-label={label}
      title={label}
      {...props}
    >
      {children}
    </button>
  );
});

export function Dialog({
  title,
  description,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  const initialFocus = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);
  useEffect(() => {
    const autofocus = dialogRef.current?.querySelector<HTMLElement>(
      '[data-dialog-autofocus]',
    );
    (autofocus ?? initialFocus.current)?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'button, input, textarea, select, [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((item) => !item.hasAttribute('disabled'));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      }
      if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
  return (
    <div
      className="dialog-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        ref={dialogRef}
        className={`dialog ${wide ? 'dialog-wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
      >
        <header className="dialog-header">
          <div>
            <h2 id="dialog-title">{title}</h2>
            {description ? <p>{description}</p> : null}
          </div>
          <IconButton ref={initialFocus} label="Close" onClick={onClose}>
            <X size={17} />
          </IconButton>
        </header>
        {children}
      </section>
    </div>
  );
}

export function StatusIcon({
  type,
  color,
  size = 15,
}: {
  type: string;
  color?: string;
  size?: number;
}) {
  const style = color ? { color } : undefined;
  if (type === 'completed' || type === 'done')
    return <Check size={size} strokeWidth={2.5} style={style} />;
  if (type === 'canceled' || type === 'cancelled')
    return <CircleOff size={size} style={style} />;
  if (type === 'started' || type === 'in_progress')
    return <CircleDot size={size} style={style} />;
  if (type === 'backlog') return <CircleEllipsis size={size} style={style} />;
  return <Circle size={size} style={style} />;
}

export function PriorityIcon({ priority }: { priority: number }) {
  const labels = ['No priority', 'Urgent', 'High', 'Medium', 'Low'];
  const color =
    ['var(--muted)', '#ef4444', '#f97316', '#eab308', '#3b82f6'][priority] ??
    'var(--muted)';
  return (
    <span
      className="priority-icon"
      title={labels[priority] ?? 'No priority'}
      aria-label={labels[priority] ?? 'No priority'}
      style={{ color }}
    >
      <span className={`priority-bars priority-${priority}`}>
        <i />
        <i />
        <i />
        <i />
      </span>
    </span>
  );
}

export function Avatar({
  name,
  email,
  size = 'sm',
}: {
  name?: string | null;
  email?: string | null;
  size?: 'sm' | 'md';
}) {
  const label = name || email || 'Unassigned';
  const initials = label
    .split(/[\s@]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
  if (!name && !email)
    return (
      <span className={`avatar avatar-${size} avatar-empty`} title="Unassigned">
        <Circle size={size === 'md' ? 18 : 14} />
      </span>
    );
  return (
    <span className={`avatar avatar-${size}`} title={label}>
      {initials}
    </span>
  );
}

export function Loading({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="loading">
      <LoaderCircle size={16} className="spin" />
      <span>{label}</span>
    </div>
  );
}

export function ErrorNotice({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="error-notice" role="alert">
      <AlertCircle size={16} />
      <span>{message}</span>
      {onRetry ? <Button onClick={onRetry}>Try again</Button> : null}
    </div>
  );
}

export function EmptyState({
  icon = <Search size={24} />,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="empty-icon">{icon}</div>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}

export function SaveStatus({
  state,
  error,
}: {
  state: 'idle' | 'saving' | 'saved' | 'error';
  error?: string;
}) {
  if (state === 'saving')
    return (
      <span className="save-status save-status-saving">
        <LoaderCircle size={13} className="spin" /> Saving…
      </span>
    );
  if (state === 'saved')
    return (
      <span className="save-status save-status-saved">
        <Check size={13} /> Saved
      </span>
    );
  if (state === 'error')
    return (
      <span className="save-status save-status-error">
        <AlertCircle size={13} /> {error ?? 'Save failed'}
      </span>
    );
  return null;
}

export function ResourceIcon({
  resource,
}: {
  resource:
    | 'team'
    | 'project'
    | 'member'
    | 'workspace'
    | 'issue'
    | 'archive'
    | 'trash'
    | 'restore';
}) {
  if (resource === 'team') return <CircleDot size={15} />;
  if (resource === 'project') return <Archive size={15} />;
  if (resource === 'member') return <Avatar name="M" />;
  if (resource === 'workspace') return <Circle size={15} />;
  if (resource === 'trash') return <Trash2 size={15} />;
  if (resource === 'restore') return <RotateCcw size={15} />;
  if (resource === 'archive') return <Archive size={15} />;
  return <CircleDot size={15} />;
}

export function AddIcon() {
  return <Plus size={16} />;
}
