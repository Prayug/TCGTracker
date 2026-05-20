import React from 'react';
import { LucideIcon } from 'lucide-react';

interface FeatureCardProps {
  icon: LucideIcon;
  title: string;
  description: string;
}

export const FeatureCard: React.FC<FeatureCardProps> = ({ icon: Icon, title, description }) => {
  return (
    <article className="group rounded-xl border border-white/10 bg-white/[0.04] p-4 backdrop-blur transition-transform duration-300 hover:-translate-y-0.5 hover:border-violet-300/40 hover:bg-white/[0.07]">
      <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-black/30 text-violet-300 transition-colors group-hover:bg-violet-500/20">
        <Icon className="h-5 w-5" aria-hidden="true" />
      </div>
      <h3 className="text-base font-semibold text-white">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-slate-300">{description}</p>
    </article>
  );
};
