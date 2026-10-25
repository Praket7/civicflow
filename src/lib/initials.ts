/**
 * Initials for avatars and workspace badges.
 *
 * Two words give the first and last initial ("FeedMore WNY" → "FW"); one word
 * gives its first two letters ("CivicFlow" → "CI"). Every surface uses this so
 * the same organization never shows two different badges.
 */
export function initialsOf(name: string): string {
  const words = name.split(/\s+/).filter(Boolean);
  if (words.length === 0) return "CF";
  const letters =
    words.length > 1 ? `${words[0][0]}${words[words.length - 1][0]}` : words[0].slice(0, 2);
  return letters.toUpperCase();
}
