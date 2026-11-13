// The real provider: the plain Anthropic SDK with an API key, the same approach as job-board. One call is one step of
// an agent loop in team.ts: the model sees the order, the chat and the tools, and answers with text and tool calls.
// Each agent has its own model: the host must answer fast; the designer must get the rules right.
import Anthropic from '@anthropic-ai/sdk';
import type { Agent } from '@cakeshop/shared';
import type { ProviderInput } from './prompt';
import type { AssistantProvider, Step } from './provider';

export const MODELS: Record<Agent, string> = { host: 'claude-haiku-5-5', designer: 'claude-sonnet-5-5' };

export class AnthropicProvider implements AssistantProvider {
  readonly name = 'anthropic';
  private client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  model(agent: Agent): string {
    return MODELS[agent];
  }

  async step(input: ProviderInput): Promise<Step> {
    const res = await this.client.messages.create({
      model: MODELS[input.agent],
      max_tokens: 4096,
      system: input.system,
      messages: input.messages as Anthropic.MessageParam[],
      ...(input.tools.length
        ? {
            tools: input.tools as Anthropic.Tool[],
            tool_choice: input.force ? { type: 'tool' as const, name: input.force } : { type: 'auto' as const },
          }
        : {}),
    });
    if (res.stop_reason !== 'end_turn' && res.stop_reason !== 'tool_use') throw new Error(`The AI stopped early (${res.stop_reason}).`);
    const text = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim();
    const calls = res.content
      .filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')
      .map((b) => ({ id: b.id, name: b.name, input: (b.input ?? {}) as Record<string, unknown> }));
    return { text, calls, usage: { in: res.usage.input_tokens, out: res.usage.output_tokens } };
  }
}
