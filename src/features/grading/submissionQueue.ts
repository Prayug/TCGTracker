const QUEUE_KEY = 'tcg_psa_submission_queue';

export type SubmissionQueueItem = {
  id: string;
  gradingId: string;
  cardId: string;
  cardName: string;
  imageUrl?: string;
  action: 'submit' | 'consider';
  psaRangeLabel: string;
  expectedUpside: number | null;
  addedAt: string;
};

function read(): SubmissionQueueItem[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    const parsed = raw ? (JSON.parse(raw) as SubmissionQueueItem[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function write(items: SubmissionQueueItem[]): SubmissionQueueItem[] {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(items.slice(0, 50)));
  } catch {
    // quota
  }
  return items;
}

export function loadSubmissionQueue(): SubmissionQueueItem[] {
  return read();
}

export function addToSubmissionQueue(
  item: Omit<SubmissionQueueItem, 'id' | 'addedAt'>
): SubmissionQueueItem[] {
  const current = read().filter((row) => row.gradingId !== item.gradingId);
  const next: SubmissionQueueItem = {
    ...item,
    id: `${item.gradingId}-${Date.now()}`,
    addedAt: new Date().toISOString(),
  };
  return write([next, ...current]);
}

export function removeFromSubmissionQueue(id: string): SubmissionQueueItem[] {
  return write(read().filter((row) => row.id !== id));
}

export function isInSubmissionQueue(gradingId: string): boolean {
  return read().some((row) => row.gradingId === gradingId);
}
