import React, { useState } from 'react';
import { BookOpen, Heart, Loader2 } from 'lucide-react';
import { ScanResult } from '../../../services/cardScannerApi';
import { pokemonApi } from '../../../services/pokemonApi';
import { setWishlistService } from '../../../services/setWishlistService';
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
      const match =
        search.find(
          (c) =>
            c.name.toLowerCase() === result.card!.name.toLowerCase() &&
            (c.set?.name === result.card!.set || c.number === result.card!.number)
        ) || search[0];
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
      setMessage('Could not resolve card in catalog. Try Browse search.');
      return;
    }
    setVaultOpen(true);
  };

  const handleWishlist = async () => {
    const resolved = await resolveCard();
    if (!resolved?.set?.id) {
      setMessage('Set ID missing — add from Set Tracker after browsing.');
      return;
    }
    const now = setWishlistService.toggleWishlist(resolved.set.id, resolved.id);
    setWishlisted(now);
    setMessage(now ? 'Added to set wishlist' : 'Removed from wishlist');
  };

  return (
    <div className="mt-4 flex flex-wrap gap-2 border-t border-border-subtle pt-4">
      <button
        type="button"
        disabled={loading}
        onClick={handleAddToVault}
        className="btn-primary flex-1 justify-center"
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <BookOpen className="h-4 w-4" />}
        Add to collection
      </button>
      <button
        type="button"
        disabled={loading}
        onClick={handleWishlist}
        className={`btn-secondary flex-1 justify-center ${
          wishlisted ? 'border-amber-500/40 text-amber-300' : ''
        }`}
      >
        <Heart className={`h-4 w-4 ${wishlisted ? 'fill-current' : ''}`} />
        Wishlist
      </button>
      {message && (
        <p className="w-full text-xs text-ink-muted" aria-live="polite">
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
