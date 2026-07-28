"use client";

import { memo, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { useChartStable, useYScale } from "./chart-context";
import { resolveYAxisTickCount } from "./y-axis-ticks";

export interface YAxisProps {
  /** Number of tick marks. Default: 5 */
  numTicks?: number;
  /** Format tick values for display. */
  tickFormatter?: (value: number) => string;
  /** Y-scale axis id. Default: primary (`"left"`). */
  yAxisId?: string | number;
  /** Extra class on each tick label. */
  className?: string;
}

export function YAxis(props: YAxisProps) {
  const { containerRef } = useChartStable();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const container = containerRef.current;
  if (!(mounted && container)) {
    return null;
  }

  return <YAxisInner {...props} container={container} />;
}

const YAxisInner = memo(function YAxisInner({
  numTicks,
  tickFormatter = (value: number) => String(value),
  yAxisId,
  className,
  container,
}: YAxisProps & { container: HTMLDivElement }) {
  const { margin } = useChartStable();
  const yScale = useYScale(yAxisId);
  const tickCount = resolveYAxisTickCount(numTicks);

  const labels = useMemo(() => {
    const ticks = yScale.ticks(tickCount);
    return ticks.map((value) => ({
      value,
      label: tickFormatter(value),
      y: (yScale(value) ?? 0) + margin.top,
    }));
  }, [yScale, tickCount, tickFormatter, margin.top]);

  return createPortal(
    <div className="pointer-events-none absolute inset-0">
      {labels.map((item) => (
        <div
          key={`${item.value}`}
          className="absolute left-0 flex -translate-y-1/2 items-center"
          style={{ top: item.y, width: Math.max(0, margin.left - 4) }}
        >
          <span
            className={cn(
              "w-full truncate pr-1 text-right font-mono text-[10px] tabular-nums text-ink-muted",
              className
            )}
          >
            {item.label}
          </span>
        </div>
      ))}
    </div>,
    container
  );
});

YAxis.displayName = "YAxis";

export default YAxis;
