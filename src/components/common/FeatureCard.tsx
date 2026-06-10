import React from 'react';
import { LucideIcon } from 'lucide-react';

interface FeatureCardProps {
  icon: LucideIcon;
  title: string;
  description: string;
}

/** Simple content block — avoid icon-grid marketing cards on landing pages. */
export const FeatureCard: React.FC<FeatureCardProps> = ({ icon: Icon, title, description }) => {
  return (
    <article className="rounded-lg border border-border-default bg-surface-raised p-5 shadow-sm">
      <Icon className="mb-3 h-5 w-5 text-accent" aria-hidden="true" />
      <h3 className="text-base font-semibold text-ink-primary">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-ink-secondary">{description}</p>
    </article>
  );
};
