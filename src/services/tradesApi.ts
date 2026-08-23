import { buildApiUrl } from '../config/env';
import '../config/apiClient';
import axios from 'axios';
import type { SharePayloadV1 } from '../features/trade/shareCodec';

export interface SavedTrade {
  id: string;
  shareToken: string;
  title: string;
  game: 'pokemon' | 'onepiece';
  payload: SharePayloadV1;
  giveTotal: number;
  getTotal: number;
  createdAt: string;
  updatedAt: string;
}

export async function listSavedTrades(): Promise<SavedTrade[]> {
  const res = await axios.get<{ success: boolean; data: { trades: SavedTrade[] } }>(
    buildApiUrl('/api/trades')
  );
  return res.data.data.trades;
}

export async function saveTrade(input: {
  id?: string;
  title?: string;
  game: 'pokemon' | 'onepiece';
  payload: SharePayloadV1;
  giveTotal: number;
  getTotal: number;
}): Promise<SavedTrade> {
  const res = await axios.post<{ success: boolean; data: { trade: SavedTrade } }>(
    buildApiUrl('/api/trades'),
    input
  );
  return res.data.data.trade;
}

export async function deleteSavedTrade(id: string): Promise<void> {
  await axios.delete(buildApiUrl(`/api/trades/${id}`));
}

export async function getPublicTrade(token: string): Promise<SavedTrade> {
  const res = await axios.get<{ success: boolean; data: { trade: SavedTrade } }>(
    buildApiUrl(`/api/trades/public/${token}`)
  );
  return res.data.data.trade;
}
