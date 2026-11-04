// Scores live only in the browser (spec §1): they vanish on reload, and the server stores nothing.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { MAX_JOBS_PER_SCORING, type Job, type JobScore } from '@jobboard/shared';
import { api, ApiRequestError } from './api';
import { useAuth } from './auth';

interface ScoresState {
  scores: Record<number, JobScore>;
  scoring: boolean;
  /** Set when scoring could not run: 'empty' = profile blank, 'unavailable' = AI down or all jobs failed. */
  problem: null | 'empty' | 'unavailable';
  sortByMatch: boolean;
  setSortByMatch: (on: boolean) => void;
  scoreJobs: (jobs: Job[]) => Promise<void>;
  clearProblem: () => void;
}

const ScoresContext = createContext<ScoresState | null>(null);

export function ScoresProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [scores, setScores] = useState<Record<number, JobScore>>({});
  const [scoring, setScoring] = useState(false);
  const [problem, setProblem] = useState<ScoresState['problem']>(null);
  const [sortByMatch, setSortByMatch] = useState(false);

  // A different person (or nobody) must never see the previous person's scores.
  useEffect(() => {
    setScores({});
    setProblem(null);
    setSortByMatch(false);
  }, [user?.id]);

  const scoreJobs = useCallback(async (jobs: Job[]) => {
    setScoring(true);
    setProblem(null);
    try {
      const results = await api.score(jobs.slice(0, MAX_JOBS_PER_SCORING).map((j) => j.id));
      if (results.length > 0 && results.every((r) => r.status === 'not_scored')) {
        setProblem('unavailable');
        return;
      }
      setScores((old) => ({ ...old, ...Object.fromEntries(results.map((r) => [r.jobId, r])) }));
    } catch (err) {
      setProblem(err instanceof ApiRequestError && err.code === 'PROFILE_EMPTY' ? 'empty' : 'unavailable');
    } finally {
      setScoring(false);
    }
  }, []);

  const clearProblem = useCallback(() => setProblem(null), []);
  const value = useMemo(
    () => ({ scores, scoring, problem, sortByMatch, setSortByMatch, scoreJobs, clearProblem }),
    [scores, scoring, problem, sortByMatch, scoreJobs, clearProblem],
  );
  return <ScoresContext.Provider value={value}>{children}</ScoresContext.Provider>;
}

export function useScores(): ScoresState {
  const ctx = useContext(ScoresContext);
  if (!ctx) throw new Error('useScores must be used inside <ScoresProvider>');
  return ctx;
}

/** Highest overall first; jobs without a number keep their place after the scored ones. Stable. */
export function sortJobs(jobs: Job[], scores: Record<number, JobScore>): Job[] {
  const value = (j: Job) => scores[j.id]?.overall ?? null;
  return jobs
    .map((job, index) => ({ job, index }))
    .sort((a, b) => {
      const x = value(a.job);
      const y = value(b.job);
      if (x === null && y === null) return a.index - b.index;
      if (x === null) return 1;
      if (y === null) return -1;
      return y - x || a.index - b.index;
    })
    .map((e) => e.job);
}

/** 0.85 -> "8.5", 0.6 -> "6" */
export const outOfTen = (overall: number) => String(Math.round(overall * 100) / 10);
export const matchClass = (overall: number) => (overall >= 0.7 ? '' : overall >= 0.4 ? ' mid' : ' low');
