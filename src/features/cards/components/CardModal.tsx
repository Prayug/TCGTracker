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
    day: 'numeric',
  });

  return (
    <Modal isOpen={isOpen} onClose={onClose} variant="dive" size="large" flush>
      <div className="bg-felt p-4 sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:gap-6">
          <div className="mx-auto w-[min(14rem,70vw)] shrink-0 sm:mx-0">
            <div className="sleeve-window p-1.5">
              <img
                src={card.images.large}
                alt={card.name}
                className="aspect-[5/7] w-full object-contain"
                loading="lazy"
                onError={(e) => {
                  const target = e.target as HTMLImageElement;
                  if (target.src !== card.images.small) {
                    target.src = card.images.small;
                  }
                }}
              />
            </div>
          </div>

          <div className="binder-page min-w-0 flex-1 p-4">
            <div className="mb-3 flex flex-wrap gap-1.5">
              <span className="binder-tab" data-active="true">
                Spec
              </span>
              {card.rarity ? <span className="binder-tab">{card.rarity}</span> : null}
              {card.language === 'ja' ? <span className="binder-tab">JP</span> : null}
            </div>

            <h2 className="font-display text-xl font-extrabold text-ink-primary">{card.name}</h2>
            {card.matchName && card.language === 'ja' && card.matchName !== card.name && (
              <p className="mt-1 text-xs text-ink-muted">{card.matchName}</p>
            )}

            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-[11px] font-medium text-ink-muted">Set</dt>
                <dd className="font-medium text-ink-primary">{card.set.name}</dd>
              </div>
              <div>
                <dt className="text-[11px] font-medium text-ink-muted">Rarity</dt>
                <dd className="font-medium text-ink-primary">{card.rarity || 'N/A'}</dd>
              </div>
              <div>
                <dt className="text-[11px] font-medium text-ink-muted">Release</dt>
                <dd className="font-medium text-ink-primary">{formattedDate}</dd>
              </div>
              <div>
                <dt className="text-[11px] font-medium text-ink-muted">Market</dt>
                <dd className="stamp-price animate-stamp-price text-lg">
                  {price > 0 ? `$${price.toFixed(2)}` : 'N/A'}
                </dd>
              </div>
            </dl>

            {card.artist && (
              <p className="mt-4 border-t border-border-page pt-3 text-sm text-ink-muted">
                <span className="font-semibold text-ink-secondary">Artist:</span> {card.artist}
              </p>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
};
