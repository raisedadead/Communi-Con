import type { Opinion } from '../shared/session';

const confettiColors = ['#d3f86a', '#f1ad75', '#f2f3eb', '#a99cf5'];
const motion = matchMedia('(prefers-reduced-motion: no-preference)');

function layer(): HTMLElement | null {
  return document.getElementById('fx');
}

function spawn(className: string, style: string, text = ''): void {
  const fx = layer();
  if (!fx || !motion.matches || fx.childElementCount >= 60) return;
  const node = document.createElement('span');
  node.className = className;
  node.setAttribute('style', style);
  node.textContent = text;
  node.addEventListener('animationend', () => node.remove(), { once: true });
  fx.append(node);
}

export function clearFx(): void {
  layer()?.replaceChildren();
}

export function cheer(opinion: Opinion, count: number): void {
  for (let index = 0; index < count; index++) {
    const x = (4 + Math.random() * 88).toFixed(1);
    const delay = (index * 0.15 + Math.random() * 0.25).toFixed(2);
    const rotate = Math.round(Math.random() * 50 - 25);
    spawn('cheer', `--x:${x}%;--d:${delay}s;--r:${rotate}deg`, opinion === 'keep' ? '👍' : '👎');
  }
}

export function burst(box: DOMRect): void {
  for (let index = 0; index < 18; index++) {
    const angle = Math.random() * Math.PI * 2;
    const distance = 50 + Math.random() * 90;
    const round = index % 3 === 0;
    const style = [
      `left:${(box.left + box.width / 2).toFixed(0)}px`,
      `top:${(box.top + box.height / 3).toFixed(0)}px`,
      `--px:${(Math.cos(angle) * distance).toFixed(0)}px`,
      `--py:${(Math.sin(angle) * distance - 30).toFixed(0)}px`,
      `--r:${Math.round(Math.random() * 720 - 360)}deg`,
      `--c:${confettiColors[index % confettiColors.length]}`,
      `--w:${round ? 7 : 6}px`,
      `--h:${round ? 7 : 13}px`,
      `--br:${round ? '50%' : '2px'}`,
    ].join(';');
    spawn('confetti', style);
  }
}
