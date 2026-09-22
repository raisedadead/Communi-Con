import QRCode from 'qrcode';
import { mountCrowd } from './crowd';
import { initialSession, phaseOf, readSession, timeLabel, transition } from './session';
import type { Action, Session } from './session';
import './style.css';

const root = document.querySelector<HTMLDivElement>('#app')!;
const role = location.pathname.replace(/\/$/, '') === '/admin' ? 'admin' : location.pathname.replace(/\/$/, '') === '/stage' ? 'stage' : 'audience';
const storageKey = 'communi-con:visual-demo:v1';
let storageAvailable = true;
let session = load();
let disposeCrowd = (): void => {};
let joinUrl = new URL('/', location.href).href;
let lastTick = performance.now();
let timerOwner = false;

function load(): Session {
  try { return readSession(localStorage.getItem(storageKey)); }
  catch { storageAvailable = false; return initialSession(); }
}

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
  return `<a class="brand" href="/" aria-label="Communi-Con audience home"><span class="brand-mark">${icon('cursor')}${icon('cursor')}</span><span>communi<span class="brand-hyphen">–</span>con<span class="brand-caption">AN INDIAFOSS EXPERIENCE</span></span></a>`;
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
  return `<div class="demo-banner"><span class="demo-tag">VISUAL DEMO</span><span>Simulated crowd · this browser only</span><span class="demo-target">Designed for 500+ voices</span></div>`;
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
  return `${header()}<main class="audience-main">
    <section class="intro"><div><p class="eyebrow"><span class="live-dot"></span>COMMUNI-CON <span class="slash">/</span> HALL 01</p><h1>${title}</h1><p class="intro-copy">${description}</p></div><div class="intro-aside"><span class="edition-label">THE COMMUNITY<br>TAKES THE MIC.</span><span class="edition-number">01<span>/ 07</span></span></div></section>
    <div class="experience-grid">
      <section class="playground" aria-labelledby="playground-title"><div class="canvas-top"><span class="canvas-label" id="playground-title"><span class="live-dot"></span>${statusLabel()}</span><span class="canvas-meta">${practice ? 'A LITTLE PRACTICE' : `<span data-time>${timeLabel(session.elapsed)}</span> / 10:00`}</span></div>
        <div class="canvas-wrap"><canvas id="crowd" class="${practice ? 'interactive-canvas' : ''}" role="img" aria-label="${practice ? 'Simulated crowd of cursors around a circle. Use Join the circle below or drag your cursor into the middle.' : 'Abstract simulated crowd. This visual does not represent votes.'}"></canvas>${!practice ? `<div class="canvas-message"><span>${celebration ? 'FROM ALL OF US' : 'THE ROOM IS LISTENING'}</span><strong>${celebration ? 'Take a bow.' : 'All ears.<br>All here.'}</strong>${celebration ? `<span class="applause-caption">${icon('spark')} THANK YOU, SPEAKER.</span>` : ''}</div>` : ''}</div>
        <div class="canvas-bottom"><span>${practice ? `${icon('cursor')} <span>Your cursor is the bright one.</span>` : `${icon('spark')} <span>${celebration ? 'A room full of appreciation.' : 'One community. Many perspectives.'}</span>`}</span><span class="canvas-corner">${practice ? 'MOVE · MEET · MAKE' : 'ATTENTION IS A GIFT'}</span></div>
      </section>
      <section class="participant-panel" aria-labelledby="participant-title">
        <div class="panel-top"><span class="eyebrow">${practice ? 'BEFORE THE FIRST TALK' : celebration ? 'UNTIL THE NEXT ONE' : 'YOUR AUDIENCE PASS'}</span><span class="step-marker">${practice ? '01' : celebration ? '03' : '02'}</span></div>
        ${practice ? `<div class="panel-body"><span class="large-symbol">${icon(session.joined ? 'check' : 'cursor')}</span><h2 id="participant-title">${session.joined ? 'You’re part of it.' : 'Hello, little cursor.'}</h2><p>${session.joined ? 'Look what happens when we come together. You’re ready for the first talk.' : 'Let’s make a circle, together. Drag your cursor into the middle, or simply tap below.'}</p><button class="button primary full" data-action="join" ${session.joined ? 'disabled' : ''}>${session.joined ? 'You’re in the circle' : 'Join the circle'}${icon(session.joined ? 'check' : 'arrow')}</button><p class="panel-hint">${session.joined ? 'The co-chairs will start the first talk.' : 'No score. No right answer. Just us.'}</p></div>` : celebration ? `<div class="panel-body"><span class="large-symbol">${icon('spark')}</span><h2 id="participant-title">${phase === 'applause' ? 'A round of applause.' : 'Thanks for listening.'}</h2><p>${phase === 'applause' ? 'The co-chairs have cued the room. Put your phone down and give our speaker a big hand.' : 'Our ten minutes are up. Thank you for listening, sharing, and being part of it.'}</p><div class="confirmation">${icon('check')} ${phase === 'applause' ? 'Applause cued by the co-chairs' : 'Talk complete'}</div><p class="panel-hint">Your next great idea is one talk away.</p></div>` : `<div class="panel-body ballot"><div class="sample-label">DEMO TALK 01</div><h2 id="participant-title">The best things<br>are built together.</h2><p class="speaker-caption">A sample community talk <span>·</span> 10 minutes</p>${progress()}<div class="time-row"><span data-time>${timeLabel(session.elapsed)}</span><span>10:00</span></div><div class="ballot-question"><h3>${session.paused ? 'A brief pause.' : voteOpen ? 'How’s the talk going?' : 'For now, just listen.'}</h3><p>${session.paused ? 'The co-chairs have paused the session.' : voteOpen ? 'One choice. You can change your mind.' : 'Your private ballot opens at 5:00.'}</p></div><div class="vote-buttons"><button class="vote-button ${session.opinion === 'keep' ? 'selected' : ''}" data-vote="keep" aria-pressed="${session.opinion === 'keep'}" ${voteOpen ? '' : 'disabled'}><span><strong>Keep going</strong><small>I’m with you.</small></span>${icon(session.opinion === 'keep' ? 'check' : 'arrow')}</button><button class="vote-button ${session.opinion === 'wrap' ? 'selected' : ''}" data-vote="wrap" aria-pressed="${session.opinion === 'wrap'}" ${voteOpen ? '' : 'disabled'}><span><strong>Time to wrap up</strong><small>Let’s land the thought.</small></span>${icon(session.opinion === 'wrap' ? 'check' : 'arrow')}</button></div><p class="ballot-receipt">${session.opinion ? `${icon('check')} Your choice is saved in this demo.` : `${icon('lock')} Only the co-chairs see the results.`}</p></div>`}
        <div class="panel-bottom">${icon('lock')} Anonymous to the room. Part of the room.</div>
      </section>
    </div>
    <section class="how-it-works" aria-label="How it works"><div><span>01</span><p><strong>Find your place.</strong>Scan. Join. You’re one of us.</p></div><div><span>02</span><p><strong>Lend your attention.</strong>Great ideas need good listeners.</p></div><div><span>03</span><p><strong>Have your say.</strong>Private feedback. Shared appreciation.</p></div></section>
    ${demoBanner()}
  </main>${footer()}`;
}

function qrBlock(): string {
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(new URL(joinUrl).hostname);
  return `<div class="join-block"><div class="qr-frame"><canvas id="qr" role="img" aria-label="QR code for the participant demo"></canvas></div><div><span class="eyebrow">THE FLOOR IS YOURS</span><h2>Scan. Join. Be part of it.</h2><a class="join-address" href="${escape(joinUrl)}">${escape(new URL(joinUrl).host)}</a><p>${local ? 'Local preview · set a phone-accessible URL in the co-chair demo.' : 'Open the participant demo. Each device runs its own simulation.'}</p></div></div>`;
}

function stage(): string {
  const phase = phaseOf(session);
  const practice = phase === 'practice';
  const celebration = phase === 'applause';
  return `<main class="stage-main"><header class="stage-header">${brand()}<div class="stage-event">IndiaFOSS 2026<span>27 SEPTEMBER · HALL 01</span></div><button class="icon-button" data-fullscreen aria-label="Toggle fullscreen">${icon('expand')}</button></header><section class="stage-scene"><canvas id="crowd" role="img" aria-label="Simulated collective cursor artwork; no voting results are shown."></canvas><div class="stage-title"><p class="eyebrow">${practice ? 'A ROOM FULL OF POSSIBILITY' : celebration ? 'ONE STAGE. ALL OF US.' : 'COMMUNITY TALK 01 / 07 · SAMPLE TALK'}</p><h1>${practice ? 'We’re better<br><em>together.</em>' : celebration ? 'Let’s hear<br><em>it for them.</em>' : 'The best things<br>are built <em>together.</em>'}</h1><p>${practice ? 'Find your cursor. Join the circle.' : celebration ? 'Thank you for sharing your little corner of the world.' : 'Give an idea ten minutes. See where it takes you.'}</p></div><div class="stage-status"><span class="live-dot"></span>${session.paused ? 'SESSION PAUSED' : practice ? 'WARM-UP IN PROGRESS' : celebration ? 'A ROUND OF APPLAUSE' : phase === 'ended' ? 'TALK COMPLETE' : 'THE ROOM IS LISTENING'}${!practice && !celebration ? `<span class="stage-clock" data-time>${timeLabel(session.elapsed)}</span>` : ''}</div></section><div class="stage-bottom">${qrBlock()}<div class="stage-footnote">FROM THE COMMUNITY.<br>FOR THE COMMUNITY.<span>VISUAL DEMO · SIMULATED CROWD</span></div></div></main>`;
}

function results(): { keep: number; wrap: number; total: number } {
  const voting = session.elapsed >= 300 && session.mode === 'talk';
  const wrap = voting ? Math.round(400 * session.crowdWrap / 100) + Number(session.opinion === 'wrap') : 0;
  const keep = voting ? 400 - Math.round(400 * session.crowdWrap / 100) + Number(session.opinion === 'keep') : 0;
  return { keep, wrap, total: keep + wrap };
}

function resultBars(): string {
  const count = results();
  return `<div class="results-summary"><span>Sample responses</span><strong>${count.total}<span> / 500 simulated</span></strong></div><div class="result-row"><div><span>Keep going</span><strong>${count.total ? Math.round(count.keep / count.total * 100) : 0}% <small>${count.keep}</small></strong></div><div class="result-track"><div style="width:${count.total ? count.keep / count.total * 100 : 0}%"></div></div></div><div class="result-row wrap-result"><div><span>Time to wrap up</span><strong>${count.total ? Math.round(count.wrap / count.total * 100) : 0}% <small>${count.wrap}</small></strong></div><div class="result-track"><div style="width:${count.total ? count.wrap / count.total * 100 : 0}%"></div></div></div>`;
}

function admin(): string {
  const phase = phaseOf(session);
  const practice = phase === 'practice';
  const canApplaud = (phase === 'eligible' || phase === 'ended') && !session.paused;
  return `${header()}<main class="admin-main"><div class="admin-heading"><div><p class="eyebrow">BACKSTAGE <span class="slash">/</span> CO-CHAIRS ONLY</p><h1>A feel for the room.</h1><p>The audience has a voice. You have the final cue.</p></div><div class="preview-links"><a class="button secondary" href="/" target="_blank" rel="noopener">Audience view ${icon('external')}</a><a class="button secondary" href="/stage" target="_blank" rel="noopener">Stage view ${icon('external')}</a></div></div>
    <div class="admin-notice">${icon('lock')}<p><strong>Co-chair interface preview.</strong> This local demo has no authentication. In the live app, this page and its results require co-chair access.</p></div>
    <div class="admin-grid"><section class="control-panel"><div class="section-heading"><span class="eyebrow">ON THE CLOCK</span><span class="status-pill">${session.paused ? 'Paused' : practice ? 'Practice' : phase === 'ended' ? 'Complete' : phase === 'applause' ? 'Applause' : 'Sample talk 01'}</span></div><h2>${practice ? 'Let the room warm up.' : 'The best things are built together.'}</h2><p class="muted">${practice ? 'Give everyone a moment to find their cursor.' : 'Sample speaker · community talk · ten minutes'}</p><div class="host-timer"><strong data-time>${timeLabel(session.elapsed)}</strong><span>/ 10:00</span></div>${progress()}<div class="timer-milestones"><span>00:00<br>Listen</span><span>05:00<br>Ballot opens</span><span>08:00<br>Cue available</span><span>10:00<br>Complete</span></div><div class="host-actions">${practice ? `<button class="button primary" data-action="start">Start sample talk ${icon('play')}</button>` : `<button class="button secondary" data-action="pause" ${['applause', 'ended'].includes(phase) ? 'disabled' : ''}>${session.paused ? 'Resume session' : 'Pause session'}${icon(session.paused ? 'play' : 'pause')}</button>`}<button class="button secondary" data-action="reset">Reset demo</button></div></section>
    <section class="results-panel"><div class="section-heading"><span class="eyebrow">THE AUDIENCE SAYS</span><span class="private-label">${icon('lock')} PRIVATE</span></div><h2>A signal, not a verdict.</h2><p class="muted">The audience and stage screens never show these totals.</p><div id="result-bars">${resultBars()}</div><div class="host-cue"><button class="button primary full" data-action="applause" ${canApplaud ? '' : 'disabled'}>${phase === 'applause' ? 'Applause is on the stage' : 'Cue a round of applause'}${icon('spark')}</button><p>${phase === 'applause' ? 'The ballot is closed. The stage is celebrating.' : canApplaud ? 'You decide when to land the talk. Votes do not trigger this.' : session.paused ? 'Resume the session before sending a cue.' : 'Available from 08:00. Always triggered by a co-chair.'}</p></div></section></div>
    <section class="demo-controls"><div><p class="eyebrow">FOR THIS WALKTHROUGH</p><h2>Skip ahead. See what happens.</h2><p>These controls change the simulation in this browser.</p></div><div class="demo-buttons"><button class="button secondary" data-jump="0">00:00 · Listen</button><button class="button secondary" data-jump="300">05:00 · Vote</button><button class="button secondary" data-jump="480">08:00 · Wrap up</button><button class="button secondary" data-jump="600">10:00 · Finish</button></div><label class="crowd-control" for="crowd-wrap"><span>Simulated “wrap up” feedback <strong id="crowd-value">${session.crowdWrap}%</strong></span><input id="crowd-wrap" type="range" min="0" max="100" value="${session.crowdWrap}" aria-describedby="crowd-help"/><small id="crowd-help">Illustrative responses, not connected people.</small></label></section>
    <section class="share-panel"><div><p class="eyebrow">TRY IT ON A PHONE</p><h2>One link. A little shared curiosity.</h2><p>Use this computer’s LAN address on the same Wi-Fi, or the URL of a hosted demo. Devices run independent simulations.</p></div><form id="share-form"><label for="share-url">Participant demo URL</label><div class="share-input"><input id="share-url" name="url" type="url" required value="${escape(joinUrl)}" placeholder="http://192.168.1.10:5173/"/><button class="button secondary" type="submit">Update QR ${icon('arrow')}</button></div><p id="share-message" aria-live="polite">The stage QR uses this address in this browser.</p></form></section>
    ${demoBanner()}</main>${footer()}`;
}

function announce(message: string): void {
  const live = document.querySelector('#announcements');
  if (live) live.textContent = message;
}

function persist(): void {
  try { localStorage.setItem(storageKey, JSON.stringify(session)); }
  catch { storageAvailable = false; }
}

function apply(action: Action): void {
  const before = session;
  session = transition(session, action);
  if (before === session) return;
  persist();
  if (action.type === 'tick' && phaseOf(before) === phaseOf(session)) updateClock();
  else if (action.type === 'crowd') updateResults();
  else render();
  if (action.type === 'vote') announce('Your choice is saved in this demo. You can change it while the ballot is open.');
  if (action.type === 'join') announce('You joined the circle. You are ready for the first talk.');
  lastTick = performance.now();
}

function updateClock(): void {
  document.querySelectorAll('[data-time]').forEach(element => { element.textContent = timeLabel(session.elapsed); });
  document.querySelectorAll<HTMLElement>('[data-progress]').forEach(element => { element.style.width = `${session.elapsed / 6}%`; });
}

function updateResults(): void {
  const bars = document.querySelector('#result-bars');
  if (bars) bars.innerHTML = resultBars();
  const value = document.querySelector('#crowd-value');
  if (value) value.textContent = `${session.crowdWrap}%`;
}

function loadJoinUrl(): void {
  try {
    const stored = localStorage.getItem('communi-con:join-url');
    if (stored) {
      const url = new URL(stored);
      if (['http:', 'https:'].includes(url.protocol)) joinUrl = new URL('/', url).href;
    }
  } catch { joinUrl = new URL('/', location.href).href; }
}

function render(): void {
  const focused = document.activeElement instanceof HTMLElement ? document.activeElement.dataset.focus || document.activeElement.id : '';
  disposeCrowd();
  root.innerHTML = `${role === 'admin' ? admin() : role === 'stage' ? stage() : audience()}<div id="announcements" class="sr-only" aria-live="polite" aria-atomic="true"></div>${storageAvailable ? '' : '<div class="storage-notice">Browser storage is unavailable. This demo will not sync across tabs or save on refresh.</div>'}`;
  const canvas = document.querySelector<HTMLCanvasElement>('#crowd');
  if (canvas) disposeCrowd = mountCrowd(canvas, () => session, role === 'audience' && phaseOf(session) === 'practice' ? () => apply({ type: 'join' }) : undefined);
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
      if (session.mode === 'practice') apply({ type: 'start' });
      apply({ type: 'seek', seconds: Number(button.dataset.jump) });
    });
  });
  document.querySelector<HTMLInputElement>('#crowd-wrap')?.addEventListener('input', event => apply({ type: 'crowd', wrap: Number((event.target as HTMLInputElement).value) }));
  document.querySelector('#share-form')?.addEventListener('submit', event => {
    event.preventDefault();
    const input = document.querySelector<HTMLInputElement>('#share-url')!;
    const message = document.querySelector('#share-message')!;
    try {
      const url = new URL(input.value);
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Invalid URL');
      joinUrl = new URL('/', url).href;
      localStorage.setItem('communi-con:join-url', joinUrl);
      input.value = joinUrl;
      message.textContent = 'Stage QR updated in this browser. Check that the address opens on your phone.';
    } catch { message.textContent = 'Enter an http:// or https:// address without a username or password.'; }
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

window.addEventListener('storage', event => {
  if (event.key === storageKey || event.key === null) {
    const previous = session;
    session = load();
    if (phaseOf(previous) !== phaseOf(session) || previous.paused !== session.paused || previous.opinion !== session.opinion || previous.joined !== session.joined) render();
    else { updateClock(); updateResults(); }
  }
  if (event.key === 'communi-con:join-url') { loadJoinUrl(); if (role === 'stage') render(); }
});

if (role === 'admin') {
  if (navigator.locks) {
    void navigator.locks.request('communi-con:demo-clock', async () => {
      timerOwner = true;
      lastTick = performance.now();
      await new Promise<void>(() => {});
    });
  } else timerOwner = true;
  setInterval(() => {
    const now = performance.now();
    const seconds = Math.floor((now - lastTick) / 1000);
    if (timerOwner && seconds > 0) {
      apply({ type: 'tick', seconds });
      lastTick = now;
    }
  }, 250);
}

document.body.dataset.role = role;
loadJoinUrl();
render();
