import { createClient } from '@supabase/supabase-js';
import type { App, Favorites, Layout, MasterFolder, Person } from './types';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

export const isConfigured = Boolean(url && key);

const supabase = isConfigured
  ? createClient(url!, key!, { auth: { persistSession: false } })
  : null;

async function rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  if (!supabase) throw new Error('LinkPortal is not connected to Supabase yet.');
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

interface UnlockResult {
  ok: boolean;
  token?: string;
  error?: string;
  needs_pin?: boolean;
}

/** Thrown when someone tries to unlock a person who hasn't created a PIN yet. */
export class NeedsPinError extends Error {}

async function unlock(result: Promise<UnlockResult>): Promise<string> {
  const r = await result;
  if (r.needs_pin) throw new NeedsPinError(r.error ?? 'No PIN yet');
  if (!r.ok || !r.token) throw new Error(r.error ?? 'Could not unlock');
  return r.token;
}

export const api = {
  listPeople: () => rpc<Person[]>('list_people'),
  listApps: () => rpc<App[]>('list_apps'),
  listMasterFolders: () => rpc<MasterFolder[]>('list_master_folders'),
  getBoard: async (personId: string) =>
    (await rpc<Layout | null>('get_board', { p_person_id: personId })) ?? [],
  getFavorites: (personId: string) => rpc<Favorites>('get_favorites', { p_person_id: personId }),
  recordVisit: (personId: string, appId: string) =>
    rpc<void>('record_visit', { p_person_id: personId, p_app_id: appId }),
  savePins: (token: string, personId: string, appIds: string[]) =>
    rpc<void>('save_pins', { p_token: token, p_person_id: personId, p_app_ids: appIds }),
  defaultLayout: (appIds: string[]) => rpc<Layout>('default_layout', { p_app_ids: appIds }),

  unlockPerson: (personId: string, pin: string) =>
    unlock(rpc<UnlockResult>('unlock_person', { p_person_id: personId, p_pin: pin })),
  createFirstPin: (personId: string, pin: string) =>
    unlock(rpc<UnlockResult>('create_first_pin', { p_person_id: personId, p_pin: pin })),
  saveBoard: (token: string, personId: string, layout: Layout) =>
    rpc<Layout>('save_board', { p_token: token, p_person_id: personId, p_layout: layout }),
  changePin: (token: string, personId: string, pin: string) =>
    rpc<void>('change_pin', { p_token: token, p_person_id: personId, p_new_pin: pin }),
  endSession: (token: string) => rpc<void>('end_session', { p_token: token }),

  adminLogin: (password: string) =>
    unlock(rpc<UnlockResult>('admin_login', { p_password: password })),
  adminCheck: (token: string) => rpc<boolean>('admin_check', { p_token: token }),
  adminChangePassword: (token: string, password: string) =>
    rpc<void>('admin_change_password', { p_token: token, p_new_password: password }),

  createPerson: (token: string, name: string, pin: string, appIds: string[]) =>
    rpc<string>('admin_create_person', { p_token: token, p_name: name, p_pin: pin, p_app_ids: appIds }),
  renamePerson: (token: string, personId: string, name: string) =>
    rpc<void>('admin_rename_person', { p_token: token, p_person_id: personId, p_name: name }),
  clearPin: (token: string, personId: string) =>
    rpc<void>('admin_clear_pin', { p_token: token, p_person_id: personId }),
  deletePerson: (token: string, personId: string) =>
    rpc<void>('admin_delete_person', { p_token: token, p_person_id: personId }),

  saveApp: (token: string, app: Omit<App, 'id'> & { id: string | null }) =>
    rpc<string>('admin_save_app', {
      p_token: token,
      p_app_id: app.id,
      p_name: app.name,
      p_url: app.url,
      p_icon_data: app.icon_data,
      p_master_folder_id: app.master_folder_id,
    }),
  deleteApp: (token: string, appId: string) =>
    rpc<void>('admin_delete_app', { p_token: token, p_app_id: appId }),
  addAppToPeople: (token: string, appId: string, personIds: string[] | null) =>
    rpc<void>('admin_add_app_to_people', { p_token: token, p_app_id: appId, p_person_ids: personIds }),

  saveMasterFolder: (token: string, id: string | null, name: string, sortOrder: number | null) =>
    rpc<string>('admin_save_master_folder', {
      p_token: token,
      p_folder_id: id,
      p_name: name,
      p_sort_order: sortOrder,
    }),
  deleteMasterFolder: (token: string, id: string) =>
    rpc<void>('admin_delete_master_folder', { p_token: token, p_folder_id: id }),
};
