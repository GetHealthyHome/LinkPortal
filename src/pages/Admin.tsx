import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AppIconImage } from '../components/AppIcon';
import { Spinner } from '../components/Wallpaper';
import { api } from '../lib/api';
import { resizeIcon } from '../lib/icons';
import { session } from '../lib/session';
import type { App, MasterFolder } from '../lib/types';
import { usePortalData } from '../lib/usePortalData';

type Tab = 'people' | 'apps' | 'folders' | 'account';

export function Admin() {
  const [token, setToken] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const saved = session.getAdminToken();
    if (!saved) return setChecking(false);
    api
      .adminCheck(saved)
      .then((ok) => (ok ? setToken(saved) : session.setAdminToken(null)))
      .catch(() => {})
      .finally(() => setChecking(false));
  }, []);

  function signOut() {
    if (token) void api.endSession(token).catch(() => {});
    session.setAdminToken(null);
    setToken(null);
  }

  return (
    <div className="min-h-dvh bg-neutral-100 text-neutral-900">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3 sm:px-6">
          <Link to="/" className="flex items-center gap-2 font-semibold">
            <img src="/favicon.svg" alt="" className="size-7" />
            LinkPortal <span className="font-normal text-neutral-500">Admin</span>
          </Link>
          <div className="flex items-center gap-2">
            <Link to="/" className="btn-secondary">
              Back to portal
            </Link>
            {token && (
              <button type="button" onClick={signOut} className="btn-secondary">
                Sign out
              </button>
            )}
          </div>
        </div>
      </header>

      {checking ? (
        <div className="flex justify-center py-24 text-indigo-600">
          <Spinner />
        </div>
      ) : token ? (
        <Dashboard token={token} onExpired={signOut} />
      ) : (
        <Login
          onLogin={(t) => {
            session.setAdminToken(t);
            setToken(t);
          }}
        />
      )}
    </div>
  );
}

function Login({ onLogin }: { onLogin: (token: string) => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onLogin(await api.adminLogin(password));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="card mx-auto mt-20 max-w-sm">
      <h1 className="text-xl font-semibold">Admin sign-in</h1>
      <label className="mt-4 block text-sm font-medium">
        Admin password
        <input type="password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} className="input mt-1" autoComplete="current-password" />
      </label>
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      <button type="submit" disabled={busy || !password} className="btn-primary mt-4 w-full">
        {busy ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  );
}

function Dashboard({ token, onExpired }: { token: string; onExpired: () => void }) {
  const data = usePortalData();
  const [tab, setTab] = useState<Tab>('people');

  /** Runs an admin action, reloads the lists, and shows any error. */
  async function run(action: () => Promise<unknown>): Promise<boolean> {
    try {
      await action();
      await data.reload();
      return true;
    } catch (e) {
      const message = (e as Error).message;
      if (/sign-in required/i.test(message)) {
        alert('Your admin session has ended. Please sign in again.');
        onExpired();
      } else {
        alert(message);
      }
      return false;
    }
  }

  const tabs: [Tab, string][] = [
    ['people', `People (${data.people.length})`],
    ['apps', `Apps (${data.appList.length})`],
    ['folders', `Master folders (${data.masterFolders.length})`],
    ['account', 'Admin password'],
  ];

  return (
    <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
      <nav className="flex gap-1 overflow-x-auto rounded-2xl bg-neutral-200/70 p-1" role="tablist">
        {tabs.map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={`whitespace-nowrap rounded-xl px-4 py-2 text-sm font-medium ${tab === id ? 'bg-white shadow-sm' : 'text-neutral-600 hover:text-neutral-900'}`}
          >
            {label}
          </button>
        ))}
      </nav>

      {data.loading ? (
        <div className="flex justify-center py-16 text-indigo-600">
          <Spinner />
        </div>
      ) : data.error ? (
        <p className="card mt-6 text-red-600">{data.error}</p>
      ) : (
        <div className="mt-6">
          {tab === 'people' && <PeopleTab token={token} data={data} run={run} />}
          {tab === 'apps' && <AppsTab token={token} data={data} run={run} />}
          {tab === 'folders' && <FoldersTab token={token} folders={data.masterFolders} apps={data.appList} run={run} />}
          {tab === 'account' && <AccountTab token={token} />}
        </div>
      )}
    </main>
  );
}

type Data = ReturnType<typeof usePortalData>;
type Run = (action: () => Promise<unknown>) => Promise<boolean>;

// ---------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------

function PeopleTab({ token, data, run }: { token: string; data: Data; run: Run }) {
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [selectedApps, setSelectedApps] = useState<Set<string>>(new Set());

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (pin && !/^\d{4}$/.test(pin)) return alert('The PIN must be exactly 4 digits, or left blank.');
    if (await run(() => api.createPerson(token, name.trim(), pin, [...selectedApps]))) {
      setName('');
      setPin('');
      setSelectedApps(new Set());
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
      <form onSubmit={add} className="card h-fit">
        <h2 className="text-lg font-semibold">Add a person</h2>
        <label className="mt-4 block text-sm font-medium">
          Name
          <input className="input mt-1" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} required />
        </label>
        <label className="mt-3 block text-sm font-medium">
          4-digit PIN <span className="font-normal text-neutral-500">(optional)</span>
          <input
            className="input mt-1 tracking-[0.4em]"
            inputMode="numeric"
            maxLength={4}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
            autoComplete="off"
          />
          <span className="mt-1 block text-xs font-normal text-neutral-500">
            Leave blank and they’ll create their own PIN the first time they tap the gear.
          </span>
        </label>
        <fieldset className="mt-4">
          <legend className="text-sm font-medium">Starting apps</legend>
          <p className="text-xs text-neutral-500">They’ll be grouped using your master folders.</p>
          <AppChecklist apps={data.appList} folders={data.masterFolders} selected={selectedApps} onChange={setSelectedApps} />
        </fieldset>
        <button type="submit" className="btn-primary mt-4 w-full" disabled={!name.trim() || (pin.length > 0 && pin.length !== 4)}>
          Add person
        </button>
      </form>

      <div className="card h-fit">
        <h2 className="text-lg font-semibold">Everyone</h2>
        {data.people.length === 0 && <p className="mt-3 text-sm text-neutral-500">No one yet.</p>}
        <ul className="mt-2 divide-y divide-neutral-100">
          {data.people.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-2 py-3">
              <span className="min-w-0 flex-1 truncate font-medium">
                {p.name}
                {p.has_pin === false && (
                  <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">No PIN yet</span>
                )}
              </span>
              <Link to={`/settings/${p.id}`} className="btn-small">
                Edit apps
              </Link>
              <button
                type="button"
                className="btn-small"
                onClick={() => {
                  const next = prompt(`New name for ${p.name}:`, p.name)?.trim();
                  if (next && next !== p.name) void run(() => api.renamePerson(token, p.id, next));
                }}
              >
                Rename
              </button>
              <button
                type="button"
                className="btn-small"
                onClick={() => {
                  const answer = prompt(
                    `New 4-digit PIN for ${p.name}.\n\nOr leave this blank and click OK to clear it, so ${p.name} creates a new PIN next time.`,
                  );
                  if (answer === null) return;
                  const next = answer.trim();
                  if (next === '') {
                    void run(() => api.clearPin(token, p.id)).then(
                      (ok) => ok && alert(`${p.name}’s PIN was cleared. They’ll create a new one next time they tap the gear.`),
                    );
                    return;
                  }
                  if (!/^\d{4}$/.test(next)) return alert('The PIN must be exactly 4 digits.');
                  void run(() => api.changePin(token, p.id, next)).then((ok) => ok && alert(`${p.name}’s PIN was changed.`));
                }}
              >
                Reset PIN
              </button>
              <button
                type="button"
                className="btn-small text-red-600"
                onClick={() => confirm(`Remove ${p.name} and their home screen?`) && void run(() => api.deletePerson(token, p.id))}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function AppChecklist({
  apps,
  folders,
  selected,
  onChange,
}: {
  apps: App[];
  folders: MasterFolder[];
  selected: Set<string>;
  onChange: (s: Set<string>) => void;
}) {
  if (apps.length === 0) return <p className="mt-2 text-sm text-neutral-500">Add some apps first (Apps tab).</p>;
  const folderName = (id: string | null) => folders.find((f) => f.id === id)?.name;
  return (
    <div className="mt-2 max-h-72 space-y-1 overflow-y-auto rounded-xl border border-neutral-200 p-2">
      <label className="flex items-center gap-2 px-1 py-1 text-sm text-neutral-600">
        <input
          type="checkbox"
          className="size-4 accent-indigo-600"
          checked={selected.size === apps.length}
          onChange={(e) => onChange(new Set(e.target.checked ? apps.map((a) => a.id) : []))}
        />
        Select all
      </label>
      {apps.map((app) => (
        <label key={app.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-1 py-1 hover:bg-neutral-50">
          <input
            type="checkbox"
            className="size-4 accent-indigo-600"
            checked={selected.has(app.id)}
            onChange={(e) => {
              const next = new Set(selected);
              if (e.target.checked) next.add(app.id);
              else next.delete(app.id);
              onChange(next);
            }}
          />
          <AppIconImage app={app} className="size-7" small />
          <span className="flex-1 truncate text-sm">{app.name}</span>
          {folderName(app.master_folder_id) && <span className="text-xs text-neutral-400">{folderName(app.master_folder_id)}</span>}
        </label>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Apps
// ---------------------------------------------------------------------------

type Draft = { id: string | null; name: string; url: string; icon_data: string | null; master_folder_id: string | null };
const emptyDraft: Draft = { id: null, name: '', url: 'https://', icon_data: null, master_folder_id: null };

function AppsTab({ token, data, run }: { token: string; data: Data; run: Run }) {
  const [draft, setDraft] = useState<Draft | null>(null);

  return (
    <div className="card">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Company apps & websites</h2>
        <button type="button" className="btn-primary" onClick={() => setDraft(emptyDraft)}>
          Add app
        </button>
      </div>
      {data.appList.length === 0 && <p className="mt-3 text-sm text-neutral-500">No apps yet. Add the websites and tools your company uses.</p>}
      <ul className="mt-3 divide-y divide-neutral-100">
        {data.appList.map((app) => (
          <li key={app.id} className="flex flex-wrap items-center gap-3 py-3">
            <AppIconImage app={app} className="size-11" />
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium">{app.name}</div>
              <div className="truncate text-xs text-neutral-500">
                {app.url}
                {app.master_folder_id && ` · ${data.masterFolders.find((f) => f.id === app.master_folder_id)?.name ?? ''}`}
              </div>
            </div>
            <button type="button" className="btn-small" onClick={() => setDraft({ ...app })}>
              Edit
            </button>
            <button
              type="button"
              className="btn-small"
              title="Add this app to every person’s home screen"
              onClick={() =>
                confirm(`Add ${app.name} to everyone’s home screen?`) &&
                void run(() => api.addAppToPeople(token, app.id, null)).then((ok) => ok && alert(`${app.name} was added for everyone.`))
              }
            >
              Give to everyone
            </button>
            <button
              type="button"
              className="btn-small text-red-600"
              onClick={() => confirm(`Delete ${app.name}? It will disappear from everyone’s home screen.`) && void run(() => api.deleteApp(token, app.id))}
            >
              Delete
            </button>
          </li>
        ))}
      </ul>

      {draft && (
        <AppForm
          draft={draft}
          folders={data.masterFolders}
          onCancel={() => setDraft(null)}
          onSave={async (d, giveToEveryone) => {
            const ok = await run(async () => {
              const id = await api.saveApp(token, d);
              if (giveToEveryone) await api.addAppToPeople(token, id, null);
            });
            if (ok) setDraft(null);
          }}
        />
      )}
    </div>
  );
}

function AppForm({
  draft: initial,
  folders,
  onCancel,
  onSave,
}: {
  draft: Draft;
  folders: MasterFolder[];
  onCancel: () => void;
  onSave: (d: Draft, giveToEveryone: boolean) => Promise<void>;
}) {
  const [draft, setDraft] = useState(initial);
  const [giveToEveryone, setGiveToEveryone] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  let validUrl = false;
  try {
    validUrl = /^https?:$/.test(new URL(draft.url).protocol) && new URL(draft.url).hostname.includes('.');
  } catch {
    validUrl = false;
  }

  async function upload(file: File | undefined) {
    if (!file) return;
    try {
      const icon = await resizeIcon(file);
      setDraft((d) => ({ ...d, icon_data: icon }));
    } catch (e) {
      alert((e as Error).message);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    await onSave({ ...draft, name: draft.name.trim(), url: draft.url.trim() }, giveToEveryone);
    setBusy(false);
  }

  const preview: App = { ...draft, id: 'preview', name: draft.name || '?' };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onCancel}>
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()} className="card max-h-[90dvh] w-full max-w-md overflow-y-auto">
        <h2 className="text-lg font-semibold">{draft.id ? 'Edit app' : 'Add an app'}</h2>

        <label className="mt-4 block text-sm font-medium">
          Name
          <input className="input mt-1" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} maxLength={60} required autoFocus />
        </label>
        <label className="mt-3 block text-sm font-medium">
          Web address
          <input className="input mt-1" type="url" value={draft.url} onChange={(e) => setDraft({ ...draft, url: e.target.value })} required placeholder="https://" />
        </label>
        <label className="mt-3 block text-sm font-medium">
          Master folder
          <select className="input mt-1" value={draft.master_folder_id ?? ''} onChange={(e) => setDraft({ ...draft, master_folder_id: e.target.value || null })}>
            <option value="">None</option>
            {folders.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </label>

        <div className="mt-4 flex items-center gap-4">
          {/* Remount when the URL changes so a failed icon gets retried. */}
          <AppIconImage key={draft.icon_data ?? (validUrl ? draft.url : '')} app={preview} />
          <div className="space-y-2 text-sm">
            <p className="text-neutral-600">{draft.icon_data ? 'Using your uploaded icon.' : 'Using the website’s own icon.'}</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn-small" onClick={() => fileInput.current?.click()}>
                Upload icon…
              </button>
              {draft.icon_data && (
                <button type="button" className="btn-small" onClick={() => setDraft({ ...draft, icon_data: null })}>
                  Use website icon
                </button>
              )}
            </div>
            <input ref={fileInput} type="file" accept="image/*" hidden onChange={(e) => void upload(e.target.files?.[0])} />
          </div>
        </div>

        {!draft.id && (
          <label className="mt-4 flex items-center gap-2 text-sm">
            <input type="checkbox" className="size-4 accent-indigo-600" checked={giveToEveryone} onChange={(e) => setGiveToEveryone(e.target.checked)} />
            Also add it to everyone’s home screen
          </label>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={busy || !draft.name.trim() || !validUrl}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Master folders
// ---------------------------------------------------------------------------

function FoldersTab({ token, folders, apps, run }: { token: string; folders: MasterFolder[]; apps: App[]; run: Run }) {
  const [name, setName] = useState('');

  async function move(index: number, delta: number) {
    if (!folders[index + delta]) return;
    // Renumber everything so the order is always clean.
    const order = folders.map((f) => f.id);
    [order[index], order[index + delta]] = [order[index + delta], order[index]];
    await run(() => Promise.all(order.map((id, i) => api.saveMasterFolder(token, id, folders.find((f) => f.id === id)!.name, i))));
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
      <form
        className="card h-fit"
        onSubmit={async (e) => {
          e.preventDefault();
          if (await run(() => api.saveMasterFolder(token, null, name.trim(), null))) setName('');
        }}
      >
        <h2 className="text-lg font-semibold">Add a master folder</h2>
        <p className="mt-1 text-sm text-neutral-600">
          Master folders are the company’s standard categories (like “Sales” or “HR”). New people start with their apps grouped into these folders,
          and anyone can press “Reset to company layout” to get them back.
        </p>
        <label className="mt-4 block text-sm font-medium">
          Folder name
          <input className="input mt-1" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} required />
        </label>
        <button type="submit" className="btn-primary mt-4 w-full" disabled={!name.trim()}>
          Add folder
        </button>
      </form>

      <div className="card h-fit">
        <h2 className="text-lg font-semibold">Folders</h2>
        {folders.length === 0 && <p className="mt-3 text-sm text-neutral-500">No master folders yet.</p>}
        <ul className="mt-2 divide-y divide-neutral-100">
          {folders.map((f, i) => (
            <li key={f.id} className="flex flex-wrap items-center gap-2 py-3">
              <span className="min-w-0 flex-1 truncate font-medium">
                {f.name}{' '}
                <span className="text-xs font-normal text-neutral-500">
                  {apps.filter((a) => a.master_folder_id === f.id).length} apps
                </span>
              </span>
              <button type="button" className="btn-small" disabled={i === 0} onClick={() => void move(i, -1)} aria-label={`Move ${f.name} up`}>
                ↑
              </button>
              <button type="button" className="btn-small" disabled={i === folders.length - 1} onClick={() => void move(i, 1)} aria-label={`Move ${f.name} down`}>
                ↓
              </button>
              <button
                type="button"
                className="btn-small"
                onClick={() => {
                  const next = prompt('New folder name:', f.name)?.trim();
                  if (next && next !== f.name) void run(() => api.saveMasterFolder(token, f.id, next, null));
                }}
              >
                Rename
              </button>
              <button
                type="button"
                className="btn-small text-red-600"
                onClick={() =>
                  confirm(`Delete the “${f.name}” master folder? Its apps stay, they just won’t be in this category.`) &&
                  void run(() => api.deleteMasterFolder(token, f.id))
                }
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Admin password
// ---------------------------------------------------------------------------

function AccountTab({ token }: { token: string }) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 10) return setMessage({ ok: false, text: 'Use at least 10 characters.' });
    if (password !== confirmPassword) return setMessage({ ok: false, text: 'The passwords don’t match.' });
    try {
      await api.adminChangePassword(token, password);
      setPassword('');
      setConfirmPassword('');
      setMessage({ ok: true, text: 'Admin password changed. Other admin sessions were signed out.' });
    } catch (err) {
      setMessage({ ok: false, text: (err as Error).message });
    }
  }

  return (
    <form onSubmit={submit} className="card max-w-md">
      <h2 className="text-lg font-semibold">Change the admin password</h2>
      <label className="mt-4 block text-sm font-medium">
        New password
        <input className="input mt-1" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
      </label>
      <label className="mt-3 block text-sm font-medium">
        Type it again
        <input className="input mt-1" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} autoComplete="new-password" />
      </label>
      {message && <p className={`mt-3 text-sm ${message.ok ? 'text-green-700' : 'text-red-600'}`}>{message.text}</p>}
      <button type="submit" className="btn-primary mt-4" disabled={!password}>
        Save new password
      </button>
    </form>
  );
}
