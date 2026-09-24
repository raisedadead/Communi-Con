import QRCode from 'qrcode';
import { connectRoom } from './connection';
import type { RoomConnection } from './connection';
import { ballotOpen, phaseOf, timeLabel, transition } from './session';
import type { Action, Opinion, Phase, Session } from './session';
import type { Role, RoomSnapshot } from './protocol';
import './style.css';

const root = document.querySelector<HTMLDivElement>('#app')!;
const status = document.querySelector<HTMLDivElement>('#status')!;
const path = location.pathname.replace(/\/$/, '');
const role: Role = path === '/admin' ? 'admin' : path === '/stage' ? 'stage' : 'audience';
const roomPattern = /^[a-f0-9]{32}$/;

let room = new URLSearchParams(location.search).get('room') || '';
let key = '';
let snapshot: RoomSnapshot | undefined;
let session: Session | undefined;
let receivedAt = 0;
let connected = false;
let pending = false;
let pendingVote: Opinion | null = null;
let notice = '';
let fatal = '';
let qr = '';
let shown = '';
let lastPhase: Phase | undefined;
let connection: RoomConnection | undefined;
let pendingTimer: ReturnType<typeof setTimeout> | undefined;
let noticeTimer: ReturnType<typeof setTimeout> | undefined;

const links = {
  audience: (): string => `${location.origin}/?room=${room}`,
  stage: (): string => `${location.origin}/stage?room=${room}`,
  admin: (): string => `${location.origin}/admin?room=${room}#key=${key}`,
};

function escape(text: string): string {
  return text.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);
}

function icon(name: 'check' | 'external'): string {
  const paths = { check: '<path d="m5 12 5 5L19 7"/>', external: '<path d="M14 4h6v6m0-6-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>' };
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]}</svg>`;
}

function announce(text: string): void {
  status.textContent = text;
}

function flash(text: string): void {
  notice = text;
  announce(text);
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => { notice = ''; render(); }, 6000);
  render();
}

function header(title: string): string {
  const state = !connected ? 'Connecting…' : role === 'audience' ? 'Live' : '<span data-count></span>';
  const net = session ? `<span class="net${connected ? '' : ' off'}">${connected ? '<span class="dot"></span>' : ''}${state}</span>` : '';
  return `<header class="bar"><span class="brand">${title}</span>${net}</header>`;
}

function clock(): string {
  return `<div class="clock"><span class="time" role="timer" data-clock></span><span class="of">of 10:00</span></div><div class="track" aria-hidden="true"><div class="fill" data-progress></div><span class="mark" style="--at:50%"></span><span class="mark" style="--at:80%"></span></div>`;
}

function button(action: string, label: string, options: { primary?: boolean; disabled?: boolean } = {}): string {
  const disabled = options.disabled || pending || !connected;
  return `<button class="button${options.primary ? ' primary' : ''}" data-action="${action}" data-key="${action}"${disabled ? ' disabled' : ''}>${label}</button>`;
}

function choice(value: Opinion, label: string, opinion: Opinion | null, open: boolean): string {
  const selected = opinion === value;
  return `<button class="choice" data-vote="${value}" data-key="vote-${value}" aria-pressed="${selected}"${open && connected && !pending ? '' : ' disabled'}><span>${label}</span>${selected ? icon('check') : ''}</button>`;
}

function audience(current: Session): string {
  const phase = phaseOf(current);
  if (phase === 'applause') return '<main class="cue"><h1>Round of applause</h1><p>Put your phone down and clap for the speaker.</p></main>';
  if (phase === 'lobby') {
    return `${header('Communi-Con')}<main class="screen"><section class="card"><h1>The next talk starts soon</h1><p>Keep this page open. From 05:00 into each talk, you can vote to keep it going or wrap it up.</p><p class="quiet">Your vote is anonymous. Only the co-chairs see the count.</p></section></main>`;
  }
  if (phase === 'ended') {
    return `${header('Communi-Con')}<main class="screen"><section class="card"><h1>Time is up</h1><p>Voting is closed. Thank you for listening.</p></section></main>`;
  }
  const open = ballotOpen(current);
  const opinion = pendingVote || snapshot?.opinion || null;
  const label = current.paused ? 'Paused' : open ? 'Voting open' : 'Talk in progress';
  const hint = current.paused ? 'Voting continues when the talk resumes.' : pendingVote ? 'Sending your vote…' : opinion ? 'Vote received. You can change it until 10:00.' : 'Only the co-chairs see the count.';
  const ballot = phase === 'listening'
    ? '<p>Voting opens at 05:00.</p>'
    : `<h2>How is this talk going?</h2><div class="choices">${choice('keep', 'Keep going', opinion, open)}${choice('wrap', 'Wrap it up', opinion, open)}</div><p class="quiet">${hint}</p>`;
  return `${header('Communi-Con')}<main class="screen"><section class="card"><p class="label">${label}</p>${clock()}</section><section class="card">${ballot}</section></main>`;
}

function stage(current: Session): string {
  const phase = phaseOf(current);
  if (phase === 'applause') return '<main class="cue"><h1>Round of applause</h1></main>';
  const line = current.paused ? 'Paused' : { lobby: 'Scan to join Communi-Con', listening: 'Scan to join. Voting opens at 05:00.', voting: 'Voting is open. Scan to vote.', eligible: 'Voting is open. Scan to vote.', ended: 'Time is up' }[phase];
  const time = phase === 'lobby' ? '' : '<p class="stage-time" role="timer" data-clock></p>';
  return `<main class="stage"><div class="qr" role="img" aria-label="QR code for ${escape(links.audience())}">${qr}</div><div class="stage-text"><p class="stage-line">${line}</p>${time}<p class="stage-host">${escape(location.host)}</p><p class="stage-host" data-count></p></div></main>`;
}

function admin(current: Session): string {
  const phase = phaseOf(current);
  const running = current.mode === 'talk' && phase !== 'applause' && phase !== 'ended';
  const canCue = (phase === 'eligible' || phase === 'ended') && !current.paused;
  const label = current.paused ? 'Paused' : { lobby: 'Lobby', listening: 'Listening', voting: 'Voting open', eligible: 'Applause allowed', applause: 'Applause on screen', ended: 'Time is up' }[phase];
  let controls: string;
  if (phase === 'lobby') controls = `${button('start', 'Start talk', { primary: true })}<p class="quiet">Start the clock when the speaker starts. Voting opens at 05:00.</p>`;
  else if (phase === 'applause') controls = `${button('reset', 'Back to lobby', { primary: true })}<p class="quiet">This clears the votes for the next talk.</p>`;
  else {
    const hint = canCue ? 'Every phone and the stage screen show the cue.' : current.paused ? 'Resume the talk to cue applause.' : 'Applause is available from 08:00.';
    const secondary = running ? `<div class="row">${button('pause', current.paused ? 'Resume' : 'Pause')}${button('reset', 'End talk')}</div>` : `<div class="row">${button('reset', 'Back to lobby')}</div>`;
    controls = `${button('applause', 'Cue applause', { primary: true, disabled: !canCue })}<p class="quiet">${hint}</p>${secondary}`;
  }
  const votes = phase === 'lobby' ? '' : `<section class="card" aria-labelledby="votes-title"><h2 id="votes-title">Votes</h2>${result('keep', 'Keep going')}${result('wrap', 'Wrap it up')}<p class="quiet" data-total></p><p class="quiet">Only co-chairs see these numbers.</p></section>`;
  const jumps = phase === 'lobby' ? '' : `<section class="card" aria-labelledby="clock-title"><h2 id="clock-title">Set the clock</h2><p class="quiet">Use this to rehearse, or to correct a late start. 00:00 clears the votes.</p><div class="jumps">${[0, 300, 480, 600].map(seconds => `<button class="button" data-seek="${seconds}" data-key="seek-${seconds}"${pending || !connected ? ' disabled' : ''}>${timeLabel(seconds)}</button>`).join('')}</div></section>`;
  const share = `<section class="card" aria-labelledby="share-title"><h2 id="share-title">Share</h2><a class="button" href="${escape(links.stage())}" target="_blank" rel="noopener">Open stage screen${icon('external')}</a><button class="button" data-share="audience" data-key="share-audience">Share audience link</button><button class="button" data-share="admin" data-key="share-admin">Share co-chair link</button><p class="quiet">Anyone with the co-chair link can control the talk and see the votes.</p></section>`;
  return `${header('Co-chair')}<main class="screen"><section class="card"><p class="label">${label}</p>${clock()}${controls}</section>${votes}${jumps}${share}</main>`;
}

function result(opinion: Opinion, label: string): string {
  return `<div class="result"><div class="result-head"><span>${label}</span><strong data-${opinion}></strong></div><div class="track" aria-hidden="true"><div class="fill ${opinion}" data-${opinion}-bar></div></div></div>`;
}

function setup(): string {
  const saved = localStorage.getItem('cc-room');
  if (room) {
    return `${header('Co-chair')}<main class="screen"><section class="card"><h1>No co-chair access</h1><p>This browser has no key for this room. Open the co-chair link that another co-chair shared with you.</p></section></main>`;
  }
  const resume = saved ? `<a class="button primary" href="/admin?room=${escape(saved)}">Return to your room</a>` : '';
  return `${header('Co-chair')}<main class="screen"><section class="card"><h1>Set up the room</h1><p>Create one room for the event. Put its stage screen on the projector, and keep this page open to run each talk.</p>${resume}<button class="button${saved ? '' : ' primary'}" data-create data-key="create"${pending ? ' disabled' : ''}>${pending ? 'Creating room…' : saved ? 'Create a new room' : 'Create room'}</button>${saved ? '<p class="quiet">A new room has a new QR code. Phones on the old room do not move.</p>' : ''}</section></main>`;
}

function message(title: string, text: string, retry: boolean): string {
  return `${header('Communi-Con')}<main class="screen"><section class="card"><h1>${escape(title)}</h1><p>${escape(text)}</p>${retry ? '<button class="button primary" data-retry data-key="retry">Try again</button>' : ''}</section></main>`;
}

function view(): string {
  if (fatal) return message('Unable to join', fatal, true);
  if (role === 'admin' && (!room || !key)) return setup();
  if (!room) return message('Scan to join', 'Scan the QR code on the stage screen to join the room.', false);
  if (!session) return message('Connecting…', 'Joining the room.', false);
  return role === 'admin' ? admin(session) : role === 'stage' ? stage(session) : audience(session);
}

function updateLive(): void {
  if (!session) return;
  const time = timeLabel(session.elapsed);
  for (const element of root.querySelectorAll('[data-clock]')) if (element.textContent !== time) element.textContent = time;
  for (const element of root.querySelectorAll<HTMLElement>('[data-progress]')) element.style.width = `${session.elapsed / 6}%`;
  const participants = snapshot?.participants ?? 0;
  for (const element of root.querySelectorAll('[data-count]')) element.textContent = `${participants} connected`;
  const results = snapshot?.results;
  if (!results) return;
  for (const opinion of ['keep', 'wrap'] as const) {
    const count = results[opinion];
    const share = results.total ? Math.round(count / results.total * 100) : 0;
    const value = root.querySelector(`[data-${opinion}]`);
    const bar = root.querySelector<HTMLElement>(`[data-${opinion}-bar]`);
    if (value) value.textContent = `${count} · ${share}%`;
    if (bar) bar.style.width = `${share}%`;
  }
  const total = root.querySelector('[data-total]');
  if (total) total.textContent = `${results.total} ${results.total === 1 ? 'vote' : 'votes'} from ${participants} connected.`;
}

function render(): void {
  const html = view() + (notice ? `<p class="notice">${escape(notice)}</p>` : '');
  if (html !== shown) {
    const focused = document.activeElement instanceof HTMLElement ? document.activeElement.dataset.key : undefined;
    root.innerHTML = html;
    shown = html;
    if (focused) root.querySelector<HTMLElement>(`[data-key="${focused}"]`)?.focus();
  }
  updateLive();
}

function settle(): void {
  pending = false;
  pendingVote = null;
  clearTimeout(pendingTimer);
}

function act(action: Action): void {
  if (pending) return;
  if (!connection?.send(action)) { flash('Not connected. Wait for the connection to return, then try again.'); return; }
  pending = true;
  if (action.type === 'vote') pendingVote = action.opinion;
  pendingTimer = setTimeout(() => { settle(); flash('No reply from the room. Check your connection and try again.'); }, 5000);
  render();
}

function tick(): void {
  if (!snapshot) return;
  session = transition(snapshot.session, { type: 'tick', seconds: (Date.now() - receivedAt) / 1000 });
  const phase = phaseOf(session);
  if (role === 'audience' && lastPhase && phase !== lastPhase) {
    announce({ lobby: 'The talk ended. Waiting for the next talk.', listening: 'The talk started.', voting: 'Voting is open.', eligible: 'Voting is open.', applause: 'Round of applause. Clap for the speaker.', ended: 'Time is up. Voting is closed.' }[phase]);
  }
  lastPhase = phase;
  render();
}

function start(): void {
  connection?.close();
  snapshot = undefined;
  session = undefined;
  connected = false;
  fatal = '';
  if (!roomPattern.test(room)) { fatal = 'This link is incomplete. Scan the QR code on the stage screen again.'; render(); return; }
  if (role === 'stage') void QRCode.toString(links.audience(), { type: 'svg', margin: 4, color: { dark: '#000000', light: '#ffffff' } }).then(svg => { qr = svg; render(); });
  connection = connectRoom(room, role, key, {
    state(next): void {
      snapshot = next;
      receivedAt = Date.now();
      settle();
      tick();
    },
    connection(value): void {
      connected = value;
      if (!value) settle();
      render();
    },
    error(text): void {
      settle();
      if (snapshot) flash(text);
      else { fatal = text; render(); }
    },
  });
  render();
}

async function create(): Promise<void> {
  pending = true;
  render();
  try {
    const response = await fetch('/api/rooms', { method: 'POST' });
    if (!response.ok) throw new Error(`Room creation failed with ${response.status}`);
    const created = await response.json() as { room: string; key: string };
    room = created.room;
    key = created.key;
    localStorage.setItem(`cc-key:${room}`, key);
    localStorage.setItem('cc-room', room);
    history.replaceState(null, '', `/admin?room=${room}`);
    pending = false;
    start();
  } catch {
    pending = false;
    flash('Unable to create a room. Check your connection and try again.');
  }
}

async function share(kind: 'audience' | 'admin'): Promise<void> {
  const url = kind === 'audience' ? links.audience() : links.admin();
  try {
    if (navigator.share) await navigator.share({ url });
    else { await navigator.clipboard.writeText(url); flash('Link copied.'); }
  } catch (error) {
    if (!(error instanceof DOMException && error.name === 'AbortError')) prompt('Copy this link:', url);
  }
}

root.addEventListener('click', event => {
  const target = event.target instanceof Element ? event.target.closest<HTMLElement>('button') : null;
  if (!target || target.matches(':disabled')) return;
  const { action, vote, seek, share: kind } = target.dataset;
  if (action === 'reset' && session && phaseOf(session) !== 'applause' && phaseOf(session) !== 'ended' && !confirm('End this talk and clear the votes?')) return;
  if (action === 'start' || action === 'reset' || action === 'pause' || action === 'applause') act({ type: action });
  if (vote === 'keep' || vote === 'wrap') act({ type: 'vote', opinion: vote });
  if (seek) act({ type: 'seek', seconds: Number(seek) });
  if (kind === 'audience' || kind === 'admin') void share(kind);
  if (target.hasAttribute('data-create')) void create();
  if (target.hasAttribute('data-retry')) start();
});

if (role === 'admin') {
  const shared = new URLSearchParams(location.hash.slice(1)).get('key');
  if (room && shared) {
    localStorage.setItem(`cc-key:${room}`, shared);
    history.replaceState(null, '', `/admin?room=${room}`);
  }
  key = room ? localStorage.getItem(`cc-key:${room}`) || '' : '';
  if (room && key) localStorage.setItem('cc-room', room);
}
document.body.dataset.role = role;
setInterval(tick, 250);
if (room && (role !== 'admin' || key)) start();
else render();
