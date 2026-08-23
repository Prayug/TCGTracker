import type { GameType } from '../../contexts/GameContext';
import type { TradeCardLine, TradeDraft } from './types';

export interface ShareLineV1 {
  i: string;
  u?: string;
  n: string;
  s: string;
  si?: string;
  no?: string;
  img?: string;
  r?: string;
  q: number;
  p: number | null;
  o?: number | null;
}

export interface SharePayloadV1 {
  v: 1;
  g: GameType;
  t?: string;
  a: ShareLineV1[];
  b: ShareLineV1[];
  ca: number;
  cb: number;
}

function toShareLine(line: TradeCardLine): ShareLineV1 {
  return {
    i: line.cardId,
    u: line.uniqueIdentifier,
    n: line.name,
    s: line.setName,
    si: line.setId,
    no: line.number,
    img: line.imageSmall,
    r: line.rarity,
    q: line.quantity,
    p: line.unitPrice,
    o: line.priceOverride ?? null,
  };
}

function fromShareLine(line: ShareLineV1, game: GameType): TradeCardLine {
  return {
    id: crypto.randomUUID(),
    cardId: line.i,
    uniqueIdentifier: line.u,
    name: line.n,
    setId: line.si || '',
    setName: line.s,
    number: line.no,
    imageSmall: line.img,
    rarity: line.r,
    quantity: line.q,
    unitPrice: line.p,
    priceOverride: line.o ?? null,
    game,
  };
}

export function draftToSharePayload(draft: TradeDraft): SharePayloadV1 {
  return {
    v: 1,
    g: draft.game,
    t: draft.title || undefined,
    a: draft.give.map(toShareLine),
    b: draft.get.map(toShareLine),
    ca: draft.cashGive || 0,
    cb: draft.cashGet || 0,
  };
}

export function sharePayloadToDraft(payload: SharePayloadV1): TradeDraft {
  return {
    id: crypto.randomUUID(),
    title: payload.t || '',
    game: payload.g,
    give: payload.a.map((line) => fromShareLine(line, payload.g)),
    get: payload.b.map((line) => fromShareLine(line, payload.g)),
    cashGive: payload.ca || 0,
    cashGet: payload.cb || 0,
    updatedAt: new Date().toISOString(),
  };
}

export function encodeSharePayload(payload: SharePayloadV1): string {
  const json = JSON.stringify(payload);
  const bytes = new TextEncoder().encode(json);
  let binary = '';
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeSharePayload(raw: string): SharePayloadV1 | null {
  try {
    const padded = raw.replace(/-/g, '+').replace(/_/g, '/');
    const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4));
    const binary = atob(padded + pad);
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    const json = new TextDecoder().decode(bytes);
    const parsed = JSON.parse(json) as SharePayloadV1;
    if (parsed?.v !== 1) return null;
    if (parsed.g !== 'pokemon' && parsed.g !== 'onepiece') return null;
    if (!Array.isArray(parsed.a) || !Array.isArray(parsed.b)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export const SHARE_HASH_PREFIX = 't=';
