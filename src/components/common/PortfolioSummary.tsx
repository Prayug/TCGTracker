import { motion } from 'framer-motion';
import { Wallet, TrendingUp, TrendingDown, Package } from 'lucide-react';
import { vaultService } from '../../services/vaultService';
import { formatCurrency } from '../../utils/cardDisplay';

export const PortfolioSummary: React.FC = () => {
  const stats = vaultService.getVaultStats();
  const hasCards = stats.totalCards > 0;

  const items = [
    {
      icon: Package,
      label: 'Cards in vault',
      value: hasCards ? stats.totalCards.toLocaleString() : 'No cards yet',
      accent: 'var(--neon-cyan)',
    },
    {
      icon: Wallet,
      label: 'Market value',
      value: hasCards ? formatCurrency(stats.currentValue) : 'Start tracking',
      accent: 'var(--neon-gold)',
    },
    {
      icon: stats.profit >= 0 ? TrendingUp : TrendingDown,
      label: 'Profit / loss',
      value: hasCards ? (
        <span className={stats.profit >= 0 ? 'text-neon-green' : 'text-neon-pink'}>
          {stats.profit >= 0 ? '+' : ''}{stats.profitPercentage.toFixed(1)}%
        </span>
      ) : 'Add cards',
      accent: hasCards ? (stats.profit >= 0 ? 'var(--neon-green)' : 'var(--neon-pink)') : 'var(--ink-muted)',
    },
  ];

  return (
    <div className="flex flex-wrap justify-center gap-4">
      {items.map(({ icon: Icon, label, value, accent }, i) => (
        <motion.div
          key={label}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.12, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="flex items-center gap-3 border border-border-default bg-surface-raised px-5 py-4 transition-all hover:border-accent hover:shadow-[0_0_15px_var(--ring-accent)] neon-flood"
        >
          <Icon className="h-5 w-5 shrink-0" style={{ color: accent }} />
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-ink-muted">{label}</p>
            <p
              className="font-mono text-lg font-bold tabular-nums tracking-tight"
              style={{ color: accent }}
            >
              {value}
            </p>
          </div>
        </motion.div>
      ))}
    </div>
  );
};
