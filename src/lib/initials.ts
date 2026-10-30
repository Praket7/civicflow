/**
 * Two words give first and last initial; one word gives its first two letters.
 * Every surface uses this so a badge never differs by screen.
 */
export function initialsOf(name: string): string {
  const words = name.split(/\s+/).filter(Boolean);
  if (words.length === 0) return "CF";
  const letters =
    words.length > 1 ? `${words[0][0]}${words[words.length - 1][0]}` : words[0].slice(0, 2);
  return letters.toUpperCase();
}
