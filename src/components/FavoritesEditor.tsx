import { useCallback, useEffect, useState } from 'react';
import { AppIconImage } from './AppIcon';
import { api } from '../lib/api';
import type { App } from '../lib/types';

export const MAX_PINS = 5;

/** Loads a person's favorites and saves pin changes straight away. */
export function useFavorites(personId: string, token: string | null, onAuthError: (message: string) => void) {
  const [pinned, setPinned] = useState<string[] | null>(null);
  const [bar, setBar] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const f = await api.getFavorites(personId);
      setPinned(f.pinned);
      setBar(f.bar);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [personId]);

  useEffect(() => {
    if (token) void refresh();
  }, [token, refresh]);

  async function save(next: string[]) {
    if (!token) return;
    setPinned(next);
    setError(null);
    try {
      await api.savePins(token, personId, next);
      await refresh();
    } catch (e) {
      const message = (e as Error).message;
      setError(message);
      if (/PIN|sign-in/i.test(message)) onAuthError('Your session timed out. Enter your PIN to keep going.');
    }
  }

  return { pinned, bar, error, refresh, save };
}

/** The "Favorites bar" card on the settings page: pin, unpin and order apps. */
export function FavoritesEditor({
  boardApps,
  pinned,
  error,
  onSave,
}: {
  boardApps: App[];
  pinned: string[] | null;
  error: string | null;
  onSave: (pinned: string[]) => void;
}) {
  if (pinned === null) return null;
  const byId = new Map(boardApps.map((a) => [a.id, a]));
  const pinnedApps = pinned.map((id) => byId.get(id)).filter((a): a is App => Boolean(a));
  const unpinned = boardApps.filter((a) => !pinned.includes(a.id));
  const full = pinnedApps.length >= MAX_PINS;
  const ids = pinnedApps.map((a) => a.id);

  function move(index: number, delta: number) {
    const next = [...ids];
    [next[index], next[index + delta]] = [next[index + delta], next[index]];
    onSave(next);
  }

  return (
    <section className="mt-12 rounded-3xl bg-white p-5 text-neutral-900 shadow-2xl sm:p-7">
      <h2 className="text-xl font-semibold">Favorites bar</h2>
      <p className="mt-1 text-sm text-neutral-600">
        The bar at the top shows your {MAX_PINS} most-opened apps. Pin apps to keep them there no matter what. Pinned
        apps come first, and the rest fill in automatically.
      </p>

      <h3 className="mt-5 text-sm font-semibold uppercase tracking-wide text-neutral-500">
        Pinned ({pinnedApps.length}/{MAX_PINS})
      </h3>
      {pinnedApps.length === 0 ? (
        <p className="mt-2 text-sm text-neutral-500">Nothing pinned. Your bar fills itself with the apps you open most.</p>
      ) : (
        <ol className="mt-2 space-y-2">
          {pinnedApps.map((app, i) => (
            <li key={app.id} className="flex items-center gap-3 rounded-2xl border border-indigo-200 bg-indigo-50 p-2.5">
              <AppIconImage app={app} className="size-10" />
              <span className="min-w-0 flex-1 truncate font-medium">{app.name}</span>
              <button type="button" className="btn-small" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`Move ${app.name} left`}>
                ←
              </button>
              <button
                type="button"
                className="btn-small"
                disabled={i === pinnedApps.length - 1}
                onClick={() => move(i, 1)}
                aria-label={`Move ${app.name} right`}
              >
                →
              </button>
              <button type="button" className="btn-small" onClick={() => onSave(ids.filter((id) => id !== app.id))}>
                Unpin
              </button>
            </li>
          ))}
        </ol>
      )}

      {unpinned.length > 0 && (
        <>
          <h3 className="mt-6 text-sm font-semibold uppercase tracking-wide text-neutral-500">
            {full ? `Unpin one to pin another (max ${MAX_PINS})` : 'Tap to pin'}
          </h3>
          <div className="mt-2 flex flex-wrap gap-2">
            {unpinned.map((app) => (
              <button
                key={app.id}
                type="button"
                disabled={full}
                onClick={() => onSave([...ids, app.id])}
                className="flex items-center gap-2 rounded-full border border-neutral-200 py-1 pl-1 pr-3 text-sm font-medium hover:border-indigo-300 hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <AppIconImage app={app} className="size-7" small />
                📌 {app.name}
              </button>
            ))}
          </div>
        </>
      )}

      {error && <p className="mt-4 text-sm text-red-600">Not saved: {error}</p>}
    </section>
  );
}
