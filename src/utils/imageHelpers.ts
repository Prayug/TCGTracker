// Image fetching and placeholder utilities
export const createPlaceholderImage = (name: string, setName: string) => {
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

export const hasGoodStoredImages = (imageSource?: string, largeUrl?: string): boolean => {
  const isTrustedSource = imageSource && ['pokemon_api', 'manual', 'manual_mcdonalds_2014', 'stored'].includes(imageSource);
  const looksLikeGenericBack = /\/back\//i.test(largeUrl || '') || /cardback/i.test(largeUrl || '') || /\/back\./i.test(largeUrl || '');
  
  return !!(
    isTrustedSource &&
    largeUrl &&
    !largeUrl.includes('placeholder') &&
    !looksLikeGenericBack
  );
};

export const fetchCardImagesFromBackend = async (
  cardName: string,
  setId: string,
  cardNumber?: string,
  timeout: number = 8000
): Promise<{ images?: { small: string; large: string }; id?: string; rarity?: string } | null> => {
  const backendBase = window.location.origin.replace(':5173', ':3001');
  const searchUrl = new URL(`${backendBase}/api/cards/search-pokemon`);
  searchUrl.searchParams.append('cardName', cardName);
  searchUrl.searchParams.append('setId', setId);
  if (cardNumber) {
    searchUrl.searchParams.append('cardNumber', cardNumber);
  }
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  try {
    const response = await fetch(searchUrl.toString(), {
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    
    if (response.ok) {
      const result = await response.json();
      if (result.images?.large && result.images?.small) {
        return {
          images: result.images,
          id: result.id,
          rarity: result.rarity
        };
      }
    } else if (response.status === 404) {
      // Try name-only search as fallback
      return await fetchCardImagesByNameOnly(cardName, cardNumber, timeout);
    }
  } catch (error) {
    clearTimeout(timeoutId);
    if ((error as Error).name !== 'AbortError') {
      console.warn(`⚠️ Error loading images for ${cardName}:`, error);
    }
  }
  
  return null;
};

const fetchCardImagesByNameOnly = async (
  cardName: string,
  cardNumber?: string,
  timeout: number = 5000
): Promise<{ images?: { small: string; large: string }; id?: string; rarity?: string } | null> => {
  const backendBase = window.location.origin.replace(':5173', ':3001');
  const nameOnlyUrl = new URL(`${backendBase}/api/cards/search-pokemon`);
  nameOnlyUrl.searchParams.append('cardName', cardName);
  if (cardNumber) {
    nameOnlyUrl.searchParams.append('cardNumber', cardNumber);
  }
  
  try {
    const nameController = new AbortController();
    const nameTimeout = setTimeout(() => nameController.abort(), timeout);
    
    const nameResponse = await fetch(nameOnlyUrl.toString(), {
      signal: nameController.signal
    });
    clearTimeout(nameTimeout);
    
    if (nameResponse.ok) {
      const nameResult = await nameResponse.json();
      if (nameResult.images?.large && nameResult.images?.small) {
        return {
          images: nameResult.images,
          id: nameResult.id,
          rarity: nameResult.rarity
        };
      }
    }
  } catch (error) {
    // Silently fail - this is a fallback
  }
  
  return null;
};

