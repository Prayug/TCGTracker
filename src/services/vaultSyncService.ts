import { VaultCard } from '../types/pokemon';
import { authService } from './authService';
import { fetchRemoteVault, pushVaultToRemote } from './portfolioApiService';

const VAULT_STORAGE_KEY = 'tcg_vault_cards';
const SYNC_FLAG_KEY = 'tcg_vault_synced';

export async function syncVaultOnLogin(): Promise<void> {
  const user = authService.getUser();
  if (!user) return;

  try {
    const local = readLocalVault();
    const remote = await fetchRemoteVault();

    if (remote.length > 0) {
      writeLocalVault(remote);
      localStorage.setItem(SYNC_FLAG_KEY, '1');
      return;
    }

    if (local.length > 0) {
      await pushVaultToRemote(local);
      localStorage.setItem(SYNC_FLAG_KEY, '1');
    }
  } catch (error) {
    console.warn('Vault sync failed — using local data:', error);
  }
}

export async function syncVaultToServer(cards: VaultCard[]): Promise<void> {
  if (!authService.getUser()) return;
  try {
    await pushVaultToRemote(cards);
  } catch (error) {
    console.warn('Failed to sync vault to server:', error);
  }
}

function readLocalVault(): VaultCard[] {
  try {
    const stored = localStorage.getItem(VAULT_STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function writeLocalVault(cards: VaultCard[]): void {
  localStorage.setItem(VAULT_STORAGE_KEY, JSON.stringify(cards));
  window.dispatchEvent(new CustomEvent('tcg:vault-updated'));
}
