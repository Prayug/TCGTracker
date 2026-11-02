import { useGame, type GameType } from '../../contexts/GameContext';
import { cn } from '@/lib/utils';

const GAMES: { value: GameType; label: string; short: string }[] = [
  { value: 'pokemon', label: 'Pokémon', short: 'PKMN' },
  { value: 'onepiece', label: 'One Piece', short: 'OP' },
];

/**
 * Active game selector. A two-state radio group rendered as a compact
 * segmented control; the active state uses fill + weight, not colour alone.
 */
export function GameSwitch({
  compact = false,
  className,
}: {
  compact?: boolean;
  className?: string;
}) {
  const { game, setGame } = useGame();
  return (
    <div role="radiogroup" aria-label="Active game" className={cn('segmented', className)}>
      {GAMES.map((g) => {
        const active = g.value === game;
        return (
          <button
            key={g.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => setGame(g.value)}
            className={cn('cursor-pointer', active && 'font-semibold')}
            title={g.label}
          >
            {compact ? (
              <span className="font-mono text-[11px] tracking-normal">{g.short}</span>
            ) : (
              g.label
            )}
          </button>
        );
      })}
    </div>
  );
}
