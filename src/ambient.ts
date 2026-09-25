import { cursor } from './crowd';

const colors = ['#83ac87', '#b9a5e4', '#f1ad75', '#d8e3c8'];
const names = ['Ada', 'Kofi', 'Mei', 'Sam', 'Priya'];
const lights = ['#d3f86a', '#a99cf5', '#f1ad75'];

function walker(index: number): string {
  const color = colors[index % colors.length];
  const name = index % 3 === 0 ? names[index / 3] : '';
  const style = `--x:${(4 + ((0.21 + index * 0.618) % 1) * 86).toFixed(1)}%;--y:${(4 + ((0.57 + index * 0.4142) % 1) * 84).toFixed(1)}%;--r:${((index * 47) % 50) - 25}deg;--t:${19 + ((index * 7) % 17)}s;--d:${(-((index * 3.7) % 20)).toFixed(1)}s`;
  return `<span class="walker w${index % 3}" style="${style}">${cursor(color)}${name ? `<span class="tag" style="--c:${color}">${name}</span>` : ''}</span>`;
}

export function ambient(): string {
  return lights.map((color, index) => `<span class="glow g${index}" style="--c:${color}"></span>`).join('') + Array.from({ length: 15 }, (_, index) => walker(index)).join('');
}
