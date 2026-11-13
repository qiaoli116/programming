// Chooses the assistant from the config: fake (offline), Anthropic (API key), or plain (nothing configured).
import type { OrderStore } from '../store';
import type { Clock } from '../orders/applyChange';
import type { Trace } from '../trace';
import { AnthropicProvider } from './anthropic';
import { FakeProvider, type AssistantProvider } from './provider';
import { PlainAssistant, type Assistant } from './service';
import { TeamAssistant } from './team';

export function chooseProvider(cfg: { assistantProvider?: string; anthropicApiKey?: string }): AssistantProvider | null {
  if (cfg.assistantProvider === 'fake') return new FakeProvider();
  if (cfg.anthropicApiKey) return new AnthropicProvider(cfg.anthropicApiKey);
  return null;
}

export function createAssistant(store: OrderStore, clock: Clock, cfg: { assistantProvider?: string; anthropicApiKey?: string }, trace?: Trace): Assistant {
  const provider = chooseProvider(cfg);
  return provider ? new TeamAssistant(store, clock, provider, trace) : new PlainAssistant(store, clock);
}
