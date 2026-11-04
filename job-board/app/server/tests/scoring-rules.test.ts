import { describe, expect, it } from 'vitest';
import type { Criterion, MatchLevel } from '@jobboard/shared';
import { checkAnswer, overallScore } from '../src/scoring/rules';

const c = (level: MatchLevel, n = 1): Criterion => ({ criterion: `Criterion ${n}`, level, reason: 'Because.' });

describe('overallScore', () => {
  it('TC-13-1 overall_is_average_of_checked_levels', () => {
    expect(overallScore([c('Meets'), c('Partly'), c('Does not meet')])).toEqual({ overall: 0.5, checked: 3 });
  });
  it('TC-13-1 overall_ignores_unknown', () => {
    expect(overallScore([c('Meets'), c('Unknown'), c('Unknown')])).toEqual({ overall: 1, checked: 1 });
  });
  it('TC-13-2 overall_is_null_when_all_unknown', () => {
    expect(overallScore([c('Unknown'), c('Unknown')])).toEqual({ overall: null, checked: 0 });
  });
  it('TC-13-2 overall_is_null_for_no_criteria', () => {
    expect(overallScore([])).toEqual({ overall: null, checked: 0 });
  });
});

describe('checkAnswer', () => {
  const item = (over: Record<string, unknown> = {}) => ({ criterion: 'Knows React', level: 'Meets', reason: 'Profile lists React.', ...over });

  it('TC-12-3 check_accepts_a_valid_list_of_five', () => {
    const r = checkAnswer([item(), item(), item(), item(), item()]);
    expect(r.ok && r.criteria).toHaveLength(5);
  });
  it('TC-12-2 check_keeps_only_the_first_five_of_six', () => {
    const r = checkAnswer([1, 2, 3, 4, 5, 6].map((n) => item({ criterion: `C${n}` })));
    expect(r.ok && r.criteria.map((x) => x.criterion)).toEqual(['C1', 'C2', 'C3', 'C4', 'C5']);
  });
  it('TC-14-5 check_empty_list_is_ok_and_empty', () => {
    expect(checkAnswer([])).toEqual({ ok: true, criteria: [] });
  });
  it('TC-12-3 check_rejects_unknown_level_name', () => {
    expect(checkAnswer([item({ level: 'Great' })]).ok).toBe(false);
  });
  it('TC-12-3 check_rejects_empty_reason_or_criterion', () => {
    expect(checkAnswer([item({ reason: '  ' })]).ok).toBe(false);
    expect(checkAnswer([item({ criterion: '' })]).ok).toBe(false);
  });
  it('TC-14-2 check_rejects_non_list_input', () => {
    expect(checkAnswer({ criteria: [] }).ok).toBe(false);
    expect(checkAnswer(null).ok).toBe(false);
    expect(checkAnswer([null]).ok).toBe(false);
  });
});
