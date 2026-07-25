import { useEffect, useState } from 'react';
import { Shield, Sparkles } from 'lucide-react';
import { gradingService } from '../../services/gradingService';

interface GradingStats {
  total: number;
  avgGrade: number;
  avgTotalScore: number;
  bestScore: number;
  worstScore: number;
  distribution: Array<{ gradeLabel: string; count: number }>;
}

const gradeColor = (label: string): string => {
  if (label.startsWith('10') || label.startsWith('9')) return 'var(--gain)';
  if (label.startsWith('8') || label.startsWith('7')) return 'var(--accent)';
  return 'var(--loss)';
};

export const GradeDistribution: React.FC = () => {
  const [stats, setStats] = useState<GradingStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    gradingService.getGradingStats().then((data) => {
      if (!mounted) return;
      setStats(data);
      setLoading(false);
    }).catch(() => {
      if (mounted) setLoading(false);
    });
    return () => { mounted = false; };
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col items-center gap-6">
        <div className="skeleton h-8 w-48 rounded" />
        <div className="skeleton h-40 w-full max-w-md rounded-xl" />
      </div>
    );
  }

  if (!stats || stats.total === 0) {
    return (
      <div className="card-glass-scene flex flex-col items-center gap-4 p-8 text-center">
        <Shield className="h-10 w-10" style={{ color: 'var(--accent)' }} />
        <p className="text-lg font-semibold" style={{ color: 'var(--ink-primary)' }}>
          No grades yet
        </p>
        <p className="text-sm" style={{ color: 'var(--ink-muted)' }}>
          Grade a card to see your distribution
        </p>
      </div>
    );
  }

  const maxCount = Math.max(...stats.distribution.map((d) => d.count), 1);

  return (
    <div className="flex flex-col items-center gap-8 w-full max-w-lg mx-auto">
      <div className="flex items-center gap-3">
        <Sparkles className="h-5 w-5" style={{ color: 'var(--accent)' }} />
        <span className="font-mono text-3xl font-bold tabular-nums" style={{ color: 'var(--ink-primary)' }}>
          {stats.avgGrade.toFixed(1)}
        </span>
        <div className="text-left">
          <p className="text-xs font-medium" style={{ color: 'var(--ink-muted)' }}>Avg grade</p>
          <p className="text-xs" style={{ color: 'var(--ink-muted)' }}>{stats.total} total graded</p>
        </div>
      </div>

      <div className="w-full space-y-2">
        {stats.distribution.map((d) => (
          <div key={d.gradeLabel} className="flex items-center gap-3">
            <span
              className="w-8 text-right text-xs font-mono font-medium"
              style={{ color: gradeColor(d.gradeLabel) }}
            >
              {d.gradeLabel}
            </span>
            <div className="flex-1 h-5 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--surface-inset)' }}>
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{
                  width: `${(d.count / maxCount) * 100}%`,
                  backgroundColor: gradeColor(d.gradeLabel),
                }}
              />
            </div>
            <span className="w-6 text-xs tabular-nums" style={{ color: 'var(--ink-muted)' }}>
              {d.count}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};
