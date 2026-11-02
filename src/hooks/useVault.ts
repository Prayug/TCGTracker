import { useCallback, useEffect, useState } from 'react';
import type { VaultCard, VaultActivityItem } from '../types/pokemon';
import { vaultService } from '../services/vaultService';
import { useGame } from '../contexts/GameContext';

/** Live vault holdings + activity for the active game. */
export function useVault() {
  const { game } = useGame();
  const [cards, setCards] = useState<VaultCard[]>(() => vaultService.getVaultCards(game));
  const [activity, setActivity] = useState<VaultActivityItem[]>(() =>
    vaultService.getActivity(game)
  );

  const refresh = useCallback(() => {
    setCards(vaultService.getVaultCards(game));
    setActivity(vaultService.getActivity(game));
  }, [game]);

  useEffect(() => {
    refresh();
    const onStorage = (e: StorageEvent) => {
      if (!e.key || e.key.startsWith('tcg_vault')) refresh();
    };
    window.addEventListener('tcg:vault-updated', refresh);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('tcg:vault-updated', refresh);
      window.removeEventListener('storage', onStorage);
    };
  }, [refresh]);

  return { cards, activity, refresh, game };
}
