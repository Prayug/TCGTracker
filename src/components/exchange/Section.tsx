import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';

/**
 * Section header: a sentence-case title on a hairline, an optional one-line
 * note, and at most one quiet link on the right. No eyebrows, no boxes.
 */
export function SectionHeader({
  id,
  title,
  note,
  action,
  as: Tag = 'h2',
  strong = false,
  className,
}: {
  id?: string;
  title: ReactNode;
  note?: ReactNode;
  /** A link (`{ to, label }`) or any small control. */
  action?: { to: string; label: string } | ReactNode;
  as?: 'h2' | 'h3';
  /** Ink rule instead of a hairline: use once per page for the primary section. */
  strong?: boolean;
  className?: string;
}) {
  const isLink =
    action != null &&
    typeof action === 'object' &&
    'to' in (action as object) &&
    'label' in (action as object);
  return (
    <div
      className={cn(
        'flex flex-wrap items-end justify-between gap-x-4 gap-y-1 border-b pb-2',
        strong ? 'border-rule-strong' : 'border-rule',
        className
      )}
    >
      <div className="min-w-0">
        <Tag id={id} className="text-h2 text-ink-primary">
          {title}
        </Tag>
        {note ? <p className="mt-0.5 text-meta text-ink-muted">{note}</p> : null}
      </div>
      {isLink ? (
        <Link
          to={(action as { to: string }).to}
          className="shrink-0 text-[13px] text-accent hover:underline"
        >
          {(action as { label: string }).label}
        </Link>
      ) : (
        ((action as ReactNode) ?? null)
      )}
    </div>
  );
}

/** A section with header and body, spaced for the page rhythm. */
export function Section({
  id,
  title,
  note,
  action,
  strong,
  className,
  children,
}: {
  id: string;
  title: ReactNode;
  note?: ReactNode;
  action?: { to: string; label: string } | ReactNode;
  strong?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={`${id}-h`} className={cn('min-w-0', className)}>
      <SectionHeader id={`${id}-h`} title={title} note={note} action={action} strong={strong} />
      <div className="mt-3">{children}</div>
    </section>
  );
}

/**
 * A compact row of related links: replaces grids of identical "Open →" tiles.
 * Each link reads as a sentence fragment with an optional count.
 */
export function LinkRow({
  label,
  links,
  className,
}: {
  label?: string;
  links: { to: string; label: string; meta?: ReactNode }[];
  className?: string;
}) {
  return (
    <nav aria-label={label ?? 'Related'} className={cn('text-[13.5px]', className)}>
      <ul className="flex flex-wrap items-baseline gap-x-5 gap-y-2">
        {label ? <li className="text-meta text-ink-muted">{label}</li> : null}
        {links.map((l) => (
          <li key={l.to}>
            <Link to={l.to} className="text-accent hover:underline">
              {l.label}
            </Link>
            {l.meta ? (
              <span className="ml-1.5 font-mono text-[12px] text-ink-muted">{l.meta}</span>
            ) : null}
          </li>
        ))}
      </ul>
    </nav>
  );
}
