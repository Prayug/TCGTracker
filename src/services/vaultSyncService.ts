import { VaultCard } from '../types/pokemon';
import { authService } from './authService';
import { fetchRemoteVault, pushVaultToRemote } from './portfolioApiService';

const VAULT_STORAGE_KEY_LEGACY = 'tcg_vault_cards';
const VAULT_STORAGE_KEY_POKEMON = 'tcg_vault_cards_pokemon';
const VAULT_STORAGE_KEY_ONEPIECE = 'tcg_vault_cards_onepiece';
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
  const migrate = (key: string) => {
    const stored = localStorage.getItem(key);
    if (stored) {
      try { return JSON.parse(stored); } catch { return []; }
    }
    return [];
  };

  // Read from legacy key if newer keys are empty (migration path)
  const pokemonCards = migrate(VAULT_STORAGE_KEY_POKEMON);
  const onePieceCards = migrate(VAULT_STORAGE_KEY_ONEPIECE);

  if (pokemonCards.length === 0 && onePieceCards.length === 0) {
    const legacy = migrate(VAULT_STORAGE_KEY_LEGACY);
    if (legacy.length > 0) {
      // Migrate legacy data — assume Pokemon if no game field
      localStorage.setItem(VAULT_STORAGE_KEY_POKEMON, JSON.stringify(legacy));
      localStorage.removeItem(VAULT_STORAGE_KEY_LEGACY);
      return legacy;
    }
  }

  return [...pokemonCards, ...onePieceCards];
}

function writeLocalVault(cards: VaultCard[]): void {
  const pokemonCards = cards.filter((c) => !c.game || c.game === 'pokemon');
  const onePieceCards = cards.filter((c) => c.game === 'onepiece');
  localStorage.setItem(VAULT_STORAGE_KEY_POKEMON, JSON.stringify(pokemonCards));
  localStorage.setItem(VAULT_STORAGE_KEY_ONEPIECE, JSON.stringify(onePieceCards));
  window.dispatchEvent(new CustomEvent('tcg:vault-updated'));
}
