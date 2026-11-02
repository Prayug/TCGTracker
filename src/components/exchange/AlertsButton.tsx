import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { unifiedAlertService, type AlertDigestEntry } from '../../services/unifiedAlertService';
import { cardWishlistService, type WishlistItem } from '../../services/cardWishlistService';
import { useGame } from '../../contexts/GameContext';
import { formatCurrency } from '../../utils/cardDisplay';
import { cn } from '@/lib/utils';

/**
 * Header alerts: triggered price alerts (in-app digest) plus wishlist cards
 * at or under their target. Both are real local state; nothing is invented.
 */
export function AlertsButton() {
  const { game } = useGame();
  const [open, setOpen] = useState(false);
  const [digest, setDigest] = useState<AlertDigestEntry[]>([]);
  const [atTarget, setAtTarget] = useState<WishlistItem[]>([]);
  const ref = useRef<HTMLDivElement>(null);

  const refresh = useCallback(() => {
    setDigest(unifiedAlertService.getDigest().slice(0, 8));
    setAtTarget(cardWishlistService.getAtTarget(game).slice(0, 6));
  }, [game]);

  useEffect(() => {
    refresh();
    window.addEventListener('tcg:alert-digest-updated', refresh);
    window.addEventListener('tcg:wishlist-updated', refresh);
    return () => {
      window.removeEventListener('tcg:alert-digest-updated', refresh);
      window.removeEventListener('tcg:wishlist-updated', refresh);
    };
  }, [refresh]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const unread = digest.filter((d) => !d.read).length + atTarget.length;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        className="btn-icon relative"
        aria-label={unread > 0 ? `Alerts, ${unread} need attention` : 'Alerts'}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((v) => !v)}
      >
        <Bell className="h-[18px] w-[18px]" strokeWidth={1.6} />
        {unread > 0 ? (
          <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-loss px-1 font-mono text-[10px] font-semibold leading-none text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label="Alerts"
          className="absolute right-0 top-full z-50 mt-2 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-lg border border-border-default bg-surface-overlay shadow-popover"
        >
          <div className="flex items-center justify-between border-b border-border-subtle px-4 py-2.5">
            <p className="text-[13px] font-semibold">Alerts</p>
            {digest.some((d) => !d.read) ? (
              <button
                type="button"
                className="text-[12px] text-accent hover:underline"
                onClick={() => {
                  unifiedAlertService.markDigestRead();
                  refresh();
                }}
              >
                Mark read
              </button>
            ) : null}
          </div>

          {digest.length === 0 && atTarget.length === 0 ? (
            <div className="px-4 py-6 text-[13px] text-ink-secondary">
              <p>Nothing needs your attention.</p>
              <p className="mt-1 text-meta text-ink-muted">
                Set a target price on a wishlist card or a price alert on any card and it will show
                up here when it hits.
              </p>
            </div>
          ) : (
            <ul className="max-h-[60vh] overflow-y-auto">
              {atTarget.map((item) => (
                <li key={item.id} className="border-b border-border-subtle last:border-0">
                  <Link
                    to={`/card/${encodeURIComponent(item.card.id)}`}
                    onClick={() => setOpen(false)}
                    className="flex items-baseline justify-between gap-3 px-4 py-2.5 hover:bg-surface-hover"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] font-medium">
                        {item.card.name}
                      </span>
                      <span className="text-meta text-gain">Wishlist · at or under target</span>
                    </span>
                    <span className="shrink-0 text-right font-mono text-[12.5px] tabular-nums">
                      target {formatCurrency(item.targetPrice ?? 0)}
                    </span>
                  </Link>
                </li>
              ))}
              {digest.map((entry) => (
                <li key={entry.id} className="border-b border-border-subtle last:border-0">
                  <Link
                    to={`/card/${encodeURIComponent(entry.cardId)}`}
                    onClick={() => {
                      unifiedAlertService.markDigestRead(entry.id);
                      setOpen(false);
                    }}
                    className={cn(
                      'flex items-baseline justify-between gap-3 px-4 py-2.5 hover:bg-surface-hover',
                      entry.read && 'opacity-70'
                    )}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] font-medium">
                        {entry.cardName}
                      </span>
                      <span className="text-meta text-ink-muted">
                        {entry.condition === 'above' ? 'Rose above' : 'Fell below'}{' '}
                        {formatCurrency(entry.targetPrice)} ·{' '}
                        {new Date(entry.triggeredAt).toLocaleDateString()}
                      </span>
                    </span>
                    <span className="shrink-0 font-mono text-[12.5px] tabular-nums">
                      {formatCurrency(entry.currentPrice)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
