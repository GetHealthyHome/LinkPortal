import { useEffect, useState } from 'react';

/** iPad-style 4-digit PIN entry. Works with the on-screen keys or a keyboard. */
export function PinPad({
  title,
  subtitle,
  error,
  busy,
  onSubmit,
  onCancel,
}: {
  title: string;
  subtitle?: string;
  error?: string | null;
  busy?: boolean;
  onSubmit: (pin: string) => void;
  onCancel?: () => void;
}) {
  const [pin, setPin] = useState('');
  const [attempt, setAttempt] = useState(0);

  // When a check finishes without unlocking, clear the dots and shake.
  useEffect(() => {
    if (!busy && error) {
      setPin('');
      setAttempt((n) => n + 1);
    }
  }, [busy, error]);

  function press(digit: string) {
    if (busy || pin.length >= 4) return;
    const next = pin + digit;
    setPin(next);
    if (next.length === 4) onSubmit(next);
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (/^[0-9]$/.test(e.key)) press(e.key);
      else if (e.key === 'Backspace') setPin((p) => p.slice(0, -1));
      else if (e.key === 'Escape') onCancel?.();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div className="flex flex-col items-center text-white">
      <h1 className="text-2xl font-semibold [text-shadow:0_1px_3px_rgb(0_0_0/0.4)]">{title}</h1>
      {subtitle && <p className="mt-1 text-sm text-white/80">{subtitle}</p>}

      <div className={`mt-6 flex gap-4 ${error ? 'animate-shake' : ''}`} key={attempt} aria-live="polite">
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className={`size-3.5 rounded-full border-2 border-white ${i < pin.length ? 'bg-white' : 'bg-transparent'}`}
          />
        ))}
      </div>
      <p className="mt-3 h-5 text-sm font-medium text-red-100">{error}</p>

      <div className="mt-4 grid grid-cols-3 gap-4">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
          <Key key={d} onClick={() => press(d)}>
            {d}
          </Key>
        ))}
        <button
          type="button"
          onClick={onCancel}
          className="text-sm font-medium text-white/90 hover:text-white"
          style={{ visibility: onCancel ? 'visible' : 'hidden' }}
        >
          Cancel
        </button>
        <Key onClick={() => press('0')}>0</Key>
        <button
          type="button"
          onClick={() => setPin((p) => p.slice(0, -1))}
          className="text-sm font-medium text-white/90 hover:text-white"
        >
          Delete
        </button>
      </div>
    </div>
  );
}

function Key({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex size-[4.5rem] items-center justify-center rounded-full bg-white/20 text-3xl font-light text-white backdrop-blur-md transition-colors hover:bg-white/30 active:bg-white/50"
    >
      {children}
    </button>
  );
}
