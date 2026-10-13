/**
 * Fill blank Money Flow thumbs. Japanese catalog rows (M2, E2, CP1, …)
 * often have no pokemontcg.io art; the English print in the paired set does.
 */

import type { MoneyFlowResponse } from '@tcgtracker/shared';
import { getDb } from '../db/database';

export type ImageFillable = {
  cardId: string | null;
  setId?: string | null;
  setName?: string | null;
  cardNumber?: string | null;
  rarity?: string | null;
  productName: string;
  imageSmall: string | null;
  imageLarge?: string | null;
};

export type CounterpartCandidate = {
  matchName: string | null;
  setId: string;
  cardNumber: string | null;
  rarity: string | null;
  imageSmall: string | null;
  imageLarge: string | null;
  dexId?: number | null;
};

const FAMILY_SETS: Record<string, string[]> = {
  m2: ['me2', 'M2', 'm2'],
  m1: ['me1', 'ME1', 'm1', 'M1L', 'M1S', 'M1K', 'm1l', 'm1s', 'm1k'],
  dc1: ['dc1', 'CP1', 'cp1'],
  e1: ['ecard1', 'E1', 'e1'],
  e2: ['ecard2', 'E2', 'e2'],
  e3: ['ecard3', 'E3', 'e3'],
};

export function setFamily(setId?: string | null): string {
  const s = (setId || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!s) return '';
  if (s === 'me2' || s === 'm2') return 'm2';
  if (s === 'me1' || s === 'm1' || s === 'm1l' || s === 'm1s' || s === 'm1k') return 'm1';
  if (s === 'dc1' || s === 'cp1') return 'dc1';
  if (s === 'ecard1' || s === 'e1') return 'e1';
  if (s === 'ecard2' || s === 'e2') return 'e2';
  if (s === 'ecard3' || s === 'e3') return 'e3';
  return s.replace(/^me(?=\d)/, 'm');
}

export function normalizeMatchKey(name?: string | null): string {
  return (name || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

const KEEP_SHORT = new Set(['ex', 'gx', 'v', 'vmax', 'vstar']);

export function matchTokens(name?: string | null): string[] {
  return (name || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t !== 'pokemon' && (t.length >= 4 || KEEP_SHORT.has(t)));
}

export function namesCompatible(jpName: string, enName: string): boolean {
  const jk = normalizeMatchKey(jpName);
  const ek = normalizeMatchKey(enName);
  if (!jk || !ek) return false;
  if (jk === ek) return true;
  if (ek.endsWith(jk) && jk.length >= 6) return true;
  if (jk.endsWith(ek) && ek.length >= 6) return true;
  const jpTokens = matchTokens(jpName);
  const enTokens = new Set(matchTokens(enName));
  if (jpTokens.length === 0) return false;
  return jpTokens.every((t) => enTokens.has(t)) && jpTokens.some((t) => t.length >= 5);
}

function collectorNumber(value?: string | null): string {
  if (!value) return '';
  const beforeSlash = value.split('/')[0].trim();
  if (/^\d+$/.test(beforeSlash)) return String(parseInt(beforeSlash, 10));
  return beforeSlash.toLowerCase().replace(/^0+/, '');
}

function chaseRank(rarity?: string | null): number {
  const s = (rarity || '').toLowerCase();
  if (s.includes('special illustration')) return 4;
  if (s.includes('illustration') || s.includes('secret') || s.includes('hyper')) return 3;
  if (s.includes('ultra')) return 2;
  if (s.includes('holo') || s.includes('double rare')) return 1;
  return 0;
}

export function pickEnglishCounterpart(
  target: {
    matchName?: string | null;
    productName?: string | null;
    setId?: string | null;
    cardNumber?: string | null;
    rarity?: string | null;
    dexId?: number | null;
  },
  candidates: CounterpartCandidate[]
): CounterpartCandidate | null {
  const family = setFamily(target.setId);
  if (!family) return null;
  const name = target.matchName || target.productName || '';
  const wantNum = collectorNumber(target.cardNumber);
  const wantChase = chaseRank(target.rarity);
  const wantDex = target.dexId ?? null;

  let best: CounterpartCandidate | null = null;
  let bestScore = -1;
  for (const c of candidates) {
    if (!c.imageSmall && !c.imageLarge) continue;
    if (setFamily(c.setId) !== family) continue;
    const enName = c.matchName || '';
    const nameOk = namesCompatible(name, enName);
    const dexOk = wantDex != null && c.dexId != null && wantDex === c.dexId;
    if (!nameOk && !dexOk) continue;

    let score = 0;
    if (nameOk) score += 80;
    if (dexOk) score += 70;
    if (wantNum && collectorNumber(c.cardNumber) === wantNum) score += 40;
    score += 10 - Math.min(10, Math.abs(chaseRank(c.rarity) - wantChase));
    if (wantChase >= 2) score += chaseRank(c.rarity);
    if (score > bestScore) {
      best = c;
      bestScore = score;
    }
  }
  return bestScore >= 70 ? best : null;
}

type CatalogMeta = {
  cardId: string;
  matchName: string | null;
  setId: string | null;
  cardNumber: string | null;
  rarity: string | null;
  dexId: number | null;
  language: string | null;
};

const dbAll = <T>(sql: string, params: unknown[] = []): Promise<T[]> =>
  new Promise((resolve, reject) => {
    getDb().all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve((rows || []) as T[]);
    });
  });

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Mutates movers in place: copy English-print art onto Japanese rows with empty thumbs. */
export async function fillMissingMoverImages<T extends ImageFillable>(movers: T[]): Promise<T[]> {
  const missing = movers.filter((m) => !m.imageSmall && !m.imageLarge && m.cardId);
  if (missing.length === 0) return movers;

  const ids = [...new Set(missing.map((m) => m.cardId as string))];
  const meta: CatalogMeta[] = [];
  for (const batch of chunk(ids, 400)) {
    const placeholders = batch.map(() => '?').join(',');
    const part = await dbAll<CatalogMeta>(
      `SELECT cardId, matchName, setId, cardNumber, rarity, dexId, language
       FROM catalog_cards
       WHERE cardId IN (${placeholders})`,
      batch
    );
    meta.push(...part);
  }
  const metaById = new Map(meta.map((r) => [r.cardId, r]));

  const setIds = new Set<string>();
  for (const row of missing) {
    const m = metaById.get(row.cardId as string);
    const family = setFamily(m?.setId || row.setId);
    for (const sid of FAMILY_SETS[family] || [m?.setId || row.setId || '']) {
      if (sid) setIds.add(sid);
    }
  }
  if (setIds.size === 0) return movers;

  const setPlaceholders = [...setIds].map(() => '?').join(',');
  const counterparts = await dbAll<CounterpartCandidate>(
    `SELECT matchName, setId, cardNumber, rarity, imageSmall, imageLarge, dexId
     FROM catalog_cards
     WHERE language = 'en'
       AND setId IN (${setPlaceholders})
       AND (imageSmall IS NOT NULL AND trim(imageSmall) != '')`,
    [...setIds]
  );

  for (const row of missing) {
    const m = metaById.get(row.cardId as string);
    const picked = pickEnglishCounterpart(
      {
        matchName: m?.matchName || row.productName,
        productName: row.productName,
        setId: m?.setId || row.setId,
        cardNumber: m?.cardNumber || row.cardNumber,
        rarity: m?.rarity || row.rarity,
        dexId: m?.dexId ?? null,
      },
      counterparts
    );
    if (!picked) continue;
    row.imageSmall = picked.imageSmall || picked.imageLarge;
    row.imageLarge = picked.imageLarge || picked.imageSmall;
  }

  return movers;
}

/** Only tape + cohort faces — skip the rest of the universe. */
export async function fillMoneyFlowPayloadImages(payload: MoneyFlowResponse): Promise<void> {
  const thumbs: ImageFillable[] = [];
  const cohorts = [
    ...payload.eras,
    ...payload.finishes,
    ...payload.eraFinishes,
    ...payload.specials,
    ...payload.rotationInto,
    ...payload.rotationOut,
    ...payload.mostActive,
  ];
  for (const c of cohorts) thumbs.push(...c.exemplars);
  thumbs.push(...payload.topGainers, ...payload.topLosers);
  await fillMissingMoverImages(thumbs);
}
