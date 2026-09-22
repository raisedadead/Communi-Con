import { phaseOf } from './session';
import type { Session } from './session';

interface Particle {
  x: number;
  y: number;
  seed: number;
  color: string;
  size: number;
}

const colors = ['#d3f86a', '#d3f86a', '#83ac87', '#b9a5e4', '#f1ad75', '#d8e3c8'];

export function mountCrowd(canvas: HTMLCanvasElement, getSession: () => Session, onJoin?: () => void): () => void {
  const context = canvas.getContext('2d');
  if (!context) return () => {};
  const ctx = context;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const particles: Particle[] = Array.from({ length: 90 }, (_, i) => ({
    x: ((i * 73 + 31) % 97) / 97,
    y: ((i * 37 + 13) % 89) / 89,
    seed: i,
    color: colors[i % colors.length],
    size: 6 + (i % 4) * 2,
  }));
  let width = 1;
  let height = 1;
  let frame = 0;
  let last = 0;
  let moved = false;
  let pointer = { x: 0.25, y: 0.72 };
  let dragging = false;
  let alive = true;

  function cursor(x: number, y: number, size: number, color: string, rotation: number): void {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotation);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(size * 0.2, size * 1.65);
    ctx.lineTo(size * 0.69, size * 1.16);
    ctx.lineTo(size * 1.38, size * 1.02);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = '#202821';
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.restore();
  }

  function draw(time: number): void {
    if (!alive) return;
    const state = getSession();
    const phase = phaseOf(state);
    const motion = reduced.matches ? 0 : time / 1400;
    const centerX = width * 0.5;
    const centerY = height * 0.46;
    const radius = Math.min(width * 0.26, height * 0.29);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#202821';
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = '#374037';
    for (let x = 18; x < width; x += 28) {
      for (let y = 18; y < height; y += 28) {
        ctx.beginPath();
        ctx.arc(x, y, 0.7, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    if (phase === 'practice') {
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
      ctx.fillStyle = state.joined ? '#303e29' : '#263026';
      ctx.fill();
      ctx.strokeStyle = state.joined ? '#d3f86a' : '#738368';
      ctx.lineWidth = 1;
      ctx.setLineDash(state.joined ? [] : [3, 7]);
      ctx.stroke();
      ctx.setLineDash([]);
      if (onJoin) {
        ctx.textAlign = 'center';
        ctx.fillStyle = '#d3f86a';
        ctx.font = `500 ${width < 400 ? 20 : 25}px system-ui, sans-serif`;
        ctx.fillText(state.joined ? 'Better, together.' : 'Meet in the middle.', centerX, centerY - 2);
        ctx.fillStyle = '#a9b5a3';
        ctx.font = '12px ui-monospace, monospace';
        ctx.fillText(state.joined ? 'YOU MADE THE CIRCLE' : 'THERE’S ROOM FOR YOU', centerX, centerY + 23);
      }
    }

    for (const particle of particles) {
      const i = particle.seed;
      const angle = i * 2.39996 + motion * 0.035;
      let targetX: number;
      let targetY: number;
      if (phase === 'practice' && state.joined) {
        const spread = radius + (i % 5) * 8 - 14;
        targetX = centerX + Math.cos(angle) * spread;
        targetY = centerY + Math.sin(angle) * spread;
      } else if (phase === 'applause') {
        targetX = width * (0.07 + (i / 90) * 0.86);
        targetY = height * (0.50 + Math.sin(i * 0.115 + motion * 1.4) * 0.17 + ((i % 4) - 1.5) * 0.055);
      } else if (phase === 'practice') {
        const spread = radius * (1.22 + (i % 6) * 0.15);
        targetX = centerX + Math.cos(angle) * spread;
        targetY = centerY + Math.sin(angle) * spread * 0.89;
      } else {
        targetX = width * (0.06 + ((i * 73 + 31) % 97) / 97 * 0.88);
        targetY = height * (0.13 + ((i * 37 + 13) % 89) / 89 * 0.73);
      }
      const ease = reduced.matches ? 1 : 0.065;
      particle.x += (targetX / width - particle.x) * ease;
      particle.y += (targetY / height - particle.y) * ease;
      cursor(particle.x * width, particle.y * height + Math.sin(motion + i) * (reduced.matches ? 0 : 3), particle.size, particle.color, Math.sin(i) * 0.7);
    }

    if (onJoin && phase === 'practice') {
      if (state.joined && !moved) pointer = { x: (centerX + radius * 0.72) / width, y: (centerY + radius * 0.7) / height };
      const x = pointer.x * width;
      const y = pointer.y * height;
      cursor(x, y, 22, '#d3f86a', -0.12);
      const labelX = Math.min(width - 64, Math.max(6, x + 16));
      const labelY = Math.min(height - 25, y + 30);
      ctx.fillStyle = '#d3f86a';
      ctx.beginPath();
      ctx.roundRect(labelX, labelY, 53, 24, 5);
      ctx.fill();
      ctx.fillStyle = '#202821';
      ctx.font = '600 11px ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.fillText('YOU', labelX + 26, labelY + 16);
    }
  }

  function loop(time: number): void {
    if (time - last >= 32) {
      if (!document.hidden) draw(time);
      last = time;
    }
    if (!reduced.matches && alive) frame = requestAnimationFrame(loop);
  }

  function resize(): void {
    const bounds = canvas.getBoundingClientRect();
    width = Math.max(bounds.width, 1);
    height = Math.max(bounds.height, 1);
    const ratio = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    draw(performance.now());
  }

  function move(event: PointerEvent): void {
    if (!onJoin || phaseOf(getSession()) !== 'practice') return;
    const bounds = canvas.getBoundingClientRect();
    moved = true;
    pointer = { x: Math.max(0.03, Math.min(0.92, (event.clientX - bounds.left) / width)), y: Math.max(0.03, Math.min(0.86, (event.clientY - bounds.top) / height)) };
    const radius = Math.min(width * 0.26, height * 0.29);
    if (Math.hypot(pointer.x * width - width * 0.5, pointer.y * height - height * 0.46) < radius && !getSession().joined) onJoin();
    draw(performance.now());
  }

  function down(event: PointerEvent): void {
    dragging = true;
    canvas.setPointerCapture(event.pointerId);
    move(event);
  }

  function pointerMove(event: PointerEvent): void { if (dragging) move(event); }
  function up(): void { dragging = false; }
  function motionChanged(): void {
    cancelAnimationFrame(frame);
    draw(performance.now());
    if (!reduced.matches) frame = requestAnimationFrame(loop);
  }

  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  reduced.addEventListener('change', motionChanged);
  if (onJoin) {
    canvas.addEventListener('pointerdown', down);
    canvas.addEventListener('pointermove', pointerMove);
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
  }
  resize();
  if (!reduced.matches) frame = requestAnimationFrame(loop);
  return () => {
    alive = false;
    cancelAnimationFrame(frame);
    observer.disconnect();
    reduced.removeEventListener('change', motionChanged);
    canvas.removeEventListener('pointerdown', down);
    canvas.removeEventListener('pointermove', pointerMove);
    canvas.removeEventListener('pointerup', up);
    canvas.removeEventListener('pointercancel', up);
  };
}
