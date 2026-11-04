// The seam between our code and the AI. Real use plugs in AnthropicProvider; every automated test uses FakeProvider.

export interface ScoringProvider {
  /** Returns the model's raw criteria list for one posting. Throws on any failure (refusal, error, timeout). */
  scoreJob(prompt: string): Promise<unknown>;
}

export interface FakeProviderOptions {
  /** Wait this long before answering, to test parallel running. */
  delayMs?: number;
}

/**
 * Deterministic, offline stand-in for the AI.
 * - Criteria are the first five non-empty lines of the posting's requirements, as written.
 * - A criterion is Meets if the profile contains the line's first word of 4+ letters (case-insensitive), else Unknown.
 * - Title tags: [FAIL] throws, [NONE] returns no criteria, [BAD] returns an invalid level, [HANG] never answers,
 *   [SLOW] answers after 1.5 s (lets browser tests see the progress state).
 */
export class FakeProvider implements ScoringProvider {
  calls = 0;
  constructor(private options: FakeProviderOptions = {}) {}

  async scoreJob(prompt: string): Promise<unknown> {
    this.calls++;
    if (this.options.delayMs) await new Promise((r) => setTimeout(r, this.options.delayMs));
    const title = /^Title: (.*)$/m.exec(prompt)?.[1] ?? '';
    if (title.includes('[SLOW]')) await new Promise((r) => setTimeout(r, 1500));
    if (title.includes('[HANG]')) return new Promise(() => {});
    if (title.includes('[FAIL]')) throw new Error('Fake provider failure');
    if (title.includes('[NONE]')) return [];

    const requirements = /^Requirements:\n([\s\S]*?)\n=== PROFILE ===/m.exec(prompt)?.[1] ?? '';
    const profile = (prompt.split('=== PROFILE ===\n')[1] ?? '').toLowerCase();
    const lines = requirements.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 5);
    return lines.map((line) => {
      if (title.includes('[BAD]')) return { criterion: line, level: 'Excellent', reason: 'Invalid level on purpose.' };
      const word = /[A-Za-z]{4,}/.exec(line)?.[0].toLowerCase();
      return word && profile.includes(word)
        ? { criterion: line, level: 'Meets', reason: `Profile mentions "${word}".` }
        : { criterion: line, level: 'Unknown', reason: 'Profile is silent.' };
    });
  }
}
