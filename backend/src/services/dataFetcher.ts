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
  const insertSql = `
    INSERT INTO price_history (
      productId, date, price, subTypeName, productName, groupName, 
      source, lowPrice, highPrice, marketPrice, volume, uniqueIdentifier
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(productId, date, subTypeName, source) DO UPDATE SET
      price = excluded.price,
      lowPrice = excluded.lowPrice,
      highPrice = excluded.highPrice,
      marketPrice = excluded.marketPrice,
      productName = excluded.productName,
      groupName = excluded.groupName,
      uniqueIdentifier = excluded.uniqueIdentifier;
  `;
  const stmt = db.prepare(insertSql);

  // Create a map of productId to product name for quick lookup
  const productMap = new Map(products.map(p => [p.productId, p.name]));

  return new Promise<void>((resolve, reject) => {
    db.serialize(() => {
      db.run('BEGIN TRANSACTION');
      
      for (const price of prices) {
        if (price.marketPrice && price.marketPrice > 0) {
          const productName = productMap.get(price.productId) || '';
          
          // Extract card details from product name for better identification
          const cardDetails = extractCardDetails(productName, groupName);
          const uniqueIdentifier = generateUniqueIdentifier(
            cardDetails.setId, 
            cardDetails.cardNumber, 
            cardDetails.cardName
          );
          
          // Store card mapping if we have enough information
          if (cardDetails.cardName && cardDetails.setId) {
            storeCardMapping({
              cardId: `tcgcsv-${price.productId}`,
              productId: price.productId,
              cardName: cardDetails.cardName,
              setId: cardDetails.setId,
              setName: groupName,
              cardNumber: cardDetails.cardNumber,
              tcgplayerProductId: price.productId.toString()
            }).catch(err => console.warn('Error storing card mapping:', err));
          }
          
          stmt.run([
            price.productId, 
            date, 
            price.marketPrice, // Use marketPrice as primary price
            price.subTypeName || 'Normal',
            productName,
            groupName,
            'tcgcsv',
            price.lowPrice || null,
            price.highPrice || null,
            price.marketPrice || null,
            null, // volume not available from TCGCSV
            uniqueIdentifier
          ]);
        }
      }
      
      db.run('COMMIT', (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  });
};

/**
 * Extracts card details from TCGCSV product name
 */
const extractCardDetails = (productName: string, setName: string) => {
  // Common patterns in TCGCSV product names:
  // "Charizard ex (003/165)" 
  // "Pikachu - 25/102 - Common"
  // "Rayquaza VMAX (111/203) [Evolving Skies]"
  
  let cardName = productName;
  let cardNumber = '';
  let setId = setName.toLowerCase().replace(/[^a-z0-9]/g, '');
  
  // Extract card number from parentheses or after dash
  const numberMatches = productName.match(/\((\d+\/\d+)\)/) || productName.match(/(\d+\/\d+)/);
  if (numberMatches) {
    cardNumber = numberMatches[1];
    cardName = productName.replace(/\s*\([^)]*\)/, '').replace(/\s*-\s*\d+\/\d+.*$/, '').trim();
  }
  
  // Clean up card name
  cardName = cardName.replace(/\s*-\s*(Common|Uncommon|Rare|Ultra Rare|Secret Rare).*$/i, '').trim();
  
  return {
    cardName,
    cardNumber,
    setId
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
    
    // Process groups in batches to avoid overwhelming the API
    for (let i = 0; i < groups.length; i += 5) {
      const batch = groups.slice(i, i + 5);
      
      await Promise.all(batch.map(async (group) => {
        try {
          console.log(`Processing group: ${group.name} (${group.groupId})`);
          
          // Fetch both products and prices for this group
          const [products, prices] = await Promise.all([
            fetchGroupProducts(group.groupId),
            fetchGroupPrices(group.groupId)
          ]);
          
          if (prices.length > 0) {
            await storePriceData(prices, products, group.name, currentDate);
            totalPricesProcessed += prices.length;
            console.log(`Stored ${prices.length} prices for ${group.name}`);
          }
          
          // Small delay to be respectful to the API
          await new Promise(resolve => setTimeout(resolve, 100));
        } catch (error) {
          console.error(`Error processing group ${group.name}:`, error);
        }
      }));
      
      // Longer delay between batches
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    // Create daily snapshot for analytics
    console.log('Creating daily market snapshot...');
    await createDailySnapshot(currentDate);
    
    console.log(`
      Price data update completed:
      - TCGCSV prices: ${totalPricesProcessed}
      - Daily snapshot created
    `);
  } catch (error) {
    console.error('Failed to update price data:', error);
  }
};
