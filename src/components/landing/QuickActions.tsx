import { Link } from 'react-router-dom';
import {
  ArrowLeftRight,
  LineChart,
  Package,
  ScanLine,
  Search,
  ShieldCheck,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react';

const ACTIONS: { key: string; label: string; hint: string; href: string; icon: LucideIcon }[] = [
  { key: 'browse', label: 'Browse', hint: 'Catalog', href: '/browse', icon: Search },
  { key: 'slabs', label: 'Slabs', hint: 'Graded market', href: '/prices', icon: TrendingUp },
  { key: 'vault', label: 'Vault', hint: 'Holdings', href: '/vault', icon: ShieldCheck },
  { key: 'trade', label: 'Trade', hint: 'Fairness', href: '/trade', icon: ArrowLeftRight },
  { key: 'packs', label: 'Packs', hint: 'Rip sims', href: '/packs', icon: Package },
  { key: 'grade', label: 'Grade', hint: 'AI scan', href: '/grading', icon: ScanLine },
  {
    key: 'insights',
    label: 'Insights',
    hint: 'Forecasts',
    href: '/market-insights',
    icon: LineChart,
  },
];

/** Quiet launcher strip — steel captions, not pill clutter. */
export function QuickActions() {
  return (
    <nav aria-label="Quick actions" className="flex flex-wrap items-center gap-x-1 gap-y-2">
      {ACTIONS.map(({ key, label, hint, href, icon: Icon }) => (
        <Link
          key={key}
          to={href}
          className="group inline-flex cursor-pointer items-center gap-2 border-b border-transparent px-3 py-2 text-sm transition-colors duration-200 hover:border-accent/40"
        >
          <Icon className="h-3.5 w-3.5 text-ink-muted transition-colors group-hover:text-accent" />
          <span className="font-medium text-ink-primary">{label}</span>
          <span className="hidden font-mono text-[10px] uppercase tracking-[0.12em] text-ink-muted sm:inline">
            {hint}
          </span>
        </Link>
      ))}
    </nav>
  );
}
