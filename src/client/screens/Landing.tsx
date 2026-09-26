import { type CSSProperties, type FormEvent, type ReactNode, useState } from 'react';
import { announce } from '../announce';
import { Header } from '../components/Header';
import { roomPattern } from '../route';
import { CodeInput } from './CodeInput';

const colors = ['#83ac87', '#b9a5e4', '#f1ad75', '#d8e3c8'];
const reactions = ['👏', '👍', '🙌', '💚', '👏', '✨'];
const steps = [
  { icon: '📱', title: 'Join', text: 'Join from any phone browser. No app, no sign-up.' },
  {
    icon: '👍',
    title: 'Vote',
    text: 'When voting opens, tap Keep going or Wrap it up. Only the co-chairs see the totals.',
  },
  { icon: '👏', title: 'Cheer', text: 'The co-chairs cue the applause on every screen.' },
];
const codeError = 'Enter the 8-digit code from the stage screen.';

const seats = [0, 1, 2].flatMap(row =>
  Array.from({ length: row % 2 ? 6 : 7 }, (_, column) => ({
    '--x': `${(8 + (column + (row % 2) * 0.5) * 12).toFixed(1)}%`,
    '--y': `${48 + row * 16}%`,
    '--w': `${column * 90 + row * 60}ms`,
    '--c': colors[(row * 7 + column) % colors.length],
  })),
);

function Scene(): ReactNode {
  return (
    <div className="scene" aria-hidden="true">
      <span className="beam" />
      <span className="podium" />
      <span className="presenter">
        <span className="tag">On stage</span>
      </span>
      <span className="live">On air</span>
      {seats.map((style, index) => (
        <span className="seat" key={index} style={style as CSSProperties} />
      ))}
      {reactions.map((emoji, index) => (
        <span
          className="react"
          key={index}
          style={
            {
              '--x': `${12 + ((index * 0.618) % 1) * 72}%`,
              '--d': `${index}s`,
              '--dx': `${((index % 3) - 1) * 4}cqw`,
            } as CSSProperties
          }
        >
          {emoji}
        </span>
      ))}
      {[38, 50, 62].map((x, index) => (
        <span
          className="clap-pop"
          key={x}
          style={{ '--x': `${x}%`, '--w': `${index * 120}ms` } as CSSProperties}
        >
          👏
        </span>
      ))}
    </div>
  );
}

function JoinForm(): ReactNode {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (roomPattern.test(code)) {
      location.assign(`/?room=${code}`);
      return;
    }
    setError(codeError);
    setAttempt(value => value + 1);
    announce(codeError);
  }

  return (
    <form className="join-form" onSubmit={submit}>
      <label htmlFor="code">Event code</label>
      <CodeInput value={code} onChange={setCode} error={error} attempt={attempt} />
      <button className="button primary" data-key="join">
        Join
      </button>
      {error && (
        <p className="field-error" id="code-error">
          {error}
        </p>
      )}
    </form>
  );
}

export function Landing(): ReactNode {
  const words = 'Keep going or wrap it up?'.split(' ');
  return (
    <>
      <Header />
      <main className="landing">
        <section className="hero">
          <div className="pitch">
            <p className="hint">At a talk? Scan the QR code or enter the event code.</p>
            <h1 className="display">
              {words.map((word, index) => (
                <span key={index}>
                  <span className="word enter" style={{ '--i': index + 1 } as CSSProperties}>
                    {word}
                  </span>{' '}
                </span>
              ))}
            </h1>
            <p className="lede">Anonymous live votes for community talks.</p>
            <JoinForm />
          </div>
          <Scene />
        </section>
        <section className="steps" aria-labelledby="how-title">
          <h2 id="how-title">How it works</h2>
          <ol>
            {steps.map((step, index) => (
              <li className="step" key={step.title}>
                <span className="step-icon" aria-hidden="true">
                  {step.icon}
                </span>
                <h3>
                  <span className="step-number">{index + 1}</span>
                  {step.title}
                </h3>
                <p>{step.text}</p>
              </li>
            ))}
          </ol>
        </section>
      </main>
    </>
  );
}
