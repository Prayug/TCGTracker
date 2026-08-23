import type { GameType } from '../../contexts/GameContext';
import type { TradeDraft } from './types';

const keyFor = (game: GameType) => `tcg_trade_draft_${game}`;

export function emptyDraft(game: GameType): TradeDraft {
  return {
    id: crypto.randomUUID(),
    title: '',
    game,
    give: [],
    get: [],
    cashGive: 0,
    cashGet: 0,
    updatedAt: new Date().toISOString(),
  };
}

export function loadDraft(game: GameType): TradeDraft {
  try {
    const raw = localStorage.getItem(keyFor(game));
    if (!raw) return emptyDraft(game);
    const parsed = JSON.parse(raw) as TradeDraft;
    if (
      !parsed ||
      parsed.game !== game ||
      !Array.isArray(parsed.give) ||
      !Array.isArray(parsed.get)
    ) {
      return emptyDraft(game);
    }
    return {
      ...parsed,
      cashGive: parsed.cashGive || 0,
      cashGet: parsed.cashGet || 0,
    };
  } catch {
    return emptyDraft(game);
  }
}

export function saveDraft(draft: TradeDraft): void {
  try {
    localStorage.setItem(
      keyFor(draft.game),
      JSON.stringify({ ...draft, updatedAt: new Date().toISOString() })
    );
  } catch {
    /* quota / private mode */
  }
}

export function clearDraft(game: GameType): TradeDraft {
  const next = emptyDraft(game);
  saveDraft(next);
  return next;
}
