import { setCodeService } from './setCodeService';

export const buildPlaceholderImage = (name: string, set: string) => (
  'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="245" height="342" viewBox="0 0 245 342"%3E%3Crect width="245" height="342" fill="%23f3f4f6" rx="12"/%3E%3Ctext x="50%25" y="45%25" font-family="Arial,sans-serif" font-size="16" fill="%239ca3af" text-anchor="middle"%3E' +
  encodeURIComponent(name) + '%3C/text%3E%3Ctext x="50%25" y="55%25" font-family="Arial,sans-serif" font-size="14" fill="%23d1d5db" text-anchor="middle"%3E' +
  encodeURIComponent(set) + '%3C/text%3E%3Ctext x="50%25" y="65%25" font-family="Arial,sans-serif" font-size="12" fill="%23e5e7eb" text-anchor="middle"%3ENo Image%3C/text%3E%3C/svg%3E'
);

export const buildDeterministicImageUrls = async (setId?: string | null, cardNumber?: string | null, setName?: string | null) => {
  return setCodeService.buildDeterministicImageUrls(setId, cardNumber, setName);
};

const IMAGE_COLUMN_FRAGMENT =
  'cm.imageSmall, cm.imageLarge, cm.imageSource, cm.imageLastUpdated,';
const IMAGE_COLUMN_CACHE_TTL = 1000 * 60 * 5; // 5 minutes
let imageColumnCache: { hasColumns: boolean; checkedAt: number } | null = null;

export const hasImageMetadataColumns = async (): Promise<boolean> => {
  if (
    imageColumnCache &&
    Date.now() - imageColumnCache.checkedAt < IMAGE_COLUMN_CACHE_TTL
  ) {
    return imageColumnCache.hasColumns;
  }

  const { getDb } = await import('../db/database');
  const db = getDb();
  const hasColumns = await new Promise<boolean>((resolve) => {
    db.all("PRAGMA table_info(card_mappings)", [], (err, rows: any[]) => {
      if (err || !rows) {
        resolve(false);
      } else {
        resolve(rows.some((row: any) => row.name === 'imageSmall'));
      }
    });
  });

  imageColumnCache = { hasColumns, checkedAt: Date.now() };
  return hasColumns;
};

export const getImageColumnSelectFragment = async () => {
  return (await hasImageMetadataColumns()) ? IMAGE_COLUMN_FRAGMENT : '';
};

