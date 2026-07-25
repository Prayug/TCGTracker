import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, useScroll, useSpring } from 'framer-motion';
import {
  Camera,
  ChevronDown,
  Cuboid,
  GraduationCap,
  PackageOpen,
  Search,
  Sparkles,
  SwatchBook,
  TrendingUp,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { AppView } from '../../types/ui';
import { PokemonCard } from '../../types/pokemon';
import { pokemonApi } from '../../services/pokemonApi';
import { browseSearchPath } from '../../utils/routes';
import { useCardModal } from '../../contexts/CardModalContext';
import { proxyImageUrl } from '../../utils/cardDisplay';

import { FoilCard } from './FoilCard';
import { PortfolioSummary } from './PortfolioSummary';
import { TopMovers } from './TopMovers';
import { MarqueeText } from './MarqueeText';

interface HeroSectionProps {
  onStartSearch: (query: string) => void;
  onViewChange: (view: AppView) => void;
}

const quickSearches = ['Charizard', 'Pikachu', 'Umbreon', 'Gengar', 'Rayquaza'];

const features: { label: string; view: AppView; icon: React.FC<{ className?: string }> }[] = [
  { label: 'Browse', view: 'cards', icon: SwatchBook },
  { label: 'Track', view: 'tracking', icon: TrendingUp },
  { label: 'Vault', view: 'vault', icon: Cuboid },
  { label: 'Scan', view: 'scanner', icon: Camera },
  { label: 'Grade', view: 'grading', icon: GraduationCap },
  { label: 'Packs', view: 'packs', icon: PackageOpen },
];

const SCENES = [
  { id: 'grid', label: 'The Grid', accent: 'var(--neon-gold)', scrollWeight: 1.4, linger: 0.35 },
  { id: 'pulse', label: 'Market Pulse', accent: 'var(--neon-pink)', scrollWeight: 1.3, linger: 0.3 },
  { id: 'tools', label: 'Command', accent: 'var(--neon-amber)', scrollWeight: 1.5, linger: 0.4 },
  { id: 'packs', label: 'Packs', accent: 'var(--neon-green)', scrollWeight: 1.2, linger: 0.25 },
  { id: 'cta', label: 'Jump In', accent: 'var(--neon-gold)', scrollWeight: 1.6, linger: 0.5 },
];

function useScrollProgress() {
  const { scrollYProgress } = useScroll();
  const smooth = useSpring(scrollYProgress, { stiffness: 80, damping: 25, restDelta: 0.0005 });
  return { scrollYProgress, smoothProgress: smooth };
}

function SceneDot({
  scene, index, activeIndex, onClick,
}: {
  scene: (typeof SCENES)[0];
  index: number;
  activeIndex: number;
  onClick: () => void;
}) {
  const isActive = index === activeIndex;
  return (
    <button
      onClick={onClick}
      className="group relative flex items-center gap-3"
      aria-label={`Go to ${scene.label}`}
    >
      <div className="relative flex h-4 w-4 items-center justify-center">
        <motion.div
          animate={{ scale: isActive ? 1 : 0.4, opacity: isActive ? 1 : 0.3 }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className="h-full w-full rounded-full"
          style={{ backgroundColor: scene.accent, boxShadow: isActive ? `0 0 12px ${scene.accent}` : 'none' }}
        />
      </div>
      <span
        className={`text-xs font-bold uppercase tracking-widest transition-all duration-300 ${
          isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-60'
        }`}
        style={{ color: scene.accent }}
      >
        {scene.label}
      </span>
    </button>
  );
}

function SceneWrapper({
  id, children,
}: {
  id: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="relative w-full">
      {children}
    </section>
  );
}

export const HeroSection: React.FC<HeroSectionProps> = ({ onStartSearch, onViewChange }) => {
  const navigate = useNavigate();
  const { openCard } = useCardModal();
  const [searchValue, setSearchValue] = useState('');
  const [heroCards, setHeroCards] = useState<PokemonCard[]>([]);
  const [activeSceneIndex, setActiveSceneIndex] = useState(0);

  const { smoothProgress } = useScrollProgress();
  const containerRef = useRef<HTMLDivElement>(null);

  const totalScroll = useMemo(() => SCENES.reduce((sum, s) => sum + s.scrollWeight, 0), []);
  const sceneRanges = useMemo(() => {
    let cum = 0;
    return SCENES.map((s) => {
      const start = cum / totalScroll;
      cum += s.scrollWeight;
      const end = cum / totalScroll;
      return { ...s, start, end };
    });
  }, [totalScroll]);

  useEffect(() => {
    let mounted = true;
    pokemonApi.searchCards('charizard', undefined, 3)
      .then((cards) => { if (mounted) setHeroCards(cards); })
      .catch(() => {});
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    return smoothProgress.on('change', (v: number) => {
      let idx = 0;
      for (let i = 0; i < sceneRanges.length; i++) {
        if (v >= sceneRanges[i].start) idx = i;
      }
      setActiveSceneIndex(idx);
    });
  }, [smoothProgress, sceneRanges]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchValue.trim()) onStartSearch(searchValue.trim());
  };

  const handleQuickSearch = (q: string) => navigate(browseSearchPath(q));
  const handleCardClick = (card: PokemonCard) => openCard(card);

  const jumpToScene = useCallback((i: number) => {
    const scene = sceneRanges[i];
    if (!scene) return;
    const mid = (scene.start + scene.end) / 2;
    const targetScroll = mid * (document.documentElement.scrollHeight - window.innerHeight);
    window.scrollTo({ top: targetScroll, behavior: 'smooth' });
  }, [sceneRanges]);

  const heroBgCard = heroCards[0];

  return (
    <div ref={containerRef} className="relative">
      <nav
        aria-label="Scene navigation"
        className="fixed right-4 top-1/2 z-40 hidden -translate-y-1/2 flex-col gap-5 md:flex"
      >
        <div className="absolute left-[7px] top-3 bottom-3 w-px bg-border-subtle" aria-hidden="true" />
        {sceneRanges.map((scene, i) => (
          <SceneDot key={scene.id} scene={scene} index={i} activeIndex={activeSceneIndex} onClick={() => jumpToScene(i)} />
        ))}
      </nav>

      {/* ============ SCENE 1: THE GRID ============ */}
      <SceneWrapper id="grid">
        <div className="relative flex min-h-[90vh] items-center justify-center overflow-hidden">
          {heroBgCard && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-[0.06]">
              <img
                src={proxyImageUrl(heroBgCard.images.large)}
                alt=""
                className="h-[32rem] w-auto rotate-[-8deg] select-none sm:h-[48rem]"
                draggable={false}
              />
            </div>
          )}

          <div className="relative z-10 flex w-full max-w-5xl flex-col items-center px-4 text-center">
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
              className="flex flex-col items-center gap-6"
            >
              <h1 className="font-display text-[clamp(3rem,10vw,7rem)] font-bold leading-[0.95] tracking-tight">
                <span className="text-gradient animate-text-shimmer">COMMAND</span>
                <br />
                <span className="text-ink-primary">YOUR</span>
                <br />
                <span className="text-neon-gold animate-neon-pulse" style={{ animationDuration: '3s' }}>
                  COLLECTION
                </span>
              </h1>

              <p className="max-w-lg text-base font-semibold text-ink-secondary">
                One terminal for Pokémon TCG &amp; One Piece. Track, scan, grade, and trade.
              </p>

              <form onSubmit={handleSubmit} className="w-full max-w-xl">
                <label htmlFor="hero-card-search" className="sr-only">Search cards</label>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-5 top-1/2 h-5 w-5 -translate-y-1/2" style={{ color: 'var(--ink-muted)' }} />
                  <input
                    id="hero-card-search"
                    type="text"
                    value={searchValue}
                    onChange={(e) => setSearchValue(e.target.value)}
                    placeholder="Search 50,000+ cards by name, set, or number..."
                    className="h-14 w-full border-2 border-border-default bg-surface-inset pl-14 pr-5 text-base font-semibold text-ink-primary outline-none transition-all focus:border-accent focus:shadow-[0_0_20px_var(--ring-accent)]"
                  />
                </div>
              </form>

              <div className="flex flex-wrap justify-center gap-2">
                {quickSearches.map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => handleQuickSearch(q)}
                    className="border border-border-default bg-surface-raised px-4 py-2 text-xs font-bold uppercase tracking-wider text-ink-secondary transition-all hover:border-accent hover:text-accent neon-flood"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </motion.div>
          </div>

          <motion.div
            className="absolute bottom-6 left-1/2 -translate-x-1/2"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.5, duration: 0.6 }}
          >
            <motion.div animate={{ y: [0, 8, 0] }} transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut' }}>
              <div className="flex flex-col items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-ink-muted">Scroll to explore</span>
                <ChevronDown className="h-5 w-5 text-accent" />
              </div>
            </motion.div>
          </motion.div>
        </div>
      </SceneWrapper>

      <MarqueeText
        text="● TRACK ● SCAN ● GRADE ● TRADE ● COLLECT ● 50,000+ CARDS ● LIVE PRICES ● PACK SIMULATOR"
        className="border-y border-border-subtle bg-surface-inset py-3"
        speed={25}
      />

      {/* ============ SCENE 2: MARKET PULSE ============ */}
      <SceneWrapper id="pulse">
        <section className="relative px-4 py-24 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-6xl">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            >
              <h2 className="font-display text-[clamp(2rem,5vw,3.5rem)] font-bold leading-tight tracking-tight">
                <span className="text-gradient">Real-time</span>{' '}
                <span className="text-ink-primary">market</span>{' '}
                <span className="text-neon-pink animate-neon-pulse">data</span>
              </h2>
              <p className="mt-3 max-w-lg text-base font-semibold text-ink-secondary">
                Track prices, spot trends, and never miss a move.
              </p>
            </motion.div>

            <div className="mt-10">
              <TopMovers onCardClick={handleCardClick} />
            </div>
          </div>
        </section>
      </SceneWrapper>

      <div className="scene-divider mx-auto max-w-5xl" />

      {/* ============ SCENE 3: COMMAND ============ */}
      <SceneWrapper id="tools">
        <section className="relative px-4 py-24 sm:px-6 lg:px-8">
          <div className="mx-auto flex max-w-6xl flex-col items-center gap-12">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
              className="flex flex-col items-center gap-4 text-center"
            >
              <h2 className="font-display text-[clamp(2rem,5vw,3.5rem)] font-bold leading-tight tracking-tight">
                <span className="text-ink-primary">Your</span>{' '}
                <span className="text-gradient">toolkit</span>
              </h2>
              <p className="max-w-lg text-base font-semibold text-ink-secondary">
                Everything a collector needs, one click away.
              </p>
            </motion.div>

            <PortfolioSummary />

            <div className="bento-grid w-full max-w-5xl">
              {features.map(({ label, view, icon: Icon }, i) => (
                <motion.div
                  key={view}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.4, delay: i * 0.06, ease: [0.16, 1, 0.3, 1] }}
                  className={i < 3 ? 'bento-span-2' : ''}
                >
                  <FoilCard as="button" onClick={() => onViewChange(view)} className="w-full px-4 py-5 neon-flood">
                    <div className="flex flex-col items-center gap-2">
                      <div className="flex h-10 w-10 items-center justify-center border border-accent" style={{ background: 'var(--accent-muted)' }}>
                        <Icon className="h-5 w-5 text-accent" />
                      </div>
                      <span className="text-xs font-bold uppercase tracking-wider text-ink-primary">{label}</span>
                    </div>
                  </FoilCard>
                </motion.div>
              ))}
            </div>
          </div>
        </section>
      </SceneWrapper>

      <div className="scene-divider mx-auto max-w-5xl" />

      {/* ============ SCENE 4: PACKS ============ */}
      <SceneWrapper id="packs">
        <section className="relative px-4 py-24 sm:px-6 lg:px-8">
          <div className="mx-auto flex max-w-6xl flex-col items-center gap-10">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
              className="flex flex-col items-center gap-4 text-center"
            >
              <h2 className="font-display text-[clamp(2rem,5vw,3.5rem)] font-bold leading-tight tracking-tight">
                <span className="text-gradient">Rip</span>{' '}
                <span className="text-ink-primary">virtual</span>{' '}
                <span className="text-neon-green animate-neon-pulse">packs</span>
              </h2>
              <p className="max-w-lg text-base font-semibold text-ink-secondary">
                Open packs with 3D cinematic reveals. Every rarity, every set.
              </p>
            </motion.div>

            <div className="flex flex-wrap justify-center gap-4">
              <button type="button" onClick={() => onViewChange('packs')} className="btn-primary gap-3 px-10 py-4 text-base">
                Open Packs <PackageOpen className="h-5 w-5" />
              </button>
              <button type="button" onClick={() => handleQuickSearch('Charizard')} className="btn-secondary gap-3 px-8 py-4 text-base">
                Browse Cards
              </button>
            </div>
          </div>
        </section>
      </SceneWrapper>

      <div className="scene-divider mx-auto max-w-5xl" />

      {/* ============ SCENE 5: JUMP IN (CTA) ============ */}
      <SceneWrapper id="cta">
        <section className="relative px-4 py-24 sm:px-6 lg:px-8">
          <div className="mx-auto flex max-w-5xl flex-col items-center gap-10">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
              className="flex flex-col items-center gap-8 text-center"
            >
              <div className="animate-float">
                <div className="flex h-20 w-20 items-center justify-center border-2 border-accent bg-surface-base shadow-[0_0_30px_var(--ring-accent)]">
                  <Sparkles className="h-8 w-8 text-accent" />
                </div>
              </div>

              <h2 className="font-display text-[clamp(2.5rem,6vw,4rem)] font-bold leading-tight tracking-tight">
                <span className="text-gradient">Ready</span>{' '}
                <span className="text-ink-primary">to build your</span>{' '}
                <span className="text-neon-gold animate-neon-pulse">collection</span>
                <span className="text-ink-primary">?</span>
              </h2>

              <p className="max-w-md text-base font-semibold text-ink-secondary">
                Search, track, scan, grade, and organize — everything a TCG collector needs. Free to start.
              </p>

              <button
                type="button"
                onClick={() => onViewChange('cards')}
                className="btn-primary animate-glow-pulse gap-3 px-14 py-5 text-lg font-bold"
              >
                Launch TCGTracker <Sparkles className="h-5 w-5" />
              </button>

              <div className="flex flex-wrap justify-center gap-3">
                <button
                  type="button"
                  onClick={() => handleQuickSearch('Charizard')}
                  className="border border-border-default bg-surface-raised px-5 py-3 text-xs font-bold uppercase tracking-wider text-ink-secondary transition-all hover:border-accent hover:text-accent neon-flood"
                >
                  Search Charizard
                </button>
                <button
                  type="button"
                  onClick={() => onViewChange('vault')}
                  className="border border-border-default bg-surface-raised px-5 py-3 text-xs font-bold uppercase tracking-wider text-ink-secondary transition-all hover:border-accent hover:text-accent neon-flood"
                >
                  View My Vault
                </button>
                <button
                  type="button"
                  onClick={() => onViewChange('scanner')}
                  className="border border-border-default bg-surface-raised px-5 py-3 text-xs font-bold uppercase tracking-wider text-ink-secondary transition-all hover:border-accent hover:text-accent neon-flood"
                >
                  Scan a Card
                </button>
              </div>
            </motion.div>
          </div>
        </section>
      </SceneWrapper>

      <MarqueeText
        text="● POKEMON TCG ● ONE PIECE TCG ● LIVE PRICES ● AI GRADING ● VAULT TRACKING ● PACK SIMULATOR"
        className="border-y border-border-subtle bg-surface-inset py-3"
        speed={25}
      />
    </div>
  );
};
