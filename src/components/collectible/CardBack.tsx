import { BrandMark } from '../layout/BrandMark';

/**
 * TCGTracker's own card back (never a publisher's back), used when a card is
 * flipped. Cobalt field, archival frame, the mark at the centre.
 */
export function CardBack() {
  return (
    <div className="card-back relative grid aspect-[63/88] w-full place-items-center overflow-hidden rounded-[4.6%/3.3%]">
      <div className="absolute inset-[5%] rounded-[3.4%/2.4%] border border-white/25" />
      <div className="absolute inset-[9%] rounded-[2.8%/2%] border border-white/10" />
      <div className="relative flex flex-col items-center gap-2 text-white">
        <BrandMark className="h-14 w-14" />
        <span className="font-display text-[13px] font-semibold tracking-[0.02em]">TCGTracker</span>
      </div>
      <span className="absolute bottom-[6%] font-mono text-[9px] text-white/55">
        Collector's archive
      </span>
    </div>
  );
}
