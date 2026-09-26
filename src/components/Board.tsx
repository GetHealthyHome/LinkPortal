import { useEffect, useState } from 'react';
import { AppIconImage, TileLabel } from './AppIcon';
import { FolderIconImage } from './FolderIcon';
import { EditableGrid, type GridEntry } from './EditableGrid';
import {
  dropOnto,
  itemKey,
  moveInFolder,
  moveItem,
  moveOutOfFolder,
  moveToEnd,
  removeApp,
  renameFolder,
  ungroupFolder,
} from '../lib/layout';
import type { App, FolderItem, Layout, MasterFolder } from '../lib/types';

export const GRID_CLASSES =
  'grid grid-cols-4 gap-x-2 gap-y-7 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 sm:gap-x-4';

interface BoardProps {
  layout: Layout;
  apps: Map<string, App>;
  masterFolders: MasterFolder[];
  editing?: boolean;
  onChange?: (layout: Layout) => void;
}

/** The iPad-style home screen. Read-only unless `editing` is set. */
export function Board({ layout, apps, masterFolders, editing = false, onChange }: BoardProps) {
  const [openFolderId, setOpenFolderId] = useState<string | null>(null);
  const openFolder = layout.find((i): i is FolderItem => i.type === 'folder' && i.id === openFolderId);
  const visible = layout.filter((item) => item.type === 'folder' || apps.has(item.id));
  const change = (next: Layout) => onChange?.(next);

  const folderModal = openFolder && (
    <FolderModal
      folder={openFolder}
      apps={apps}
      editing={editing}
      onClose={() => setOpenFolderId(null)}
      onRename={(name) => change(renameFolder(layout, openFolder.id, name))}
      onReorder={(from, to, side) => change(moveInFolder(layout, openFolder.id, from, to, side))}
      onMoveToEnd={(from) => {
        const last = openFolder.apps[openFolder.apps.length - 1];
        if (last && last !== from) change(moveInFolder(layout, openFolder.id, from, last, 'after'));
      }}
      onTakeOut={(appId) => {
        if (openFolder.apps.length <= 1) setOpenFolderId(null);
        change(moveOutOfFolder(layout, openFolder.id, appId));
      }}
      onUngroup={() => {
        setOpenFolderId(null);
        change(ungroupFolder(layout, openFolder.id));
      }}
    />
  );

  if (!editing) {
    return (
      <>
        <div className={GRID_CLASSES}>
          {visible.map((item) =>
            item.type === 'app' ? (
              <AppLink key={itemKey(item)} app={apps.get(item.id)!} />
            ) : (
              <button
                key={itemKey(item)}
                type="button"
                onClick={() => setOpenFolderId(item.id)}
                className="flex flex-col items-center justify-self-center rounded-2xl outline-none transition-transform focus-visible:ring-2 focus-visible:ring-white active:scale-95"
              >
                <FolderIconImage folder={item} apps={apps} />
                <TileLabel>{item.name}</TileLabel>
              </button>
            ),
          )}
        </div>
        {folderModal}
      </>
    );
  }

  const entries: GridEntry[] = visible.map((item) =>
    item.type === 'app'
      ? {
          key: itemKey(item),
          acceptsDrop: true,
          canDropOnto: true,
          render: () => (
            <div className="flex flex-col items-center">
              <AppIconImage app={apps.get(item.id)!} />
              <TileLabel>{apps.get(item.id)!.name}</TileLabel>
            </div>
          ),
          badge: { label: `Remove ${apps.get(item.id)!.name}`, symbol: '−', onClick: () => change(removeApp(layout, item.id)) },
        }
      : {
          key: itemKey(item),
          acceptsDrop: true,
          canDropOnto: false,
          render: () => (
            <div className="flex flex-col items-center">
              <FolderIconImage folder={item} apps={apps} />
              <TileLabel>{item.name}</TileLabel>
            </div>
          ),
          onTap: () => setOpenFolderId(item.id),
        },
  );

  return (
    <>
      <EditableGrid
        className={GRID_CLASSES}
        entries={entries}
        onMove={(from, to, side) => change(moveItem(layout, from, to, side))}
        onDropOnto={(from, to) => change(dropOnto(layout, from, to, apps, masterFolders))}
        onMoveToEnd={(from) => change(moveToEnd(layout, from))}
      />
      {folderModal}
    </>
  );
}

function AppLink({ app }: { app: App }) {
  return (
    <a
      href={app.url}
      target="_blank"
      rel="noopener noreferrer"
      title={app.name}
      className="flex flex-col items-center justify-self-center rounded-2xl outline-none transition-transform focus-visible:ring-2 focus-visible:ring-white active:scale-95"
    >
      <AppIconImage app={app} />
      <TileLabel>{app.name}</TileLabel>
    </a>
  );
}

function FolderModal({
  folder,
  apps,
  editing,
  onClose,
  onRename,
  onReorder,
  onMoveToEnd,
  onTakeOut,
  onUngroup,
}: {
  folder: FolderItem;
  apps: Map<string, App>;
  editing: boolean;
  onClose: () => void;
  onRename: (name: string) => void;
  onReorder: (fromKey: string, toKey: string, side: 'before' | 'after') => void;
  onMoveToEnd: (fromKey: string) => void;
  onTakeOut: (appId: string) => void;
  onUngroup: () => void;
}) {
  const folderApps = folder.apps.map((id) => apps.get(id)).filter((a): a is App => Boolean(a));
  const grid = 'grid grid-cols-3 gap-x-3 gap-y-6 sm:grid-cols-4';

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/35 p-4 backdrop-blur-xl"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={folder.name}
    >
      <div className="w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
        {editing ? (
          <input
            value={folder.name}
            onChange={(e) => onRename(e.target.value)}
            onBlur={(e) => !e.target.value.trim() && onRename('Folder')}
            maxLength={40}
            aria-label="Folder name"
            className="mb-5 w-full rounded-xl bg-white/20 px-4 py-2 text-center text-2xl font-semibold text-white placeholder-white/60 outline-none focus:bg-white/30"
          />
        ) : (
          <h2 className="mb-5 text-center text-3xl font-semibold text-white [text-shadow:0_1px_4px_rgb(0_0_0/0.5)]">
            {folder.name}
          </h2>
        )}

        <div className="rounded-[2rem] bg-white/25 p-6 shadow-2xl ring-1 ring-white/20">
          {editing ? (
            <EditableGrid
              className={grid}
              entries={folderApps.map((app) => ({
                key: app.id,
                acceptsDrop: false,
                canDropOnto: false,
                render: () => (
                  <div className="flex flex-col items-center">
                    <AppIconImage app={app} />
                    <TileLabel>{app.name}</TileLabel>
                  </div>
                ),
                badge: { label: `Take ${app.name} out of the folder`, symbol: '↑', onClick: () => onTakeOut(app.id) },
              }))}
              onMove={onReorder}
              onMoveToEnd={onMoveToEnd}
            />
          ) : (
            <div className={grid}>
              {folderApps.map((app) => (
                <AppLink key={app.id} app={app} />
              ))}
            </div>
          )}
        </div>

        {editing && (
          <div className="mt-4 flex flex-wrap items-center justify-center gap-3 text-sm">
            <span className="text-white/80">Drag to reorder · ↑ takes an app out</span>
            <button type="button" onClick={onUngroup} className="rounded-full bg-white/20 px-4 py-1.5 font-medium text-white hover:bg-white/30">
              Ungroup folder
            </button>
            <button type="button" onClick={onClose} className="rounded-full bg-white px-4 py-1.5 font-medium text-neutral-900 hover:bg-white/90">
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
