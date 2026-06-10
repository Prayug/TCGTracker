import React, { useEffect, useState } from 'react';
import { motion, useMotionValue, useTransform, animate } from 'framer-motion';
import { Package, TrendingUp } from 'lucide-react';

interface StatItemProps {
  icon: React.ReactNode;
  value: number;
  label: string;
  suffix?: string;
  prefix?: string;
  gradient: string;
}

const StatItem: React.FC<StatItemProps> = ({ icon, value, label, suffix = '', prefix = '', gradient }) => {
  const count = useMotionValue(0);
  const rounded = useTransform(count, (latest) => Math.round(latest));
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    const controls = animate(count, value, { duration: 2, ease: 'easeOut' });
    const unsubscribe = rounded.on('change', (latest) => setDisplayValue(latest));
    
    return () => {
      controls.stop();
      unsubscribe();
    };
  }, [value]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      className="group relative"
    >
      <div className="relative rounded-2xl border border-border-subtle bg-surface-inset p-6 shadow-lg transition-all duration-300 hover:border-violet-500/40">
        <div className={`absolute inset-0 bg-gradient-to-br ${gradient} rounded-2xl opacity-0 group-hover:opacity-10 transition-opacity`} />
        
        <div className="relative flex items-center gap-4">
          <div className={`p-3 bg-gradient-to-br ${gradient} rounded-xl shadow-lg group-hover:scale-110 transition-transform duration-300`}>
            {icon}
          </div>
          
          <div>
            <div className="mb-1 text-3xl font-black text-white md:text-4xl">
              {prefix}
              {displayValue.toLocaleString()}
              {suffix}
            </div>
            <div className="text-sm font-semibold text-ink-muted">
              {label}
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export const StatsCounter: React.FC = () => {
  const stats = [
    {
      icon: <Package className="w-6 h-6 text-white" />,
      value: 30000,
      label: 'Cards Available',
      gradient: 'from-violet-500 to-violet-600'
    },
    {
      icon: <TrendingUp className="w-6 h-6 text-white" />,
      value: 500000,
      label: 'Market Data Points',
      prefix: '$',
      gradient: 'from-green-500 to-emerald-600'
    },
    {
      icon: <TrendingUp className="w-6 h-6 text-white" />,
      value: 1000,
      label: 'Active Users',
      suffix: '+',
      gradient: 'from-amber-500 to-orange-600'
    },
    {
      icon: <TrendingUp className="w-6 h-6 text-white" />,
      value: 95,
      label: 'TCGPlayer Accuracy',
      suffix: '%',
      gradient: 'from-yellow-500 to-orange-600'
    }
  ];

  return (
    <section className="py-16">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mb-12 text-center"
        >
          <h2 className="mb-4 text-3xl font-black text-white md:text-4xl">
            TCGPlayer Integration
          </h2>
          <p className="text-xl font-medium text-ink-muted">
            Real market data • Live price tracking
          </p>
        </motion.div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
          {stats.map((stat, index) => (
            <StatItem key={index} {...stat} />
          ))}
        </div>
      </div>
    </section>
  );
};
