import { authService } from './authService';
import { syncVaultOnLogin } from './vaultSyncService';
import { syncWatchlistsOnLogin } from './watchlistSyncService';
import { alertServiceFrontend } from './alertService';
import { priceTrackingService } from './priceTrackingService';

const GUEST_SNAPSHOT_KEY = 'tcg_guest_data_snapshot';
const LAST_USER_KEY = 'tcgtracker_last_user_id';

/** Local keys that hold collector data (guest or hydrated from server). */
const USER_DATA_KEYS = [
  'tcg_vault_cards',
  'tcg_vault_cards_pokemon',
  'tcg_vault_cards_onepiece',
  'tcg_vault_synced',
  'tcg_vault_activity_pokemon',
  'tcg_vault_activity_onepiece',
  'tcg_tracked_cards',
  'tcg_tracked_cards_pokemon',
  'tcg_tracked_cards_onepiece',
  'tcg_card_wishlist_pokemon',
  'tcg_card_wishlist_onepiece',
  'tcg_price_alerts',
  'tcg_price_alerts_pokemon',
  'tcg_price_alerts_onepiece',
  'tcg_alert_digest',
  'tcg_grading_history',
] as const;

export interface UserDataSyncResult {
  vault: 'pulled' | 'pushed' | 'skipped' | 'error';
  watchlists: 'pulled' | 'pushed' | 'skipped' | 'error';
  alerts: 'pulled' | 'pushed' | 'skipped' | 'error';
  message: string;
}

function readKey(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeKey(key: string, value: string | null): void {
  try {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* quota / private mode */
  }
}

/** Snapshot guest local data before signing in so logout can restore it. */
export function saveGuestSnapshot(): void {
  if (authService.getUser()) return;
  const snapshot: Record<string, string | null> = {};
  for (const key of USER_DATA_KEYS) {
    snapshot[key] = readKey(key);
  }
  try {
    localStorage.setItem(GUEST_SNAPSHOT_KEY, JSON.stringify(snapshot));
  } catch {
    /* ignore */
  }
}

/** Restore pre-login guest data after sign-out. */
export function restoreGuestSnapshot(): void {
  try {
    const raw = localStorage.getItem(GUEST_SNAPSHOT_KEY);
    if (!raw) {
      clearLocalUserData();
      return;
    }
    const snapshot = JSON.parse(raw) as Record<string, string | null>;
    for (const key of USER_DATA_KEYS) {
      writeKey(key, snapshot[key] ?? null);
    }
  } catch {
    clearLocalUserData();
  }
  window.dispatchEvent(new CustomEvent('tcg:vault-updated'));
  window.dispatchEvent(new CustomEvent('tcg:alert-digest-updated'));
}

export function clearLocalUserData(): void {
  for (const key of USER_DATA_KEYS) {
    writeKey(key, null);
  }
  window.dispatchEvent(new CustomEvent('tcg:vault-updated'));
  window.dispatchEvent(new CustomEvent('tcg:alert-digest-updated'));
}

/**
 * Remote-wins alerts: if the account has server alerts, local threshold mirrors
 * are left alone (UI reads server). If remote is empty, push local alerts up.
 */
async function syncAlertsOnLogin(): Promise<'pulled' | 'pushed' | 'skipped' | 'error'> {
  if (!authService.getUser()) return 'skipped';
  try {
    const remote = await alertServiceFrontend.getAlerts();
    if (remote.length > 0) {
      return 'pulled';
    }

    const local = [
      ...priceTrackingService.getAlerts('pokemon'),
      ...priceTrackingService.getAlerts('onepiece'),
    ];
    if (local.length === 0) return 'skipped';

    let pushed = 0;
    for (const alert of local) {
      if (!alert.isActive) continue;
      try {
        await alertServiceFrontend.createAlert(
          alert.cardId,
          alert.cardName,
          alert.targetPrice,
          alert.alertType
        );
        pushed += 1;
      } catch {
        /* continue remaining */
      }
    }
    return pushed > 0 ? 'pushed' : 'skipped';
  } catch {
    return 'error';
  }
}

/**
 * Pull/push vault, watchlists, and alerts after a successful login/register.
 * Cookie session must already be set; authService user cache must be populated.
 */
export async function syncUserDataOnLogin(): Promise<UserDataSyncResult> {
  const user = authService.getUser();
  if (!user) {
    return {
      vault: 'skipped',
      watchlists: 'skipped',
      alerts: 'skipped',
      message: 'Not signed in',
    };
  }

  const previousUserId = localStorage.getItem(LAST_USER_KEY);
  const userId = String(user.id);
  // Switching accounts: don't leave the previous user's hydrated local cache.
  if (previousUserId && previousUserId !== userId) {
    clearLocalUserData();
  }
  localStorage.setItem(LAST_USER_KEY, userId);

  const result: UserDataSyncResult = {
    vault: 'skipped',
    watchlists: 'skipped',
    alerts: 'skipped',
    message: '',
  };

  try {
    await syncVaultOnLogin();
    result.vault = 'pulled';
  } catch {
    result.vault = 'error';
  }

  try {
    await syncWatchlistsOnLogin();
    result.watchlists = 'pulled';
  } catch {
    result.watchlists = 'error';
  }

  result.alerts = await syncAlertsOnLogin();

  const parts: string[] = [];
  if (result.vault !== 'error') parts.push('vault');
  if (result.watchlists !== 'error') parts.push('lists');
  if (result.alerts === 'pushed') parts.push('alerts uploaded');
  else if (result.alerts === 'pulled') parts.push('alerts');

  result.message =
    parts.length > 0
      ? `Synced ${parts.join(', ')} to this device`
      : 'Signed in — cloud sync had issues; local data kept';

  window.dispatchEvent(
    new CustomEvent('tcg:user-data-synced', { detail: result })
  );
  return result;
}

/** Clear session-linked local cache and restore guest snapshot. */
export function handleLogoutLocalData(): void {
  localStorage.removeItem(LAST_USER_KEY);
  restoreGuestSnapshot();
}
