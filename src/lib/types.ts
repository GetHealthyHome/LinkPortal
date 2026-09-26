export interface Person {
  id: string;
  name: string;
  /** False until the person (or admin) has set a PIN. */
  has_pin: boolean;
  /** Admins' own PIN also unlocks the admin tools. */
  is_admin: boolean;
}

export interface App {
  id: string;
  name: string;
  url: string;
  /** Uploaded icon as a data: URL, or null to use the website's own icon. */
  icon_data: string | null;
  master_folder_id: string | null;
}

export interface MasterFolder {
  id: string;
  name: string;
  sort_order: number;
}

export interface AppItem {
  type: 'app';
  id: string;
}

export interface FolderItem {
  type: 'folder';
  id: string;
  name: string;
  apps: string[];
  /** 'pane' shows the apps in a frosted-glass window on the home screen; otherwise a stack. */
  view?: 'pane';
}

export type BoardItem = AppItem | FolderItem;
export type Layout = BoardItem[];

export interface Favorites {
  /** False when the person has turned the Most Visited bar off. */
  show?: boolean;
  /** Apps the person pinned, in order. */
  pinned: string[];
  /** Up to 5 apps to show: pinned first, then the most opened. */
  bar: string[];
}
