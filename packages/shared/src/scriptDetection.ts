/** Hiragana, katakana, CJK ideographs, and half-width kana. */
const CJK_RE = /[\u3040-\u30ff\u3400-\u9fff\uff66-\uff9d]/;
const HANGUL_RE = /[\uac00-\ud7af]/;

/** True when the query contains Japanese/CJK script (Pokemon TCG API cannot search these). */
export const queryContainsCjk = (query: string | null | undefined): boolean =>
  typeof query === 'string' && CJK_RE.test(query);

export const queryContainsNonEnglishScript = (query: string | null | undefined): boolean =>
  typeof query === 'string' && (CJK_RE.test(query) || HANGUL_RE.test(query));
