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

export interface PortfolioLot {
  id: number;
  user_id: number;
  collection_id: number | null;
  card_id: string;
  card_name: string;
  quantity: number;
  cost_basis: number;
  acquired_at: string | null;
  sold_at: string | null;
  sale_price: number | null;
  realized_pnl: number | null;
  condition: string | null;
  notes: string | null;
}

export interface PortfolioStatsSummary {
  totalCards: number;
  totalValue: number;
  totalInvestment: number;
  profitLoss: number;
  profitLossPercentage: number;
  realizedPnl: number;
  unrealizedPnl: number;
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

export async function fetchLots(openOnly = false): Promise<PortfolioLot[]> {
  const q = openOnly ? '?openOnly=true' : '';
  const response = await axios.get<{ success: boolean; data: { lots: PortfolioLot[] } }>(
    buildApiUrl(`/api/portfolio/lots${q}`)
  );
  return response.data?.data?.lots ?? [];
}

export async function closeLot(
  lotId: number,
  salePrice: number,
  soldAt?: string
): Promise<PortfolioLot> {
  const response = await axios.post<{ success: boolean; data: { lot: PortfolioLot } }>(
    buildApiUrl(`/api/portfolio/lots/${lotId}/close`),
    { salePrice, soldAt }
  );
  return response.data.data.lot;
}

export async function fetchPortfolioStats(): Promise<PortfolioStatsSummary | null> {
  const response = await axios.get<{ success: boolean; data: { stats: PortfolioStatsSummary } }>(
    buildApiUrl('/api/portfolio/stats')
  );
  return response.data?.data?.stats ?? null;
}

export function isAuthenticatedForSync(): boolean {
  return authService.getUser() !== null;
}
