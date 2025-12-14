import { createContext, useContext, useState, useCallback, useMemo, type ReactNode } from 'react';

export type GameType = 'pokemon' | 'onepiece';

interface GameContextValue {
  game: GameType;
  setGame: (game: GameType) => void;
  isPokemon: boolean;
  isOnePiece: boolean;
}

const STORAGE_KEY = 'tcgtracker_game';

function getInitialGame(): GameType {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'pokemon' || stored === 'onepiece') return stored;
  } catch {
    /* localStorage unavailable */
  }
  return 'pokemon';
}

const GameContext = createContext<GameContextValue>({
  game: 'pokemon',
  setGame: () => {},
  isPokemon: true,
  isOnePiece: false,
});

export const useGame = () => {
  const ctx = useContext(GameContext);
  return ctx;
};

export function GameProvider({ children }: { children: ReactNode }) {
  const [game, setGameState] = useState<GameType>(getInitialGame);

  const setGame = useCallback((next: GameType) => {
    setGameState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* localStorage unavailable */
    }
  }, []);

  const value = useMemo(
    () => ({
      game,
      setGame,
      isPokemon: game === 'pokemon',
      isOnePiece: game === 'onepiece',
    }),
    [game, setGame]
  );

  return (
    <GameContext.Provider value={value}>
      {children}
    </GameContext.Provider>
  );
}
