import { useState } from 'react';
import { autoIconUrl, tileColor } from '../lib/icons';
import type { App } from '../lib/types';

/** The rounded-square picture for an app (no label). */
export function AppIconImage({
  app,
  className = 'size-16 sm:size-[72px]',
  small = false,
}: {
  app: App;
  className?: string;
  small?: boolean;
}) {
  const src = app.icon_data ?? autoIconUrl(app.url);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  if (!src || failedSrc === src) {
    return (
      <div
        className={`${className} flex items-center justify-center rounded-[22%] font-semibold text-white ${small ? 'text-[8px]' : 'text-2xl shadow-md'}`}
        style={{ backgroundColor: tileColor(app.name) }}
      >
        {app.name.trim().charAt(0).toUpperCase()}
      </div>
    );
  }

  return (
    <div className={`${className} flex items-center justify-center overflow-hidden rounded-[22%] bg-white ${small ? '' : 'shadow-md'}`}>
      <img
        src={src}
        alt=""
        draggable={false}
        className={app.icon_data ? 'size-full object-cover' : 'size-[62%] object-contain'}
        onError={() => setFailedSrc(src)}
      />
    </div>
  );
}

export function TileLabel({ children, folder = false }: { children: React.ReactNode; folder?: boolean }) {
  // Folder names are 4px larger than app names.
  const size = folder ? 'w-20 text-base font-semibold sm:w-28 sm:text-[17px]' : 'w-20 text-xs font-medium sm:w-24 sm:text-[13px]';
  return (
    <span className={`mt-1.5 line-clamp-1 text-center text-white [text-shadow:0_1px_3px_rgb(0_0_0/0.6)] ${size}`}>
      {children}
    </span>
  );
}
