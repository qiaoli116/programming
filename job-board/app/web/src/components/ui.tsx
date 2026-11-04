// Small building blocks that use the CSS classes from the Stage 2 mockups.
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { Job, JobScore } from '@jobboard/shared';
import { matchClass, outOfTen } from '../scores';
import { summarise, timeAgo } from '../format';

export const Page = ({ children }: { children: ReactNode }) => <main id="main">{children}</main>;

export const Loading = () => (
  <div className="loading" role="status">
    Loading…
  </div>
);

/** Lets a wide table scroll inside its own box on a narrow screen, so the page itself never scrolls sideways (JB-001). */
export const TableScroll = ({ children }: { children: ReactNode }) => <div className="table-scroll">{children}</div>;

export function Notice({ kind, children }: { kind: 'ok' | 'err' | 'info'; children: ReactNode }) {
  return (
    <div className={`notice ${kind}`} role={kind === 'err' ? 'alert' : 'status'}>
      {children}
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="card empty">
      <b>{title}</b>
      {children}
    </div>
  );
}

interface FieldProps {
  id: string;
  label: string;
  required?: boolean;
  optional?: boolean;
  hint?: string;
  error?: string;
  children: ReactNode;
}

/** Label + control + error message. The control must use the same `id`. */
export function Field({ id, label, required, optional, hint, error, children }: FieldProps) {
  return (
    <div className={`field${error ? ' error' : ''}`}>
      <label htmlFor={id}>
        {label}
        {required && <span className="req"> *</span>}
        {optional && <span className="muted"> (optional)</span>}
      </label>
      {children}
      {hint && <div className="hint">{hint}</div>}
      {error && (
        <div className="err" id={`${id}-error`}>
          {error}
        </div>
      )}
    </div>
  );
}

export const errorProps = (id: string, error?: string) =>
  error ? { 'aria-invalid': true as const, 'aria-describedby': `${id}-error` } : {};

export function JobMeta({ job, withPosted = true }: { job: Job; withPosted?: boolean }) {
  return (
    <div className="meta">
      <span>📍 {job.location}</span>
      <span className="chip">{job.workType}</span>
      {job.salary && <span>💰 {job.salary}</span>}
      {withPosted && <span>Posted {timeAgo(job.postedAt)}</span>}
    </div>
  );
}

/** The round badge with the overall number, or why there is none. */
export function MatchBadge({ score, scoring }: { score?: JobScore; scoring?: boolean }) {
  if (scoring) return <span className="match">Scoring…</span>;
  if (!score) return null;
  if (score.status === 'not_scored') return <span className="match none">Not scored</span>;
  if (score.status === 'no_criteria') return <span className="match none">No criteria</span>;
  if (score.overall === null) return <span className="match none">Nothing to check</span>;
  return (
    <span className={`match${matchClass(score.overall)}`} aria-label={`Match ${outOfTen(score.overall)} out of 10`}>
      {outOfTen(score.overall)}
      <small>/ 10</small>
    </span>
  );
}

export function JobCard({ job, score, scoring }: { job: Job; score?: JobScore; scoring?: boolean }) {
  const note =
    score?.status === 'not_scored'
      ? 'Scoring failed for this job.'
      : score?.status === 'no_criteria'
        ? 'No criteria found in this posting.'
        : score?.status === 'scored' && score.checked < score.criteria.length
          ? `${score.checked} of ${score.criteria.length} criteria could be checked.`
          : null;
  return (
    <Link className={`card job-card${scoring ? ' scoring' : ''}`} to={`/jobs/${job.id}`}>
      <div className="top">
        <div>
          <h3>{job.title}</h3>
          <div className="company">{job.company}</div>
        </div>
        <MatchBadge score={score} scoring={scoring} />
      </div>
      <JobMeta job={job} />
      <p className="small summary">{summarise(job.description)}</p>
      {note && <p className="small muted" style={{ margin: '6px 0 0' }}>{note}</p>}
    </Link>
  );
}

export function NotFoundCard({ title = 'Job not found', children }: { title?: string; children?: ReactNode }) {
  return (
    <div className="card empty">
      <b>{title}</b>
      {children ?? 'This job may have been removed, or the link is wrong.'}
      <br />
      <br />
      <Link className="btn secondary" to="/">
        Search for jobs
      </Link>
    </div>
  );
}

/** Shown wherever a profile or job text is about to go to the AI company (S-01, S-09). */
export const Disclaimer = () => (
  <p className="disclaimer">
    Your profile and the job descriptions are sent to an external AI company (Anthropic) to be scored. This is a prototype with fictional data, so that is fine here, but do not enter real personal details.
  </p>
);
