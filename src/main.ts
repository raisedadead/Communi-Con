import QRCode from 'qrcode';
import { mountCrowd } from './crowd';
import { connectRoom } from './connection';
import { initialSession, phaseOf, timeLabel, transition } from './session';
import type { Action } from './session';
import type { RoomSnapshot } from './protocol';
import './style.css';

const root = document.querySelector<HTMLDivElement>('#app')!;
const role = location.pathname.replace(/\/$/, '') === '/admin' ? 'admin' : location.pathname.replace(/\/$/, '') === '/stage' ? 'stage' : 'audience';
let room = new URL(location.href).searchParams.get('room') || '';
let snapshot: RoomSnapshot | undefined;
let session = initialSession();
let disposeCrowd = (): void => {};
let joinUrl = new URL('/', location.href).href;
let receivedAt = 0;
let connected = false;
let pending = false;
let notice = '';
let roomError = '';
let connection: ReturnType<typeof connectRoom> | undefined;
let pendingTimeout: ReturnType<typeof setTimeout> | undefined;

function roomPath(path: string): string { return `${path}?room=${encodeURIComponent(room)}`; }

function escape(text: string): string {
  return text.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);
}

function icon(name: 'arrow' | 'cursor' | 'check' | 'lock' | 'expand' | 'play' | 'pause' | 'spark' | 'external'): string {
  const paths = {
    arrow: '<path d="M4 12h15m-6-6 6 6-6 6"/>',
    cursor: '<path d="m5 3 2 17 5-6 7-2L5 3Z"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    lock: '<rect x="5" y="10" width="14" height="11" rx="3"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 4v3"/>',
    expand: '<path d="M9 4H4v5m11-5h5v5M4 15v5h5m11-5v5h-5"/>',
    play: '<path d="m8 4 12 8-12 8V4Z"/>',
    pause: '<path d="M8 5v14m8-14v14"/>',
    spark: '<path d="m12 2 2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5L12 2Z"/>',
    external: '<path d="M14 3h7v7m0-7L10 14m-1-9H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"/>',
  };
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]}</svg>`;
}

function brand(): string {
  return `<a class="brand" href="${room ? roomPath('/') : '/'}" aria-label="Communi-Con audience home"><span class="brand-mark">${icon('cursor')}${icon('cursor')}</span><span>communi<span class="brand-hyphen">–</span>con<span class="brand-caption">AN INDIAFOSS EXPERIENCE</span></span></a>`;
}

function header(): string {
  return `<header class="site-header">${brand()}<div class="event-wordmark">IndiaFOSS<span>20<span class="lime-dot"></span>26</span></div></header>`;
}

function footer(): string {
  return `<footer class="site-footer"><span>FROM THE COMMUNITY. FOR THE COMMUNITY.</span><span>27 SEP 2026 <span class="footer-divider">/</span> BENGALURU</span></footer>`;
}

function statusLabel(): string {
  if (session.paused) return 'Taking a moment';
  return { practice: 'The warm-up', listening: 'Now listening', voting: 'Your voice, privately', eligible: 'Your voice, privately', applause: 'A little appreciation', ended: 'That’s a wrap' }[phaseOf(session)];
}

function demoBanner(): string {
  return `<div class="demo-banner"><span class="demo-tag">SHARED DEMO</span><span>${connected ? 'Connected' : 'Reconnecting…'} · <span data-participants>${snapshot?.participants || 0}</span> participants</span><span class="demo-target">Sample talk · real audience feedback</span></div>`;
}

function progress(): string {
  return `<div class="talk-progress" aria-label="Talk progress"><div data-progress style="width:${session.elapsed / 6}%"></div></div>`;
}

function audience(): string {
  const phase = phaseOf(session);
  const practice = phase === 'practice';
  const celebration = phase === 'applause' || phase === 'ended';
  const voteOpen = (phase === 'voting' || phase === 'eligible') && !session.paused;
  const title = practice ? 'Small cursors.<br><span>Big energy.</span>' : celebration ? 'Good talks deserve<br><span>a great send-off.</span>' : 'The stage is theirs.<br><span>The voice is yours.</span>';
  const description = practice ? 'One room. Hundreds of little voices.<br>Find your cursor. Make something happen.' : celebration ? 'A shared stage. A shared thank-you.<br>Let’s hear it for our speaker.' : 'Listen, get curious, and have your say.<br>Your feedback goes only to the co-chairs.';
  return `${header()}<main class="audience-main${!practice && !celebration ? ' talk-active' : ''}">
    <section class="intro"><div><p class="eyebrow"><span class="live-dot"></span>COMMUNI-CON <span class="slash">/</span> HALL 01</p><h1>${title}</h1><p class="intro-copy">${description}</p></div><div class="intro-aside"><span class="edition-label">THE COMMUNITY<br>TAKES THE MIC.</span><span class="edition-number">01<span>/ 07</span></span></div></section>
    <div class="experience-grid">
      <section class="playground" aria-labelledby="playground-title"><div class="canvas-top"><span class="canvas-label" id="playground-title"><span class="live-dot"></span>${statusLabel()}</span><span class="canvas-meta">${practice ? 'A LITTLE PRACTICE' : `<span data-time>${timeLabel(session.elapsed)}</span> / 10:00`}</span></div>
        <div class="canvas-wrap"><canvas id="crowd" class="${practice ? 'interactive-canvas' : ''}" role="img" aria-label="${practice ? 'Connected participants around a circle. Use Join the circle below or drag your cursor into the middle.' : 'Connected audience artwork. This visual does not represent votes.'}"></canvas>${!practice ? `<div class="canvas-message"><span>${celebration ? 'FROM ALL OF US' : 'THE ROOM IS LISTENING'}</span><strong>${celebration ? 'Take a bow.' : 'All ears.<br>All here.'}</strong>${celebration ? `<span class="applause-caption">${icon('spark')} THANK YOU, SPEAKER.</span>` : ''}</div>` : ''}</div>
        <div class="canvas-bottom"><span>${practice ? `${icon('cursor')} <span>Your cursor is the bright one.</span>` : `${icon('spark')} <span>${celebration ? 'A room full of appreciation.' : 'One community. Many perspectives.'}</span>`}</span><span class="canvas-corner">${practice ? 'MOVE · MEET · MAKE' : 'ATTENTION IS A GIFT'}</span></div>
      </section>
      <section class="participant-panel" aria-labelledby="participant-title">
        <div class="panel-top"><span class="eyebrow">${practice ? 'BEFORE THE FIRST TALK' : celebration ? 'UNTIL THE NEXT ONE' : 'YOUR AUDIENCE PASS'}</span><span class="step-marker">${practice ? '01' : celebration ? '03' : '02'}</span></div>
        ${practice ? `<div class="panel-body"><span class="large-symbol">${icon(session.joined ? 'check' : 'cursor')}</span><h2 id="participant-title">${session.joined ? 'You’re part of it.' : 'Hello, little cursor.'}</h2><p>${session.joined ? 'Look what happens when we come together. You’re ready for the first talk.' : 'Let’s make a circle, together. Drag your cursor into the middle, or simply tap below.'}</p><button class="button primary full" data-action="join" ${session.joined ? 'disabled' : ''}>${session.joined ? 'You’re in the circle' : 'Join the circle'}${icon(session.joined ? 'check' : 'arrow')}</button><p class="panel-hint">${session.joined ? 'The co-chairs will start the first talk.' : 'No score. No right answer. Just us.'}</p></div>` : celebration ? `<div class="panel-body"><span class="large-symbol">${icon('spark')}</span><h2 id="participant-title">${phase === 'applause' ? 'A round of applause.' : 'Thanks for listening.'}</h2><p>${phase === 'applause' ? 'The co-chairs have cued the room. Put your phone down and give our speaker a big hand.' : 'Our ten minutes are up. Thank you for listening, sharing, and being part of it.'}</p><div class="confirmation">${icon('check')} ${phase === 'applause' ? 'Applause cued by the co-chairs' : 'Talk complete'}</div><p class="panel-hint">Your next great idea is one talk away.</p></div>` : `<div class="panel-body ballot"><div class="sample-label">DEMO TALK 01</div><h2 id="participant-title">The best things<br>are built together.</h2><p class="speaker-caption">A sample community talk <span>·</span> 10 minutes</p>${progress()}<div class="time-row"><span data-time>${timeLabel(session.elapsed)}</span><span>10:00</span></div><div class="ballot-question"><h3>${session.paused ? 'A brief pause.' : voteOpen ? 'How’s the talk going?' : 'For now, just listen.'}</h3><p>${session.paused ? 'The co-chairs have paused the session.' : voteOpen ? 'One choice. You can change your mind.' : 'Your private ballot opens at 5:00.'}</p></div><div class="vote-buttons"><button class="vote-button ${session.opinion === 'keep' ? 'selected' : ''}" data-vote="keep" aria-pressed="${session.opinion === 'keep'}" ${voteOpen ? '' : 'disabled'}><span><strong>Keep going</strong><small>I’m with you.</small></span>${icon(session.opinion === 'keep' ? 'check' : 'arrow')}</button><button class="vote-button ${session.opinion === 'wrap' ? 'selected' : ''}" data-vote="wrap" aria-pressed="${session.opinion === 'wrap'}" ${voteOpen ? '' : 'disabled'}><span><strong>Time to wrap up</strong><small>Let’s land the thought.</small></span>${icon(session.opinion === 'wrap' ? 'check' : 'arrow')}</button></div><p class="ballot-receipt">${session.opinion ? `${icon('check')} Your choice was received.` : `${icon('lock')} Only the co-chairs see the results.`}</p></div>`}
        <div class="panel-bottom">${icon('lock')} Anonymous to the room. Part of the room.</div>
      </section>
    </div>
    <section class="how-it-works" aria-label="How it works"><div><span>01</span><p><strong>Find your place.</strong>Scan. Join. You’re one of us.</p></div><div><span>02</span><p><strong>Lend your attention.</strong>Great ideas need good listeners.</p></div><div><span>03</span><p><strong>Have your say.</strong>Private feedback. Shared appreciation.</p></div></section>
    ${demoBanner()}
  </main>${footer()}`;
}

function qrBlock(): string {
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(new URL(joinUrl).hostname);
  return `<div class="join-block"><div class="qr-frame"><canvas id="qr" role="img" aria-label="QR code for the participant demo"></canvas></div><div><span class="eyebrow">THE FLOOR IS YOURS</span><h2>Scan. Join. Be part of it.</h2><a class="join-address" href="${escape(joinUrl)}">${escape(new URL(joinUrl).host)}</a><small class="room-code">ROOM ${room.slice(0, 6).toUpperCase()}</small><p>${local ? 'Open the demo through its public link before sharing this QR.' : 'Scan to join this shared room from your phone.'}</p></div></div>`;
}

function stage(): string {
  const phase = phaseOf(session);
  const practice = phase === 'practice';
  const celebration = phase === 'applause';
  return `<main class="stage-main"><header class="stage-header">${brand()}<div class="stage-event">IndiaFOSS 2026<span>27 SEPTEMBER · HALL 01</span></div><button class="icon-button" data-fullscreen aria-label="Toggle fullscreen">${icon('expand')}</button></header><section class="stage-scene"><canvas id="crowd" role="img" aria-label="Connected audience artwork; no voting results are shown."></canvas><div class="stage-title"><p class="eyebrow">${practice ? 'A ROOM FULL OF POSSIBILITY' : celebration ? 'ONE STAGE. ALL OF US.' : 'COMMUNITY TALK 01 / 07 · SAMPLE TALK'}</p><h1>${practice ? 'We’re better<br><em>together.</em>' : celebration ? 'Let’s hear<br><em>it for them.</em>' : 'The best things<br>are built <em>together.</em>'}</h1><p>${practice ? 'Find your cursor. Join the circle.' : celebration ? 'Thank you for sharing your little corner of the world.' : 'Give an idea ten minutes. See where it takes you.'}</p></div><div class="stage-status"><span class="live-dot"></span>${session.paused ? 'SESSION PAUSED' : practice ? 'WARM-UP IN PROGRESS' : celebration ? 'A ROUND OF APPLAUSE' : phase === 'ended' ? 'TALK COMPLETE' : 'THE ROOM IS LISTENING'}${!practice && !celebration ? `<span class="stage-clock" data-time>${timeLabel(session.elapsed)}</span>` : ''}</div></section><div class="stage-bottom">${qrBlock()}<div class="stage-footnote">FROM THE COMMUNITY.<br>FOR THE COMMUNITY.<span>SHARED DEMO · CONNECTED PARTICIPANTS</span></div></div></main>`;
}

function resultBars(): string {
  const count = snapshot?.results || { keep: 0, wrap: 0, total: 0 };
  return `<div class="results-summary"><span>Audience responses</span><strong>${count.total}<span> votes received</span></strong></div><div class="result-row"><div><span>Keep going</span><strong>${count.total ? Math.round(count.keep / count.total * 100) : 0}% <small>${count.keep}</small></strong></div><div class="result-track"><div style="width:${count.total ? count.keep / count.total * 100 : 0}%"></div></div></div><div class="result-row wrap-result"><div><span>Time to wrap up</span><strong>${count.total ? Math.round(count.wrap / count.total * 100) : 0}% <small>${count.wrap}</small></strong></div><div class="result-track"><div style="width:${count.total ? count.wrap / count.total * 100 : 0}%"></div></div></div>`;
}

function admin(): string {
  const phase = phaseOf(session);
  const practice = phase === 'practice';
  const canApplaud = (phase === 'eligible' || phase === 'ended') && !session.paused;
  return `${header()}<main class="admin-main"><div class="admin-heading"><div><p class="eyebrow">BACKSTAGE <span class="slash">/</span> CO-CHAIRS ONLY</p><h1>A feel for the room.</h1><p>The audience has a voice. You have the final cue.</p></div><div class="preview-links"><a class="button secondary" href="${roomPath('/')}" target="_blank" rel="noopener">Audience view ${icon('external')}</a><a class="button secondary" href="${roomPath('/stage')}" target="_blank" rel="noopener">Stage view ${icon('external')}</a></div></div>
    <div class="admin-notice">${icon('lock')}<p><strong>You’re hosting this room.</strong> Keep this tab open for controls. Share the participant link below; only this browser can see results and send stage cues.</p></div>
    <div class="admin-grid"><section class="control-panel"><div class="section-heading"><span class="eyebrow">ON THE CLOCK</span><span class="status-pill">${session.paused ? 'Paused' : practice ? 'Practice' : phase === 'ended' ? 'Complete' : phase === 'applause' ? 'Applause' : 'Sample talk 01'}</span></div><h2>${practice ? 'Let the room warm up.' : 'The best things are built together.'}</h2><p class="muted">${practice ? 'Give everyone a moment to find their cursor.' : 'Sample speaker · community talk · ten minutes'}</p><div class="host-timer"><strong data-time>${timeLabel(session.elapsed)}</strong><span>/ 10:00</span></div>${progress()}<div class="timer-milestones"><span>00:00<br>Listen</span><span>05:00<br>Ballot opens</span><span>08:00<br>Cue available</span><span>10:00<br>Complete</span></div><div class="host-actions">${practice ? `<button class="button primary" data-action="start">Start sample talk ${icon('play')}</button>` : `<button class="button secondary" data-action="pause" ${['applause', 'ended'].includes(phase) ? 'disabled' : ''}>${session.paused ? 'Resume session' : 'Pause session'}${icon(session.paused ? 'play' : 'pause')}</button>`}<button class="button secondary" data-action="reset">Reset demo</button></div></section>
    <section class="results-panel"><div class="section-heading"><span class="eyebrow">THE AUDIENCE SAYS</span><span class="private-label">${icon('lock')} PRIVATE</span></div><h2>A signal, not a verdict.</h2><p class="muted">The audience and stage screens never show these totals.</p><div id="result-bars">${resultBars()}</div><div class="host-cue"><button class="button primary full" data-action="applause" ${canApplaud ? '' : 'disabled'}>${phase === 'applause' ? 'Applause is on the stage' : 'Cue a round of applause'}${icon('spark')}</button><p>${phase === 'applause' ? 'The ballot is closed. The stage is celebrating.' : canApplaud ? 'You decide when to land the talk. Votes do not trigger this.' : session.paused ? 'Resume the session before sending a cue.' : 'Available from 08:00. Always triggered by a co-chair.'}</p></div></section></div>
    <section class="demo-controls"><div><p class="eyebrow">FOR THIS WALKTHROUGH</p><h2>Skip ahead. See what happens.</h2><p>Skip the wait for this rehearsal. Every connected device follows.</p></div><div class="demo-buttons"><button class="button secondary" data-jump="0">00:00 · Listen</button><button class="button secondary" data-jump="300">05:00 · Vote</button><button class="button secondary" data-jump="480">08:00 · Wrap up</button><button class="button secondary" data-jump="600">10:00 · Finish</button></div></section>
    <section class="share-panel"><div><p class="eyebrow">INVITE THE ROOM</p><h2>Bring your phone into this room.</h2><p>Scan the QR, or share the participant link. Each browser gets one private, changeable vote.</p><button class="button secondary" data-copy-link>Copy participant link ${icon('arrow')}</button></div>${qrBlock()}</section>
    ${demoBanner()}</main>${footer()}`;
}

function announce(message: string): void {
  const live = document.querySelector('#announcements');
  if (live) live.textContent = message;
}

function apply(action: Action): void {
  if (pending) return;
  roomError = '';
  if (!connection?.send(action)) {
    notice = 'Reconnecting. Wait until you’re connected, then try again.';
    render();
    return;
  }
  pending = true;
  notice = '';
  pendingTimeout = setTimeout(() => {
    pending = false;
    notice = 'Still waiting for confirmation. Check your connection before trying again.';
    render();
  }, 5000);
  render();
}

function updateClock(): void {
  document.querySelectorAll('[data-time]').forEach(element => { element.textContent = timeLabel(session.elapsed); });
  document.querySelectorAll<HTMLElement>('[data-progress]').forEach(element => { element.style.width = `${session.elapsed / 6}%`; });
}

function waiting(): string {
  const create = role === 'admin' && !room;
  return `${header()}<main class="welcome"><p class="eyebrow">COMMUNI-CON / SHARED DEMO</p><h1>${create ? 'Bring the room together.' : room ? 'Joining the room.' : 'Your place is in the room.'}</h1><p>${create ? 'Create a session on your laptop. Then scan its QR code with your phone. Your controls and their feedback stay in the same room.' : room ? 'We’re connecting you to the shared session.' : 'Scan the QR code on the stage screen, or open the participant link from your co-chair.'}</p>${create ? `<button class="button primary" data-create ${pending ? 'disabled' : ''}>${pending ? 'Creating your room…' : 'Create a demo room'}${icon('arrow')}</button>` : room ? '<button class="button secondary" data-retry>Try connecting again</button>' : ''}</main>${footer()}`;
}

async function createRoom(): Promise<void> {
  if (pending) return;
  pending = true;
  notice = '';
  render();
  try {
    const response = await fetch('/api/rooms', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    if (!response.ok) throw new Error('Could not create the room. Try again.');
    const result = await response.json() as { room: string };
    room = result.room;
    history.replaceState(null, '', roomPath('/admin'));
    pending = false;
    startConnection();
  } catch (error) {
    pending = false;
    notice = error instanceof Error ? error.message : 'Could not create the room. Try again.';
    render();
  }
}

function startConnection(): void {
  connection?.close();
  connected = false;
  notice = '';
  roomError = '';
  render();
  if (!/^[a-f0-9]{32}$/.test(room)) {
    notice = 'This room link is incomplete. Scan the current stage QR code.';
    render();
    return;
  }
  connection = connectRoom(room, role, {
    state(next): void {
      const oldOpinion = session.opinion;
      snapshot = next;
      session = next.session;
      receivedAt = performance.now();
      joinUrl = next.joinUrl;
      pending = false;
      clearTimeout(pendingTimeout);
      notice = '';
      render();
      if (session.opinion && session.opinion !== oldOpinion) announce('Your choice was received. You can change it while the ballot is open.');
    },
    connection(value): void {
      if (connected === value) return;
      connected = value;
      if (!value) { pending = false; clearTimeout(pendingTimeout); render(); }
    },
    error(message): void { pending = false; clearTimeout(pendingTimeout); roomError = message; render(); },
  });
}

function render(): void {
  const focused = document.activeElement instanceof HTMLElement ? document.activeElement.dataset.focus || document.activeElement.id : '';
  disposeCrowd();
  const message = roomError || notice;
  root.innerHTML = `${snapshot ? role === 'admin' ? admin() : role === 'stage' ? stage() : audience() : waiting()}${message ? `<div class="connection-notice" role="alert">${escape(message)}</div>` : snapshot && !connected ? '<div class="connection-notice" role="status">Reconnecting… Your controls will return when the room is connected.</div>' : ''}`;
  const canvas = document.querySelector<HTMLCanvasElement>('#crowd');
  if (canvas) disposeCrowd = mountCrowd(canvas, () => session, () => snapshot?.members || [], () => snapshot?.participantId || null, role === 'audience' && phaseOf(session) === 'practice' ? () => apply({ type: 'join' }) : undefined);
  document.querySelectorAll<HTMLButtonElement>('[data-action]').forEach(button => {
    button.dataset.focus = button.dataset.action;
    button.addEventListener('click', () => {
      const type = button.dataset.action;
      if (type === 'join') apply({ type });
      if (role === 'admin' && (type === 'start' || type === 'reset' || type === 'pause' || type === 'applause')) apply({ type });
    });
  });
  document.querySelectorAll<HTMLButtonElement>('[data-vote]').forEach(button => {
    button.dataset.focus = button.dataset.vote;
    button.addEventListener('click', () => {
      const opinion = button.dataset.vote;
      if (opinion === 'keep' || opinion === 'wrap') apply({ type: 'vote', opinion });
    });
  });
  document.querySelectorAll<HTMLButtonElement>('[data-jump]').forEach(button => {
    button.dataset.focus = `jump-${button.dataset.jump}`;
    button.addEventListener('click', () => {
      apply({ type: 'seek', seconds: Number(button.dataset.jump) });
    });
  });
  document.querySelector('[data-create]')?.addEventListener('click', () => void createRoom());
  document.querySelector('[data-retry]')?.addEventListener('click', startConnection);
  document.querySelector('[data-copy-link]')?.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(joinUrl); announce('Participant link copied.'); }
    catch { notice = 'Copy the participant link beside the QR code.'; render(); }
  });
  document.querySelectorAll<HTMLButtonElement>('[data-action], [data-vote], [data-jump]').forEach(button => {
    if (!connected || pending) button.disabled = true;
    if (button.dataset.jump && session.mode === 'practice') button.disabled = true;
  });
  document.querySelector('[data-fullscreen]')?.addEventListener('click', async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch { announce('Fullscreen is unavailable in this browser. Use the browser’s fullscreen option.'); }
  });
  const qr = document.querySelector<HTMLCanvasElement>('#qr');
  if (qr) QRCode.toCanvas(qr, joinUrl, { width: 144, margin: 3, color: { dark: '#202821', light: '#f2f3eb' } }).catch(() => { qr.replaceWith('Open the link to join.'); });
  if (focused) document.querySelector<HTMLElement>(`[data-focus="${CSS.escape(focused)}"], #${CSS.escape(focused)}`)?.focus({ preventScroll: true });
}

setInterval(() => {
  if (!snapshot || !connected) return;
  const previous = phaseOf(session);
  session = transition(snapshot.session, { type: 'tick', seconds: (performance.now() - receivedAt) / 1000 });
  if (phaseOf(session) !== previous) render();
  else updateClock();
}, 250);

document.body.dataset.role = role;
const live = document.createElement('div');
live.id = 'announcements';
live.className = 'sr-only';
live.setAttribute('aria-live', 'polite');
live.setAttribute('aria-atomic', 'true');
document.body.append(live);
if (room) startConnection();
else render();
