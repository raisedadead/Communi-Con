import { type FormEvent, type ReactNode, useRef, useState } from 'react';
import { announce } from '../announce';
import { useFeedback } from '../components/Feedback';
import { Header } from '../components/Header';
import { useReplay } from '../components/useReplay';
import { lastAdminRoom } from '../route';

interface Created {
  room: string;
  key: string;
}

export function NoAccess(): ReactNode {
  return (
    <>
      <Header tag="Co-chair" />
      <main className="screen">
        <section className="card">
          <h1>No co-chair access</h1>
          <p>This browser cannot run this room. Ask a co-chair for the co-chair link.</p>
        </section>
      </main>
    </>
  );
}

export function Setup({ onCreated }: { onCreated: (created: Created) => void }): ReactNode {
  const { flash } = useFeedback();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const field = useRef<HTMLInputElement>(null);
  const saved = lastAdminRoom();
  useReplay(field, error ? `${attempt}` : '');

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (pending) return;
    const form = new FormData(event.currentTarget);
    const passphrase = String(form.get('passphrase'));
    const name = String(form.get('event'));
    setPending(true);
    setError('');
    try {
      const response = await fetch('/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passphrase, event: name }),
      });
      if (response.status === 403 || response.status === 503) {
        const message = ((await response.json()) as { error: string }).error;
        setPending(false);
        setError(message);
        setAttempt(value => value + 1);
        announce(message);
        return;
      }
      if (!response.ok) throw new Error(`Room creation failed with ${response.status}`);
      onCreated((await response.json()) as Created);
    } catch {
      setPending(false);
      flash('Unable to create a room. Check your connection and try again.');
    }
  }

  const label = pending ? 'Creating room…' : saved ? 'Create a new room' : 'Create room';
  return (
    <>
      <Header tag="Co-chair" />
      <main className="screen">
        <section className="card">
          <h1>Set up the room</h1>
          <p>Create one room per event. Run every talk from this page.</p>
          {saved && (
            <a className="button primary" href={`/admin?room=${encodeURIComponent(saved)}`}>
              Return to your room
            </a>
          )}
          <form className="form" onSubmit={submit}>
            <label className="field">
              <span>Event name (optional)</span>
              <input
                className="input"
                name="event"
                maxLength={60}
                autoComplete="off"
                data-key="event"
              />
            </label>
            <label className="field">
              <span>Event passphrase</span>
              <input
                ref={field}
                className="input"
                type="password"
                name="passphrase"
                autoComplete="current-password"
                required
                data-key="passphrase"
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? 'passphrase-error' : undefined}
              />
            </label>
            {error && (
              <p className="field-error" id="passphrase-error">
                {error}
              </p>
            )}
            <button
              className={saved ? 'button' : 'button primary'}
              data-key="create"
              disabled={pending}
            >
              {label}
            </button>
          </form>
          {saved && (
            <p className="quiet">
              A new room has a new QR code and event code. Phones stay in the old room.
            </p>
          )}
        </section>
      </main>
    </>
  );
}
