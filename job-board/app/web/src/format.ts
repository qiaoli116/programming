const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "12 Oct 2026" */
export function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** "today", "2 days ago", "1 week ago", "3 months ago" */
export function timeAgo(iso: string, now = new Date()): string {
  const days = Math.max(0, Math.floor((now.getTime() - new Date(iso).getTime()) / 86_400_000));
  if (days === 0) return 'today';
  if (days < 7) return `${plural(days, 'day')} ago`;
  if (days < 30) return `${plural(Math.floor(days / 7), 'week')} ago`;
  return `${plural(Math.floor(days / 30), 'month')} ago`;
}

/** The first paragraph, cut at a word boundary, for the search result cards. */
export function summarise(text: string, max = 150): string {
  const first = text.split(/\n\s*\n/)[0].trim();
  if (first.length <= max) return first;
  return first.slice(0, max).replace(/\s+\S*$/, '') + '…';
}

export const paragraphs = (text: string) => text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
export const lines = (text: string) => text.split('\n').map((l) => l.trim()).filter(Boolean);
export { plural };
