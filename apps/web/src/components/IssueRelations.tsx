import type { IssueRelation } from '../api.ts';

export function IssueRelations({
  relations,
  onSelectIssue,
}: {
  relations: IssueRelation[];
  onSelectIssue: (issueId: string) => void;
}) {
  if (relations.length === 0) return null;
  return (
    <section className="relation-section" aria-label="Related issues">
      <div className="section-heading">
        <h3>Related issues</h3>
        <span>{relations.length}</span>
      </div>
      <div className="relation-list">
        {relations.map((relation) => (
          <button
            className="relation-link"
            key={relation.id}
            onClick={() => onSelectIssue(relation.issueId)}
            type="button"
          >
            <span className="relation-type">
              {relation.direction === 'incoming' ? '←' : '→'} {relation.type}
            </span>
            <span className="relation-issue">
              {relation.identifier} · {relation.title}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
