'use client'

export function HeroBackground() {
  return (
    <div className="pointer-events-none absolute inset-y-0 right-8 hidden md:block overflow-hidden">
      {/* blue dot near center */}
      <div className="absolute left-1/2 top-6 h-3 w-3 -translate-x-1/2 rounded-full bg-sky-500/60" />
      
      {/* yellow dot */}
      <div className="absolute right-64 top-12 h-4 w-4 rounded-full bg-amber-400/70" />
      
      {/* green blob far right */}
      <div className="absolute right-16 top-8 h-7 w-7 rounded-full bg-emerald-500/70" />
      
      {/* dashed triangle outline */}
      <svg
        className="absolute right-40 top-2 h-28 w-28 text-sky-400/40"
        viewBox="0 0 100 100"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <polygon
          points="10,80 80,50 10,20"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeDasharray="4 4"
        />
      </svg>
    </div>
  )
}

