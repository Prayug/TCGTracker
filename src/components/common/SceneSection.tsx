import { motion, useInView } from 'framer-motion';
import { useRef } from 'react';

interface SceneSectionProps {
  children: React.ReactNode;
  className?: string;
  id?: string;
}

const sceneVariants = {
  hidden: { opacity: 0, y: 40 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.7, ease: [0.16, 1, 0.3, 1] },
  },
};

export const SceneSection: React.FC<SceneSectionProps> = ({ children, className = '', id }) => {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: '-15%' });

  return (
    <section
      id={id}
      ref={ref}
      className={`relative min-h-screen w-full ${className}`}
    >
      <motion.div
        variants={sceneVariants}
        initial="hidden"
        animate={isInView ? 'visible' : 'hidden'}
        className="flex min-h-screen w-full items-center justify-center px-4 py-24 sm:px-6 lg:px-8"
      >
        {children}
      </motion.div>
    </section>
  );
};
