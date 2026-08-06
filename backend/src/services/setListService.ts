import { getDb } from '../db/database';
import { setCodeService } from './setCodeService';
import {
  classifySetEra,
  getEraLabel,
  resolveSetImages,
  sortSetsForDisplay,
} from '../utils/setEra';

export interface EnrichedPokemonSet {
  id: string;
  name: string;
  releaseDate: string;
  total: number;
  series: string;
  era: string;
  eraLabel: string;
  images: {
    symbol: string;
    logo: string;
  };
}

interface RawSetRow {
  id: string;
  name: string;
  releaseDate: string | null;
  total: number;
}

const dbAll = <T>(sql: string, params: unknown[] = []): Promise<T[]> =>
  new Promise((resolve, reject) => {
    getDb().all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve((rows as T[]) || []);
    });
  });

const fetchRawSets = async (): Promise<RawSetRow[]> => {
  const catalogRows = await dbAll<RawSetRow>(
    `
    SELECT
      setId as id,
      setName as name,
      MAX(setReleaseDate) as releaseDate,
      COUNT(*) as total
    FROM catalog_cards
    GROUP BY setId, setName
    `
  );

  if (catalogRows.length > 0) return catalogRows;

  return dbAll<RawSetRow>(
    `
    SELECT
      setId as id,
      setName as name,
      NULL as releaseDate,
      COUNT(*) as total
    FROM card_mappings
    GROUP BY setId, setName
    `
  );
};

export const getEnrichedSets = async (): Promise<EnrichedPokemonSet[]> => {
  await setCodeService.initialize();

  const rows = await fetchRawSets();
  const enriched: EnrichedPokemonSet[] = [];

  for (const row of rows) {
    const apiMeta = setCodeService.resolveApiSet(row.id, row.name);
    const normalizedId =
      apiMeta?.id ||
      (await setCodeService.normalizeSetIdForImageUrl(row.id, row.name)) ||
      row.id;
    const series = apiMeta?.series || '';
    const era = classifySetEra({
      id: apiMeta?.id || row.id,
      name: row.name,
      series,
    });
    const imageSetId = apiMeta?.id || normalizedId || row.id;
    const images = resolveSetImages(apiMeta?.images, imageSetId);

    enriched.push({
      id: row.id,
      name: row.name,
      releaseDate: apiMeta?.releaseDate || row.releaseDate || '1970-01-01',
      total: row.total,
      series,
      era,
      eraLabel: getEraLabel(era),
      images,
    });
  }

  // Catalog can emit multiple names under one setId (e.g. svp). Prefer the larger checklist.
  const deduped = new Map<string, EnrichedPokemonSet>();
  for (const set of enriched) {
    const prev = deduped.get(set.id);
    if (!prev || set.total > prev.total) deduped.set(set.id, set);
  }

  return sortSetsForDisplay([...deduped.values()]);
};

export const enrichSetById = async (
  setId: string
): Promise<EnrichedPokemonSet | null> => {
  await setCodeService.initialize();

  const row = await new Promise<RawSetRow | undefined>((resolve, reject) => {
    getDb().get(
      `
      SELECT setId as id, setName as name, MAX(setReleaseDate) as releaseDate, COUNT(*) as total
      FROM catalog_cards
      WHERE setId = ? OR setName = ?
      GROUP BY setId, setName
      LIMIT 1
      `,
      [setId, setId],
      (err, result) => {
        if (err) reject(err);
        else resolve(result as RawSetRow | undefined);
      }
    );
  });

  if (!row) return null;

  const apiMeta = setCodeService.resolveApiSet(row.id, row.name);
  const normalizedId =
    apiMeta?.id ||
    (await setCodeService.normalizeSetIdForImageUrl(row.id, row.name)) ||
    row.id;
  const series = apiMeta?.series || '';
  const era = classifySetEra({
    id: apiMeta?.id || row.id,
    name: row.name,
    series,
  });

  return {
    id: row.id,
    name: row.name,
    releaseDate: apiMeta?.releaseDate || row.releaseDate || '1970-01-01',
    total: row.total,
    series,
    era,
    eraLabel: getEraLabel(era),
    images: resolveSetImages(apiMeta?.images, apiMeta?.id || normalizedId || row.id),
  };
};
