import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AppIconImage } from '../components/AppIcon';
import { Board } from '../components/Board';
import { FavoritesBar } from '../components/FavoritesBar';
import { FavoritesEditor, useFavorites } from '../components/FavoritesEditor';
import { PinPad } from '../components/PinPad';
import { Spinner, Wallpaper } from '../components/Wallpaper';
import { api, NeedsPinError } from '../lib/api';
import { addApp, appIdsIn, removeApp } from '../lib/layout';
import { session } from '../lib/session';
import type { App, Layout } from '../lib/types';
import { usePortalData } from '../lib/usePortalData';

type Auth = { state: 'checking' } | { state: 'locked' } | { state: 'unlocked'; token: string; asAdmin: boolean };
type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export function Settings() {
  const { personId = '' } = useParams();
  const navigate = useNavigate();
  const { people, appList, apps, masterFolders, loading } = usePortalData();
  const person = people.find((p) => p.id === personId);

  const [auth, setAuth] = useState<Auth>({ state: 'checking' });
  const [pinError, setPinError] = useState<string | null>(null);
  const [pinBusy, setPinBusy] = useState(false);
  // Creating a first PIN: null = decide from the person's has_pin; otherwise the
  // step we're on ('create' = type it, 'confirm' = type it again).
  const [createStep, setCreateStep] = useState<'create' | 'confirm' | 'no' | null>(null);
  const [firstPin, setFirstPin] = useState('');
  const [layout, setLayout] = useState<Layout | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showPinForm, setShowPinForm] = useState(false);

  const pending = useRef<Layout | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Work out who is editing: the admin (already signed in) or the person (PIN).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const adminToken = session.getAdminToken();
      if (adminToken && (await api.adminCheck(adminToken).catch(() => false))) {
        if (!cancelled) setAuth({ state: 'unlocked', token: adminToken, asAdmin: true });
        return;
      }
      const personToken = session.getPersonToken(personId);
      if (!cancelled) setAuth(personToken ? { state: 'unlocked', token: personToken, asAdmin: false } : { state: 'locked' });
    })();
    return () => {
      cancelled = true;
    };
  }, [personId]);

  useEffect(() => {
    if (auth.state !== 'unlocked' || layout) return;
    api.getBoard(personId).then(setLayout).catch((e: Error) => setSaveError(e.message));
  }, [auth.state, layout, personId]);

  const lock = useCallback(
    (message: string | null) => {
      session.setPersonToken(personId, null);
      setPinError(message);
      setAuth({ state: 'locked' });
    },
    [personId],
  );

  const favorites = useFavorites(personId, auth.state === 'unlocked' ? auth.token : null, lock);

  const flush = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const next = pending.current;
    if (!next || auth.state !== 'unlocked') return true;
    setSaveState('saving');
    try {
      await api.saveBoard(auth.token, personId, next);
      if (pending.current === next) pending.current = null;
      setSaveState('saved');
      void favorites.refresh();
      setSaveError(null);
      return true;
    } catch (e) {
      const message = (e as Error).message;
      setSaveState('error');
      setSaveError(message);
      if (/PIN|sign-in/i.test(message) && !auth.asAdmin) lock('Your session timed out. Enter your PIN to keep going.');
      return false;
    }
  }, [auth, personId, lock, favorites.refresh]);

  function update(next: Layout) {
    setLayout(next);
    pending.current = next;
    setSaveState('saving');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), 500);
  }

  // Once re-unlocked after a timeout, save anything that was waiting.
  useEffect(() => {
    if (auth.state === 'unlocked' && pending.current) void flush();
  }, [auth, flush]);

  async function unlock(pin: string) {
    setPinBusy(true);
    setPinError(null);
    try {
      const signIn = await api.unlockPerson(personId, pin);
      session.savePersonSignIn(personId, signIn);
      setAuth({ state: 'unlocked', token: signIn.token, asAdmin: false });
    } catch (e) {
      if (e instanceof NeedsPinError) setCreateStep('create');
      else setPinError((e as Error).message);
    } finally {
      setPinBusy(false);
    }
  }

  async function createPin(pin: string) {
    if (createStep !== 'confirm') {
      setFirstPin(pin);
      setPinError(null);
      setCreateStep('confirm');
      return;
    }
    if (pin !== firstPin) {
      setFirstPin('');
      setPinError('Those PINs didn’t match. Try again.');
      setCreateStep('create');
      return;
    }
    setPinBusy(true);
    setPinError(null);
    try {
      const signIn = await api.createFirstPin(personId, pin);
      session.savePersonSignIn(personId, signIn);
      setAuth({ state: 'unlocked', token: signIn.token, asAdmin: false });
    } catch (e) {
      // Someone else set it in the meantime: fall back to entering the PIN.
      setCreateStep('no');
      setPinError((e as Error).message);
    } finally {
      setPinBusy(false);
    }
  }

  async function done() {
    if (!(await flush())) return;
    // Lock this person's screen again (their PIN session may exist even when
    // editing as admin, e.g. after an admin signed in with their PIN).
    const personToken = session.getPersonToken(personId);
    if (personToken) {
      void api.endSession(personToken).catch(() => {});
      session.setPersonToken(personId, null);
    }
    // Admin access that came from a PIN ends with the visit.
    if (session.adminFromPin()) {
      session.signOutAll(api.endSession);
      navigate('/');
      return;
    }
    navigate(auth.state === 'unlocked' && auth.asAdmin ? '/admin' : '/');
  }

  async function resetToCompanyLayout() {
    if (!layout) return;
    if (!confirm('Put your apps back into the company’s standard folders? Your own folders and order will be replaced.')) return;
    update(await api.defaultLayout(appIdsIn(layout)));
  }

  if (loading || auth.state === 'checking') {
    return (
      <Wallpaper>
        <div className="flex justify-center py-32">
          <Spinner />
        </div>
      </Wallpaper>
    );
  }

  if (!person) {
    return (
      <Wallpaper>
        <div className="flex flex-col items-center py-32 text-center">
          <p>That person could not be found.</p>
          <Link to="/" className="mt-4 underline">
            Back to the portal
          </Link>
        </div>
      </Wallpaper>
    );
  }

  if (auth.state === 'locked') {
    const step = createStep ?? (person.has_pin === false ? 'create' : 'no');
    return (
      <Wallpaper>
        <div className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
          {step === 'no' ? (
            <PinPad
              key="enter"
              title={`Hi ${person.name}`}
              subtitle="Enter your 4-digit PIN to change your apps"
              error={pinError}
              busy={pinBusy}
              onSubmit={unlock}
              onCancel={() => navigate('/')}
            />
          ) : (
            <PinPad
              key={step}
              title={step === 'create' ? `Welcome, ${person.name}!` : 'Confirm your PIN'}
              subtitle={
                step === 'create'
                  ? 'Create a 4-digit PIN. You’ll use it whenever you change your apps.'
                  : 'Type the same 4 digits again'
              }
              error={pinError}
              busy={pinBusy}
              onSubmit={createPin}
              onCancel={() => navigate('/')}
            />
          )}
          <Link to="/admin" className="mt-10 text-sm text-white/70 underline-offset-2 hover:text-white hover:underline">
            Admin sign-in
          </Link>
        </div>
      </Wallpaper>
    );
  }

  const chosen = new Set(layout ? appIdsIn(layout) : []);
  const boardApps = [...chosen].map((id) => apps.get(id)).filter((a): a is App => Boolean(a));
  const barApps = favorites.bar.filter((id) => chosen.has(id)).map((id) => apps.get(id)!).filter(Boolean);
  const groups = [
    ...masterFolders.map((f) => ({ id: f.id, name: f.name, apps: appList.filter((a) => a.master_folder_id === f.id) })),
    { id: 'none', name: masterFolders.length ? 'Other apps' : 'All apps', apps: appList.filter((a) => !a.master_folder_id || !masterFolders.some((f) => f.id === a.master_folder_id)) },
  ].filter((g) => g.apps.length > 0);

  function toggle(app: App) {
    if (!layout) return;
    update(chosen.has(app.id) ? removeApp(layout, app.id) : addApp(layout, app, masterFolders));
  }

  return (
    <Wallpaper>
      <header className="sticky top-0 z-30 flex flex-wrap items-center justify-between gap-3 bg-black/15 px-4 py-3 backdrop-blur-md sm:px-8">
        <div>
          <h1 className="text-lg font-semibold sm:text-xl">{person.name}’s home screen</h1>
          <p className="text-xs text-white/80">
            {auth.asAdmin ? 'Editing as admin · ' : ''}
            {saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'All changes saved' : saveState === 'error' ? `Not saved: ${saveError}` : 'Drag to arrange · drop an app on another to make a folder'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {person.is_admin && session.getAdminToken() && (
            <button
              type="button"
              onClick={async () => (await flush()) && navigate('/admin')}
              className="rounded-full bg-white/20 px-4 py-2 text-sm font-semibold text-white ring-1 ring-white/40 hover:bg-white/30"
            >
              Admin tools
            </button>
          )}
          <button type="button" onClick={done} className="rounded-full bg-white px-5 py-2 text-sm font-semibold text-indigo-800 shadow hover:bg-white/90">
            Done
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-16 pt-8 sm:px-10">
        {barApps.length > 0 && (
          <div className="mb-10">
            <FavoritesBar apps={barApps} pinned={new Set(favorites.pinned ?? [])} />
          </div>
        )}
        <section aria-label="Arrange your apps" className="min-h-40">
          {layout === null ? (
            <div className="flex justify-center py-10">
              <Spinner />
            </div>
          ) : layout.length === 0 ? (
            <p className="py-10 text-center text-white/85">Pick some apps below to get started.</p>
          ) : (
            <Board layout={layout} apps={apps} masterFolders={masterFolders} editing onChange={update} />
          )}
        </section>

        <FavoritesEditor boardApps={boardApps} pinned={favorites.pinned} error={favorites.error} onSave={favorites.save} />

        <section className="mt-12 rounded-3xl bg-white p-5 text-neutral-900 shadow-2xl sm:p-7">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-semibold">Choose your apps</h2>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={resetToCompanyLayout} className="btn-secondary">
                Reset to company layout
              </button>
              <button type="button" onClick={() => setShowPinForm((v) => !v)} className="btn-secondary">
                {auth.asAdmin ? 'Set new PIN' : 'Change my PIN'}
              </button>
            </div>
          </div>

          {showPinForm && (
            <ChangePinForm
              onSave={async (pin) => {
                await api.changePin(auth.token, personId, pin);
                setShowPinForm(false);
              }}
            />
          )}

          {groups.length === 0 && <p className="mt-4 text-neutral-600">The admin hasn’t added any apps yet.</p>}

          {groups.map((group) => (
            <div key={group.id} className="mt-6">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">{group.name}</h3>
              <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {group.apps.map((app) => (
                  <label
                    key={app.id}
                    className={`flex cursor-pointer items-center gap-3 rounded-2xl border p-2.5 transition-colors ${
                      chosen.has(app.id) ? 'border-indigo-300 bg-indigo-50' : 'border-neutral-200 hover:bg-neutral-50'
                    }`}
                  >
                    <AppIconImage app={app} className="size-10" />
                    <span className="min-w-0 flex-1 truncate font-medium">{app.name}</span>
                    <input
                      type="checkbox"
                      checked={chosen.has(app.id)}
                      onChange={() => toggle(app)}
                      className="size-5 accent-indigo-600"
                    />
                  </label>
                ))}
              </div>
            </div>
          ))}
        </section>
      </main>
    </Wallpaper>
  );
}

function ChangePinForm({ onSave }: { onSave: (pin: string) => Promise<void> }) {
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!/^\d{4}$/.test(pin)) return setMessage('The PIN must be exactly 4 digits.');
    if (pin !== confirmPin) return setMessage('The two PINs don’t match.');
    try {
      await onSave(pin);
      alert('PIN changed.');
    } catch (err) {
      setMessage((err as Error).message);
    }
  }

  const input = 'w-28 rounded-xl border border-neutral-300 px-3 py-2 tracking-[0.5em] outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200';
  return (
    <form onSubmit={submit} className="mt-4 flex flex-wrap items-end gap-3 rounded-2xl bg-neutral-100 p-4">
      <label className="text-sm font-medium">
        New PIN
        <input className={`${input} mt-1 block`} type="password" inputMode="numeric" maxLength={4} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} autoComplete="new-password" />
      </label>
      <label className="text-sm font-medium">
        Type it again
        <input className={`${input} mt-1 block`} type="password" inputMode="numeric" maxLength={4} value={confirmPin} onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ''))} autoComplete="new-password" />
      </label>
      <button type="submit" className="btn-primary">
        Save PIN
      </button>
      {message && <p className="w-full text-sm text-red-600">{message}</p>}
    </form>
  );
}
