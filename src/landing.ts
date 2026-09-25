import { cursor } from './crowd';

const colors = ['#83ac87', '#b9a5e4', '#f1ad75', '#d8e3c8'];
const reactions = ['👏', '👍', '🙌', '💚', '👏', '✨'];
const steps = [
  { icon: '📱', title: 'Scan to join', text: 'The stage screen shows a QR code and an event code. Phones join in the browser, with no app and no sign-up.' },
  { icon: '👍', title: 'Vote during the talk', text: 'When voting opens, each phone picks keep going or wrap it up. Votes are anonymous, and only the co-chairs see the count.' },
  { icon: '👏', title: 'Cheer them off', text: 'The co-chairs cue the applause. Every phone and the stage screen celebrate the speaker.' },
];

function seat(row: number, column: number): string {
  const x = 8 + (column + (row % 2) * 0.5) * 12;
  const y = 48 + row * 16;
  const rotation = Math.atan2(50 - x, (y - 16) * 0.8) * (180 / Math.PI) + 32;
  const style = `--x:${x.toFixed(1)}%;--y:${y}%;--r:${rotation.toFixed(0)}deg;--w:${column * 90 + row * 60}ms`;
  return `<span class="seat" style="${style}">${cursor(colors[(row * 7 + column) % colors.length])}</span>`;
}

function scene(): string {
  const seats = [0, 1, 2].flatMap(row => Array.from({ length: row % 2 ? 6 : 7 }, (_, column) => seat(row, column))).join('');
  const floats = reactions.map((emoji, index) => `<span class="react" style="--x:${12 + ((index * 0.618) % 1) * 72}%;--d:${index}s;--dx:${((index % 3) - 1) * 4}cqw">${emoji}</span>`).join('');
  const claps = [38, 50, 62].map((x, index) => `<span class="clap-pop" style="--x:${x}%;--w:${index * 120}ms">👏</span>`).join('');
  return `<div class="scene" aria-hidden="true"><span class="beam"></span><span class="podium"></span><span class="presenter">${cursor('#d3f86a')}<span class="tag">On stage</span></span><span class="live">On air</span>${seats}${floats}${claps}</div>`;
}

export const codeError = 'Enter the 8-digit code from the stage screen.';

function join(invalid: boolean): string {
  const error = invalid ? `<p class="field-error" id="code-error">${codeError}</p>` : '';
  const state = invalid ? ' aria-invalid="true" aria-describedby="code-error" data-enter="code-error"' : '';
  return `<form class="inline-form" data-join><label for="code">Event code</label><input class="input" id="code" name="code" inputmode="numeric" autocomplete="off" enterkeyhint="go" placeholder="1234-5678" data-key="code"${state}><button class="button primary" data-key="join">Join</button>${error}</form>`;
}

export function landing(invalid = false): string {
  const words = 'The floor is yours.'.split(' ').map((word, index) => `<span class="word" data-enter="word-${index}" style="--i:${index + 1}">${word}</span>`).join(' ');
  const list = steps.map((step, index) => `<li class="step"><span class="step-icon" aria-hidden="true">${step.icon}</span><h3><span class="step-number">${index + 1}</span>${step.title}</h3><p>${step.text}</p></li>`).join('');
  return `<main class="landing"><section class="hero"><div class="pitch"><p class="hint">At a talk? Scan the QR code on the stage screen, or enter its event code.</p><h1 class="display">${words}</h1><p class="lede">Anonymous live votes for community talks. The audience votes from their phones, the co-chairs read the room, and everyone cheers the speaker off together.</p>${join(invalid)}</div>${scene()}</section><section class="steps" aria-labelledby="how-title"><h2 id="how-title">How it works</h2><ol>${list}</ol></section></main>`;
}
