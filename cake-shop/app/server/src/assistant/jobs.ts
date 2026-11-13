// The job board (devlog 06 §3): tasks the host gives the designer, stored on the order.
import type { Job, Order } from '@cakeshop/shared';
import type { Clock } from '../orders/applyChange';

/** An open job older than this is treated as failed (the server restarted mid-job, or the job hung). */
export const JOB_STALE_MS = 2 * 60 * 1000;

const OPEN: Job['status'][] = ['queued', 'working', 'reporting'];

export function isOpen(job: Job, clock: Clock): boolean {
  return OPEN.includes(job.status) && clock().getTime() - Date.parse(job.createdAt) < JOB_STALE_MS;
}

/** The job with its stale state resolved: an open job past the limit shows as failed. */
export function shownJob(job: Job, clock: Clock): Job {
  if (!OPEN.includes(job.status) || isOpen(job, clock)) return job;
  return { ...job, status: 'failed', progress: [...job.progress, 'stopped: took too long'] };
}

export const openJobs = (order: Order, clock: Clock) => (order.jobs ?? []).filter((j) => isOpen(j, clock));

/** The board in words, for the host's prompt. Only the last few jobs. */
export function boardText(order: Order, clock: Clock): string {
  const jobs = (order.jobs ?? []).slice(-4).map((j) => shownJob(j, clock));
  if (!jobs.length) return 'No jobs yet.';
  return jobs
    .map((j) => {
      const lines = [`Job ${j.id} (${j.status}): ${j.task}`];
      if (j.progress.length) lines.push(`  progress: ${j.progress.slice(-4).join('; ')}`);
      if (j.report) lines.push(`  report: ${j.report.summary}${j.report.questions.length ? ` Questions: ${j.report.questions.join(' ')}` : ''}`);
      return lines.join('\n');
    })
    .join('\n');
}
