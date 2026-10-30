// Small building blocks that use the CSS classes from the Stage 2 mockups.
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { Job } from '@jobboard/shared';
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

export function JobCard({ job }: { job: Job }) {
  return (
    <Link className="card job-card" to={`/jobs/${job.id}`}>
      <h3>{job.title}</h3>
      <div className="company">{job.company}</div>
      <JobMeta job={job} />
      <p className="small summary">{summarise(job.description)}</p>
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
