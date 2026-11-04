// The match-scoring agent: a fixed workflow. Our code decides every step; the AI only answers.
// Per job (one parallel lane each): build prompt -> ask the AI -> check the answer -> compute the overall score.
import type { Job, JobScore } from '@jobboard/shared';
import { buildPrompt } from './prompt';
import type { ScoringProvider } from './provider';
import { checkAnswer, overallScore } from './rules';

export interface AgentOptions {
  timeoutMs?: number;
}

const notScored = (jobId: number): JobScore => ({ jobId, status: 'not_scored', criteria: [], overall: null, checked: 0 });

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout;
  const limit = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('The AI took too long.')), ms);
  });
  return Promise.race([promise, limit]).finally(() => clearTimeout(timer));
}

async function scoreOne(job: Job, profile: string, provider: ScoringProvider, timeoutMs: number): Promise<JobScore> {
  try {
    const raw = await withTimeout(provider.scoreJob(buildPrompt(job, profile)), timeoutMs);
    const checked = checkAnswer(raw);
    if (!checked.ok) return notScored(job.id);
    if (checked.criteria.length === 0) return { jobId: job.id, status: 'no_criteria', criteria: [], overall: null, checked: 0 };
    return { jobId: job.id, status: 'scored', criteria: checked.criteria, ...overallScore(checked.criteria) };
  } catch {
    return notScored(job.id); // one job failing never fails the others
  }
}

/** Fork one lane per job, run them in parallel, join, and return the results in the order given. */
export function scoreJobs(jobs: Job[], profile: string, provider: ScoringProvider, options: AgentOptions = {}): Promise<JobScore[]> {
  const timeoutMs = options.timeoutMs ?? 30_000;
  return Promise.all(jobs.map((job) => scoreOne(job, profile, provider, timeoutMs)));
}
