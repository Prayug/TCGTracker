import { ExternalSignal } from '../types';

/** Parse prediction.externalSignals JSON into a typed list (best-effort). */
export function parseExternalSignalsJson(raw: string | null | undefined): ExternalSignal[] {
  if (!raw || raw === '[]' || raw.includes('unavailable')) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
      .map((item) => ({
        sourceUrl: String(item.sourceUrl ?? item.source_url ?? ''),
        sourceType: String(item.sourceType ?? item.source_type ?? 'unknown'),
        title: String(item.title ?? 'Untitled signal'),
        summary: String(item.summary ?? ''),
        sentiment: Number(item.sentiment ?? item.sentiment_score ?? 0) || 0,
        relevance: Number(item.relevance ?? item.relevance_score ?? 0) || 0,
        type: String(item.type ?? item.risk_type ?? 'unknown'),
        createdAt: item.createdAt != null ? String(item.createdAt) : undefined,
        expiresAt:
          item.expiresAt === null || item.expires_at === null
            ? null
            : item.expiresAt != null || item.expires_at != null
              ? String(item.expiresAt ?? item.expires_at)
              : null,
      }))
      .filter((s) => s.sourceUrl || s.title);
  } catch {
    return [];
  }
}
