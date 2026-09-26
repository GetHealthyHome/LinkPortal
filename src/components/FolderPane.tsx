import { AppIconImage, TileLabel } from './AppIcon';
import { paneColumns } from '../lib/layout';
import type { App, FolderItem } from '../lib/types';

/** Static class names (Tailwind needs them written out in full). */
export const PANE_SPAN = { 2: 'col-span-2', 3: 'col-span-3', 4: 'col-span-4' } as const;
const PANE_GRID = { 2: 'grid-cols-2', 3: 'grid-cols-3', 4: 'grid-cols-4' } as const;

export function paneSpanClass(folder: FolderItem): string {
  return PANE_SPAN[paneColumns(folder.apps.length)];
}

/**
 * A folder shown as a frosted-glass window: its name on top and its apps inside,
 * ready to tap. It gets wider as more apps are added.
 */
export function FolderPane({
  folder,
  apps,
  onOpenApp,
  interactive = true,
}: {
  folder: FolderItem;
  apps: Map<string, App>;
  onOpenApp?: (appId: string) => void;
  /** False while editing: icons are shown but aren't links. */
  interactive?: boolean;
}) {
  const folderApps = folder.apps.map((id) => apps.get(id)).filter((a): a is App => Boolean(a));
  const columns = paneColumns(folderApps.length);

  return (
    <section
      aria-label={folder.name}
      className="w-full rounded-[28px] bg-white/20 px-2 pb-3 pt-2.5 shadow-[0_8px_32px_rgb(0_0_0/0.22)] ring-1 ring-inset ring-white/35 backdrop-blur-2xl backdrop-saturate-150 sm:px-3"
    >
      <h2 className="mb-2 truncate px-2 text-lg font-semibold text-white [text-shadow:0_1px_3px_rgb(0_0_0/0.45)]">{folder.name}</h2>
      <div className={`grid ${PANE_GRID[columns]} gap-y-3`}>
        {folderApps.map((app) =>
          interactive ? (
            <a
              key={app.id}
              href={app.url}
              target="_blank"
              rel="noopener noreferrer"
              title={app.name}
              onClick={() => onOpenApp?.(app.id)}
              className="flex flex-col items-center justify-self-center rounded-2xl outline-none transition-transform focus-visible:ring-2 focus-visible:ring-white active:scale-95"
            >
              <AppIconImage app={app} />
              <TileLabel>{app.name}</TileLabel>
            </a>
          ) : (
            <div key={app.id} className="flex flex-col items-center justify-self-center">
              <AppIconImage app={app} />
              <TileLabel>{app.name}</TileLabel>
            </div>
          ),
        )}
      </div>
    </section>
  );
}
