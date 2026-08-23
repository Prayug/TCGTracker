const NON_ENGLISH_LISTING_RE =
  /[\u3040-\u30ff\u3400-\u9fff\uff66-\uff9d\uac00-\ud7af]|【|\djp\b|\b(japanese|japan|jap|jpn|jp|asian\s*english|ae\s*(ver|version|print)|ワンピース)\b/i;

/** Drop JP / Asian English listings the feed already stamped as English. */
export function listingTitleLooksNonEnglish(title: string | null | undefined): boolean {
  return Boolean(title && NON_ENGLISH_LISTING_RE.test(title));
}
