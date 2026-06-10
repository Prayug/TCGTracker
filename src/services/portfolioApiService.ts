import axios from 'axios';
import { buildApiUrl } from '../config/env';
import { VaultCard } from '../types/pokemon';
import { authService } from './authService';

import '../config/apiClient';

interface PortfolioRow {
  id: number;
  card_id: string;
  card_name: string;
  card_data?: string | null;
  client_vault_id?: string | null;
  quantity: number;
  purchase_price?: number;
  purchase_date?: string;
  condition?: string;
  notes?: string;
}

function rowToVaultCard(row: PortfolioRow): VaultCard | null {
  if (row.card_data) {
    try {
      return JSON.parse(row.card_data) as VaultCard;
    } catch {
      /* fall through */
    }
  }
  return null;
}

export async function fetchRemoteVault(): Promise<VaultCard[]> {
  const response = await axios.get<{ success: boolean; data: { collection: PortfolioRow[] } }>(
    buildApiUrl('/api/portfolio')
  );
  const rows = response.data?.data?.collection ?? [];
  return rows
    .map(rowToVaultCard)
    .filter((c): c is VaultCard => c !== null);
}

export async function pushVaultToRemote(cards: VaultCard[]): Promise<number> {
  const response = await axios.post<{ success: boolean; data: { synced: number } }>(
    buildApiUrl('/api/portfolio/sync'),
    { cards }
  );
  return response.data?.data?.synced ?? cards.length;
}

export function isAuthenticatedForSync(): boolean {
  return authService.getUser() !== null;
}
