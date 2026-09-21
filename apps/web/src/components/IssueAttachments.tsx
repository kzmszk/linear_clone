import type { Attachment } from '../api.ts';

export function IssueAttachments({
  attachments,
}: {
  attachments: Attachment[];
}) {
  if (attachments.length === 0) return null;
  return (
    <section className="attachment-section" aria-label="Attachments">
      <div className="section-heading">
        <h3>Attachments</h3>
        <span>{attachments.length}</span>
      </div>
      <div className="attachment-list">
        {attachments.map((attachment) => (
          <a
            className="attachment-link"
            href={attachment.url}
            key={attachment.id}
            rel="noreferrer"
            target="_blank"
          >
            {attachment.contentType?.startsWith('image/') ? (
              <img src={attachment.url} alt={attachment.title} loading="lazy" />
            ) : null}
            <span>{attachment.title}</span>
          </a>
        ))}
      </div>
    </section>
  );
}
