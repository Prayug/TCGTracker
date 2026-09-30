/**
 * Seed minimal card + price history for buy-thesis API smoke tests.
 */
import { initializeDatabase, getDb } from '../db/database';
import { runMigrations } from '../db/migrations';

function run(sql: string, params: unknown[] = []): Promise<void> {
  return new Promise((resolve, reject) => {
    getDb().run(sql, params, (err) => (err ? reject(err) : resolve()));
  });
}

function seriesPrices(n: number, base: number): Array<{ date: string; price: number }> {
  const end = new Date();
  const out = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(end);
    d.setUTCDate(d.getUTCDate() - (n - 1 - i));
    out.push({
      date: d.toISOString().slice(0, 10),
      price: Math.round((base + Math.sin(i / 8) * base * 0.05) * 100) / 100,
    });
  }
  return out;
}

async function main() {
  await initializeDatabase();
  await runMigrations(getDb());

  const cards = [
    {
      cardId: 'sv3pt5-198',
      name: 'Charizard ex',
      setId: 'sv3pt5',
      setName: '151',
      number: '198',
      rarity: 'Special Illustration Rare',
      uid: 'sv3pt5|198|Charizard ex|normal',
      base: 95,
      release: '2023-09-22',
    },
    {
      cardId: 'swsh12pt5-GG69',
      name: 'Umbreon VMAX',
      setId: 'swsh12pt5',
      setName: 'Crown Zenith',
      number: 'GG69',
      rarity: 'Special Illustration Rare',
      uid: 'swsh12pt5|GG69|Umbreon VMAX|normal',
      base: 180,
      release: '2023-01-20',
    },
    {
      cardId: 'base1-4',
      name: 'Charizard',
      setId: 'base1',
      setName: 'Base',
      number: '4',
      rarity: 'Rare Holo',
      uid: 'base1|4|Charizard|normal',
      base: 400,
      release: '1999-01-09',
    },
  ];

  for (const c of cards) {
    await run(
      `INSERT OR REPLACE INTO card_mappings
       (cardId, cardName, setId, setName, cardNumber, rarity, uniqueIdentifier, variantKey)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'normal')`,
      [c.cardId, c.name, c.setId, c.setName, c.number, c.rarity, c.uid]
    );
    await run(
      `INSERT OR IGNORE INTO catalog_cards (cardId, setId, setReleaseDate, rarity)
       VALUES (?, ?, ?, ?)`,
      [c.cardId, c.setId, c.release, c.rarity]
    ).catch(async () => {
      // catalog schema may differ — best effort
      await run(`UPDATE catalog_cards SET setReleaseDate = ? WHERE cardId = ?`, [
        c.release,
        c.cardId,
      ]).catch(() => undefined);
    });

    for (const p of seriesPrices(90, c.base)) {
      await run(
        `INSERT OR REPLACE INTO price_history
         (uniqueIdentifier, date, price, marketPrice, volume, source)
         VALUES (?, ?, ?, ?, ?, 'tcgdex')`,
        [c.uid, p.date, p.price, p.price, 40]
      );
    }
  }

  console.log('Seeded', cards.length, 'cards for buy-thesis smoke test');
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
