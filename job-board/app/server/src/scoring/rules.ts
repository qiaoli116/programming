// The pure rules of match scoring: how an AI answer is checked and how the overall score is built.
import { MATCH_LEVELS, MAX_CRITERIA, type Criterion, type MatchLevel } from '@jobboard/shared';

const POINTS: Record<MatchLevel, number | null> = {
  Meets: 1,
  Partly: 0.5,
  'Does not meet': 0,
  Unknown: null, // left out of the average
};

/** Average of the checked criteria (Unknown left out). overall is null when none could be checked. */
export function overallScore(criteria: Criterion[]): { overall: number | null; checked: number } {
  const points = criteria.map((c) => POINTS[c.level]).filter((p): p is number => p !== null);
  if (points.length === 0) return { overall: null, checked: 0 };
  return { overall: points.reduce((a, b) => a + b, 0) / points.length, checked: points.length };
}

export type CheckResult = { ok: true; criteria: Criterion[] } | { ok: false; reason: string };

const isText = (v: unknown): v is string => typeof v === 'string' && v.trim() !== '';

/**
 * Accepts the provider's raw answer only if every item has a criterion, a valid level and a reason.
 * More than five items are cut to the first five. Anything invalid rejects the whole answer: no repair.
 */
export function checkAnswer(raw: unknown): CheckResult {
  if (!Array.isArray(raw)) return { ok: false, reason: 'The answer is not a list.' };
  const criteria: Criterion[] = [];
  for (const [i, item] of raw.slice(0, MAX_CRITERIA).entries()) {
    const it = item as Partial<Criterion> | null;
    if (!it || typeof it !== 'object') return { ok: false, reason: `Item ${i + 1} is not an object.` };
    if (!isText(it.criterion)) return { ok: false, reason: `Item ${i + 1} has no criterion.` };
    if (!MATCH_LEVELS.includes(it.level as MatchLevel)) return { ok: false, reason: `Item ${i + 1} has an invalid level.` };
    if (!isText(it.reason)) return { ok: false, reason: `Item ${i + 1} has no reason.` };
    criteria.push({ criterion: it.criterion.trim(), level: it.level as MatchLevel, reason: it.reason.trim() });
  }
  return { ok: true, criteria };
}
