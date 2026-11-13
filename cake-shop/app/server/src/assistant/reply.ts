// The price guardrail: prices come only from the Pricing function, never from the AI's text.

// An amount of money: $45, 45 dollars, AUD 45, "45 bucks".
const MONEY = /[$€£]\s?\d|\b\d[\d,.]*\s?(dollars?|bucks|usd|aud|cad|eur|gbp)\b|\b(usd|aud|cad)\s?\d/i;

/** Removes every sentence that mentions an amount of money. Prices come only from the Pricing function. */
export function stripPrices(text: string): { text: string; removed: string[] } {
  const removed: string[] = [];
  const parts = text.split(/(?<=[.!?])\s+|\n+/);
  const kept = parts.filter((p) => {
    if (MONEY.test(p)) {
      removed.push(p.trim());
      return false;
    }
    return true;
  });
  return { text: kept.join(' ').trim(), removed };
}
