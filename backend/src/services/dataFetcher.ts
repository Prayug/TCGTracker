import fs from 'fs';
import path from 'path';
import { getDb } from '../db/database';
import { storeCardMapping, generateUniqueIdentifier } from './cardIdentifier';

const TCGCSV_BASE_URL = 'https://tcgcsv.com/tcgplayer';
const POKEMON_CATEGORY_ID = '3';

interface TCGCSVProduct {
  productId: number;
  name: string;
  groupId: number;
}

interface TCGCSVPrice {
  productId: number;
  subTypeName: string;
  lowPrice: number;
  midPrice: number;
  highPrice: number;
  marketPrice: number;
  directLowPrice: number;
}

interface TCGCSVGroup {
  groupId: number;
  name: string;
  abbreviation: string;
  publishedOn: string;
}

const fetchPokemonGroups = async (): Promise<TCGCSVGroup[]> => {
  const response = await fetch(`${TCGCSV_BASE_URL}/${POKEMON_CATEGORY_ID}/groups`);
  if (!response.ok) {
    throw new Error(`Failed to fetch Pokemon groups: ${response.statusText}`);
  }
  const data = await response.json();
  return data.results;
};

const fetchGroupProducts = async (groupId: number): Promise<TCGCSVProduct[]> => {
  const response = await fetch(`${TCGCSV_BASE_URL}/${POKEMON_CATEGORY_ID}/${groupId}/products`);
  if (!response.ok) {
    throw new Error(`Failed to fetch products for group ${groupId}: ${response.statusText}`);
  }
  const data = await response.json();
  return data.results;
};

const fetchGroupPrices = async (groupId: number): Promise<TCGCSVPrice[]> => {
  const response = await fetch(`${TCGCSV_BASE_URL}/${POKEMON_CATEGORY_ID}/${groupId}/prices`);
  if (!response.ok) {
    throw new Error(`Failed to fetch prices for group ${groupId}: ${response.statusText}`);
  }
  const data = await response.json();
  return data.results;
};

const storePriceData = async (prices: TCGCSVPrice[], products: TCGCSVProduct[], groupName: string, date: string) => {
  const db = getDb();
  
  const priceInsertSql = `
    INSERT INTO price_history (
      productId, date, price, subTypeName, productName, groupName, 
      source, lowPrice, highPrice, marketPrice, volume, uniqueIdentifier
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(productId, date, source, subTypeName) DO UPDATE SET
      price = excluded.price,
      lowPrice = excluded.lowPrice,
      highPrice = excluded.highPrice,
      marketPrice = excluded.marketPrice,
      productName = excluded.productName;
  `;

  const mappingInsertSql = `
    INSERT OR REPLACE INTO card_mappings 
    (cardId, productId, cardName, setId, setName, cardNumber, rarity, tcgplayerProductId, uniqueIdentifier, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `;

  const priceStmt = db.prepare(priceInsertSql);
  const mappingStmt = db.prepare(mappingInsertSql);

  const productMap = new Map(products.map(p => [p.productId, p.name]));

  return new Promise<void>((resolve, reject) => {
    db.serialize(() => {
      db.run('BEGIN TRANSACTION');

      try {
        for (const price of prices) {
          if (price.marketPrice && price.marketPrice > 0) {
            const productName = productMap.get(price.productId) || '';
            const cardDetails = extractCardDetails(productName, groupName);
            const uniqueIdentifier = generateUniqueIdentifier(
              cardDetails.setId,
              cardDetails.cardNumber,
              cardDetails.cardName
            );
            
            priceStmt.run([
              price.productId, date, price.marketPrice,
              price.subTypeName || 'Normal', productName, groupName,
              'tcgcsv', price.lowPrice || null, price.highPrice || null,
              price.marketPrice || null, null, uniqueIdentifier
            ]);

            if (cardDetails.cardName && cardDetails.setId) {
              mappingStmt.run([
                `tcgcsv-${price.productId}`, price.productId,
                cardDetails.cardName, cardDetails.setId, groupName,
                cardDetails.cardNumber || null, null,
                price.productId.toString(), uniqueIdentifier
              ]);
            }
          }
        }
        
        db.run('COMMIT', (commitErr) => {
          if (commitErr) {
            throw commitErr;
          }
          priceStmt.finalize();
          mappingStmt.finalize();
          resolve();
        });

      } catch (runErr) {
        console.error('Error during transaction, rolling back.', runErr);
        db.run('ROLLBACK', () => {
          priceStmt.finalize();
          mappingStmt.finalize();
          reject(runErr);
        });
      }
    });
  });
};

/**
 * Extracts card details from TCGCSV product name
 */
const extractCardDetails = (productName: string, setName: string) => {
  let cardName = productName;
  let cardNumber = '';
  let setId = setName.toLowerCase().replace(/[^a-z0-9]/g, '');

  // Try to match standard card numbers first, e.g., (199/165)
  let numberMatches = productName.match(/\s\(?(\d+\/\d+)\)?/);

  if (numberMatches) {
    cardNumber = numberMatches[1];
    cardName = productName.substring(0, numberMatches.index).trim();
  } else {
    // If not found, try to match promo numbers, e.g., - SWSH250
    // This pattern looks for a dash followed by a code that contains at least one digit.
    numberMatches = productName.match(/-\s+([a-zA-Z0-9-]*[a-zA-Z]*\d+[a-zA-Z0-9-]*)$/);
    if (numberMatches) {
      cardNumber = numberMatches[1];
      cardName = productName.substring(0, numberMatches.index).trim();
    }
  }

  // Clean up card name from rarity indicators often found in TCGPlayer names
  cardName = cardName.replace(/\s*-\s*(Common|Uncommon|Rare|Holo Rare|Reverse Holo|Promo|Secret Rare|Ultra Rare|Amazing Rare).*$/i, '').trim();
  if (cardName.endsWith(' -')) {
    cardName = cardName.slice(0, -2).trim();
  }

  return {
    cardName,
    cardNumber,
    setId,
  };
};

const createDailySnapshot = async (date: string) => {
  const db = getDb();
  
  return new Promise<void>((resolve, reject) => {
    // Calculate daily statistics
    const statsSql = `
      SELECT 
        COUNT(*) as totalCards,
        AVG(price) as avgPrice,
        COUNT(*) as totalVolume
      FROM price_history 
      WHERE date = ?
    `;
    
    db.get(statsSql, [date], (err, stats: any) => {
      if (err) {
        reject(err);
        return;
      }

      // Get top gainers and losers
      const gainersSql = `
        SELECT 
          ph1.productName,
          ph1.price as currentPrice,
          ph2.price as previousPrice,
          ((ph1.price - ph2.price) / ph2.price * 100) as changePercent
        FROM price_history ph1
        JOIN price_history ph2 ON ph1.productId = ph2.productId
        WHERE ph1.date = ? 
          AND ph2.date = date(?, '-1 day')
          AND ph1.price > 0 AND ph2.price > 0
        ORDER BY changePercent DESC
        LIMIT 10
      `;

      db.all(gainersSql, [date, date], (err, gainers) => {
        if (err) {
          reject(err);
          return;
        }

        const losersSql = gainersSql.replace('DESC', 'ASC');
        db.all(losersSql, [date, date], (err, losers) => {
          if (err) {
            reject(err);
            return;
          }

          // Insert snapshot
          const insertSnapshotSql = `
            INSERT OR REPLACE INTO price_snapshots 
            (date, totalCards, avgPrice, totalVolume, topGainers, topLosers)
            VALUES (?, ?, ?, ?, ?, ?)
          `;

          db.run(insertSnapshotSql, [
            date,
            stats?.totalCards || 0,
            stats?.avgPrice || 0,
            stats?.totalVolume || 0,
            JSON.stringify(gainers || []),
            JSON.stringify(losers || [])
          ], (err) => {
            if (err) {
              reject(err);
            } else {
              resolve();
            }
          });
        });
      });
    });
  });
};

export const updatePriceData = async () => {
  try {
    console.log('Starting TCGCSV price data update...');
    const currentDate = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
    
    console.log('Fetching TCGCSV data...');
    const groups = await fetchPokemonGroups();
    console.log(`Found ${groups.length} Pokemon groups/sets`);
    
    let totalPricesProcessed = 0;
    
    // Process groups sequentially to prevent database locking issues
    for (const group of groups) {
      try {
        console.log(`Processing group: ${group.name} (${group.groupId})`);
        
        const [products, prices] = await Promise.all([
          fetchGroupProducts(group.groupId),
          fetchGroupPrices(group.groupId)
        ]);

        if (prices.length > 0 && products.length > 0) {
          await storePriceData(prices, products, group.name, currentDate);
          totalPricesProcessed += prices.length;
          console.log(`Successfully processed ${prices.length} price points for ${group.name}.`);
        } else {
          console.log(`No price or product data found for ${group.name}, skipping.`);
        }
      } catch (error) {
        console.error(`Failed to process group ${group.name} (${group.groupId}):`, error);
      }
      // Add a small delay between processing each group to be kind to the API
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    
    console.log(`Finished processing all groups. Total price points processed: ${totalPricesProcessed}`);
    
    console.log('Creating daily market snapshot...');
    await createDailySnapshot(currentDate);
    console.log('Daily market snapshot created.');
    
  } catch (error) {
    console.error('An error occurred during the price data update process:', error);
  }
};
