const colors = ['#83ac87', '#b9a5e4', '#f1ad75', '#d8e3c8'];
const limit = 150;

export function cursor(fill: string): string {
  return `<svg viewBox="0 0 24 24"><path d="m5 3 2 17 5-6 7-2L5 3Z" fill="${fill}"/></svg>`;
}

function peer(index: number, fresh: boolean): string {
  const x = 4 + ((0.13 + index * 0.7549) % 1) * 86;
  const y = 4 + ((0.37 + index * 0.5698) % 1) * 82;
  const rotation = ((index * 37) % 60) - 30;
  const delay = -((index * 0.61) % 5);
  const style = `--x:${x.toFixed(1)}%;--y:${y.toFixed(1)}%;--r:${rotation}deg;--d:${delay.toFixed(2)}s`;
  return `<span class="peer${fresh ? ' fresh' : ''}" style="${style}">${cursor(colors[index % colors.length])}</span>`;
}

export function crowd(count: number, you: boolean): string {
  const self = you ? `<span class="you">${cursor('#d3f86a')}<span class="you-tag">You</span></span>` : '';
  return `<div class="crowd" data-crowd aria-hidden="true">${Array.from({ length: Math.min(count, limit) }, (_, index) => peer(index, false)).join('')}${self}</div>`;
}

export function syncCrowd(field: HTMLElement, count: number): void {
  const peers = field.getElementsByClassName('peer');
  const target = Math.min(Math.max(count, 0), limit);
  const fresh = field.dataset.ready === 'true';
  while (peers.length > target) peers[peers.length - 1].remove();
  const start = peers.length;
  if (start < target) field.insertAdjacentHTML('beforeend', Array.from({ length: target - start }, (_, offset) => peer(start + offset, fresh)).join(''));
  field.dataset.ready = 'true';
}
