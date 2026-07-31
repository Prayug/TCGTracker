import React from 'react';
import { PokemonCard } from '../../../types/pokemon';
import { pokemonApi } from '../../../services/pokemonApi';
import { Modal } from '../../../components/common/Modal';

interface CardModalProps {
  card: PokemonCard | null;
  isOpen: boolean;
  onClose: () => void;
}

export const CardModal: React.FC<CardModalProps> = ({ card, isOpen, onClose }) => {
  if (!card) return null;

  const price = pokemonApi.extractCardPrice(card);
  const formattedDate = new Date(card.set.releaseDate).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      variant="inspect"
      sceneImageUrl={card.images.large || card.images.small}
      size="medium"
    >
      <div className="space-y-6">
        <img
          src={card.images.large}
          alt={card.name}
          className="mx-auto w-full max-w-[min(16rem,50vw)] rounded-xl border border-border-subtle bg-black/30 shadow-lg md:hidden"
          loading="lazy"
          onError={(e) => {
            const target = e.target as HTMLImageElement;
            if (target.src !== card.images.small) {
              target.src = card.images.small;
            }
          }}
        />

        <div className="space-y-4">
          <div className="text-center">
            <h2 className="font-display text-xl font-bold text-ink-primary">{card.name}</h2>
            {card.types && card.types.length > 0 && (
              <div className="mt-2 flex justify-center gap-2">
                {card.types.map((type) => (
                  <span
                    key={type}
                    className="rounded-lg border border-foil/30 bg-foil/10 px-2.5 py-0.5 text-xs font-medium text-foil"
                  >
                    {type}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4 rounded-2xl border border-border-subtle bg-surface-inset p-4 text-sm">
            <div>
              <p className="section-label mb-0.5">Set</p>
              <p className="font-medium text-ink-secondary">{card.set.name}</p>
            </div>

            <div>
              <p className="section-label mb-0.5">Rarity</p>
              <p className="font-medium text-ink-secondary">{card.rarity || 'N/A'}</p>
            </div>

            <div>
              <p className="section-label mb-0.5">Release Date</p>
              <p className="font-medium text-ink-secondary">{formattedDate}</p>
            </div>

            <div>
              <p className="section-label mb-0.5">Price</p>
              <p className="font-mono font-semibold text-gain">
                {price > 0 ? `$${price.toFixed(2)}` : 'N/A'}
              </p>
            </div>
          </div>

          {card.artist && (
            <div className="text-center border-t border-border-subtle pt-3">
              <p className="text-sm text-ink-muted">
                <span className="font-semibold text-ink-secondary">Artist:</span> {card.artist}
              </p>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
};
