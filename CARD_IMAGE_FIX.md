# Card Image Display Fix

## Problem
Card images were not displaying when pulled from packs, showing 404 errors in the console for Pokemon TCG API image URLs.

## Root Cause
1. Cards fetched from the local database initially had placeholder SVG images
2. The frontend attempted to enrich these with real images from the Pokemon TCG API
3. When the API fetch failed or timed out, the code logged "using placeholder" but didn't actually update the image URLs
4. The broken/missing image URLs remained, causing 404 errors

## Solution Implemented

### 1. Frontend Pack Service (`tieredPackService.ts`)
- Added a `createPlaceholder()` helper function that generates SVG placeholder images
- Added an `imagesFetched` flag to track whether images were successfully loaded
- When image enrichment fails (timeout, 404, or error), the card images are now explicitly set to the placeholder SVG
- This ensures cards always have displayable images, even when the Pokemon API is unavailable

### 2. Image Error Handling in Components
Added `onError` handlers to all card image elements across the application:

#### Updated Components:
- **PackOpeningModal.tsx** - Pack opening display (both reveal and results views)
- **PokemonCard.tsx** - Card grid display
- **VaultCard.tsx** - Vault collection display
- **CardModal.tsx** - Card detail modal
- **InvestmentModal.tsx** - Investment analysis modal
- **AddToVaultModal.tsx** - Add to vault modal
- **FeaturedCards.tsx** - Featured cards display
- **PriceTrackingDashboard.tsx** - Price tracking dashboard (4 instances)

#### Error Handling Logic:
- If `large` image fails to load, fallback to `small` image
- If `small` image fails to load, fallback to `large` image
- If both fail and URL isn't already a data URI, generate an inline SVG placeholder

### 3. Placeholder Image Design
The placeholder SVG shows:
- Card name (centered)
- Set name (below card name)
- "Pokemon Card" text
- Clean gray gradient background
- Proper aspect ratio (245x342, matching Pokemon card dimensions)

## Benefits
1. **Robust Image Loading**: Cards always display something, even when external APIs fail
2. **Better User Experience**: No broken images or 404 errors visible to users
3. **Graceful Degradation**: System works offline or with limited API access
4. **Comprehensive Coverage**: All card display components now handle image errors

## Testing
To test the fix:
1. Open a pack from the Pack Shop
2. Verify that the card image displays (either real image or placeholder)
3. Check browser console - should see no 404 errors for images
4. Test with network throttling or offline mode to verify placeholders work

## Files Modified
- `src/services/tieredPackService.ts` - Main pack opening logic with image enrichment
- `src/components/PackOpeningModal.tsx` - Pack opening modal
- `src/components/PokemonCard.tsx` - Card grid component
- `src/components/VaultCard.tsx` - Vault card component  
- `src/components/CardModal.tsx` - Card detail modal
- `src/components/InvestmentModal.tsx` - Investment modal
- `src/components/AddToVaultModal.tsx` - Add to vault modal
- `src/components/FeaturedCards.tsx` - Featured cards component
- `src/components/PriceTrackingDashboard.tsx` - Price tracking dashboard

## Notes
- The Pokemon TCG API sometimes doesn't have images for certain sets (e.g., McDonald's promo sets like `mcd14`, `mcd15`, etc.)
- The backend already returns placeholder images from the `/api/cards/pool` endpoint
- This fix ensures those placeholders are properly used when real images can't be fetched

