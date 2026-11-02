import React, { useState } from 'react';
import { BookOpen, Heart, Loader2 } from 'lucide-react';
import { ScanResult } from '../../../services/cardScannerApi';
import { pokemonApi } from '../../../services/pokemonApi';
import { setWishlistService } from '../../../services/setWishlistService';
import { cardWishlistService } from '../../../services/cardWishlistService';
import { PokemonCard } from '../../../types/pokemon';
import { AddToVaultModal } from '../../vault/components/AddToVaultModal';
import { markOnboardingStep } from '../../../components/common/OnboardingChecklist';

interface ScanResultActionsProps {
  result: ScanResult;
}

export const ScanResultActions: React.FC<ScanResultActionsProps> = ({ result }) => {
  const [card, setCard] = useState<PokemonCard | null>(null);
  const [loading, setLoading] = useState(false);
  const [vaultOpen, setVaultOpen] = useState(false);
  const [wishlisted, setWishlisted] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const resolveCard = async (): Promise<PokemonCard | null> => {
    if (card) return card;
    if (!result.card) return null;

    setLoading(true);
    try {
      if (result.card.id) {
        const found = await pokemonApi.getCardById(result.card.id);
        if (found) {
          setCard(found);
          return found;
        }
      }
      const search = await pokemonApi.searchCards(result.card.name, undefined, 30);
      const match = search.find(
        (c) =>
          c.name.toLowerCase() === result.card!.name.toLowerCase() &&
          (c.set?.name === result.card!.set || c.number === result.card!.number)
      );
      // Never fall back to a different card: adding the wrong print is worse than asking.
      if (match) {
        setCard(match);
        return match;
      }
    } finally {
      setLoading(false);
    }
    return null;
  };

  const handleAddToVault = async () => {
    const resolved = await resolveCard();
    if (!resolved) {
      setMessage('Could not find this exact card in the catalog. Search for it instead.');
      return;
    }
    setVaultOpen(true);
  };

  const handleWishlist = async () => {
    const resolved = await resolveCard();
    if (!resolved) {
      setMessage('Could not find this exact card in the catalog. Search for it instead.');
      return;
    }
    const now = cardWishlistService.toggle(resolved, 'pokemon');
    setWishlisted(now);
    setMessage(now ? 'Added to your wishlist' : 'Removed from your wishlist');
  };

  return (
    <div className="mt-4 flex flex-wrap gap-2">
      <button type="button" disabled={loading} onClick={handleAddToVault} className="btn-primary">
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />
        ) : (
          <BookOpen className="h-4 w-4" aria-hidden />
        )}
        Add to vault
      </button>
      <button
        type="button"
        disabled={loading}
        onClick={handleWishlist}
        aria-pressed={wishlisted}
        className="btn-secondary"
      >
        <Heart className={`h-4 w-4 ${wishlisted ? 'fill-current' : ''}`} aria-hidden />
        {wishlisted ? 'On your wishlist' : 'Add to wishlist'}
      </button>
      {message && (
        <p className="w-full text-[12.5px] text-ink-muted" aria-live="polite">
          {message}
        </p>
      )}
      <AddToVaultModal
        card={card}
        isOpen={vaultOpen}
        onClose={() => setVaultOpen(false)}
        onSuccess={() => {
          setVaultOpen(false);
          setMessage('Added to vault');
          markOnboardingStep('vault');
          if (card?.id) setWishlistService.removeFromWishlist(card.set.id, card.id);
        }}
      />
    </div>
  );
};
