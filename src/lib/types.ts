export interface Person {
  id: string;
  name: string;
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
}

export type BoardItem = AppItem | FolderItem;
export type Layout = BoardItem[];
