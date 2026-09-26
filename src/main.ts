import QRCode from 'qrcode';
import { ambient } from './ambient';
import { connectRoom } from './connection';
import { crowd, syncCrowd } from './crowd';
import { codeError, landing } from './landing';
import type { RoomConnection } from './connection';
import { ballotOpen, canNudge, phaseOf, timeLabel, timingProblem, transition, votingWindow } from './session';
import type { Action, Opinion, Phase, Session, Timing } from './session';
import type { Role, RoomSnapshot } from './protocol';
import './style.css';

const eventName = 'Communi-Con';
const eventEdition = 'IndiaFOSS 2026';
const eventTitle = `${eventName} @ ${eventEdition}`;
const root = document.querySelector<HTMLDivElement>('#app')!;
const status = document.querySelector<HTMLDivElement>('#status')!;
const fx = document.querySelector<HTMLDivElement>('#fx')!;
const motion = matchMedia('(prefers-reduced-motion: no-preference)');
const confettiColors = ['#d3f86a', '#f1ad75', '#f2f3eb', '#a99cf5'];
const [, screen = '', slug = ''] = location.pathname.split('/');
const role: Role = screen === 'admin' ? 'admin' : screen === 'stage' ? 'stage' : 'audience';
const roomPattern = /^\d{8}$/;

let room = (slug || new URLSearchParams(location.search).get('room') || '').replaceAll('-', '');
let key = '';
let snapshot: RoomSnapshot | undefined;
let session: Session | undefined;
let receivedAt = 0;
let connected = false;
let pending = false;
let pendingVote: Opinion | null = null;
let notice = '';
let formError = '';
let timingError: keyof Timing | null = null;
let fatal = '';
let final = false;
let qr = '';
let shown = '';
let lastPhase: Phase | undefined;
let entered = new Set<string>();
let lastCount = '';
let connection: RoomConnection | undefined;
let pendingTimer: ReturnType<typeof setTimeout> | undefined;
let noticeTimer: ReturnType<typeof setTimeout> | undefined;

const timingHelp: Readonly<Record<keyof Timing, string>> = { length: 'Talk length must be 1 to 120 min.', opensAt: 'Voting must open between 0 min and the talk length.', lasts: 'Voting must last 0.25 to 120 min.' };
const code = (): string => `${room.slice(0, 4)}-${room.slice(4)}`;
const links = {
  audience: (): string => `${location.origin}/?room=${room}`,
  stage: (): string => `${location.origin}/stage/${code()}`,
  admin: (): string => `${location.origin}/admin?room=${room}#key=${key}`,
};

function escape(text: string): string {
  return text.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);
}

function icon(name: 'check' | 'external' | 'people'): string {
  const paths = {
    check: '<path d="m5 12 5 5L19 7"/>',
    external: '<path d="M14 4h6v6m0-6-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
    people: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><circle cx="17" cy="9" r="2.5"/><path d="M17.5 14.5a5 5 0 0 1 4 5.5"/>',
  };
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

function people(): string {
  return `<span class="people">${icon('people')}<span class="badge" data-count data-enter="badge"></span><span class="sr-only">${role === 'audience' ? ' here' : ' connected'}</span></span>`;
}

function header(tag = ''): string {
  const net = session ? connected ? people() : '<span class="net off">Connecting…</span>' : '';
  const logo = '<svg class="logo" viewBox="0 0 64 64" aria-hidden="true"><rect width="64" height="64" rx="16" fill="#d3f86a"/><path d="M17 12v38l11-12 9 15 8-5-9-14 17-3z" fill="#202821"/></svg>';
  return `<header class="bar${role === 'stage' && room ? ' stage-bar' : ''}"><span class="brand">${logo}${tag ? `<span class="chip">${tag}</span>` : `<span class="brand-name">${eventName} <span class="brand-event">@ ${eventEdition}</span></span>`}</span>${net}</header>`;
}

function cue(text: string): string {
  const rising = Array.from({ length: 7 }, (_, index) => `<span class="rise" style="--x:${8 + index * 13}%;--d:${(index * 0.45).toFixed(2)}s;--s:${[20, 28, 36][index % 3]}px;--c:${index % 2 ? '#202821' : '#f2f3eb'}"></span>`).join('');
  return `<div class="event-screen applause">${header()}<main class="cue"><div class="burst" aria-hidden="true">${rising}</div><span class="clap" aria-hidden="true">👏</span><h1 data-enter="cue">Round of applause</h1>${text ? `<p data-enter="cue-${escape(text)}" style="--i:1">${text}</p>` : ''}</main></div>`;
}

function clock(current: Session): string {
  const { from, to } = votingWindow(current);
  const marks = [from, to].filter(seconds => seconds > 0 && seconds < current.length).map(seconds => `<span class="mark" style="--at:${(seconds / current.length * 100).toFixed(2)}%"></span>`).join('');
  return `<div class="clock"><span class="time" role="timer" data-clock></span><span class="of">of ${timeLabel(current.length)}</span></div><div class="track" aria-hidden="true"><div class="fill" data-progress></div>${marks}</div>`;
}

function minutes(seconds: number): string {
  return `${Math.round(seconds / 60 * 100) / 100}`;
}

function button(action: string, label: string, options: { primary?: boolean; disabled?: boolean } = {}): string {
  const disabled = options.disabled || pending || !connected;
  return `<button class="button${options.primary ? ' primary' : ''}" data-action="${action}" data-key="${action}"${disabled ? ' disabled' : ''}>${label}</button>`;
}

function nudgeButton(current: Session, seconds: number, label: string): string {
  return `<button class="button small" data-nudge="${seconds}" data-key="nudge${seconds}"${pending || !connected || !canNudge(current, seconds) ? ' disabled' : ''}>${label}</button>`;
}

function choice(value: Opinion, emoji: string, label: string, opinion: Opinion | null, open: boolean): string {
  const selected = opinion === value;
  const tick = selected ? `<span class="tick" data-enter="tick-${value}">${icon('check')}</span>` : '';
  return `<button class="choice" data-vote="${value}" data-key="vote-${value}" aria-pressed="${selected}"${open && connected && !pending ? '' : ' disabled'}><span class="emoji" aria-hidden="true"${selected ? ` data-enter="pick-${value}"` : ''}>${emoji}</span><span class="choice-label">${label}</span>${tick}</button>`;
}

function onAir(name: string): string {
  return name ? `<div class="on-air"><span class="live">On air</span><p class="speaker" data-enter="speaker-${escape(name)}">${escape(name)}</p></div>` : '';
}

function audience(current: Session): string {
  const phase = phaseOf(current);
  const name = snapshot?.speaker || '';
  if (phase === 'applause') return cue(`Put your phone down and clap for ${name ? escape(name) : 'the speaker'}.`);
  if (phase === 'lobby') {
    const title = name
      ? `<p><span class="live next" data-enter="next">Up next</span></p><h1 class="display" data-enter="next-${escape(name)}" style="--i:1">${escape(name)}</h1>`
      : '<h1 class="display" data-enter="floor">You are in.</h1>';
    return `${header()}<main class="screen"><section class="card crowd-card">${crowd(0, true)}<p class="quiet">Each dot is one person. Yours is lime.</p></section><section class="intro">${title}<p>Keep this page open. Voting opens during each talk.</p><p class="quiet">Votes are anonymous. Your first vote shows as 👍 or 👎 on the screens. Only the co-chairs see the totals.</p></section></main>`;
  }
  if (phase === 'ended') {
    return `${header()}<main class="screen"><section class="intro"><h1 class="display" data-enter="ended">Time is up.</h1><p data-enter="ended-text" style="--i:1">Voting is closed.</p></section></main>`;
  }
  const open = ballotOpen(current);
  const opinion = pendingVote || snapshot?.opinion || null;
  const label = current.paused ? 'Paused' : open ? 'Voting open' : phase === 'closed' ? 'Voting closed' : 'Listening';
  const mood = current.paused ? 'paused' : open ? 'open' : 'live';
  const closed = phase === 'closed';
  const hint = closed ? opinion ? 'Thank you for voting.' : '' : current.paused ? 'Voting continues when the talk resumes.' : pendingVote ? 'Sending…' : opinion ? 'Vote received. You can change it until voting closes.' : 'Only the co-chairs see the totals.';
  const ballot = phase === 'listening'
    ? `<p>${current.openedAt === null ? `Voting opens at ${timeLabel(current.opensAt)}.` : 'Voting opens soon.'}</p>`
    : `<div class="ballot-head"><h2>Your vote</h2>${open ? '<span class="closes" data-closes></span>' : ''}</div><div class="choices">${choice('keep', '👍', 'Keep going', opinion, open)}${choice('wrap', '👎', 'Wrap it up', opinion, open)}</div>${hint ? `<p class="quiet">${hint}</p>` : ''}`;
  return `${header()}<main class="screen"><section class="card">${onAir(name)}<h1 class="state" data-mood="${mood}" data-enter="state-${label}"><span class="pulse" aria-hidden="true"></span>${label}</h1>${clock(current)}</section><section class="card">${ballot}</section></main>`;
}

function stage(current: Session): string {
  const phase = phaseOf(current);
  const name = snapshot?.speaker || '';
  if (phase === 'applause') return cue(name ? `Clap for ${escape(name)}.` : '');
  const listening = current.openedAt === null ? `Scan to join. Voting opens at ${timeLabel(current.opensAt)}.` : 'Scan to join.';
  const line = current.paused ? 'Talk paused.' : { lobby: 'Scan to join.', listening, voting: 'Voting is open. Scan to vote.', closed: 'Voting is closed.', ended: 'Time is up.' }[phase];
  const tag = phase === 'lobby' ? '<span class="live next">Up next</span>' : '<span class="live">On air</span>';
  const who = name ? `<p data-enter="tag-${phase === 'lobby'}">${tag}</p><p class="stage-name" data-enter="stage-${escape(name)}" style="--i:1">${escape(name)}</p>` : '';
  const time = phase === 'lobby' ? '' : '<p class="stage-time" role="timer" data-clock></p>';
  return `<div class="event-screen">${header()}<main class="stage"><div class="qr" role="img" aria-label="QR code for ${escape(links.audience())}">${qr}</div><div class="stage-text">${who}<h1 class="stage-line" data-enter="line-${line}" style="--i:2">${line}</h1>${time}</div></main><p class="stage-host">Cannot scan? Go to <strong>${escape(location.host)}</strong> and enter <strong>${code()}</strong></p></div>`;
}

function speakerForm(label: string): string {
  return `<form class="inline-form" data-speaker><label for="speaker-name">${label}</label><input class="input" id="speaker-name" name="speaker" maxlength="60" autocomplete="off" autocapitalize="words" enterkeyhint="done" data-key="speaker" value="${escape(snapshot?.speaker || '')}"><button class="button small" data-key="save-speaker"${pending || !connected ? ' disabled' : ''}>Save name</button></form>`;
}

function shareCard(): string {
  return `<section class="card" aria-labelledby="share-title"><h2 id="share-title">Share</h2><a class="button" href="${escape(links.stage())}" target="_blank" rel="noopener">Open stage screen${icon('external')}</a><button class="button" data-share="stage" data-key="share-stage">Share stage link</button><p class="quiet">Or type this address on the projector: <strong class="address">${escape(location.host)}<wbr>${escape(links.stage().slice(location.origin.length))}</strong></p><button class="button" data-share="audience" data-key="share-audience">Share audience link</button><button class="button" data-share="admin" data-key="share-admin">Share co-chair link</button><p class="quiet">Anyone with the co-chair link can run the talk and see the totals.</p></section>`;
}

function admin(current: Session): string {
  const phase = phaseOf(current);
  const name = snapshot?.speaker || '';
  const running = current.mode === 'talk' && phase !== 'applause' && phase !== 'ended';
  const canCue = phase !== 'listening';
  const label = current.paused ? 'Paused' : { lobby: 'Between talks', listening: 'Listening', voting: 'Voting open', closed: 'Voting closed', applause: 'Applause on screen', ended: 'Time is up' }[phase];
  const title = `<h1 class="state" data-mood="${current.paused ? 'paused' : phase === 'lobby' ? 'idle' : 'live'}"><span class="pulse" aria-hidden="true"></span>${label}</h1>`;
  if (phase === 'lobby') {
    return `${header('Co-chair')}<main class="screen"><section class="card">${title}${speakerForm('Next speaker')}${button('start', 'Start talk', { primary: true })}<p class="quiet">Voting opens at ${timeLabel(current.opensAt)} for ${minutes(Math.min(current.lasts, current.length - current.opensAt))} min.</p></section>${timingCard(current)}${shareCard()}</main>`;
  }
  let controls: string;
  if (phase === 'applause') controls = `${button('reset', 'Next talk', { primary: true })}<p class="quiet">This clears the votes and the speaker name.</p>`;
  else {
    const secondary = running ? `<div class="row">${button('pause', current.paused ? 'Resume' : 'Pause')}${button('reset', 'End talk')}</div>` : `<div class="row">${button('reset', 'Next talk')}</div>`;
    const vote = phase === 'listening' || phase === 'closed' ? `${button('open', phase === 'closed' ? 'Open voting again' : 'Open voting now')}<p class="quiet">Voting stays open for ${minutes(Math.min(current.lasts, current.length - Math.floor(current.elapsed)))} min.</p>` : phase === 'voting' ? '<p class="closes-line" data-closes></p>' : '';
    controls = `${vote}${button('applause', 'Cue applause', { primary: canCue })}<p class="quiet">Shows on every screen.</p>${secondary}`;
  }
  const adjust = phase === 'applause' ? '' : `<div class="adjust" role="group" aria-labelledby="adjust-title"><span class="quiet" id="adjust-title">Length of this talk</span>${nudgeButton(current, -60, '−1 min')}${nudgeButton(current, 60, '+1 min')}</div>`;
  const onAirLine = name ? `<p class="on-air-line"><span class="live">On air</span>${escape(name)}</p>` : '';
  const votes = `<section class="card" aria-labelledby="votes-title"><h2 id="votes-title">Votes</h2>${result('keep', 'Keep going')}${result('wrap', 'Wrap it up')}<p class="quiet" data-total></p><p class="quiet">Only the co-chairs see these totals.</p></section>`;
  const speaker = `<section class="card" aria-labelledby="speaker-title"><h2 id="speaker-title">Speaker</h2>${speakerForm('Name')}</section>`;
  return `${header('Co-chair')}<main class="screen"><section class="card">${onAirLine}${title}${clock(current)}${adjust}${controls}</section>${votes}${speaker}${timingCard(current)}${shareCard()}</main>`;
}

function timingCard(current: Session): string {
  const saved: Timing = { length: current.planned, opensAt: current.opensAt, lasts: current.lasts };
  const field = (key: keyof Timing, label: string): string => `<label class="timing-row"><span>${label}</span><input class="input" name="${key}" inputmode="decimal" autocomplete="off" data-key="${key}" value="${minutes(saved[key])}"${timingError === key ? ' aria-invalid="true" aria-describedby="timing-error"' : ''}><span class="quiet">min</span></label>`;
  const error = timingError ? `<p class="field-error" id="timing-error">${timingHelp[timingError]}</p>` : '';
  return `<section class="card" aria-labelledby="timing-title"><h2 id="timing-title">Timing</h2><form class="form" data-timing>${field('length', 'Talk length')}${field('opensAt', 'Voting opens at')}${field('lasts', 'Voting lasts')}${error}<button class="button small" data-key="save-timing"${pending || !connected ? ' disabled' : ''}>Save timing</button></form><p class="quiet">Applies now and to the next talks.</p></section>`;
}

function result(opinion: Opinion, label: string): string {
  return `<div class="result"><div class="result-head"><span>${label}</span><strong data-${opinion}></strong></div><div class="track" aria-hidden="true"><div class="fill" data-${opinion}-bar></div></div></div>`;
}

function setup(): string {
  const saved = localStorage.getItem('cc-room');
  if (room) {
    return `${header('Co-chair')}<main class="screen"><section class="card"><h1>No co-chair access</h1><p>This browser cannot run this room. Ask a co-chair for the co-chair link.</p></section></main>`;
  }
  const resume = saved ? `<a class="button primary" href="/admin?room=${escape(saved)}">Return to your room</a>` : '';
  const error = formError ? `<p class="field-error" id="passphrase-error">${escape(formError)}</p>` : '';
  const field = `<label class="field"><span>Event passphrase</span><input class="input" type="password" name="passphrase" autocomplete="current-password" required data-key="passphrase"${formError ? ` aria-invalid="true" aria-describedby="passphrase-error" data-enter="error-${escape(formError)}"` : ''}></label>${error}`;
  const submit = `<button class="button${saved ? '' : ' primary'}" data-key="create"${pending ? ' disabled' : ''}>${pending ? 'Creating room…' : saved ? 'Create a new room' : 'Create room'}</button>`;
  return `${header('Co-chair')}<main class="screen"><section class="card"><h1>Set up the room</h1><p>Create one room per event. Run every talk from this page.</p>${resume}<form class="form" data-create>${field}${submit}</form>${saved ? '<p class="quiet">A new room has a new QR code and event code. Phones stay in the old room.</p>' : ''}</section></main>`;
}

function message(title: string, text: string, action = ''): string {
  return `${header()}<main class="screen"><section class="card"><h1>${escape(title)}</h1>${text ? `<p>${escape(text)}</p>` : ''}${action}</section></main>`;
}

function recovery(): string {
  if (!final) return '<button class="button primary" data-retry data-key="retry">Try again</button>';
  return role === 'audience' ? '<a class="button primary" href="/">Enter the code</a>' : '';
}

function view(): string {
  if (fatal) return message('Unable to join', fatal, recovery());
  if (role === 'admin' && (!room || !key)) return setup();
  if (!room) return `${header()}${landing(formError !== '')}`;
  if (!session) return message('Connecting…', '');
  return role === 'admin' ? admin(session) : role === 'stage' ? stage(session) : audience(session);
}

function updateLive(): void {
  if (!session) return;
  const time = timeLabel(session.elapsed);
  for (const element of root.querySelectorAll('[data-clock]')) if (element.textContent !== time) element.textContent = time;
  for (const element of root.querySelectorAll<HTMLElement>('[data-progress]')) element.style.width = `${session.elapsed / session.length * 100}%`;
  const closes = `Closes in ${timeLabel(Math.max(0, votingWindow(session).to - session.elapsed))}`;
  for (const element of root.querySelectorAll('[data-closes]')) if (element.textContent !== closes) element.textContent = closes;
  const participants = snapshot?.participants ?? 0;
  const count = String(participants);
  for (const element of root.querySelectorAll<HTMLElement>('[data-count]')) {
    if (element.textContent === count) continue;
    element.textContent = count;
    if (lastCount && count !== lastCount) restart(element, 'pop');
  }
  lastCount = count;
  const field = root.querySelector<HTMLElement>('[data-crowd]');
  if (field && role === 'audience' && connected) syncCrowd(field, participants - 1);
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
  if (total) total.textContent = `${results.total} ${results.total === 1 ? 'vote' : 'votes'}. ${participants} ${participants === 1 ? 'phone' : 'phones'} connected.`;
}

function restart(element: HTMLElement, name: string): void {
  element.classList.remove(name);
  void element.offsetWidth;
  element.classList.add(name);
}

function animateEntries(): void {
  const present = new Set<string>();
  for (const element of root.querySelectorAll<HTMLElement>('[data-enter]')) {
    const id = element.dataset.enter!;
    present.add(id);
    if (!entered.has(id)) element.classList.add('enter');
  }
  entered = present;
}

function spawn(className: string, style: string, text = ''): void {
  if (!motion.matches || fx.childElementCount >= 60) return;
  const node = document.createElement('span');
  node.className = className;
  node.setAttribute('style', style);
  node.textContent = text;
  node.addEventListener('animationend', () => node.remove(), { once: true });
  fx.append(node);
}

function cheer(opinion: Opinion, count: number): void {
  for (let index = 0; index < count; index++) {
    spawn('cheer', `--x:${(4 + Math.random() * 88).toFixed(1)}%;--d:${(index * 0.15 + Math.random() * 0.25).toFixed(2)}s;--r:${Math.round(Math.random() * 50 - 25)}deg`, opinion === 'keep' ? '👍' : '👎');
  }
}

function burst(box: DOMRect): void {
  for (let index = 0; index < 18; index++) {
    const angle = Math.random() * Math.PI * 2;
    const distance = 50 + Math.random() * 90;
    const round = index % 3 === 0;
    spawn('confetti', `left:${(box.left + box.width / 2).toFixed(0)}px;top:${(box.top + box.height / 3).toFixed(0)}px;--px:${(Math.cos(angle) * distance).toFixed(0)}px;--py:${(Math.sin(angle) * distance - 30).toFixed(0)}px;--r:${Math.round(Math.random() * 720 - 360)}deg;--c:${confettiColors[index % confettiColors.length]};--w:${round ? 7 : 6}px;--h:${round ? 7 : 13}px;--br:${round ? '50%' : '2px'}`);
  }
}

function render(): void {
  const html = view() + (notice ? `<p class="notice" data-enter="notice-${escape(notice)}">${escape(notice)}</p>` : '');
  if (html !== shown) {
    const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const drafts = [...root.querySelectorAll<HTMLInputElement>('input[data-key]')].filter(input => input.value !== input.defaultValue);
    root.innerHTML = html;
    shown = html;
    animateEntries();
    for (const draft of drafts) {
      const input = root.querySelector<HTMLInputElement>(`input[data-key="${draft.dataset.key}"]`);
      if (input && (input.defaultValue === draft.defaultValue || draft === active)) input.value = draft.value;
    }
    const restored = active?.dataset.key ? root.querySelector<HTMLElement>(`[data-key="${active.dataset.key}"]`) : null;
    restored?.focus();
    if (active instanceof HTMLInputElement && restored instanceof HTMLInputElement) restored.setSelectionRange(active.selectionStart, active.selectionEnd);
  }
  updateLive();
}

function settle(): void {
  pending = false;
  pendingVote = null;
  clearTimeout(pendingTimer);
}

function act(action: Action, basis?: Pick<RoomSnapshot, 'roundId' | 'version'>): boolean {
  if (pending) return false;
  if (!connection?.send(action, basis)) { flash('Not connected. Try again in a moment.'); return false; }
  pending = true;
  if (action.type === 'vote') pendingVote = action.opinion;
  pendingTimer = setTimeout(() => { settle(); flash('No reply. Check your connection and try again.'); }, 5000);
  render();
  return true;
}

function tick(): void {
  if (!snapshot) return;
  session = transition(snapshot.session, { type: 'tick', seconds: (Date.now() - receivedAt) / 1000 });
  const phase = phaseOf(session);
  if (lastPhase && phase !== lastPhase && !ballotOpen(session)) fx.replaceChildren();
  if (role === 'audience' && lastPhase && phase !== lastPhase) {
    announce({ lobby: 'The talk ended.', listening: 'The talk started.', voting: 'Voting is open.', closed: 'Voting is closed.', applause: 'Round of applause. Clap for the speaker.', ended: 'Time is up. Voting is closed.' }[phase]);
    if (phase === 'voting') navigator.vibrate?.(200);
    if (phase === 'applause') navigator.vibrate?.([120, 60, 120, 60, 240]);
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
  final = false;
  if (!roomPattern.test(room)) { final = true; fatal = role === 'stage' ? 'This address is incomplete. Copy it from the Share card.' : 'This link is incomplete.'; render(); return; }
  if (role === 'stage') void QRCode.toString(links.audience(), { type: 'svg', margin: 4, color: { dark: '#000000', light: '#ffffff' } }).then(svg => { qr = svg; render(); });
  connection = connectRoom(room, role, key, {
    state(next): void {
      if (snapshot && (['planned', 'opensAt', 'lasts'] as const).some(field => next.session[field] !== snapshot!.session[field])) timingError = null;
      if (role === 'admin' && !snapshot) localStorage.setItem('cc-room', room);
      const answered = !snapshot || next.version !== snapshot.version || next.roundId !== snapshot.roundId || (pendingVote !== null && next.opinion === pendingVote);
      const sameRound = snapshot && next.version === snapshot.version && next.roundId === snapshot.roundId;
      snapshot = sameRound ? { ...next, session: snapshot!.session } : next;
      if (!sameRound) receivedAt = Date.now();
      if (answered) settle();
      tick();
    },
    reactions(message): void {
      if (!session || !ballotOpen(session) || document.hidden) return;
      cheer('keep', message.keep);
      cheer('wrap', message.wrap);
    },
    connection(value): void {
      connected = value;
      if (!value) settle();
      render();
    },
    error(text, kind): void {
      settle();
      if (kind === 'notice') { flash(text); return; }
      fatal = text;
      final = kind === 'final';
      render();
    },
  });
  render();
}

async function create(passphrase: string): Promise<void> {
  pending = true;
  formError = '';
  render();
  try {
    const response = await fetch('/api/rooms', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ passphrase }) });
    if (response.status === 403 || response.status === 503) {
      pending = false;
      formError = (await response.json() as { error: string }).error;
      announce(formError);
      render();
      return;
    }
    if (!response.ok) throw new Error(`Room creation failed with ${response.status}`);
    const created = await response.json() as { room: string; key: string };
    room = created.room;
    key = created.key;
    localStorage.setItem(`cc-key:${room}`, key);
    history.replaceState(null, '', `/admin?room=${room}`);
    pending = false;
    start();
  } catch {
    pending = false;
    flash('Unable to create a room. Check your connection and try again.');
  }
}

function join(value: string): void {
  const digits = value.replace(/\D/g, '');
  if (roomPattern.test(digits)) { location.assign(`/?room=${digits}`); return; }
  formError = codeError;
  announce(formError);
  render();
}

function ask(question: string, confirmLabel: string): Promise<boolean> {
  const dialog = document.createElement('dialog');
  dialog.className = 'ask';
  dialog.setAttribute('aria-labelledby', 'ask-question');
  dialog.innerHTML = `<form method="dialog"><p id="ask-question">${escape(question)}</p><div class="row"><button class="button" value="cancel">Cancel</button><button class="button primary" value="confirm">${escape(confirmLabel)}</button></div></form>`;
  const opener = document.activeElement instanceof HTMLElement ? document.activeElement.dataset.key : undefined;
  document.body.append(dialog);
  dialog.showModal();
  return new Promise(resolve => dialog.addEventListener('close', () => {
    dialog.remove();
    if (opener && document.activeElement === document.body) root.querySelector<HTMLElement>(`[data-key="${opener}"]`)?.focus();
    resolve(dialog.returnValue === 'confirm');
  }, { once: true }));
}

async function share(kind: 'audience' | 'stage' | 'admin'): Promise<void> {
  const url = links[kind]();
  try {
    if (navigator.share) await navigator.share({ url });
    else { await navigator.clipboard.writeText(url); flash('Link copied.'); }
  } catch (error) {
    if (!(error instanceof DOMException && error.name === 'AbortError')) prompt('Copy this link:', url);
  }
}

root.addEventListener('click', async event => {
  const target = event.target instanceof Element ? event.target.closest<HTMLElement>('button') : null;
  if (!target || target.matches(':disabled')) return;
  const { action, vote, nudge, share: kind } = target.dataset;
  const basis = snapshot && { roundId: snapshot.roundId, version: snapshot.version };
  if (action === 'reset' && session && phaseOf(session) !== 'applause' && phaseOf(session) !== 'ended' && !await ask('End this talk? This clears the votes and the speaker name.', 'End talk')) return;
  if (action === 'applause' && session && phaseOf(session) === 'listening' && !await ask('Cue applause now? Voting has not opened.', 'Cue applause')) return;
  if (action === 'start') act({ type: 'start', speaker: root.querySelector<HTMLInputElement>('input[data-key="speaker"]')?.value ?? '' }, basis);
  if (action === 'reset' || action === 'pause' || action === 'applause' || action === 'open') act({ type: action }, basis);
  if (vote === 'keep' || vote === 'wrap') {
    const box = target.getBoundingClientRect();
    if (act({ type: 'vote', opinion: vote })) burst(box);
  }
  if (nudge) act({ type: 'nudge', seconds: Number(nudge) });
  if (kind === 'audience' || kind === 'stage' || kind === 'admin') void share(kind);
  if (target.hasAttribute('data-retry')) start();
});

root.addEventListener('submit', async event => {
  event.preventDefault();
  if (!(event.target instanceof HTMLFormElement)) return;
  if (event.target.hasAttribute('data-create') && !pending) void create(String(new FormData(event.target).get('passphrase')));
  if (event.target.hasAttribute('data-join')) join(String(new FormData(event.target).get('code')));
  if (event.target.hasAttribute('data-speaker')) act({ type: 'speaker', name: String(new FormData(event.target).get('speaker')) });
  if (event.target.hasAttribute('data-timing')) {
    const form = new FormData(event.target);
    const seconds = (key: keyof Timing): number => {
      const value = String(form.get(key)).trim().replace(',', '.');
      return value ? Math.round(Number(value) * 60) : Number.NaN;
    };
    const timing = { length: seconds('length'), opensAt: seconds('opensAt'), lasts: seconds('lasts') };
    const basis = snapshot && { roundId: snapshot.roundId, version: snapshot.version };
    timingError = timingProblem(timing);
    render();
    if (timingError) { announce(timingHelp[timingError]); return; }
    if (session?.mode === 'talk' && !session.applause && timing.length !== session.planned && timing.length <= session.elapsed && !await ask('The new length has already passed. Saving ends the talk now.', 'Save and end talk')) return;
    act({ type: 'timing', ...timing }, basis);
  }
});

if (role === 'admin') {
  const shared = new URLSearchParams(location.hash.slice(1)).get('key');
  if (roomPattern.test(room) && shared && /^[a-f0-9]{64}$/.test(shared)) localStorage.setItem(`cc-key:${room}`, shared);
  if (location.hash) history.replaceState(null, '', location.pathname + location.search);
  key = room ? localStorage.getItem(`cc-key:${room}`) || '' : '';
}
document.body.dataset.role = role;
document.body.insertAdjacentHTML('afterbegin', `<div class="ambient" aria-hidden="true">${ambient()}</div>`);
document.title = { audience: eventTitle, stage: `Stage · ${eventTitle}`, admin: `Co-chair · ${eventTitle}` }[role];
setInterval(tick, 250);
if (room && (role !== 'admin' || key)) start();
else render();
