import { motion, useScroll, useSpring } from 'framer-motion';

interface Scene {
  id: string;
  label: string;
}

interface ScrollProgressBarProps {
  scenes: Scene[];
}

export const ScrollProgressBar: React.FC<ScrollProgressBarProps> = ({ scenes }) => {
  const { scrollYProgress } = useScroll();
  const smoothProgress = useSpring(scrollYProgress, { stiffness: 100, damping: 30, restDelta: 0.001 });

  return (
    <nav
      className="pointer-events-none fixed bottom-6 left-1/2 z-50 -translate-x-1/2"
      aria-label="Scroll progress"
    >
      <div className="card-glass-scene pointer-events-auto flex items-center gap-1.5 px-3 py-2 shadow-lg">
        {scenes.map((scene, index) => (
          <a
            key={scene.id}
            href={`#${scene.id}`}
            className="group relative flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium transition-colors hover:bg-surface-hover"
            style={{ color: 'var(--ink-muted)' }}
          >
            <motion.span
              className="absolute inset-0 rounded-md"
              style={{
                backgroundColor: 'var(--accent-muted)',
                opacity: smoothProgress.get() > index / scenes.length &&
                  smoothProgress.get() < (index + 1) / scenes.length ? 1 : 0,
              }}
            />
            <span
              className="relative z-10 hidden whitespace-nowrap sm:inline"
            >
              {scene.label}
            </span>
            <span
              className="relative z-10 h-1.5 w-1.5 rounded-full sm:hidden"
              style={{ backgroundColor: 'var(--accent)' }}
            />
          </a>
        ))}
      </div>
    </nav>
  );
};
