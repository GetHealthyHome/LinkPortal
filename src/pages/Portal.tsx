import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Board } from '../components/Board';
import { FavoritesBar } from '../components/FavoritesBar';
import { GearIcon, Spinner, Wallpaper } from '../components/Wallpaper';
import { api } from '../lib/api';
import { session } from '../lib/session';
import type { App, Layout } from '../lib/types';
import { usePortalData } from '../lib/usePortalData';

export function Portal() {
  const { people, apps, masterFolders, loading, error } = usePortalData();
  const [personId, setPersonId] = useState<string | null>(() => session.getSelectedPerson());
  const [layout, setLayout] = useState<Layout | null>(null);
  const [boardError, setBoardError] = useState<string | null>(null);
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  const navigate = useNavigate();

  // Forget a remembered person who has since been removed.
  const selected = people.find((p) => p.id === personId) ?? null;
  useEffect(() => {
    if (!loading && personId && !selected) {
      setPersonId(null);
      session.setSelectedPerson(null);
    }
  }, [loading, personId, selected]);

  useEffect(() => {
    if (!selected) {
      setLayout(null);
      return;
    }
    let cancelled = false;
    setLayout(null);
    setFavoriteIds([]);
    api
      .getBoard(selected.id)
      .then((l) => !cancelled && (setLayout(l), setBoardError(null)))
      .catch((e: Error) => !cancelled && setBoardError(e.message));
    // The favorites bar is a nice-to-have: if it fails, just don't show it.
    api
      .getFavorites(selected.id)
      .then((f) => !cancelled && setFavoriteIds(f.bar))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [selected]);

  const favorites = favoriteIds.map((id) => apps.get(id)).filter((a): a is App => Boolean(a));

  function recordVisit(appId: string) {
    if (selected) void api.recordVisit(selected.id, appId).catch(() => {});
  }

  function choose(id: string) {
    setPersonId(id || null);
    session.setSelectedPerson(id || null);
  }

  return (
    <Wallpaper>
      <header className="flex items-center justify-between gap-3 px-4 pt-4 sm:px-8 sm:pt-6">
        <label className="relative">
          <span className="sr-only">Choose your name</span>
          <select
            value={selected?.id ?? ''}
            onChange={(e) => choose(e.target.value)}
            className="max-w-[60vw] cursor-pointer appearance-none rounded-full bg-white/20 py-2 pl-4 pr-9 text-sm font-semibold text-white shadow-sm ring-1 ring-white/25 backdrop-blur-md outline-none hover:bg-white/30 focus-visible:ring-2 focus-visible:ring-white sm:text-base [&>option]:text-neutral-900"
          >
            <option value="">Choose your name…</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <span aria-hidden className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-xs">
            ▼
          </span>
        </label>

        <Clock />

        <button
          type="button"
          onClick={() => (selected ? navigate(`/settings/${selected.id}`) : navigate('/admin'))}
          title={selected ? `Set up ${selected.name}’s apps` : 'Admin'}
          aria-label={selected ? `Set up ${selected.name}’s apps` : 'Admin'}
          className="rounded-full bg-white/20 p-2 text-white shadow-sm ring-1 ring-white/25 backdrop-blur-md transition hover:rotate-45 hover:bg-white/30"
        >
          <GearIcon />
        </button>
      </header>

      {selected && favorites.length > 0 && (
        <div className="sticky top-3 z-30 mt-5 px-4 sm:px-8">
          <FavoritesBar apps={favorites} onOpenApp={recordVisit} />
        </div>
      )}

      <main className="mx-auto max-w-6xl px-4 pb-16 pt-10 sm:px-10 sm:pt-12">
        {loading ? (
          <Centered>
            <Spinner />
          </Centered>
        ) : error || boardError ? (
          <Centered>
            <p className="rounded-xl bg-black/30 px-4 py-3">Something went wrong: {error ?? boardError}</p>
          </Centered>
        ) : people.length === 0 ? (
          <Centered>
            <h1 className="text-3xl font-semibold">Welcome to LinkPortal</h1>
            <p className="mt-2 text-white/85">No one has been added yet.</p>
            <Link to="/admin" className="mt-6 rounded-full bg-white px-5 py-2 font-semibold text-indigo-800 hover:bg-white/90">
              Open admin to get started
            </Link>
          </Centered>
        ) : !selected ? (
          <Centered>
            <h1 className="text-3xl font-semibold">Hello!</h1>
            <p className="mt-2 text-white/85">Choose your name in the top-left corner to see your apps.</p>
          </Centered>
        ) : layout === null ? (
          <Centered>
            <Spinner />
          </Centered>
        ) : layout.length === 0 ? (
          <Centered>
            <p className="text-white/90">{selected.name} doesn’t have any apps yet.</p>
            <Link
              to={`/settings/${selected.id}`}
              className="mt-5 rounded-full bg-white px-5 py-2 font-semibold text-indigo-800 hover:bg-white/90"
            >
              Choose apps
            </Link>
          </Centered>
        ) : (
          <Board layout={layout} apps={apps} masterFolders={masterFolders} onOpenApp={recordVisit} />
        )}
      </main>
    </Wallpaper>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col items-center py-20 text-center">{children}</div>;
}

function Clock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="hidden text-center leading-tight sm:block [text-shadow:0_1px_3px_rgb(0_0_0/0.35)]">
      <div className="text-lg font-semibold">{now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</div>
      <div className="text-xs text-white/80">{now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}</div>
    </div>
  );
}
