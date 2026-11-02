import { useEffect, useMemo, useRef, useState } from 'react';
import type { PokemonCard } from '../../types/pokemon';
import type { OnePieceCard } from '../../types/onepiece';
import { pokemonApi } from '../../services/pokemonApi';
import { onePieceApi } from '../../services/onepieceApi';
import { PriceHistoryApi } from '../../services/priceHistoryApi';
import { fetchCardPopulation, type PopulationLookupResponse } from '../../services/populationApi';
import {
  fetchAllGradedPriceHistory,
  fetchGradedPrices,
  fetchGradedSpreads,
  type AllGradedPriceHistoryResult,
  type GradedPriceEntry,
  type GradedPriceResult,
  type GradedSpreadSummary,
} from '../../services/gradedPricesApi';
import { fetchBuyThesis } from '../../services/buyThesisApi';
import type { BuyThesisAnalysis } from '../buy-thesis/types';

export type AnyCard = PokemonCard | OnePieceCard;

export function isOnePieceCardLike(card: AnyCard | null | undefined, id?: string): boolean {
  if (card && ('cardColor' in card || 'cardCost' in card || 'attribute' in card)) return true;
  if (card && ('tcgplayer' in card || 'types' in card || 'hp' in card)) return false;
  // One Piece ids look like OP01-001, ST10-005, EB01-012, P-001.
  return Boolean(id && /^(OP|ST|EB|PRB|P)\d*-\d+/i.test(id));
}

export interface FinishOption {
  key: string;
  label: string;
  market: number | null;
  low: number | null;
  mid: number | null;
  high: number | null;
}

export function finishLabel(key: string): string {
  return key
    .replace(/([a-z])([A-Z0-9])/g, '$1 $2')
    .replace(/^1st/, '1st')
    .replace(/^./, (c) => c.toUpperCase());
}

/** Finishes TCGplayer actually quotes for this card, with their listing fields. */
export function finishOptions(card: AnyCard | null, isOP: boolean): FinishOption[] {
  if (!card || isOP)
    return [{ key: 'normal', label: 'Normal', market: null, low: null, mid: null, high: null }];
  const pokemon = card as PokemonCard;
  const prices = pokemon.tcgplayer?.prices ?? {};
  const keys = new Set(Object.keys(prices));
  if (pokemon.preferredVariant) keys.add(pokemon.preferredVariant);
  if (keys.size === 0) keys.add('normal');
  return [...keys].map((key) => {
    const p =
      (prices as Record<string, { market?: number; low?: number; mid?: number; high?: number }>)[
        key
      ] ?? {};
    const n = (v?: number) => (v != null && v > 0 ? v : null);
    return {
      key,
      label: finishLabel(key),
      market: n(p.market),
      low: n(p.low),
      mid: n(p.mid),
      high: n(p.high),
    };
  });
}

function defaultFinish(card: PokemonCard, options: FinishOption[]): string {
  const pref = card.preferredVariant;
  const match = pref ? options.find((o) => o.key.toLowerCase() === pref.toLowerCase()) : undefined;
  if (match) return match.key;
  // Most expensive quoted finish is usually the "named" one (holo over reverse).
  return [...options].sort((a, b) => (b.market ?? 0) - (a.market ?? 0))[0]?.key ?? 'normal';
}

const GRADER_ORDER = ['psa', 'cgc', 'bgs', 'sgc', 'tag', 'ace'];
const GRADE_ORDER = [
  '10 black',
  '10 pristine',
  '10',
  '9.5',
  '9',
  '8.5',
  '8',
  '7',
  '6',
  '5',
  '4',
  '3',
  '2',
  '1',
];

export function sortGraded(a: GradedPriceEntry, b: GradedPriceEntry): number {
  const ga = GRADER_ORDER.indexOf(a.grader);
  const gb = GRADER_ORDER.indexOf(b.grader);
  if (ga !== gb) return (ga === -1 ? 99 : ga) - (gb === -1 ? 99 : gb);
  const oa = GRADE_ORDER.indexOf(a.grade.toLowerCase());
  const ob = GRADE_ORDER.indexOf(b.grade.toLowerCase());
  return (oa === -1 ? 99 : oa) - (ob === -1 ? 99 : ob);
}

export function graderLabel(grader: string): string {
  const map: Record<string, string> = {
    psa: 'PSA',
    cgc: 'CGC',
    bgs: 'BGS',
    sgc: 'SGC',
    tag: 'TAG',
    ace: 'ACE',
    beckett: 'BGS',
  };
  return map[grader] ?? grader.toUpperCase();
}

export function gradeLabel(entry: { grader: string; grade: string }): string {
  const g = entry.grade
    .split(/\s+/)
    .map((p) => (/^\d/.test(p) ? p : p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()))
    .join(' ');
  return `${graderLabel(entry.grader)} ${g}`;
}

interface ResearchState {
  card: AnyCard | null;
  cardLoading: boolean;
  cardMissing: boolean;
  history: Array<{ date: string; price: number }>;
  historyLoading: boolean;
  graded: GradedPriceResult | null;
  spreads: GradedSpreadSummary | null;
  gradedLoading: boolean;
  gradedHistory: AllGradedPriceHistoryResult | null;
  population: PopulationLookupResponse | null;
  populationLoading: boolean;
  thesis: BuyThesisAnalysis | null;
  thesisLoading: boolean;
  thesisError: string | null;
}

/**
 * Loads everything the research page shows for one card + finish.
 * Each source is independent: one failing never blanks the others, and
 * nothing is synthesised when a source is empty.
 */
export function useCardResearch(id: string, stub: AnyCard | undefined) {
  const isOP = isOnePieceCardLike(stub, id);
  const [state, setState] = useState<ResearchState>(() => ({
    card: stub && stub.id === id ? stub : null,
    cardLoading: true,
    cardMissing: false,
    history: [],
    historyLoading: true,
    graded: null,
    spreads: null,
    gradedLoading: true,
    gradedHistory: null,
    population: null,
    populationLoading: true,
    thesis: null,
    thesisLoading: !isOP,
    thesisError: null,
  }));
  const patch = (p: Partial<ResearchState>) => setState((s) => ({ ...s, ...p }));

  // Card identity (enrich the stub)
  useEffect(() => {
    let cancelled = false;
    setState((s) => ({
      ...s,
      card: stub && stub.id === id ? stub : s.card?.id === id ? s.card : null,
      cardLoading: true,
      cardMissing: false,
    }));
    const load = isOP ? onePieceApi.getCardById(id) : pokemonApi.getCardById(id);
    load
      .then((fetched) => {
        if (cancelled) return;
        if (fetched) patch({ card: fetched as AnyCard, cardLoading: false });
        else setState((s) => ({ ...s, cardLoading: false, cardMissing: !s.card }));
      })
      .catch(() => {
        if (!cancelled) setState((s) => ({ ...s, cardLoading: false, cardMissing: !s.card }));
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- stub only seeds the first paint
  }, [id, isOP]);

  const finishes = useMemo(() => finishOptions(state.card, isOP), [state.card, isOP]);
  const [finish, setFinish] = useState<string>('');
  const finishKnown = finishes.some((f) => f.key === finish);
  const activeFinish = finishKnown
    ? finish
    : state.card && !isOP
      ? defaultFinish(state.card as PokemonCard, finishes)
      : 'normal';

  // Price history for the selected finish
  const historyReq = useRef(0);
  useEffect(() => {
    const card = state.card;
    if (!card) return;
    const req = ++historyReq.current;
    patch({ historyLoading: true });
    const load = isOP
      ? onePieceApi.getPriceHistory(card.id, card.marketPrice)
      : PriceHistoryApi.getPokemonCardPriceHistory({
          id: card.id,
          name: card.name,
          set: card.set as PokemonCard['set'],
          number: card.number,
          rarity: card.rarity,
          productId: (card as PokemonCard).tcgplayer?.productId,
          variant: activeFinish,
        });
    load
      .then((h) => {
        if (req === historyReq.current)
          patch({ history: Array.isArray(h) ? h : [], historyLoading: false });
      })
      .catch(() => {
        if (req === historyReq.current) patch({ history: [], historyLoading: false });
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.card?.id, activeFinish, isOP]);

  // Graded prices, spreads, graded history, population
  useEffect(() => {
    const card = state.card;
    if (!card) return;
    let cancelled = false;
    const pokemon = card as PokemonCard;
    const op = card as OnePieceCard;
    const common = {
      cardId: card.id,
      cardName: card.name,
      setId: card.set?.id,
      setName: card.set?.name,
      cardNumber: card.number,
      language: isOP ? undefined : pokemon.language,
      matchName: isOP ? undefined : pokemon.matchName,
      variant: isOP ? 'normal' : activeFinish,
      game: (isOP ? 'onepiece' : 'pokemon') as 'onepiece' | 'pokemon',
      cardImageId: isOP ? op.cardImageId : undefined,
    };
    patch({ gradedLoading: true, populationLoading: true });
    Promise.all([fetchGradedPrices(common), fetchGradedSpreads(card.id, common.variant)])
      .then(([graded, spreads]) => {
        if (!cancelled) patch({ graded, spreads, gradedLoading: false });
      })
      .catch(() => !cancelled && patch({ gradedLoading: false }));
    fetchAllGradedPriceHistory({ cardId: card.id, days: 365, variant: common.variant })
      .then((gradedHistory) => !cancelled && patch({ gradedHistory }))
      .catch(() => undefined);
    fetchCardPopulation(common)
      .then((population) => !cancelled && patch({ population, populationLoading: false }))
      .catch(() => !cancelled && patch({ populationLoading: false }));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.card?.id, activeFinish, isOP]);

  // Buy thesis (Pokémon only; backend analyses the card's default series)
  useEffect(() => {
    if (isOP) return;
    const ac = new AbortController();
    patch({ thesisLoading: true, thesisError: null });
    fetchBuyThesis(id)
      .then((thesis) => !ac.signal.aborted && patch({ thesis, thesisLoading: false }))
      .catch((err: unknown) => {
        if (ac.signal.aborted) return;
        const status = (err as { response?: { status?: number } })?.response?.status;
        patch({
          thesis: null,
          thesisLoading: false,
          thesisError:
            status === 404
              ? 'Not enough market history for an analysis yet.'
              : 'The analysis service did not respond.',
        });
      });
    return () => ac.abort();
  }, [id, isOP]);

  const gradedRows = useMemo(
    () =>
      (state.graded?.prices ?? [])
        .filter((p) => p.grader !== 'ungraded' && p.grader !== 'generic')
        .sort(sortGraded),
    [state.graded]
  );
  const ungradedGuide = useMemo(
    () =>
      (state.graded?.prices ?? []).find((p) => p.grader === 'ungraded' && (p.price ?? 0) > 0) ??
      null,
    [state.graded]
  );

  return {
    ...state,
    isOP,
    finishes,
    finish: activeFinish,
    setFinish,
    gradedRows,
    ungradedGuide,
  };
}
