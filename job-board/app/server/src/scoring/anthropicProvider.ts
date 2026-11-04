// The real AI: Claude Haiku 5.5 through the official SDK, called from the server only (the key never reaches the browser).
import Anthropic from '@anthropic-ai/sdk';
import { MATCH_LEVELS } from '@jobboard/shared';
import type { ScoringProvider } from './provider';

export const MODEL = 'claude-haiku-5-5';

// The reply must match this shape, so the model always returns a list of criteria we can check.
const CRITERIA_SCHEMA = {
  type: 'object',
  properties: {
    criteria: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          criterion: { type: 'string' },
          level: { type: 'string', enum: [...MATCH_LEVELS] },
          reason: { type: 'string' },
        },
        required: ['criterion', 'level', 'reason'],
        additionalProperties: false,
      },
    },
  },
  required: ['criteria'],
  additionalProperties: false,
} as const;

export class AnthropicProvider implements ScoringProvider {
  private client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async scoreJob(prompt: string): Promise<unknown> {
    const response = await this.client.messages.create({
      model: MODEL,
      max_tokens: 4000,
      messages: [{ role: 'user', content: prompt }],
      output_config: { format: { type: 'json_schema', schema: CRITERIA_SCHEMA } },
    });
    // Anything but a normal end (refusal, cut off) means the text may be unusable: fail this job.
    if (response.stop_reason !== 'end_turn') throw new Error(`The AI stopped early (${response.stop_reason}).`);
    const text = response.content.find((block) => block.type === 'text');
    if (!text || text.type !== 'text') throw new Error('The AI returned no text.');
    return (JSON.parse(text.text) as { criteria?: unknown }).criteria;
  }
}
