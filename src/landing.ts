const colors = ['#83ac87', '#b9a5e4', '#f1ad75', '#d8e3c8'];
const reactions = ['👏', '👍', '🙌', '💚', '👏', '✨'];
const steps = [
  { icon: '📱', title: 'Join', text: 'Join from any phone browser. No app, no sign-up.' },
  { icon: '👍', title: 'Vote', text: 'When voting opens, tap Keep going or Wrap it up. Only the co-chairs see the totals.' },
  { icon: '👏', title: 'Cheer', text: 'The co-chairs cue the applause on every screen.' },
];

function seat(row: number, column: number): string {
  const x = 8 + (column + (row % 2) * 0.5) * 12;
  const y = 48 + row * 16;
  const style = `--x:${x.toFixed(1)}%;--y:${y}%;--w:${column * 90 + row * 60}ms;--c:${colors[(row * 7 + column) % colors.length]}`;
  return `<span class="seat" style="${style}"></span>`;
}

function scene(): string {
  const seats = [0, 1, 2].flatMap(row => Array.from({ length: row % 2 ? 6 : 7 }, (_, column) => seat(row, column))).join('');
  const floats = reactions.map((emoji, index) => `<span class="react" style="--x:${12 + ((index * 0.618) % 1) * 72}%;--d:${index}s;--dx:${((index % 3) - 1) * 4}cqw">${emoji}</span>`).join('');
  const claps = [38, 50, 62].map((x, index) => `<span class="clap-pop" style="--x:${x}%;--w:${index * 120}ms">👏</span>`).join('');
  return `<div class="scene" aria-hidden="true"><span class="beam"></span><span class="podium"></span><span class="presenter"><span class="tag">On stage</span></span><span class="live">On air</span>${seats}${floats}${claps}</div>`;
}

export const codeError = 'Enter the 8-digit code from the stage screen.';

const codeLength = 8;

function slots(from: number): string {
  return `<span class="otp-group">${Array.from({ length: codeLength / 2 }, (_, index) => `<span class="otp-slot" data-slot="${from + index}"></span>`).join('')}</span>`;
}

function join(invalid: boolean): string {
  const error = invalid ? `<p class="field-error" id="code-error">${codeError}</p>` : '';
  const state = invalid ? ' aria-invalid="true" aria-describedby="code-error"' : '';
  const otp = `<span class="otp"${invalid ? ' data-enter="code-error"' : ''}><input class="otp-input" id="code" name="code" inputmode="numeric" autocomplete="off" enterkeyhint="go" spellcheck="false" data-key="code"${state}><span class="otp-slots" aria-hidden="true">${slots(0)}<span class="otp-separator"></span>${slots(codeLength / 2)}</span></span>`;
  return `<form class="join-form" data-join><label for="code">Event code</label>${otp}<button class="button primary" data-key="join">Join</button>${error}</form>`;
}

export function paintCode(input: HTMLInputElement): void {
  const digits = input.value.replace(/\D/g, '').slice(0, codeLength);
  if (input.value !== digits) input.value = digits;
  if (document.activeElement === input && input.selectionStart !== digits.length) input.setSelectionRange(digits.length, digits.length);
  for (const slot of input.parentElement!.querySelectorAll<HTMLElement>('[data-slot]')) {
    const index = Number(slot.dataset.slot);
    slot.textContent = digits[index] ?? '';
    slot.classList.toggle('active', index === Math.min(digits.length, codeLength - 1));
  }
}

export function landing(invalid = false): string {
  const words = 'Keep going or wrap it up?'.split(' ').map((word, index) => `<span class="word" data-enter="word-${index}" style="--i:${index + 1}">${word}</span>`).join(' ');
  const list = steps.map((step, index) => `<li class="step"><span class="step-icon" aria-hidden="true">${step.icon}</span><h3><span class="step-number">${index + 1}</span>${step.title}</h3><p>${step.text}</p></li>`).join('');
  return `<main class="landing"><section class="hero"><div class="pitch"><p class="hint">At a talk? Scan the QR code or enter the event code.</p><h1 class="display">${words}</h1><p class="lede">Anonymous live votes for community talks.</p>${join(invalid)}</div>${scene()}</section><section class="steps" aria-labelledby="how-title"><h2 id="how-title">How it works</h2><ol>${list}</ol></section></main>`;
}
