/** Recognition confidence in words, with the number for reference. */
export function confidenceLabel(value: number): { text: string; tone: 'good' | 'check' | 'weak' } {
  const pct = Math.round(value * 100);
  if (pct >= 80) return { text: `Confident match · ${pct}%`, tone: 'good' };
  if (pct >= 50)
    return { text: `Possible match · ${pct}%. Check the set and number.`, tone: 'check' };
  return { text: `Weak match · ${pct}%. This may be a different card.`, tone: 'weak' };
}
