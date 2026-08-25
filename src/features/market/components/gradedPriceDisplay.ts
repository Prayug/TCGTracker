import { GradedPriceEntry } from '../../../services/gradedPricesApi';

export const HEADLINE_GRADES = [
  { grader: 'psa', grade: '10', label: 'PSA 10' },
  { grader: 'cgc', grade: '10', label: 'CGC 10' },
  { grader: 'bgs', grade: '10', label: 'BGS 10' },
] as const;

/** Headline slab quote is always PriceCharting sold-guide — never a listed blend. */
export function headlineGradedPrice(entry: GradedPriceEntry | null | undefined): number | null {
  if (!entry) return null;
  const sold = entry.price;
  if (sold == null || sold <= 0) return null;
  return sold;
}
