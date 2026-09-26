import type { ReactNode } from 'react';

/** The colourful iPad-like background every portal screen sits on. */
export function Wallpaper({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-dvh overflow-x-hidden bg-[#1e3a8a] text-white">
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0"
        style={{
          background:
            'radial-gradient(circle at 15% 20%, #38bdf8 0, transparent 45%),' +
            'radial-gradient(circle at 85% 15%, #a78bfa 0, transparent 40%),' +
            'radial-gradient(circle at 70% 85%, #f472b6 0, transparent 45%),' +
            'radial-gradient(circle at 20% 90%, #34d399 0, transparent 40%),' +
            'linear-gradient(135deg, #1e40af, #4c1d95)',
        }}
      />
      <div className="relative">{children}</div>
    </div>
  );
}

export function GearIcon({ className = 'size-6' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className={className} aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z"
      />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
    </svg>
  );
}

export function Spinner() {
  return <div className="size-8 animate-spin rounded-full border-4 border-white/30 border-t-white" role="status" aria-label="Loading" />;
}

export function NotConfigured() {
  return (
    <Wallpaper>
      <div className="mx-auto max-w-md px-6 py-24 text-center">
        <h1 className="text-2xl font-semibold">LinkPortal isn’t connected yet</h1>
        <p className="mt-3 text-white/85">
          Set <code className="rounded bg-black/30 px-1">VITE_SUPABASE_URL</code> and{' '}
          <code className="rounded bg-black/30 px-1">VITE_SUPABASE_PUBLISHABLE_KEY</code> (see the README), then reload.
        </p>
      </div>
    </Wallpaper>
  );
}
