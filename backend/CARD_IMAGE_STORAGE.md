# Card Image Storage System

## Overview

This system allows you to store real card images directly in your database, solving the problem where promo cards (like McDonald's 2014) don't exist in the Pokémon TCG API.

## How It Works

### 1. Database Schema

The `card_mappings` table now includes:
- `imageSmall` - URL to small version of card image
- `imageLarge` - URL to large/high-res version of card image  
- `imageSource` - Where the image came from (pokemon_api, manual, tcgplayer, etc.)
- `imageLastUpdated` - Timestamp of last image update

### 2. Image Priority Order

When displaying cards, the system uses this priority:
1. **Stored images from database** ✅ (most reliable)
2. Deterministic Pokémon TCG API URLs (may 404)
3. Placeholder SVG (fallback)

## Usage

### Option A: Automatic Population (for cards IN the Pokémon API)

For cards that exist in the Pokémon TCG API, you can automatically fetch and store their images:

```bash
cd backend
npm run populate-images
```

This will:
- Scan your database for cards without images
- Search the Pokémon TCG API for each card
- Store found images in the database
- Show progress and statistics

### Option B: Manual Addition (for promo cards NOT in the API)

For promotional cards that don't exist in the Pokémon API (like McDonald's promos), you need to manually add images.

#### Step 1: Find which cards need images

```bash
npm run add-promo-images list mcdonaldspromos2014
```

This shows all cards from that set that need images.

#### Step 2: Find image URLs

Find high-quality images from these sources:
- **TCGPlayer**: https://www.tcgplayer.com
- **Bulbapedia**: https://bulbapedia.bulbagarden.net
- **PokemonDB**: https://pokemondb.net
- **PriceCharting**: https://www.pricecharting.com
- **Google Images**: Search "Pokemon [card name] [set name]"

Look for:
- Small version: ~245x342px
- Large version: ~734x1024px (high-res)

#### Step 3: Add mappings to the script

Edit `backend/src/scripts/addPromoImages.ts`:

```typescript
const PROMO_IMAGE_MAPPINGS: PromoImageMapping[] = [
  {
    setId: 'mcdonaldspromos2014',
    cardNumber: '5/12',
    cardName: 'Pikachu',
    imageSmall: 'https://example.com/pikachu-small.png', // Replace with real URL
    imageLarge: 'https://example.com/pikachu-large.png', // Replace with real URL
    source: 'manual_mcdonalds_2014'
  },
  // Add more cards here...
];
```

#### Step 4: Apply the mappings

```bash
npm run add-promo-images apply
```

This will update your database with the image URLs.

### Option C: Host Images Locally

If you can't find reliable external URLs, host images yourself:

1. Create folder: `/public/assets/cards/mcdonalds2014/`
2. Add image files: `1.png`, `2.png`, `5.png`, etc.
3. Use relative URLs in your mappings:

```typescript
{
  setId: 'mcdonaldspromos2014',
  cardNumber: '5/12',
  cardName: 'Pikachu',
  imageSmall: '/assets/cards/mcdonalds2014/5.png',
  imageLarge: '/assets/cards/mcdonalds2014/5_hires.png',
  source: 'local_hosted'
}
```

## Checking Status

View image coverage statistics:

```bash
npm run image-stats
```

This shows:
- Total cards in database
- How many have images
- How many still need images
- Coverage percentage

## Example: Fixing McDonald's 2014 Pikachu

Let's say you want to add the Pikachu card from McDonald's 2014:

### 1. Verify the card exists in your database

```bash
npm run add-promo-images list mcdonaldspromos2014
```

Look for:
```
5. Pikachu (#5/12)
   Set: McDonald's Collection 2014
   ID: mcdonaldspromos2014-5-12-Pikachu
```

### 2. Find images

Google: "Pokemon Pikachu McDonald's 2014"

Find URLs like:
- Small: `https://images.example.com/mcdonalds-pikachu-small.jpg`
- Large: `https://images.example.com/mcdonalds-pikachu-large.jpg`

### 3. Add to script

Edit `backend/src/scripts/addPromoImages.ts`:

```typescript
const PROMO_IMAGE_MAPPINGS: PromoImageMapping[] = [
  {
    setId: 'mcdonaldspromos2014',
    cardNumber: '5/12',
    cardName: 'Pikachu',
    imageSmall: 'https://images.example.com/mcdonalds-pikachu-small.jpg',
    imageLarge: 'https://images.example.com/mcdonalds-pikachu-large.jpg',
    source: 'manual_mcdonalds_2014'
  }
];
```

### 4. Apply

```bash
npm run add-promo-images apply
```

### 5. Test

Open a pack in your frontend - the Pikachu card should now show the real image!

## Advanced: Using TCGPlayer API

If you have a TCGPlayer seller account with API access, you can fetch images programmatically:

```typescript
// In imagePopulator.ts, implement:
async function fetchFromTCGPlayer(productId: string) {
  const response = await fetch(`https://api.tcgplayer.com/catalog/products/${productId}`, {
    headers: {
      'Authorization': `Bearer ${TCGPLAYER_API_KEY}`
    }
  });
  const data = await response.json();
  return {
    small: data.imageUrl,
    large: data.imageUrl.replace('.jpg', '_hires.jpg')
  };
}
```

## Troubleshooting

### "Card not found in DB" error

The card doesn't exist in your `card_mappings` table. Check:
- Card name spelling (must match exactly)
- Set ID (must match exactly)
- Card number format (e.g., "5/12" not "5")

### Images still showing as placeholder

Check:
1. Did the migration run? Look for migration #5 in database
2. Are images stored in DB? Query: `SELECT imageSmall FROM card_mappings WHERE cardName='Pikachu'`
3. Is the backend serving the images? Check `/api/cards/pool` response
4. Check browser console for image loading errors

### External image URLs return 403/404

Some sites block hotlinking. Solutions:
- Find alternative image sources
- Host images locally (see Option C above)
- Use proxy or CDN service

## Database Migration

The migration runs automatically on server startup. To manually check:

```sql
-- Check if migration ran
SELECT * FROM migrations WHERE id = 5;

-- Check if columns exist
PRAGMA table_info(card_mappings);
-- Should see: imageSmall, imageLarge, imageSource, imageLastUpdated

-- View cards with images
SELECT cardName, setName, imageSource, imageLastUpdated 
FROM card_mappings 
WHERE imageSmall IS NOT NULL
LIMIT 10;
```

## API Integration

### TCGPlayer

1. Sign up for seller account: https://seller.tcgplayer.com
2. Request API access: https://docs.tcgplayer.com
3. Get your API key
4. Add to `.env`: `TCGPLAYER_API_KEY=your_key_here`

### PriceCharting

1. Sign up: https://www.pricecharting.com
2. Get API key from account settings
3. Add to `.env`: `PRICECHARTING_API_KEY=your_key_here`

## Best Practices

1. **Always use HTTPS URLs** for external images
2. **Test image URLs** in browser before adding to database
3. **Keep source tracking** - always set `imageSource` field
4. **Backup your database** before bulk operations
5. **Rate limit API calls** when auto-populating (script does this)
6. **Use high-res images** when available (better user experience)
7. **Validate image URLs** - check they return 200 OK

## Image URL Patterns

Common patterns for Pokémon card images:

### Pokémon TCG API
```
https://images.pokemontcg.io/{setId}/{cardNumber}.png
https://images.pokemontcg.io/{setId}/{cardNumber}_hires.png
```

### TCGPlayer
```
https://product-images.tcgplayer.com/fit-in/437x437/{hash}.jpg
https://product-images.tcgplayer.com/{productId}.jpg
```

### Bulbapedia
```
https://archives.bulbagarden.net/media/upload/{hash}/{CardName}.jpg
```

## Scripts Summary

| Command | Description |
|---------|-------------|
| `npm run populate-images` | Auto-fetch images from Pokémon API for all cards |
| `npm run add-promo-images apply` | Apply manual image mappings from script |
| `npm run add-promo-images list <setId>` | Show cards needing images in a set |
| `npm run image-stats` | Show image coverage statistics |

## Support

If you're having trouble finding images for a specific promo set, check:
- **Reddit**: r/PokemonTCG often has high-res scans
- **eBay**: Listings usually have good photos
- **Pok&#233;llector**: Community database with images
- **PokéBeach**: News site with card reveals

## Contributing

To improve this system:
1. Add more image sources to `imagePopulator.ts`
2. Create scrapers for common promo sets
3. Build a web UI for adding images manually
4. Add image validation/quality checks
5. Implement image CDN caching

## Example Full Workflow

Let's add all 12 McDonald's 2014 cards:

```bash
# 1. Check what needs images
npm run add-promo-images list mcdonaldspromos2014

# 2. Find all 12 cards on TCGPlayer or Bulbapedia
# 3. Edit addPromoImages.ts with all 12 URLs
# 4. Apply mappings
npm run add-promo-images apply

# 5. Verify
npm run image-stats
# Should show 12 more cards with images

# 6. Test in frontend
# Open a pack - McDonald's cards should show real images!
```

## Future Enhancements

Potential improvements:
- [ ] Web UI for managing images
- [ ] Automatic scraping from TCGPlayer/PriceCharting
- [ ] Image quality validation
- [ ] Automatic image optimization/resizing
- [ ] Bulk import from CSV
- [ ] Image CDN integration (Cloudinary, ImageKit)
- [ ] Community-sourced image database

