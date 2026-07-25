interface MarqueeTextProps {
  text: string;
  className?: string;
  speed?: number;
}

export const MarqueeText: React.FC<MarqueeTextProps> = ({
  text,
  className = '',
  speed = 30,
}) => {
  return (
    <div className={`marquee-container ${className}`}>
      <div
        className="marquee-content"
        style={{ animationDuration: `${speed}s` }}
      >
        <span className="flex items-center gap-12 text-xs font-bold uppercase tracking-[0.2em] text-ink-muted">
          {text}
          <span className="h-1.5 w-1.5 rounded-full bg-accent shadow-[0_0_6px_var(--accent)]" />
          {text}
          <span className="h-1.5 w-1.5 rounded-full bg-accent shadow-[0_0_6px_var(--accent)]" />
          {text}
          <span className="h-1.5 w-1.5 rounded-full bg-accent shadow-[0_0_6px_var(--accent)]" />
          {text}
          <span className="h-1.5 w-1.5 rounded-full bg-accent shadow-[0_0_6px_var(--accent)]" />
          {text}
          <span className="h-1.5 w-1.5 rounded-full bg-accent shadow-[0_0_6px_var(--accent)]" />
          {text}
          <span className="h-1.5 w-1.5 rounded-full bg-accent shadow-[0_0_6px_var(--accent)]" />
          {text}
          <span className="h-1.5 w-1.5 rounded-full bg-accent shadow-[0_0_6px_var(--accent)]" />
          {text}
          <span className="h-1.5 w-1.5 rounded-full bg-accent shadow-[0_0_6px_var(--accent)]" />
          {text}
          <span className="h-1.5 w-1.5 rounded-full bg-accent shadow-[0_0_6px_var(--accent)]" />
          {text}
          <span className="h-1.5 w-1.5 rounded-full bg-accent shadow-[0_0_6px_var(--accent)]" />
        </span>
      </div>
    </div>
  );
};
