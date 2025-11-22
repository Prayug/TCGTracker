import { Pack, PackPull, PokemonCard, PackOpeningHistory, ValueRange } from '../types/pokemon';
import { pokemonApi } from './pokemonApi';

const PACK_HISTORY_KEY = 'tcg_tiered_pack_history';

class TieredPackService {
  // No caching - always fetch fresh from DB

  // Define tiered packs with GameStop-style odds
  private tieredPacks: Pack[] = [
    {
      id: 'starter-25',
      name: 'Starter Pack',
      tier: 'starter',
      price: 25,
      averageValue: 25,
      cardsPerPack: 1,
      description: 'Perfect for beginners',
      imageUrl: 'https://images.pokemontcg.io/base1/logo.png',
      valueRanges: [
        { min: 12, max: 19, probability: 40.6, label: '$12-19' },
        { min: 19, max: 25, probability: 30.6, label: '$19-25' },
        { min: 25, max: 50, probability: 25.4, label: '$25-50' },
        { min: 50, max: 100, probability: 3, label: '$50-100' },
        { min: 100, max: 250, probability: 0.3, label: '$100-250' },
        { min: 250, max: 500, probability: 0.1, label: '$250-500' }
      ]
    },
    {
      id: 'bronze-50',
      name: 'Bronze Pack',
      tier: 'bronze',
      price: 50,
      averageValue: 50,
      cardsPerPack: 1,
      description: 'Step up your collection',
      imageUrl: 'https://images.pokemontcg.io/base1/logo.png',
      valueRanges: [
        { min: 25, max: 38, probability: 40, label: '$25-38' },
        { min: 38, max: 50, probability: 30, label: '$38-50' },
        { min: 50, max: 100, probability: 25, label: '$50-100' },
        { min: 100, max: 200, probability: 4, label: '$100-200' },
        { min: 200, max: 500, probability: 0.8, label: '$200-500' },
        { min: 500, max: 1000, probability: 0.2, label: '$500-1000' }
      ]
    },
    {
      id: 'silver-100',
      name: 'Silver Pack',
      tier: 'silver',
      price: 100,
      averageValue: 100,
      cardsPerPack: 1,
      description: 'Premium cards await',
      imageUrl: 'https://images.pokemontcg.io/base1/logo.png',
      valueRanges: [
        { min: 50, max: 75, probability: 38, label: '$50-75' },
        { min: 75, max: 100, probability: 32, label: '$75-100' },
        { min: 100, max: 200, probability: 25, label: '$100-200' },
        { min: 200, max: 400, probability: 4, label: '$200-400' },
        { min: 400, max: 1000, probability: 0.8, label: '$400-1000' },
        { min: 1000, max: 2000, probability: 0.2, label: '$1000-2000' }
      ]
    },
    {
      id: 'gold-500',
      name: 'Gold Pack',
      tier: 'gold',
      price: 500,
      averageValue: 500,
      cardsPerPack: 1,
      description: 'High-value pulls',
      imageUrl: 'https://images.pokemontcg.io/base1/logo.png',
      valueRanges: [
        { min: 250, max: 375, probability: 35, label: '$250-375' },
        { min: 375, max: 500, probability: 35, label: '$375-500' },
        { min: 500, max: 1000, probability: 25, label: '$500-1000' },
        { min: 1000, max: 2000, probability: 4, label: '$1000-2000' },
        { min: 2000, max: 5000, probability: 0.8, label: '$2000-5000' },
        { min: 5000, max: 10000, probability: 0.2, label: '$5000-10000' }
      ]
    },
    {
      id: 'platinum-1000',
      name: 'Platinum Pack',
      tier: 'platinum',
      price: 1000,
      averageValue: 1000,
      cardsPerPack: 1,
      description: 'Ultimate gambling experience',
      imageUrl: 'https://images.pokemontcg.io/base1/logo.png',
      valueRanges: [
        { min: 500, max: 750, probability: 35, label: '$500-750' },
        { min: 750, max: 1000, probability: 35, label: '$750-1000' },
        { min: 1000, max: 2000, probability: 25, label: '$1000-2000' },
        { min: 2000, max: 5000, probability: 4, label: '$2000-5000' },
        { min: 5000, max: 10000, probability: 0.8, label: '$5000-10000' },
        { min: 10000, max: 20000, probability: 0.2, label: '$10000-20000' }
      ]
    }
  ];

  // Get all available tiered packs
  getAvailablePacks(): Pack[] {
    return this.tieredPacks;
  }

  // Open a tiered pack
  async openPack(pack: Pack): Promise<PackPull> {
    console.log(`🎴 Opening ${pack.name} ($${pack.price})...`);

    try {
      // Fetch a large pool of cards to select from
      const cardPool = await this.fetchCardPool();
      
      if (cardPool.length === 0) {
        throw new Error('Unable to fetch cards from Pokemon TCG API. Please check your internet connection and try again.');
      }

      console.log(`✅ Card pool ready: ${cardPool.length} cards available`);
      
      if (cardPool.length < 10) {
        console.warn(`⚠️ Card pool is small (${cardPool.length} cards). Pack quality may vary.`);
      }

      // Select ONE card based on the rolled value range
      const selectedCard = this.selectCardFromRange(cardPool, pack.valueRanges);
      
      console.log('LOOK HERE: ', selectedCard);
      
      if (!selectedCard) {
        throw new Error('No suitable card found in the pool for this value range.');
      }

      // If selected from local DB pool, enrich with actual images from Pokemon API (no fallback)
      // Narrow type to local DB enriched shape when present
      const maybeLocal = selectedCard as PokemonCard & { isLocalDbCard?: boolean; imageSource?: string };
      if (maybeLocal.isLocalDbCard) {
        const cardName = selectedCard.name;
        const setId = selectedCard.set?.id;
        const cardNumber = selectedCard.number;
        
        if (!cardName || !setId) {
          throw new Error('Missing card name or set ID for image lookup');
        }
        
        // CHECK IF WE ALREADY HAVE REAL STORED IMAGES
        // Only trust images we KNOW came from Pokemon API or manual curation.
        // Do NOT trust generic "stored"/"tcgplayer" images, since many of those are card backs.
        const imageSource = maybeLocal.imageSource;
        const isTrustedSource = imageSource && ['pokemon_api', 'manual', 'manual_mcdonalds_2014'].includes(imageSource);
        const largeUrl = selectedCard.images?.large || '';
        const looksLikeGenericBack = /\/back\//i.test(largeUrl) || /cardback/i.test(largeUrl) || /\/back\./i.test(largeUrl);
        
        const hasGoodStoredImages =
          isTrustedSource &&
          !!largeUrl &&
          !largeUrl.includes('placeholder') &&
          !looksLikeGenericBack;

        if (hasGoodStoredImages) {
          console.log(`✅ Using pre-stored image for ${cardName} (source: ${maybeLocal.imageSource})`);
          // Image is already good - no need to fetch
        } else {
          // Only fetch from API if we don't have *good* stored images
        
        // Helper function to create a placeholder image using URL encoding (more reliable than base64)
        const createPlaceholder = (name: string, setName: string) => {
          // Escape special characters for SVG
          const escapeName = name.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
          const escapeSet = setName.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
          
          // Create SVG with proper formatting
          const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="245" height="342" viewBox="0 0 245 342">
  <rect width="245" height="342" fill="#e5e7eb" rx="12"/>
  <text x="122.5" y="140" font-family="Arial,sans-serif" font-size="16" fill="#374151" text-anchor="middle" dominant-baseline="middle">${escapeName}</text>
  <text x="122.5" y="170" font-family="Arial,sans-serif" font-size="12" fill="#6b7280" text-anchor="middle" dominant-baseline="middle">${escapeSet}</text>
  <text x="122.5" y="200" font-family="Arial,sans-serif" font-size="10" fill="#9ca3af" text-anchor="middle" dominant-baseline="middle">Card Image Unavailable</text>
</svg>`;
          
          // Use URL encoding instead of base64 (more reliable)
          const encoded = encodeURIComponent(svg)
            .replace(/'/g, '%27')
            .replace(/\(/g, '%28')
            .replace(/\)/g, '%29');
          
          const placeholder = `data:image/svg+xml,${encoded}`;
          return { small: placeholder, large: placeholder };
        };
        
        // Search via backend proxy to avoid CORS (with 15s timeout)
        console.log(`🔍 Searching Pokemon API via backend for: "${cardName}" in set "${setId}"`);
        const backendBase = window.location.origin.replace(':5173', ':3001');
        const searchUrl = new URL(`${backendBase}/api/cards/search-pokemon`);
        searchUrl.searchParams.append('cardName', cardName);
        searchUrl.searchParams.append('setId', setId);
        if (cardNumber) {
          searchUrl.searchParams.append('cardNumber', cardNumber);
        }
        
        // Add timeout to prevent forever-waiting (reduced to 8s since backend is now parallel)
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000); // 8 second timeout
        
        let response;
        let imagesFetched = false;
        
        try {
          response = await fetch(searchUrl.toString(), {
            signal: controller.signal
          });
          clearTimeout(timeoutId);
          
          if (response.ok) {
            const result = await response.json();
            
            if (result.images?.large && result.images?.small) {
              console.log(`✅ Successfully loaded images for ${cardName} with set ID`);
              
              // Replace images with actual ones from API
              selectedCard.images = result.images;
              // Also update the card ID to the real Pokemon API ID
              selectedCard.id = result.id;
              imagesFetched = true;
            } else {
              console.warn(`⚠️ Card found but missing images for "${cardName}"`);
            }
          } else if (response.status === 404) {
            // Set doesn't exist - try searching by NAME ONLY as fallback
            console.log(`🔍 Set "${setId}" not in Pokemon API - trying name-only search across all sets`);
            
            const nameOnlyUrl = new URL(`${backendBase}/api/cards/search-pokemon`);
            nameOnlyUrl.searchParams.append('cardName', cardName);
            // Include card number for better matching if available
            if (cardNumber) {
              nameOnlyUrl.searchParams.append('cardNumber', cardNumber);
            }
            // Don't include setId - search across ALL sets
            
            try {
              const nameController = new AbortController();
              const nameTimeout = setTimeout(() => nameController.abort(), 5000);
              
              const nameResponse = await fetch(nameOnlyUrl.toString(), {
                signal: nameController.signal
              });
              clearTimeout(nameTimeout);
              
              if (nameResponse.ok) {
                const nameResult = await nameResponse.json();
                if (nameResult.images?.large && nameResult.images?.small) {
                  console.log(`✅ Found ${cardName} by name-only search! Set: ${nameResult.matchedSet || 'unknown'}, #${nameResult.matchedNumber || 'unknown'}`);
                  selectedCard.images = nameResult.images;
                  selectedCard.id = nameResult.id;
                  imagesFetched = true;
                } else {
                  console.warn(`⚠️ Name-only search returned card but no images for ${cardName}`);
                }
              } else {
                console.warn(`⚠️ Name-only search failed with status ${nameResponse.status}`);
              }
            } catch (fallbackError) {
              console.warn(`⚠️ Name-only search error for ${cardName}:`, fallbackError);
            }
          } else {
            console.warn(`⚠️ Failed to load images (${response.status})`);
          }
        } catch (error) {
          clearTimeout(timeoutId);
          if ((error as Error).name === 'AbortError') {
            console.warn(`⏱️ Image search timed out for ${cardName}`);
          } else {
            console.warn(`⚠️ Error loading images for ${cardName}:`, error);
          }
        }
        
        // If we didn't successfully fetch images, try deterministic URLs
        if (!imagesFetched) {
          // Try to construct deterministic Pokemon TCG image URLs
          // Format: https://images.pokemontcg.io/{setId}/{cardNumber}.png
          const setIdNormalized = this.normalizeSetIdForImageUrl(setId);
          const cardNumberNormalized = cardNumber ? cardNumber.split('/')[0].trim() : '';

          if (setIdNormalized && cardNumberNormalized) {
            // Use .png for both small and large (no _hires.png as it shows card backs)
            const deterministicSmall = `https://images.pokemontcg.io/${setIdNormalized}/${cardNumberNormalized}.png`;
            const deterministicLarge = `https://images.pokemontcg.io/${setIdNormalized}/${cardNumberNormalized}.png`;

            console.log(`🔗 Trying deterministic image URL: ${deterministicSmall}`);
            selectedCard.images = {
              small: deterministicSmall,
              large: deterministicLarge
            };
            // The onError handlers in the components will show placeholder if these fail
          } else {
            // Last resort: use placeholder
            const placeholderImages = createPlaceholder(cardName, selectedCard.set.name);
            selectedCard.images = placeholderImages;
            console.log(`🖼️ Using placeholder image for ${cardName}`);
          }
        } else {
          console.log(`✅ Real images loaded for ${cardName}`);
          console.log(`📸 Image URL: ${selectedCard.images.large}`);
        }
        }
      }

      const pulledCards = [selectedCard];

      // Calculate actual total value
      const totalValue = pulledCards.reduce((sum, card) => {
        const price = card.marketPrice || pokemonApi.extractCardPrice(card);
        return sum + price;
      }, 0);

      const profit = totalValue - pack.price;

      const packPull: PackPull = {
        pack,
        cards: pulledCards,
        totalValue,
        profit,
        openedAt: new Date().toISOString()
      };

      // Save to history
      this.addToHistory(packPull);

      console.log(`✅ Pulled ${pulledCards.length} cards! Total value: $${totalValue.toFixed(2)}`);
      console.log(`💰 Profit: ${profit >= 0 ? '+' : ''}$${profit.toFixed(2)}`);

      return packPull;
    } catch (error) {
      console.error('Error opening pack:', error);
      throw error;
    }
  }

  // Select which VALUE RANGE bracket based on probabilities
  private selectValueRange(ranges: ValueRange[]): ValueRange {
    const rand = Math.random() * 100;
    let cumulative = 0;

    for (const range of ranges) {
      cumulative += range.probability;
      if (rand <= cumulative) {
        return range;
      }
    }

    // Fallback to first range
    return ranges[0];
  }

  // Fetch a large pool of cards from various sets
  private async fetchCardPool(): Promise<PokemonCard[]> {
    console.log('🔍 Fetching fresh card pool from local DB (backend)...');
    
    // Always fetch fresh from DB - no caching
    // Fetch very large pool (2000 cards) to ensure coverage across all price ranges
    const backendBase = window.location.origin.replace(':5173', ':3001');
    const resp = await fetch(`${backendBase}/api/cards/pool?limit=2000`);
    
    if (!resp.ok) {
      throw new Error(`Failed to fetch card pool: ${resp.status} ${resp.statusText}`);
    }
    
    const json = await resp.json();
    const allCards = json.data || [];
    
    if (allCards.length === 0) {
      throw new Error('No cards returned from database');
    }
    
    console.log(`📦 Successfully fetched ${allCards.length} cards from local DB`);
    
    // Filter out cards with no price
    const cardsWithPrices = allCards.filter((card: PokemonCard) => {
      const price = card.marketPrice || pokemonApi.extractCardPrice(card);
      return price > 0 && price < 10000; // Filter out invalid prices
    });

    console.log(`💰 ${cardsWithPrices.length} cards have valid prices`);
    
    if (cardsWithPrices.length === 0) {
      throw new Error('No cards with valid prices found');
    }

    // Shuffle for variety
    return this.shuffleArray([...cardsWithPrices]);
  }

  // Shuffle array for randomness
  private shuffleArray<T>(array: T[]): T[] {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  // Select a random card from the pool based on rolled value range
  private selectCardFromRange(
    cardPool: PokemonCard[],
    ranges: ValueRange[]
  ): PokemonCard | null {
    // First, roll to see which VALUE RANGE we hit
    const rolledRange = this.selectValueRange(ranges);
    
    console.log(`🎲 Rolled: ${rolledRange.label} (${rolledRange.probability}% chance)`);
    console.log(`🎯 Looking for cards between $${rolledRange.min.toFixed(2)} and $${rolledRange.max.toFixed(2)}`);

    // Filter cards to ONLY this specific range
    let candidates = cardPool.filter(card => {
      const price = card.marketPrice || pokemonApi.extractCardPrice(card);
      return price >= rolledRange.min && price <= rolledRange.max;
    });

    console.log('LOOK HERE for candidates: ', candidates);

    console.log(`📋 Found ${candidates.length} cards in this range`);

    // Fallback logic if no cards in exact range
    if (candidates.length === 0) {
      console.warn(`⚠️ No cards in exact range $${rolledRange.min}-${rolledRange.max}. Trying fallback...`);
      
      // Strategy 1: Try broader range (expand by 20%)
      const expandedMin = rolledRange.min * 0.8;
      const expandedMax = rolledRange.max * 1.2;
      candidates = cardPool.filter(card => {
        const price = card.marketPrice || pokemonApi.extractCardPrice(card);
        return price >= expandedMin && price <= expandedMax;
      });
      
      if (candidates.length > 0) {
        console.log(`✅ Found ${candidates.length} cards in expanded range $${expandedMin.toFixed(2)}-${expandedMax.toFixed(2)}`);
      } else {
        // Strategy 2: Find closest card below the range
        const lowerCards = cardPool.filter(card => {
          const price = card.marketPrice || pokemonApi.extractCardPrice(card);
          return price < rolledRange.min && price > 0;
        });
        
        if (lowerCards.length > 0) {
          // Get the most expensive card below the range
          lowerCards.sort((a, b) => {
            const priceA = a.marketPrice || pokemonApi.extractCardPrice(a);
            const priceB = b.marketPrice || pokemonApi.extractCardPrice(b);
            return priceB - priceA;
          });
          candidates = [lowerCards[0]];
          console.log(`✅ Using closest card below range: $${(candidates[0].marketPrice || pokemonApi.extractCardPrice(candidates[0])).toFixed(2)}`);
        } else {
          // Strategy 3: Find closest card above the range
          const higherCards = cardPool.filter(card => {
            const price = card.marketPrice || pokemonApi.extractCardPrice(card);
            return price > rolledRange.max;
          });
          
          if (higherCards.length > 0) {
            // Get the cheapest card above the range
            higherCards.sort((a, b) => {
              const priceA = a.marketPrice || pokemonApi.extractCardPrice(a);
              const priceB = b.marketPrice || pokemonApi.extractCardPrice(b);
              return priceA - priceB;
            });
            candidates = [higherCards[0]];
            console.log(`✅ Using closest card above range: $${(candidates[0].marketPrice || pokemonApi.extractCardPrice(candidates[0])).toFixed(2)}`);
          } else {
            // Strategy 4: Last resort - pick random card from pool
            console.warn(`⚠️ No suitable cards found, using random card from pool`);
            candidates = [cardPool[Math.floor(Math.random() * cardPool.length)]];
          }
        }
      }
    }

    if (candidates.length === 0) {
      console.error('❌ No cards available in pool at all');
      return null;
    }

    // Shuffle candidates array to ensure pure randomness
    const shuffledCandidates = this.shuffleArray(candidates);

    // Pick a truly random card from the shuffled candidates
    // Use crypto.getRandomValues for better randomness if available, otherwise Math.random
    const randomIndex = typeof crypto !== 'undefined' && crypto.getRandomValues
      ? crypto.getRandomValues(new Uint32Array(1))[0] % shuffledCandidates.length
      : Math.floor(Math.random() * shuffledCandidates.length);
    
    const selectedCard = shuffledCandidates[randomIndex];
    const selectedPrice = selectedCard.marketPrice || pokemonApi.extractCardPrice(selectedCard);
    console.log(`✅ Selected: ${selectedCard.name} - $${selectedPrice.toFixed(2)}`);
    
    return selectedCard;
  }

  // Get pack opening history
  getHistory(): PackOpeningHistory {
    try {
      const stored = localStorage.getItem(PACK_HISTORY_KEY);
      if (!stored) {
        return {
          pulls: [],
          totalSpent: 0,
          totalValue: 0,
          totalProfit: 0,
          packsOpened: 0
        };
      }

      const pulls: PackPull[] = JSON.parse(stored);
      const totalSpent = pulls.reduce((sum, pull) => sum + pull.pack.price, 0);
      const totalValue = pulls.reduce((sum, pull) => sum + pull.totalValue, 0);
      const totalProfit = totalValue - totalSpent;

      return {
        pulls,
        totalSpent,
        totalValue,
        totalProfit,
        packsOpened: pulls.length
      };
    } catch (error) {
      console.error('Error loading pack history:', error);
      return {
        pulls: [],
        totalSpent: 0,
        totalValue: 0,
        totalProfit: 0,
        packsOpened: 0
      };
    }
  }

  // Add pack pull to history
  private addToHistory(packPull: PackPull): void {
    try {
      const history = this.getHistory();
      history.pulls.unshift(packPull);
      
      // Keep only last 100 pulls
      if (history.pulls.length > 100) {
        history.pulls = history.pulls.slice(0, 100);
      }

      localStorage.setItem(PACK_HISTORY_KEY, JSON.stringify(history.pulls));
    } catch (error) {
      console.error('Error saving pack history:', error);
    }
  }

  // Clear history
  clearHistory(): void {
    localStorage.removeItem(PACK_HISTORY_KEY);
    console.log('🗑️ Pack opening history cleared');
  }

  // Clear card pool cache (no-op since we don't cache anymore)
  clearCache(): void {
    console.log('🔄 Cache clear requested (no cache in use)');
  }

  /**
   * Get the correct Pokemon TCG API set code for image URLs
   * Maps database set IDs to their proper API set codes
   */
  private normalizeSetIdForImageUrl(setId: string): string {
    const normalized = setId.toLowerCase();

    // Comprehensive mapping from database set IDs to Pokemon TCG API set codes
    const setMappings: Record<string, string> = {
      // Mega Evolution sets
      'me01megaevolution': 'me1',
      'me02phantasmalflames': 'me2',
      
      // Scarlet & Violet (SV) sets
      'sv01scarletvioletbaseset': 'sv1',
      'sv02paldeaevolved': 'sv2',
      'sv03obsidianflames': 'sv3',
      'sv04paradoxrift': 'sv4',
      'sv05temporalforces': 'sv5',
      'sv06twilightmasquerade': 'sv6',
      'sv07stellarcrown': 'sv7',
      'sv08surgingsparks': 'sv8',
      'sv09journeytogether': 'sv9',
      'sv10destinedrivals': 'sv10',

      // SV Special sets
      'svblackbolt': 'zsv10pt5',
      'svwhiteflare': 'rsv10pt5',
      'svpaldeanfates': 'sv4pt5',
      'svprismaticevolutions': 'sv8pt5',
      'svscarletviolet151': 'sv3pt5',
      'svscarletvioletbaseset': 'sv1', // Alternative name
      'svescarletvioletenergies': 'sve',
      'svshroudedfable': 'sv6pt5',

      // Sword & Shield (SWSH) sets
      'swsh01swordshieldbaseset': 'swsh1',
      'swsh02rebelclash': 'swsh2',
      'swsh03darknessablaze': 'swsh3',
      'swsh04vividvoltage': 'swsh4',
      'swsh05battlestyles': 'swsh5',
      'swsh06chillingreign': 'swsh6',
      'swsh07evolvingskies': 'swsh7',
      'swsh08fusionstrike': 'swsh8',
      'swsh09brilliantstars': 'swsh9',
      'swsh09brilliantstarstrainergallery': 'swsh9tg',
      'swsh10astralradiance': 'swsh10',
      'swsh10astralradiancetrainergallery': 'swsh10tg',
      'swsh11lostorigin': 'swsh11',
      'swsh11lostorigintrainergallery': 'swsh11tg',
      'swsh12silvertempest': 'swsh12',

      // Sun & Moon (SM) sets
      'smbaseset': 'sm1',
      'smguardiansrising': 'sm2',
      'smburningshadows': 'sm3',
      'smcrimsoninvasion': 'sm4',
      'smultrasonicunleashed': 'sm5',
      'smforbiddenlight': 'sm6',
      'smcelestialstorm': 'sm7',
      'smlostthunder': 'sm8',
      'smteamup': 'sm9',
      'smcosmiceclipse': 'sm10',
      'smunifiedminds': 'sm11',
      'smtrainerkitalolansandslashalolanninetales': 'smkit1',
      'smtrainerkitlycanrocalolanmuk': 'smkit2',

      // XY sets
      'xykalosstarterset': 'xy0',
      'xybreakthrough': 'xy8',
      'xybreakpoint': 'xy9',
      'xyfatescollide': 'xy10',
      'xysteamsiege': 'xy11',
      'xyevolutions': 'xy12',

      // Black & White (BW) sets
      'blackandwhite': 'bw1',
      'bwemergingpowers': 'bw2',
      'bwnoblevictories': 'bw3',
      'bwnextdestinies': 'bw4',
      'bwdarkexplorers': 'bw5',
      'bwdragonsvault': 'bw6',
      'bwboundariescrossed': 'bw7',
      'bwplasmablast': 'bw8',
      'bwplasmastorm': 'bw9',
      'bwtrainerkitbisharpwigglytuff': 'bwkt1',
      'bwtrainerkitexcadrillzoroark': 'bwkt2',

      // Base sets and older
      'baseset': 'base1',
      'basesetshadowless': 'basep',
      'baseset2': 'base2',
      'basejungle': 'base3',
      'basefossil': 'base4',
      'base1stedition': 'base1-1stedition',

      // Promo sets with proper era differentiation
      'svscarletvioletpromocards': 'svp',
      'svpromos': 'svp',
      'smpromos': 'smp',
      'swshpromos': 'swshp',
      'xypromos': 'xyp',
      'bwpromos': 'bwp',
      'basepromos': 'bp',
      'blackandwhitepromos': 'bwp',
      'nintendopromos': 'np',
      'alternateartpromos': 'svap',
      'bestofpromos': 'svbp',
      'pikachuworldcollectionpromos': 'pwc',
      'countdowncalendarpromos': 'cdp',
      'burgerkingpromos': 'bkp',
      'professorprogrampromos': 'ppp',
      'memegaevolutionpromo': 'smp', // SM era

      // McDonald's Promos - differentiated by year
      'mcdonaldspromos2024': 'mcd24',
      'mcdonaldspromos2023': 'mcd23',
      'mcdonaldspromos2022': 'mcd22',
      'mcdonaldspromos2021': 'mcd21',
      'mcdonaldspromos2020': 'mcd20',
      'mcdonaldspromos2019': 'mcd19',
      'mcdonaldspromos2018': 'mcd18',
      'mcdonaldspromos2017': 'mcd17',
      'mcdonaldspromos2016': 'mcd16',
      'mcdonaldspromos2015': 'mcd15',
      'mcdonaldspromos2014': 'mcd14',
      'mcdonaldspromos2013': 'mcd13',
      'mcdonaldspromos2012': 'mcd12',
      'mcdonaldspromos2011': 'mcd11',
      'mcdonaldspromos2010': 'mcd10',
      'mcdonaldspromos2009': 'mcd09',
      'mcdonaldspromos2008': 'mcd08',
      'mcdonaldspromos2007': 'mcd07',
      'mcdonaldspromos2006': 'mcd06',
      'mcdonaldspromos2005': 'mcd05',
      'mcdonaldspromos2004': 'mcd04',
      'mcdonaldspromos2003': 'mcd03',
      'mcdonaldspromos2002': 'mcd02',
      'mcdonaldspromos2001': 'mcd01',
      'mcdonaldspromos2000': 'mcd00',

      // Special collections and other sets
      'aquapolis': 'ecard1',
      'skyridge': 'ecard2',
      'exrubyandsapphire': 'ex1',
      'exsandstorm': 'ex2',
      'exdragon': 'ex3',
      'exteamrocketreturns': 'ex4',
      'exdeoxys': 'ex5',
      'excityoflegends': 'ex6',
      'expowerkeepers': 'ex7',
      'arceus': 'pl1',
      'suprememajestic': 'pl2',
      'risingrivals': 'pl3',
      'arceusmajesticdawn': 'pl4',
      'calloflegends': 'col1',
      'triumphant': 'hgss1',
      'unleashed': 'hgss2',
      'undefeated': 'hgss3',
      'triumphantarceus': 'hgss4',
      'celebrations': 'cel25',
      'celebrationsclassiccollection': 'cel25c',
      'battleacademy': 'bap1',
      'battleacademy2022': 'bap2',
      'battleacademy2024': 'bap3',
      'trainerkitnoctowl': 'tk1a',
      'trainerkitpikachu': 'tk2a',
      'ashvsteamrocketdeckkitjpexclusive': 'tk-rocket',
      'blisterexclusives': 'blisex',
      'leaguechampionshipcards': 'lc',
      'worldchampionshipdecks': 'wc',
      'trickortradebooosterbundle2024': 'tto24',
      'pokemongocards': 'pgo',
    };

    if (setMappings[normalized]) {
      return setMappings[normalized];
    }

    // Extract pattern for sets that follow standard numbering
    // Examples: sv06, swsh11, sm3, xy9, bw10
    const patterns = [
      /(sv|swsh|sm|xy|bw)(\d+)/,  // Standard format
      /(zsv)(\d+)(pt\d+)/,        // Special format like zsv10pt5
    ];

    for (const pattern of patterns) {
      const match = normalized.match(pattern);
      if (match) {
        if (match.length === 3) {
          // Standard format: sv06, swsh11, etc. - remove leading zeros
          const series = match[1];
          const number = parseInt(match[2], 10).toString(); // Remove leading zeros
          return `${series}${number}`;
        } else if (match.length === 4) {
          // Special format: zsv10pt5
          return `${match[1]}${match[2]}${match[3]}`;
        }
      }
    }

    // Fallback: try to extract any alphanumeric sequence that looks like a set code
    const fallbackMatch = normalized.match(/([a-z]+\d+)(?:[a-z]+\d+)*/);
    if (fallbackMatch) {
      return fallbackMatch[1];
    }

    // Last resort: return the original but cleaned
    return normalized.replace(/[^a-z0-9]/g, '');
  }
}

export const tieredPackService = new TieredPackService();

