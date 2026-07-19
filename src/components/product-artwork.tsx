import type { Wish } from "@/data/wishes";

const symbols = {
  bag: "M55 74h150l18 112H37L55 74Zm27 0c5-30 22-47 48-47s43 17 48 47",
  towel: "M55 42h150v146H55zM55 42l75 66 75-66",
  thermometer: "M116 34h28v114a30 30 0 1 1-28 0V34Zm14 40v91",
  monitor: "M48 45h164v112H48zM68 65h124v70H68zM105 190h50M130 157v33",
  mobile: "M130 22v40M62 62h136M82 62v62M130 62v92M178 62v54",
  nailfile: "M98 38h64l13 120c3 28-17 45-45 45s-48-17-45-45L98 38Zm32 81a31 31 0 1 0 0 62 31 31 0 0 0 0-62Z",
  pram: "M52 70h128c0 50-28 78-72 78S52 120 52 70Zm128 0h23l12 78H100M115 178h1M193 178h1",
  blanket: "M51 42h154l8 140H65L51 42Zm27 27h128M78 69 65 182",
} as const;

export function ProductArtwork({ wish, compact = false }: { wish: Wish; compact?: boolean }) {
  if (wish.imageUrl) return <div className={`product-artwork product-photo ${compact ? "artwork-compact" : ""}`}>
    {/* Imported products may use local assets or reviewed merchant hosts. */}
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src={wish.imageUrl} alt={wish.title} referrerPolicy="no-referrer" />
  </div>;

  return (
    <div className={`product-artwork palette-${wish.palette}${compact ? " artwork-compact" : ""}`}>
      <svg viewBox="0 0 260 220" aria-hidden="true">
        <path d={symbols[wish.artwork]} fill="currentColor" fillOpacity=".74" stroke="currentColor" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="130" cy="110" r="80" fill="none" stroke="white" strokeOpacity=".34" strokeWidth="2" />
      </svg>
      <span className="artwork-sparkle artwork-sparkle-one">✦</span>
      <span className="artwork-sparkle artwork-sparkle-two">·</span>
    </div>
  );
}
