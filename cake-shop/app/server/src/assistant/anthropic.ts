// The real provider: the plain Anthropic SDK with an API key, the same approach as job-board.
import Anthropic from '@anthropic-ai/sdk';
import type { AssistantProvider } from './provider';
import type { ProviderInput } from './prompt';
import { REPLY_SCHEMA } from './reply';

export const MODEL = 'claude-sonnet-5-5';

export class AnthropicProvider implements AssistantProvider {
  readonly name = 'anthropic';
  private client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async turn(input: ProviderInput): Promise<unknown> {
    const res = await this.client.messages.create({
      model: MODEL,
      max_tokens: 4096,
      system: input.system,
      messages: input.messages,
      output_config: { format: { type: 'json_schema', schema: REPLY_SCHEMA as unknown as Record<string, unknown> } },
    });
    if (res.stop_reason !== 'end_turn') throw new Error(`The AI stopped early (${res.stop_reason}).`);
    const block = res.content.find((b) => b.type === 'text');
    if (!block || block.type !== 'text') throw new Error('The AI sent no text.');
    return JSON.parse(block.text);
  }
}
