import type { App, BoardItem, FolderItem, Layout, MasterFolder } from './types';

// All functions here are pure: they return a new layout and never mutate.

export type Side = 'before' | 'after';

export const itemKey = (item: BoardItem) => `${item.type}:${item.id}`;

function newId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `f-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  }
}

export function appIdsIn(layout: Layout): string[] {
  return layout.flatMap((item) => (item.type === 'app' ? [item.id] : item.apps));
}

function moveInArray<T>(list: T[], from: number, to: number, side: Side): T[] {
  if (from === to) return list;
  const result = [...list];
  const [moved] = result.splice(from, 1);
  let index = to > from ? to - 1 : to;
  if (side === 'after') index += 1;
  result.splice(index, 0, moved);
  return result;
}

/** Drag an item on the home screen to before/after another item. */
export function moveItem(layout: Layout, fromKey: string, toKey: string, side: Side): Layout {
  const from = layout.findIndex((i) => itemKey(i) === fromKey);
  const to = layout.findIndex((i) => itemKey(i) === toKey);
  if (from < 0 || to < 0) return layout;
  return moveInArray(layout, from, to, side);
}

/** Move an item to the very end of the home screen. */
export function moveToEnd(layout: Layout, fromKey: string): Layout {
  const from = layout.findIndex((i) => itemKey(i) === fromKey);
  if (from < 0) return layout;
  return [...layout.slice(0, from), ...layout.slice(from + 1), layout[from]];
}

/**
 * Drop an app onto another item, like on an iPad:
 * onto a folder adds it to the folder, onto an app makes a new folder.
 */
export function dropOnto(
  layout: Layout,
  fromKey: string,
  toKey: string,
  apps: Map<string, App>,
  masterFolders: MasterFolder[],
): Layout {
  const source = layout.find((i) => itemKey(i) === fromKey);
  const target = layout.find((i) => itemKey(i) === toKey);
  if (!source || !target || source === target || source.type !== 'app') return layout;

  const without = layout.filter((i) => i !== source);
  return without.map((item) => {
    if (item !== target) return item;
    if (target.type === 'folder') {
      return { ...target, apps: [...target.apps, source.id] };
    }
    const folder: FolderItem = {
      type: 'folder',
      id: newId(),
      name: suggestFolderName([target.id, source.id], apps, masterFolders),
      apps: [target.id, source.id],
    };
    return folder;
  });
}

function suggestFolderName(appIds: string[], apps: Map<string, App>, masterFolders: MasterFolder[]): string {
  const folderIds = new Set(appIds.map((id) => apps.get(id)?.master_folder_id ?? null));
  if (folderIds.size === 1) {
    const [only] = folderIds;
    const master = masterFolders.find((f) => f.id === only);
    if (master) return master.name;
  }
  return 'Folder';
}

export function setFolderView(layout: Layout, folderId: string, view: 'stack' | 'pane'): Layout {
  return layout.map((item) => {
    if (item.type !== 'folder' || item.id !== folderId) return item;
    const { view: _old, ...rest } = item;
    return view === 'pane' ? { ...rest, view: 'pane' } : rest;
  });
}

/** How many grid columns a pane spans: it grows with the number of apps inside. */
export function paneColumns(appCount: number): 2 | 3 | 4 {
  if (appCount <= 4) return 2;
  if (appCount <= 6) return 3;
  return 4;
}

export function renameFolder(layout: Layout, folderId: string, name: string): Layout {
  return layout.map((item) =>
    item.type === 'folder' && item.id === folderId ? { ...item, name: name.slice(0, 40) } : item,
  );
}

/** Reorder apps inside a folder. */
export function moveInFolder(layout: Layout, folderId: string, fromAppId: string, toAppId: string, side: Side): Layout {
  return layout.map((item) => {
    if (item.type !== 'folder' || item.id !== folderId) return item;
    const from = item.apps.indexOf(fromAppId);
    const to = item.apps.indexOf(toAppId);
    if (from < 0 || to < 0) return item;
    return { ...item, apps: moveInArray(item.apps, from, to, side) };
  });
}

/** Take an app out of a folder; it lands right after the folder. Empty folders disappear. */
export function moveOutOfFolder(layout: Layout, folderId: string, appId: string): Layout {
  return layout.flatMap((item): BoardItem[] => {
    if (item.type !== 'folder' || item.id !== folderId) return [item];
    const rest = item.apps.filter((id) => id !== appId);
    const loose: BoardItem = { type: 'app', id: appId };
    return rest.length ? [{ ...item, apps: rest }, loose] : [loose];
  });
}

/** Break a folder apart, putting its apps back on the home screen. */
export function ungroupFolder(layout: Layout, folderId: string): Layout {
  return layout.flatMap((item): BoardItem[] =>
    item.type === 'folder' && item.id === folderId
      ? item.apps.map((id) => ({ type: 'app', id }))
      : [item],
  );
}

export function removeApp(layout: Layout, appId: string): Layout {
  return layout.flatMap((item): BoardItem[] => {
    if (item.type === 'app') return item.id === appId ? [] : [item];
    const rest = item.apps.filter((id) => id !== appId);
    return rest.length ? [{ ...item, apps: rest }] : [];
  });
}

/** Add an app: into the folder named after its master folder if there is one, else at the end. */
export function addApp(layout: Layout, app: App, masterFolders: MasterFolder[]): Layout {
  if (appIdsIn(layout).includes(app.id)) return layout;
  const masterName = masterFolders.find((f) => f.id === app.master_folder_id)?.name.toLowerCase();
  const folder = masterName
    ? layout.find((i): i is FolderItem => i.type === 'folder' && i.name.toLowerCase() === masterName)
    : undefined;
  if (folder) {
    return layout.map((item) => (item === folder ? { ...folder, apps: [...folder.apps, app.id] } : item));
  }
  return [...layout, { type: 'app', id: app.id }];
}
