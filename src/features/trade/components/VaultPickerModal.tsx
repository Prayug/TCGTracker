import { Modal } from '../../../components/common/Modal';
import { vaultService } from '../../../services/vaultService';
import type { GameType } from '../../../contexts/GameContext';
import type { PokemonCard } from '../../../types/pokemon';
import { getCardImage, getCardPrice } from '../../../utils/cardPrice';
import { formatCurrency } from '../../../utils/cardDisplay';

interface VaultPickerModalProps {
  isOpen: boolean;
  game: GameType;
  onClose: () => void;
  onSelect: (card: PokemonCard) => void;
}

export function VaultPickerModal({ isOpen, game, onClose, onSelect }: VaultPickerModalProps) {
  const holdings = isOpen ? vaultService.getVaultCards(game) : [];

  return (
    <Modal isOpen={isOpen} onClose={onClose} variant="slab" size="medium">
      <div className="mx-auto max-w-xl">
        <h2 className="font-display text-xl text-ink-primary">Add from vault</h2>
        <p className="mt-1 text-sm text-ink-muted">
          Pick a holding to put on this side of the trade.
        </p>

        <div className="mt-4 max-h-80 space-y-2 overflow-y-auto">
          {holdings.length === 0 ? (
            <p className="py-8 text-center text-sm text-ink-muted">Vault is empty for this game.</p>
          ) : (
            holdings.map((holding) => {
              const price = getCardPrice(holding.card);
              return (
                <button
                  key={holding.id}
                  type="button"
                  onClick={() => onSelect(holding.card)}
                  className="flex w-full items-center gap-3 rounded-xl border border-border-subtle bg-surface-inset p-3 text-left hover:bg-surface-hover"
                >
                  <img
                    src={getCardImage(holding.card)}
                    alt=""
                    className="h-14 w-10 shrink-0 rounded-md object-cover"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-ink-primary">{holding.card.name}</p>
                    <p className="truncate text-xs text-ink-muted">{holding.card.set?.name}</p>
                  </div>
                  <span className="text-sm font-semibold tabular-nums text-ink-primary">
                    {price > 0 ? formatCurrency(price) : '—'}
                  </span>
                </button>
              );
            })
          )}
        </div>

        <div className="mt-4 flex justify-end border-t border-border-subtle pt-4">
          <button type="button" onClick={onClose} className="btn-secondary">
            Cancel
          </button>
        </div>
      </div>
    </Modal>
  );
}
