import { createContext, useContext, useState, useCallback, ReactNode } from 'react';

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
  } catch {}
  return 'pokemon';
}

const GameContext = createContext<GameContextValue>({
  game: 'pokemon',
  setGame: () => {},
  isPokemon: true,
  isOnePiece: false,
});

export const useGame = () => useContext(GameContext);

export function GameProvider({ children }: { children: ReactNode }) {
  const [game, setGameState] = useState<GameType>(getInitialGame);

  const setGame = useCallback((next: GameType) => {
    setGameState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {}
  }, []);

  return (
    <GameContext.Provider
      value={{
        game,
        setGame,
        isPokemon: game === 'pokemon',
        isOnePiece: game === 'onepiece',
      }}
    >
      {children}
    </GameContext.Provider>
  );
}
