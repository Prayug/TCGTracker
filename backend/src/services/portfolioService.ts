import { Database } from 'sqlite3';
import { allDbRows, getDbRow, runDb } from '../utils/dbAsync';
import { getLatestCanonicalPriceByCardId } from './canonicalPriceService';

export interface PortfolioItem {
  id: number;
  user_id: number;
  card_id: string;
  card_name: string;
  quantity: number;
  purchase_price?: number;
  purchase_date?: string;
  condition?: string;
  notes?: string;
  card_data?: string | null;
  client_vault_id?: string | null;
  created_at: string;
  updated_at: string;
}

export interface VaultSyncEntry {
  id: string;
  card: unknown;
  purchasePrice: number;
  purchaseDate: string;
  quantity: number;
  condition: string;
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

export interface PortfolioHoldingPnL {
  card_id: string;
  card_name: string;
  quantity: number;
  costBasis: number;
  marketPrice: number;
  marketValue: number;
  unrealizedPnl: number;
  unrealizedPnlPct: number;
  priceSource: 'canonical' | 'snapshot' | 'cost';
}

export interface PortfolioStats {
  totalCards: number;
  totalValue: number;
  totalInvestment: number;
  profitLoss: number;
  profitLossPercentage: number;
  realizedPnl: number;
  unrealizedPnl: number;
  holdings: PortfolioHoldingPnL[];
  topGainers: Array<{ card_name: string; gain: number; gainPercentage: number }>;
  topLosers: Array<{ card_name: string; loss: number; lossPercentage: number }>;
  allocationBySet: Array<{ setName: string; value: number; pct: number }>;
}

export class PortfolioService {
  constructor(private db: Database) {}

  async addToCollection(
    userId: number,
    cardId: string,
    cardName: string,
    quantity = 1,
    purchasePrice?: number,
    purchaseDate?: string,
    condition?: string,
    notes?: string,
    cardData?: string,
    clientVaultId?: string
  ): Promise<PortfolioItem> {
    const { lastID } = await runDb(
      this.db,
      `INSERT INTO user_collections
         (user_id, card_id, card_name, quantity, purchase_price, purchase_date, condition, notes, card_data, client_vault_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id, card_id, condition) DO UPDATE SET
         quantity = excluded.quantity,
         purchase_price = excluded.purchase_price,
         purchase_date = excluded.purchase_date,
         notes = excluded.notes,
         card_data = excluded.card_data,
         client_vault_id = excluded.client_vault_id,
         updated_at = CURRENT_TIMESTAMP`,
      [
        userId,
        cardId,
        cardName,
        quantity,
        purchasePrice ?? null,
        purchaseDate ?? null,
        condition ?? null,
        notes ?? null,
        cardData ?? null,
        clientVaultId ?? null,
      ]
    );

    // Mirror open lot for P&L tracking (idempotent-ish: one open lot per collection upsert).
    if (purchasePrice != null && purchasePrice >= 0) {
      await this.ensureOpenLot(userId, lastID, cardId, cardName, quantity, purchasePrice, purchaseDate, condition);
    }

    const row = await this.getItemById(lastID, userId);
    if (!row) throw new Error('Failed to load created portfolio item');
    return row;
  }

  private async ensureOpenLot(
    userId: number,
    collectionId: number,
    cardId: string,
    cardName: string,
    quantity: number,
    costBasis: number,
    acquiredAt?: string,
    condition?: string
  ): Promise<void> {
    const existing = await getDbRow<{ id: number }>(
      this.db,
      `SELECT id FROM portfolio_lots
       WHERE user_id = ? AND collection_id = ? AND sold_at IS NULL
       LIMIT 1`,
      [userId, collectionId]
    );
    if (existing) {
      await runDb(
        this.db,
        `UPDATE portfolio_lots
         SET quantity = ?, cost_basis = ?, acquired_at = ?, condition = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [quantity, costBasis, acquiredAt ?? null, condition ?? null, existing.id]
      );
      return;
    }
    await runDb(
      this.db,
      `INSERT INTO portfolio_lots
         (user_id, collection_id, card_id, card_name, quantity, cost_basis, acquired_at, condition)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [userId, collectionId, cardId, cardName, quantity, costBasis, acquiredAt ?? null, condition ?? null]
    );
  }

  async getItemById(itemId: number, userId: number): Promise<PortfolioItem | undefined> {
    return getDbRow<PortfolioItem>(
      this.db,
      'SELECT * FROM user_collections WHERE id = ? AND user_id = ?',
      [itemId, userId]
    );
  }

  async getCollection(userId: number): Promise<PortfolioItem[]> {
    return allDbRows<PortfolioItem>(
      this.db,
      'SELECT * FROM user_collections WHERE user_id = ? ORDER BY created_at DESC',
      [userId]
    );
  }

  async getLots(userId: number, openOnly = false): Promise<PortfolioLot[]> {
    const sql = openOnly
      ? 'SELECT * FROM portfolio_lots WHERE user_id = ? AND sold_at IS NULL ORDER BY acquired_at DESC'
      : 'SELECT * FROM portfolio_lots WHERE user_id = ? ORDER BY acquired_at DESC';
    return allDbRows<PortfolioLot>(this.db, sql, [userId]);
  }

  async closeLot(
    userId: number,
    lotId: number,
    salePrice: number,
    soldAt?: string
  ): Promise<PortfolioLot | undefined> {
    const lot = await getDbRow<PortfolioLot>(
      this.db,
      'SELECT * FROM portfolio_lots WHERE id = ? AND user_id = ?',
      [lotId, userId]
    );
    if (!lot) return undefined;
    const realized = (salePrice - lot.cost_basis) * lot.quantity;
    await runDb(
      this.db,
      `UPDATE portfolio_lots
       SET sold_at = ?, sale_price = ?, realized_pnl = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND user_id = ?`,
      [soldAt ?? new Date().toISOString().slice(0, 10), salePrice, realized, lotId, userId]
    );
    return getDbRow<PortfolioLot>(
      this.db,
      'SELECT * FROM portfolio_lots WHERE id = ? AND user_id = ?',
      [lotId, userId]
    );
  }

  async syncVault(userId: number, cards: VaultSyncEntry[]): Promise<PortfolioItem[]> {
    await runDb(this.db, 'BEGIN IMMEDIATE');
    try {
      await runDb(this.db, 'DELETE FROM portfolio_lots WHERE user_id = ? AND sold_at IS NULL', [
        userId,
      ]);
      await runDb(this.db, 'DELETE FROM user_collections WHERE user_id = ?', [userId]);

      // Merge duplicate catalog card + condition rows so UNIQUE(user_id, card_id, condition) cannot fail.
      const merged = new Map<string, VaultSyncEntry>();
      for (const entry of cards) {
        const card = entry.card as { id?: string };
        const cardId = card?.id || entry.id;
        const key = `${cardId}::${entry.condition || 'raw'}`;
        const existing = merged.get(key);
        if (!existing) {
          merged.set(key, { ...entry, quantity: entry.quantity });
          continue;
        }
        existing.quantity += entry.quantity;
        if ((entry.purchasePrice || 0) > 0 && !(existing.purchasePrice > 0)) {
          existing.purchasePrice = entry.purchasePrice;
          existing.purchaseDate = entry.purchaseDate;
        }
      }

      for (const entry of merged.values()) {
        const card = entry.card as { id?: string; name?: string; set?: { name?: string } };
        const { lastID } = await runDb(
          this.db,
          `INSERT INTO user_collections
             (user_id, card_id, card_name, quantity, purchase_price, purchase_date, condition, notes, card_data, client_vault_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            userId,
            card?.id || entry.id,
            card?.name || 'Unknown',
            entry.quantity,
            entry.purchasePrice,
            entry.purchaseDate,
            entry.condition,
            entry.notes ?? null,
            JSON.stringify(entry),
            entry.id,
          ]
        );
        await runDb(
          this.db,
          `INSERT INTO portfolio_lots
             (user_id, collection_id, card_id, card_name, quantity, cost_basis, acquired_at, condition, notes)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            userId,
            lastID,
            card?.id || entry.id,
            card?.name || 'Unknown',
            entry.quantity,
            entry.purchasePrice,
            entry.purchaseDate,
            entry.condition,
            entry.notes ?? null,
          ]
        );
      }

      await runDb(this.db, 'COMMIT');
    } catch (error) {
      await runDb(this.db, 'ROLLBACK');
      throw error;
    }

    return this.getCollection(userId);
  }

  async updateItem(
    itemId: number,
    userId: number,
    updates: Partial<Omit<PortfolioItem, 'id' | 'user_id' | 'created_at' | 'updated_at'>>
  ): Promise<void> {
    const fields: string[] = [];
    const values: unknown[] = [];

    Object.entries(updates).forEach(([key, value]) => {
      if (value !== undefined) {
        fields.push(`${key} = ?`);
        values.push(value);
      }
    });

    if (fields.length === 0) return;

    fields.push('updated_at = CURRENT_TIMESTAMP');
    values.push(itemId, userId);

    await runDb(
      this.db,
      `UPDATE user_collections SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`,
      values
    );
  }

  async removeFromCollection(itemId: number, userId: number): Promise<void> {
    await runDb(this.db, 'DELETE FROM portfolio_lots WHERE collection_id = ? AND user_id = ?', [
      itemId,
      userId,
    ]);
    await runDb(this.db, 'DELETE FROM user_collections WHERE id = ? AND user_id = ?', [
      itemId,
      userId,
    ]);
  }

  private async resolveMarketPrice(
    item: PortfolioItem
  ): Promise<{ price: number; source: PortfolioHoldingPnL['priceSource'] }> {
    // Prefer live canonical series over stale vault snapshot.
    try {
      const canonical = await getLatestCanonicalPriceByCardId(item.card_id);
      if (canonical && canonical.price > 0) {
        return { price: canonical.price, source: 'canonical' };
      }
    } catch {
      /* fall through */
    }

    if (item.card_data) {
      try {
        const parsed = JSON.parse(item.card_data) as VaultSyncEntry;
        const market = (parsed.card as { marketPrice?: number })?.marketPrice;
        if (market && market > 0) return { price: market, source: 'snapshot' };
      } catch {
        /* fall through */
      }
    }

    return { price: item.purchase_price || 0, source: 'cost' };
  }

  async getPortfolioStats(userId: number): Promise<PortfolioStats> {
    const collection = await this.getCollection(userId);
    const closedLots = await allDbRows<PortfolioLot>(
      this.db,
      'SELECT * FROM portfolio_lots WHERE user_id = ? AND sold_at IS NOT NULL',
      [userId]
    );

    let totalCards = 0;
    let totalInvestment = 0;
    let totalValue = 0;
    let unrealizedPnl = 0;
    const holdings: PortfolioHoldingPnL[] = [];
    const setValues = new Map<string, number>();

    for (const item of collection) {
      totalCards += item.quantity;
      const purchasePrice = item.purchase_price || 0;
      totalInvestment += purchasePrice * item.quantity;

      const { price: currentPrice, source } = await this.resolveMarketPrice(item);
      const marketValue = currentPrice * item.quantity;
      totalValue += marketValue;
      const unrealized = (currentPrice - purchasePrice) * item.quantity;
      unrealizedPnl += unrealized;

      holdings.push({
        card_id: item.card_id,
        card_name: item.card_name,
        quantity: item.quantity,
        costBasis: purchasePrice,
        marketPrice: currentPrice,
        marketValue,
        unrealizedPnl: unrealized,
        unrealizedPnlPct:
          purchasePrice > 0 ? ((currentPrice - purchasePrice) / purchasePrice) * 100 : 0,
        priceSource: source,
      });

      let setName = 'Unknown';
      if (item.card_data) {
        try {
          const parsed = JSON.parse(item.card_data) as VaultSyncEntry;
          setName =
            (parsed.card as { set?: { name?: string } })?.set?.name ||
            (parsed.card as { setName?: string })?.setName ||
            'Unknown';
        } catch {
          /* keep Unknown */
        }
      }
      setValues.set(setName, (setValues.get(setName) || 0) + marketValue);
    }

    const realizedPnl = closedLots.reduce((sum, lot) => sum + (lot.realized_pnl || 0), 0);
    const profitLoss = totalValue - totalInvestment;
    const profitLossPercentage = totalInvestment > 0 ? (profitLoss / totalInvestment) * 100 : 0;

    const sorted = [...holdings].sort((a, b) => b.unrealizedPnlPct - a.unrealizedPnlPct);
    const allocationBySet = [...setValues.entries()]
      .map(([setName, value]) => ({
        setName,
        value,
        pct: totalValue > 0 ? (value / totalValue) * 100 : 0,
      }))
      .sort((a, b) => b.value - a.value);

    return {
      totalCards,
      totalValue,
      totalInvestment,
      profitLoss,
      profitLossPercentage,
      realizedPnl,
      unrealizedPnl,
      holdings,
      topGainers: sorted
        .filter((p) => p.unrealizedPnl > 0)
        .slice(0, 5)
        .map((p) => ({
          card_name: p.card_name,
          gain: p.unrealizedPnl,
          gainPercentage: p.unrealizedPnlPct,
        })),
      topLosers: sorted
        .filter((p) => p.unrealizedPnl < 0)
        .slice(-5)
        .reverse()
        .map((p) => ({
          card_name: p.card_name,
          loss: Math.abs(p.unrealizedPnl),
          lossPercentage: Math.abs(p.unrealizedPnlPct),
        })),
      allocationBySet,
    };
  }
}
