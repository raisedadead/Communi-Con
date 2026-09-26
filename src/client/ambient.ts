const lights = ['#d3f86a', '#a99cf5', '#f1ad75'];

export function ambient(): string {
  return `${lights.map((color, index) => `<span class="glow g${index}" style="--c:${color}"></span>`).join('')}<span class="wave"><span class="wave-tile"></span></span>`;
}
