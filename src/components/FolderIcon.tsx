import { AppIconImage } from './AppIcon';
import type { App, FolderItem } from '../lib/types';

/** A folder tile: a frosted square with a 3x3 preview of the apps inside. */
export function FolderIconImage({ folder, apps }: { folder: FolderItem; apps: Map<string, App> }) {
  const preview = folder.apps
    .map((id) => apps.get(id))
    .filter((a): a is App => Boolean(a))
    .slice(0, 9);

  return (
    <div className="grid size-16 grid-cols-3 content-start gap-[3px] rounded-[22%] bg-white/30 p-[7px] shadow-md ring-1 ring-white/20 backdrop-blur-md sm:size-[72px] sm:gap-1 sm:p-2">
      {preview.map((app) => (
        <AppIconImage key={app.id} app={app} className="aspect-square w-full" small />
      ))}
    </div>
  );
}
