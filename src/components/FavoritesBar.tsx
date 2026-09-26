import { AppIconImage } from './AppIcon';
import type { App } from '../lib/types';

/**
 * The frosted-glass strip of up to 5 favorite apps that stays at the top of the
 * screen, like the iPad dock.
 */
export function FavoritesBar({
  apps,
  pinned,
  onOpenApp,
}: {
  apps: App[];
  pinned?: Set<string>;
  onOpenApp?: (appId: string) => void;
}) {
  if (apps.length === 0) return null;

  return (
    <div className="flex flex-col items-center">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-white/90 [text-shadow:0_1px_3px_rgb(0_0_0/0.45)]">
        Most Visited
      </h2>
      <nav
        aria-label="Most visited"
        className="mx-auto flex w-fit max-w-full items-start gap-2 overflow-x-auto rounded-[28px] bg-white/20 px-3 pb-2 pt-3 shadow-[0_8px_32px_rgb(0_0_0/0.22)] ring-1 ring-inset ring-white/35 backdrop-blur-2xl backdrop-saturate-150 sm:gap-5 sm:px-5"
      >
        {apps.map((app) => (
          <a
            key={app.id}
            href={app.url}
            target="_blank"
            rel="noopener noreferrer"
            title={app.name}
            onClick={() => onOpenApp?.(app.id)}
            className="relative flex shrink-0 flex-col items-center rounded-2xl outline-none transition-transform focus-visible:ring-2 focus-visible:ring-white active:scale-95"
          >
            <AppIconImage app={app} className="size-11 sm:size-14" />
            <span className="mt-1 line-clamp-1 w-14 text-center text-[11px] sm:w-16 font-medium text-white [text-shadow:0_1px_3px_rgb(0_0_0/0.6)]">
              {app.name}
            </span>
            {pinned?.has(app.id) && (
              <span
                aria-label="Pinned"
                title="Pinned"
                className="absolute -right-1 -top-1 flex size-5 items-center justify-center rounded-full bg-white text-[10px] shadow"
              >
                📌
              </span>
            )}
          </a>
        ))}
      </nav>
    </div>
  );
}
