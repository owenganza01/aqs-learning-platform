/** "1 lesson", "3 lessons". English plural with a trailing "s"; pass `plural` for irregular words. */
export function countOf(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`
}
