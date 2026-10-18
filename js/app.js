import { Board } from './board.js';
import {
  createGame, applyAction, reinforcementBreakdown, territoriesOf, armiesOf, findSets, setValue,
  nextTradeValue, mustTrade, reachable, canReach, PLAYER_COLORS, PLAYER_COLOR_NAMES, DEFAULT_OPTIONS,
} from './engine.js';
import { aiAction } from './ai.js';
import { TERR, ADJ, CONTINENTS } from './map.js';
import { Room, parseCode, netAvailable } from './net.js';

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const LS = {
  get(k, d = null) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage full or disabled */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* ignore */ } },
};
const randomId = () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36)).replace(/-/g, '');
const clientId = LS.get('risk.cid') || (() => { const id = randomId(); LS.set('risk.cid', id); return id; })();
const GRACE_MS = 30000; // disconnected online player is taken over by the computer after this
const SYM = { infantry: '♟', cavalry: '♞', artillery: '✸', wild: '★' };
const PHASE_NAME = { setup: 'Initial placement', reinforce: 'Reinforce', tradeAfterKill: 'Trade cards', attack: 'Attack', occupy: 'Occupy', fortify: 'Fortify', gameover: 'Game over' };

const OPTION_DEFS = [
  { key: 'setup', label: 'Initial armies', choices: [['manual', 'Place manually'], ['auto', 'Random']] },
  { key: 'cards', label: 'Card sets', choices: [['escalating', 'Escalating'], ['fixed', 'Fixed 4/6/8/10']] },
  { key: 'fortify', label: 'Fortify', choices: [['connected', 'Connected path'], ['adjacent', 'Adjacent only']] },
];

const app = {
  mode: null,          // 'local' | 'host' | 'client'
  state: null,
  room: null,
  lobby: null,
  ui: { sel: null, to: null, amt: 1, dice: 3, move: null, key: '', picked: new Set() },
  pending: false,
  lastBattleId: null,
  aiTimer: null,
  disc: {},            // clientId -> disconnect time
  board: null,
};

const myName = () => ($('#nameInput').value.trim() || 'Player').slice(0, 16);
const speed = () => Number(LS.get('risk.speed', 650));

function show(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.toggle('active', s.id === id));
  if (id === 'menu') refreshMenu();
}

let toastTimer;
function toast(msg, ms = 2000) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), ms);
}

// ---------------------------------------------------------------- menu
function refreshMenu() {
  $('#btnResume').hidden = !LS.get('risk.local');
  const h = LS.get('risk.host');
  $('#btnHostResume').hidden = !(h && h.state && h.state.phase !== 'gameover');
  if (h) $('#btnHostResume').textContent = `Resume hosted game ${h.code}`;
  const j = LS.get('risk.lastJoin');
  $('#btnRejoin').hidden = !j;
  if (j) $('#btnRejoin').textContent = `Rejoin online game ${j}`;
}

function initMenu() {
  const ni = $('#nameInput');
  ni.value = LS.get('risk.name', '');
  ni.addEventListener('input', () => LS.set('risk.name', ni.value.trim()));
  $('#btnSolo').onclick = () => openLocalSetup();
  $('#btnResume').onclick = () => {
    app.mode = 'local';
    app.state = LS.get('risk.local');
    enterGame();
  };
  $('#btnHost').onclick = () => hostGame(null);
  $('#btnHostResume').onclick = () => hostGame(LS.get('risk.host'));
  $('#btnJoin').onclick = () => openJoin('');
  $('#btnRejoin').onclick = () => joinGame(LS.get('risk.lastJoin'));
  $('#btnRules').onclick = () => $('#rulesDlg').showModal();
  document.querySelectorAll('[data-back]').forEach(b => (b.onclick = () => show('menu')));
  document.querySelectorAll('dialog [data-close]').forEach(b => (b.onclick = () => b.closest('dialog').close()));
  const sp = $('#speedSel');
  sp.value = String(speed());
  sp.onchange = () => LS.set('risk.speed', Number(sp.value));
  const join = new URLSearchParams(location.search).get('join');
  if (join) openJoin(join);
}

// ---------------------------------------------------------------- options UI
function renderOptions(container, opts, editable, onChange) {
  container.innerHTML = OPTION_DEFS.map(d => `
    <label class="field">${d.label}
      <select data-opt="${d.key}" ${editable ? '' : 'disabled'}>
        ${d.choices.map(([v, l]) => `<option value="${v}" ${opts[d.key] === v ? 'selected' : ''}>${l}</option>`).join('')}
      </select>
    </label>`).join('');
  container.querySelectorAll('select').forEach(s => (s.onchange = () => { opts[s.dataset.opt] = s.value; onChange && onChange(); }));
}

// ---------------------------------------------------------------- local setup
let localSeats, localOpts;
function openLocalSetup() {
  localSeats = LS.get('risk.localSeats') || [{ type: 'human' }, { type: 'ai' }, { type: 'ai' }];
  localSeats[0] = { type: 'human', name: myName() };
  localOpts = { ...DEFAULT_OPTIONS, ...LS.get('risk.localOpts', {}) };
  renderLocalSeats();
  renderOptions($('#localOptions'), localOpts, true);
  show('setup');
}

function renderLocalSeats() {
  const box = $('#localSeats');
  box.innerHTML = localSeats.map((s, i) => `
    <div class="seat">
      <span class="swatch" style="background:${PLAYER_COLORS[i]}"></span>
      ${s.type === 'human'
    ? `<input data-name="${i}" value="${esc(s.name || (i ? `Player ${i + 1}` : myName()))}" maxlength="16" aria-label="Name">`
    : `<span class="who">Computer ${PLAYER_COLOR_NAMES[i]}</span>`}
      ${i === 0 ? '<span class="muted">You</span>' : `
        <select data-type="${i}" aria-label="Player type">
          <option value="ai" ${s.type === 'ai' ? 'selected' : ''}>Computer</option>
          <option value="human" ${s.type === 'human' ? 'selected' : ''}>Human (same device)</option>
        </select>`}
      ${localSeats.length > 2 && i > 0 ? `<button class="x" data-rm="${i}" aria-label="Remove">×</button>` : ''}
    </div>`).join('');
  box.querySelectorAll('[data-name]').forEach(inp => (inp.oninput = () => (localSeats[inp.dataset.name].name = inp.value)));
  box.querySelectorAll('[data-type]').forEach(sel => (sel.onchange = () => { localSeats[sel.dataset.type].type = sel.value; renderLocalSeats(); }));
  box.querySelectorAll('[data-rm]').forEach(b => (b.onclick = () => { localSeats.splice(Number(b.dataset.rm), 1); renderLocalSeats(); }));
  $('#addSeat').hidden = localSeats.length >= 4;
}

function initLocalSetup() {
  $('#addSeat').onclick = () => { if (localSeats.length < 4) { localSeats.push({ type: 'ai' }); renderLocalSeats(); } };
  $('#startLocal').onclick = () => {
    LS.set('risk.localSeats', localSeats);
    LS.set('risk.localOpts', localOpts);
    const players = localSeats.map((s, i) => ({
      name: s.type === 'ai' ? `Computer ${PLAYER_COLOR_NAMES[i]}` : (s.name || '').trim().slice(0, 16) || `Player ${i + 1}`,
      type: s.type,
    }));
    app.mode = 'local';
    app.state = createGame(players, localOpts);
    persist();
    enterGame();
  };
}

// ---------------------------------------------------------------- online: host
function setLobbyStatus(t) { $('#lobbyStatus').textContent = t; }

async function hostGame(saved) {
  leaveOnline();
  show('lobby');
  $('#lobbyTitle').textContent = 'Host online game';
  $('#joinForm').hidden = true;
  $('#lobbyBody').hidden = true;
  if (!netAvailable()) return setLobbyStatus('Online play unavailable: the network library did not load. Check your connection and reload.');
  setLobbyStatus('Connecting to relay server…');
  let room;
  try {
    room = await Room.host(clientId, saved ? { code: saved.code, broker: saved.broker } : null, r => {
      r.on('to-host', onHostMsg);
      r.on('presence', onPresence);
      r.onStatus = setNetStatus;
    });
  } catch (e) {
    return setLobbyStatus('Could not reach a relay server. Try again later.');
  }
  app.mode = 'host';
  app.room = room;
  app.disc = {};
  if (saved) {
    app.lobby = saved.lobby;
    app.state = saved.state;
    app.lobby.seats.forEach(s => { if (s.type === 'host') { s.clientId = clientId; s.name = myName(); } });
    if (app.state) app.state.players.forEach(p => {
      if (p.type === 'remote') { p.connected = false; app.disc[p.clientId] = Date.now(); }
    });
  } else {
    app.lobby = {
      seats: [{ type: 'host', name: myName(), clientId }, { type: 'open' }, { type: 'ai' }, { type: 'closed' }],
      options: { ...DEFAULT_OPTIONS, ...LS.get('risk.localOpts', {}) },
      started: false,
    };
    app.state = null;
  }
  room.onAnnounce = () => { publishLobby(); if (app.state) publishState(); };
  publishLobby();
  setLobbyStatus('');
  if (app.state && app.lobby.started) {
    publishState();
    enterGame();
  } else renderLobby();
  persist();
}

function publishLobby() { app.room && app.room.publish('lobby', app.lobby, true); }
function publishState() {
  if (!app.room || !app.state) return;
  const v = { ...app.state, deck: app.state.deck.length, rng: 0 };
  app.room.publish('state', v, true);
}
function notify(cid, error) { app.room && app.room.publish('notice', { to: cid, error }); }

function onHostMsg(msg) {
  const cid = msg.clientId;
  if (!cid || cid === clientId) return;
  const name = String(msg.name || 'Player').trim().slice(0, 16) || 'Player';
  if (msg.kind === 'join') {
    if (!app.lobby.started) {
      let seat = app.lobby.seats.find(x => x.clientId === cid);
      if (!seat) {
        seat = app.lobby.seats.find(x => x.type === 'open');
        if (seat) Object.assign(seat, { type: 'remote', clientId: cid });
      }
      if (seat) { seat.name = name; seat.online = true; }
      publishLobby();
      renderLobby();
    } else if (app.state) {
      const p = app.state.players.find(x => x.clientId === cid);
      if (p) { p.connected = true; delete app.disc[cid]; render(); }
      publishLobby();
      publishState();
      scheduleAI();
    }
    persist();
  } else if (msg.kind === 'leave') {
    markOffline(cid, true);
  } else if (msg.kind === 'action') {
    const s = app.state;
    if (!s) return;
    const idx = s.players.findIndex(x => x.clientId === cid);
    if (idx < 0 || idx !== s.current) return notify(cid, 'Not your turn');
    const r = applyAction(s, idx, msg.action || {});
    if (!r.ok) { notify(cid, r.error); publishState(); return; }
    changed();
  }
}

function onPresence(msg) {
  if (!msg.clientId || msg.clientId === clientId) return;
  if (msg.online === false) markOffline(msg.clientId, false);
}

function markOffline(cid, left) {
  if (!app.lobby.started) {
    const seat = app.lobby.seats.find(x => x.clientId === cid);
    if (!seat) return;
    if (left) Object.assign(seat, { type: 'open', clientId: null, name: null });
    else seat.online = false;
    publishLobby();
    renderLobby();
    return;
  }
  const p = app.state && app.state.players.find(x => x.clientId === cid);
  if (!p || !p.connected) return;
  p.connected = false;
  app.disc[cid] = Date.now();
  publishState();
  render();
  scheduleAI();
}

function renderLobby() {
  const l = app.lobby;
  const host = app.mode === 'host';
  $('#joinForm').hidden = true;
  $('#lobbyBody').hidden = false;
  $('#roomCode').textContent = app.room.code;
  const box = $('#lobbySeats');
  box.innerHTML = l.seats.map((s, i) => {
    let who;
    if (s.type === 'host') who = `${esc(s.name)} <span class="muted">(host)</span>`;
    else if (s.type === 'remote') who = `${esc(s.name)}${s.clientId === clientId ? ' <span class="muted">(you)</span>' : ''}${s.online === false ? ' <span class="muted">offline</span>' : ''}`;
    else if (s.type === 'ai') who = `Computer ${PLAYER_COLOR_NAMES[i]}`;
    else if (s.type === 'open') who = '<span class="muted">Waiting for player…</span>';
    else who = '<span class="muted">Closed</span>';
    const ctl = host && s.type !== 'host'
      ? (s.type === 'remote'
        ? `<button class="x" data-kick="${i}" aria-label="Remove player">×</button>`
        : `<select data-seat="${i}" aria-label="Seat type">
            <option value="open" ${s.type === 'open' ? 'selected' : ''}>Open</option>
            <option value="ai" ${s.type === 'ai' ? 'selected' : ''}>Computer</option>
            <option value="closed" ${s.type === 'closed' ? 'selected' : ''}>Closed</option>
          </select>`)
      : '';
    return `<div class="seat"><span class="swatch" style="background:${PLAYER_COLORS[i]};${s.type === 'closed' || s.type === 'open' ? 'opacity:.35' : ''}"></span><span class="who">${who}</span>${ctl}</div>`;
  }).join('');
  box.querySelectorAll('[data-seat]').forEach(sel => (sel.onchange = () => {
    Object.assign(l.seats[sel.dataset.seat], { type: sel.value, clientId: null, name: null });
    publishLobby(); renderLobby(); persist();
  }));
  box.querySelectorAll('[data-kick]').forEach(b => (b.onclick = () => {
    const seat = l.seats[b.dataset.kick];
    notify(seat.clientId, 'Removed by host');
    Object.assign(seat, { type: 'open', clientId: null, name: null });
    publishLobby(); renderLobby(); persist();
  }));
  renderOptions($('#lobbyOptions'), l.options, host, () => { publishLobby(); persist(); });
  const filled = l.seats.filter(s => ['host', 'remote', 'ai'].includes(s.type)).length;
  $('#startOnline').hidden = !host;
  $('#startOnline').disabled = filled < 2;
  if (host) {
    $('#lobbyNote').textContent = filled < 2 ? 'Need at least 2 players (add a computer or wait for someone to join).' : 'Open seats nobody joined are left out when the game starts.';
  } else {
    const mine = l.seats.some(s => s.clientId === clientId);
    $('#lobbyNote').textContent = mine ? 'Waiting for the host to start…' : 'Room is full.';
  }
}

function initLobby() {
  $('#startOnline').onclick = () => {
    const l = app.lobby;
    const players = [];
    l.seats.forEach((s, i) => {
      if (s.type === 'host') players.push({ name: s.name, type: 'human', clientId: s.clientId });
      else if (s.type === 'remote') players.push({ name: s.name, type: 'remote', clientId: s.clientId });
      else if (s.type === 'ai') players.push({ name: `Computer ${PLAYER_COLOR_NAMES[i]}`, type: 'ai' });
    });
    if (players.length < 2) return;
    app.state = createGame(players, l.options);
    l.started = true;
    publishLobby();
    changed();
    enterGame();
  };
  $('#btnLeaveLobby').onclick = () => { leaveOnline(true); show('menu'); };
  $('#btnShare').onclick = async () => {
    const url = location.origin + location.pathname + '?join=' + app.room.code;
    if (navigator.share) {
      try { await navigator.share({ title: 'Join my Risk game', text: `Room code ${app.room.code}`, url }); return; } catch { /* cancelled */ }
    }
    try { await navigator.clipboard.writeText(url); setLobbyStatus('Link copied: ' + url); } catch { setLobbyStatus(url); }
  };
  $('#joinName').oninput = () => { $('#nameInput').value = $('#joinName').value; LS.set('risk.name', $('#joinName').value.trim()); };
  $('#btnDoJoin').onclick = () => joinGame($('#codeInput').value);
  $('#codeInput').addEventListener('keydown', e => { if (e.key === 'Enter') joinGame($('#codeInput').value); });
}

// ---------------------------------------------------------------- online: client
function openJoin(code) {
  leaveOnline();
  show('lobby');
  $('#lobbyTitle').textContent = 'Join online game';
  $('#joinForm').hidden = false;
  $('#lobbyBody').hidden = true;
  $('#codeInput').value = code || '';
  $('#joinName').value = $('#nameInput').value;
  setLobbyStatus('');
  if (!code) $('#codeInput').focus();
}

async function joinGame(code) {
  const p = parseCode(code);
  if (!p) { openJoin(code); return setLobbyStatus('Room codes are 4 letters plus a digit, e.g. KQ7X1.'); }
  if (!netAvailable()) return setLobbyStatus('Online play unavailable: the network library did not load.');
  leaveOnline();
  show('lobby');
  $('#lobbyTitle').textContent = 'Online game';
  $('#joinForm').hidden = true;
  setLobbyStatus('Connecting…');
  app.mode = 'client';
  app.state = null;
  app.lobby = null;
  try {
    app.room = await Room.join(p.code, clientId, r => {
      r.on('lobby', onLobby);
      r.on('state', onState);
      r.on('host', m => { $('#banner').hidden = m.online !== false; $('#banner').textContent = 'Host disconnected — waiting for the host to return…'; });
      r.on('notice', m => { if (m.to === clientId) { app.pending = false; toast(m.error); renderPanel(); if (m.error === 'Removed by host') { leaveOnline(); show('menu'); } } });
      r.onStatus = setNetStatus;
      r.onAnnounce = () => r.send({ kind: 'join', name: myName() });
    });
  } catch {
    app.mode = null;
    openJoin(p.code);
    return setLobbyStatus('Could not connect to the relay server.');
  }
  LS.set('risk.lastJoin', p.code);
  setLobbyStatus('Waiting for host… (if nothing appears, check the code)');
}

function onLobby(l) {
  app.lobby = l;
  if (!l.started) {
    if (app.state) { app.state = null; }
    show('lobby');
    setLobbyStatus('');
    renderLobby();
    if (!l.seats.some(s => s.clientId === clientId)) app.room.send({ kind: 'join', name: myName() });
  }
}

function onState(st) {
  if (!app.lobby || !app.lobby.started) app.lobby = { ...(app.lobby || {}), started: true, seats: app.lobby?.seats || [] };
  const cur = app.state;
  if (!cur || st.id !== cur.id || st.version >= cur.version) {
    app.state = st;
    app.pending = false;
    if (!$('#game').classList.contains('active')) enterGame();
    else render();
  }
}

function leaveOnline(explicit = false) {
  clearTimeout(app.aiTimer);
  if (app.room) {
    if (app.mode === 'client' && explicit) { app.room.send({ kind: 'leave' }); }
    const r = app.room;
    setTimeout(() => r.close(), 150);
  }
  if (app.mode === 'client' && explicit) LS.del('risk.lastJoin');
  app.room = null;
  if (app.mode !== 'local') { app.mode = null; app.state = null; }
  $('#banner').hidden = true;
}

function setNetStatus(st) {
  const n = $('#netStatus');
  n.textContent = st === 'online' ? '● online' : st === 'reconnecting' ? '● reconnecting…' : '● offline';
  n.classList.toggle('bad', st !== 'online');
}

// ---------------------------------------------------------------- game core
function persist() {
  if (app.mode === 'local' && app.state) {
    if (app.state.phase === 'gameover') LS.del('risk.local');
    else LS.set('risk.local', app.state);
  } else if (app.mode === 'host' && app.room) {
    LS.set('risk.host', { code: app.room.code, broker: app.room.broker, lobby: app.lobby, state: app.state });
  }
}

function changed() {
  persist();
  if (app.mode === 'host') publishState();
  render();
  scheduleAI();
}

function isMyTurn() {
  const s = app.state;
  if (!s || s.phase === 'gameover') return false;
  const p = s.players[s.current];
  if (app.mode === 'local') return p.type === 'human';
  return p.clientId === clientId;
}

// seat whose cards / perspective the UI shows
function viewerSeat() {
  const s = app.state;
  if (!s) return -1;
  if (app.mode === 'local') {
    if (s.players[s.current].type === 'human') return s.current;
    return s.players.findIndex(p => p.type === 'human');
  }
  return s.players.findIndex(p => p.clientId === clientId);
}

function act(a) {
  if (!isMyTurn() || app.pending) return;
  if (app.mode === 'client') {
    app.pending = true;
    app.room.send({ kind: 'action', action: a });
    setTimeout(() => { if (app.pending) { app.pending = false; renderPanel(); } }, 8000);
    renderPanel();
    return;
  }
  const r = applyAction(app.state, app.state.current, a);
  if (!r.ok) return toast(r.error);
  changed();
}

function scheduleAI() {
  clearTimeout(app.aiTimer);
  if (app.mode === 'client') return;
  const s = app.state;
  if (!s || s.phase === 'gameover') return;
  const p = s.players[s.current];
  if (p.type === 'remote') {
    if (p.connected) return;
    const wait = (app.disc[p.clientId] || Date.now()) + GRACE_MS - Date.now();
    if (wait > 0) { app.aiTimer = setTimeout(scheduleAI, wait + 50); return; }
  } else if (p.type !== 'ai') return;
  let delay = speed();
  if (s.phase === 'setup' || s.phase === 'reinforce') delay *= 0.5;
  if (s.phase === 'attack' && s.lastBattle) delay *= 1.4;
  app.aiTimer = setTimeout(() => {
    if (app.state !== s) return;
    const a = aiAction(s, s.current);
    let r = a ? applyAction(s, s.current, a) : { ok: false };
    if (!r.ok) {
      console.warn('AI action rejected', a, r.error);
      r = applyAction(s, s.current, { type: s.phase === 'attack' ? 'endAttack' : 'endTurn' });
      if (!r.ok) return;
    }
    changed();
  }, delay);
}

function enterGame() {
  show('game');
  if (!app.board) {
    app.board = new Board($('#mapWrap'), onTap);
  }
  app.lastBattleId = app.state.lastBattle ? app.state.lastBattle.id : null;
  app.ui = { sel: null, to: null, amt: 1, dice: 3, move: null, key: '', picked: new Set() };
  $('#netStatus').hidden = app.mode === 'local';
  render();
  requestAnimationFrame(() => app.board.fit());
  scheduleAI();
}

// ---------------------------------------------------------------- input
function onTap(id) {
  const s = app.state;
  if (!s) return;
  const t = s.territories[id];
  const owner = s.players[t.owner];
  if (!isMyTurn() || app.pending) {
    toast(`${TERR[id].name}: ${t.armies} (${owner.name})`);
    return;
  }
  const me = s.current, u = app.ui;
  switch (s.phase) {
    case 'setup':
    case 'reinforce': {
      if (mustTrade(s)) return openCards();
      if (t.owner !== me) return toast(`${TERR[id].name} belongs to ${owner.name}`);
      const n = u.amt === 'all' ? s.reinforcements : Math.min(u.amt, s.reinforcements);
      app.board.flash(id);
      act({ type: 'place', territory: id, count: n });
      return;
    }
    case 'tradeAfterKill':
      return openCards();
    case 'attack':
      if (t.owner === me) {
        if (u.sel === id) { u.sel = u.to = null; }
        else if (t.armies < 2) toast(`${TERR[id].name} needs 2+ armies to attack`);
        else if (!ADJ[id].some(n => s.territories[n].owner !== me)) toast(`${TERR[id].name} has no enemy neighbors`);
        else { u.sel = id; u.to = null; }
      } else if (u.sel && ADJ[u.sel].includes(id)) {
        u.to = id;
      } else {
        const c = ADJ[id].filter(n => s.territories[n].owner === me && s.territories[n].armies >= 2)
          .sort((a, b) => s.territories[b].armies - s.territories[a].armies);
        if (c.length) { u.sel = c[0]; u.to = id; } else toast(`None of your territories can attack ${TERR[id].name}`);
      }
      return render();
    case 'fortify':
      if (t.owner !== me) return toast('Pick one of your territories');
      if (u.sel === id) { u.sel = u.to = null; }
      else if (u.sel && canReach(s, u.sel, id)) { u.to = id; u.move = s.territories[u.sel].armies - 1; }
      else if (t.armies >= 2) { u.sel = id; u.to = null; }
      else toast(u.sel ? 'Not connected through your territories' : `${TERR[id].name} has no armies to spare`);
      return render();
    default:
  }
}

function onPanelClick(e) {
  const b = e.target.closest('[data-a]');
  if (!b || b.disabled) return;
  const s = app.state, u = app.ui;
  const a = b.dataset.a;
  switch (a) {
    case 'amt': u.amt = b.dataset.v === 'all' ? 'all' : Number(b.dataset.v); return renderPanel();
    case 'dice': u.dice = Number(b.dataset.v); return renderPanel();
    case 'cards': return openCards();
    case 'attack': return act({ type: 'attack', from: u.sel, to: u.to, dice: u.dice });
    case 'blitz': return act({ type: 'attack', from: u.sel, to: u.to, blitz: true });
    case 'endAttack': u.sel = u.to = null; return act({ type: 'endAttack' });
    case 'occupy': {
      const n = Number($('#moveRange').value);
      u.afterOccupy = s.occupy.to;
      return act({ type: 'occupy', count: n });
    }
    case 'fortify': return act({ type: 'fortify', from: u.sel, to: u.to, count: Number($('#moveRange').value) });
    case 'endTurn': return act({ type: 'endTurn' });
    case 'min': case 'max': {
      const r = $('#moveRange');
      r.value = a === 'min' ? r.min : r.max;
      r.dispatchEvent(new Event('input'));
      return;
    }
    case 'clear': u.sel = u.to = null; return render();
    case 'again': return playAgain();
    case 'menu': return quitToMenu();
    case 'log': return openLog();
    default:
  }
}

function playAgain() {
  if (app.mode === 'local') return openLocalSetup();
  if (app.mode === 'host') {
    app.lobby.started = false;
    app.state = null;
    app.room.publish('state', '', true);
    publishLobby();
    persist();
    show('lobby');
    renderLobby();
  }
}

function quitToMenu() {
  $('#menuDlg').close();
  clearTimeout(app.aiTimer);
  if (app.mode === 'local') { persist(); app.mode = null; app.state = null; }
  else leaveOnline(app.state && app.state.phase === 'gameover');
  show('menu');
}

// ---------------------------------------------------------------- rendering
function render() {
  const s = app.state;
  if (!s) return;
  const u = app.ui;
  const key = `${s.id}|${s.current}|${s.phase}|${s.turn}`;
  if (key !== u.key) {
    const prev = u.key.split('|')[2];
    const keep = s.phase === 'attack' && prev === 'occupy';
    const turnStarted = u.key && u.key.split('|')[1] !== String(s.current);
    u.key = key;
    if (keep && u.afterOccupy) {
      const to = u.afterOccupy;
      const ok = id => s.territories[id].owner === s.current && s.territories[id].armies >= 2 && ADJ[id].some(n => s.territories[n].owner !== s.current);
      u.sel = ok(to) ? to : (u.sel && ok(u.sel) ? u.sel : null);
      u.to = null;
    } else if (s.phase === 'occupy') {
      u.sel = s.occupy.from; u.to = s.occupy.to;
    } else { u.sel = u.to = null; }
    u.afterOccupy = null;
    u.move = null;
    if (turnStarted && isMyTurn() && s.phase !== 'gameover') {
      const humans = s.players.filter(p => p.type === 'human').length;
      toast(app.mode === 'local' && humans > 1 ? `${s.players[s.current].name}'s turn` : 'Your turn');
      if (navigator.vibrate && app.mode !== 'local') navigator.vibrate(80);
    }
  }
  if (s.phase === 'occupy' && s.occupy) { u.sel = s.occupy.from; u.to = s.occupy.to; }
  // drop stale selections
  if (u.sel && s.territories[u.sel].owner !== s.current) u.sel = u.to = null;
  if (u.to && s.phase === 'attack' && (s.territories[u.to].owner === s.current || !u.sel || s.territories[u.sel].armies < 2)) u.to = null;

  const hl = { sel: u.sel, to: u.to };
  if (isMyTurn()) {
    if (s.phase === 'attack' && u.sel && !u.to) hl.targets = new Set(ADJ[u.sel].filter(n => s.territories[n].owner !== s.current));
    if (s.phase === 'fortify' && u.sel && !u.to) hl.targets = new Set(reachable(s, u.sel));
    hl.dim = !!hl.targets;
  }
  app.board.render(s, hl);
  renderPlayers();
  renderPanel();
  renderLog();
  showBattle();
  if ($('#cardsDlg').open) renderCards();
}

function renderPlayers() {
  const s = app.state;
  $('#players').innerHTML = s.players.map((p, i) => {
    const t = territoriesOf(s, i).length;
    const a = armiesOf(s, i);
    const off = p.type === 'remote' && !p.connected ? '<span class="off" title="Disconnected">⚠</span>' : '';
    return `<div class="pchip ${i === s.current && s.phase !== 'gameover' ? 'cur' : ''} ${p.eliminated ? 'dead' : ''}" style="--c:${p.color}"
      title="${esc(p.name)}: ${t} territories, ${a} armies, ${p.cards.length} cards">
      <span class="sw"></span><span class="nm">${esc(p.name)}</span>
      <span class="st">${t}⬢ ${a}♟ ${p.cards.length}▭</span>${off}</div>`;
  }).join('');
}

function seg(action, values, current, labels = values, disabledFn = () => false) {
  return `<div class="seg">${values.map((v, i) => `<button data-a="${action}" data-v="${v}" class="${String(v) === String(current) ? 'on' : ''}" ${disabledFn(v) ? 'disabled' : ''}>${labels[i]}</button>`).join('')}</div>`;
}

function renderPanel() {
  const s = app.state;
  if (!s) return;
  const u = app.ui;
  const cp = s.players[s.current];
  const mine = isMyTurn();
  const vs = viewerSeat();
  const N = id => `<b>${esc(TERR[id].name)}</b>`;
  let hint = '', ctrls = '';
  const busy = app.pending ? 'disabled' : '';

  if (s.phase === 'gameover') {
    const w = s.players[s.winner];
    hint = `<b style="color:${w.color}">${esc(w.name)}</b> conquers the world in ${s.turn} rounds.`;
    ctrls = (app.mode !== 'client' ? '<button class="btn primary" data-a="again">New game</button>' : '') + '<button class="btn" data-a="menu">Main menu</button>';
  } else if (!mine) {
    if (cp.type === 'remote' && !cp.connected) {
      const left = Math.max(0, Math.ceil(((app.disc[cp.clientId] || Date.now()) + GRACE_MS - Date.now()) / 1000));
      hint = `${esc(cp.name)} is disconnected${app.mode === 'host' && left > 0 ? ` — computer takes over in ${left}s` : ' — computer is playing'}.`;
    } else if (cp.type === 'ai' || cp.type === 'remote' && !cp.connected) hint = `<span class="thinking">${esc(cp.name)} is playing</span>`;
    else hint = `<span class="thinking">Waiting for ${esc(cp.name)}</span>`;
    if (s.phase === 'setup') hint += ` <span class="muted">(initial placement)</span>`;
  } else {
    switch (s.phase) {
      case 'setup':
        hint = `Place <b>${s.reinforcements}</b> armies on your territories <span class="muted">(${s.setupLeft[s.current]} starting armies left)</span>`;
        ctrls = `<span class="muted">Per tap</span>${seg('amt', [1, 'all'], u.amt, ['1', 'All'])}`;
        break;
      case 'reinforce': {
        if (mustTrade(s)) {
          hint = 'You hold 5 or more cards: trade a set first.';
          ctrls = '<button class="btn danger" data-a="cards">Trade cards</button>';
          break;
        }
        const b = reinforcementBreakdown(s, s.current);
        const extra = s.afterTrade ? 'from your card trade' : `<span class="muted">(${b.base} for territories${b.conts.map(c => ` + ${CONTINENTS[c].bonus} ${CONTINENTS[c].name}`).join('')})</span>`;
        hint = `Tap your territories to place <b>${s.reinforcements}</b> armies ${extra}`;
        ctrls = `<span class="muted">Per tap</span>${seg('amt', [1, 3, 5, 'all'], u.amt, ['1', '3', '5', 'All'])}`;
        break;
      }
      case 'tradeAfterKill':
        hint = 'You took your opponent\'s cards: trade sets until you hold 4 or fewer.';
        ctrls = '<button class="btn danger" data-a="cards">Trade cards</button>';
        break;
      case 'attack': {
        if (u.sel && u.to) {
          const a = s.territories[u.sel].armies, d = s.territories[u.to].armies;
          const maxD = Math.min(3, a - 1);
          if (u.dice > maxD) u.dice = maxD;
          hint = `${N(u.sel)} (${a}) ⚔ ${N(u.to)} (${d})`;
          ctrls = `${seg('dice', [1, 2, 3], u.dice, ['1🎲', '2🎲', '3🎲'], v => v > maxD)}
            <button class="btn primary" data-a="attack" ${busy}>Roll</button>
            <button class="btn danger" data-a="blitz" ${busy}>Blitz</button>
            <span class="grow"></span><button class="btn ghost small" data-a="endAttack" ${busy}>End attack</button>`;
        } else {
          hint = u.sel ? `Attacking from ${N(u.sel)}: tap a highlighted enemy territory` : 'Tap one of your territories (2+ armies), then an adjacent enemy.';
          ctrls = `${u.sel ? '<button class="btn small ghost" data-a="clear">Cancel</button>' : ''}<span class="grow"></span><button class="btn" data-a="endAttack" ${busy}>End attack → Fortify</button>`;
        }
        break;
      }
      case 'occupy': {
        const { from, to, min } = s.occupy;
        const max = Math.max(min, s.territories[from].armies - 1);
        const v = u.move ?? max;
        hint = `Conquered ${N(to)}! Move armies in from ${N(from)}.`;
        ctrls = `<div class="slider-row"><button class="btn small" data-a="min">Min</button>
          <input type="range" id="moveRange" min="${min}" max="${max}" value="${v}" ${min === max ? 'disabled' : ''}>
          <span class="val" id="moveVal">${v}</span><button class="btn small" data-a="max">Max</button></div>
          <button class="btn primary" data-a="occupy" ${busy}>Move ${'<span id="moveVal2">' + v + '</span>'}</button>`;
        break;
      }
      case 'fortify': {
        if (u.sel && u.to) {
          const max = s.territories[u.sel].armies - 1;
          const v = Math.min(u.move ?? max, max);
          hint = `Move from ${N(u.sel)} to ${N(u.to)}`;
          ctrls = `<div class="slider-row"><button class="btn small" data-a="min">Min</button>
            <input type="range" id="moveRange" min="1" max="${max}" value="${v}" ${max === 1 ? 'disabled' : ''}>
            <span class="val" id="moveVal">${v}</span><button class="btn small" data-a="max">Max</button></div>
            <button class="btn primary" data-a="fortify" ${busy}>Move & end turn</button>
            <button class="btn ghost small" data-a="clear">Cancel</button>`;
        } else {
          hint = u.sel ? `Moving from ${N(u.sel)}: tap a highlighted territory` : `Optional: move armies once between ${s.options.fortify === 'adjacent' ? 'adjacent' : 'connected'} territories of yours.`;
          ctrls = `${u.sel ? '<button class="btn small ghost" data-a="clear">Cancel</button>' : ''}<span class="grow"></span><button class="btn primary" data-a="endTurn" ${busy}>End turn</button>`;
        }
        break;
      }
      default:
    }
  }

  const myCards = vs >= 0 ? s.players[vs].cards.length : 0;
  const must = mine && mustTrade(s);
  const cardsBtn = vs >= 0 && s.phase !== 'gameover'
    ? `<button class="btn small cards-btn ${must ? 'must' : ''}" data-a="cards">Cards ${myCards}</button>` : '';
  const last = s.log[s.log.length - 1];
  $('#panel').innerHTML = `
    <div class="ph-head"><span class="sw" style="--c:${cp.color}"></span><b>${esc(cp.name)}</b>
      <span class="phase">· ${PHASE_NAME[s.phase]}</span><span class="spacer"></span>${cardsBtn}</div>
    <div class="hint">${hint}</div>
    <div class="ctrls">${ctrls}</div>`;
  let ticker = $('#ticker');
  if (!ticker) {
    ticker = document.createElement('div');
    ticker.id = 'ticker';
    ticker.className = 'ticker';
    ticker.onclick = openLog;
    $('#side').appendChild(ticker);
  }
  ticker.textContent = last ? '▸ ' + last.text : '';
  const r = $('#moveRange');
  if (r) r.oninput = () => {
    u.move = Number(r.value);
    $('#moveVal').textContent = r.value;
    const v2 = $('#moveVal2');
    if (v2) v2.textContent = r.value;
  };
}

function renderLog() {
  const s = app.state;
  $('#log').innerHTML = s.log.slice().reverse().map(l => `<div class="log-line">${esc(l.text)}</div>`).join('');
}

function openLog() {
  $('#logFull').innerHTML = app.state.log.slice().reverse().map(l => `<div class="log-line">${esc(l.text)}</div>`).join('');
  $('#logDlg').showModal();
}

let diceTimer;
function showBattle() {
  const s = app.state, b = s.lastBattle;
  if (!b || b.id === app.lastBattleId) return;
  app.lastBattleId = b.id;
  const ac = s.players[b.attacker].color, dc = s.players[b.defender].color;
  const pairs = Math.min(b.ar.length, b.dr.length);
  const die = (v, i, cls, lost) => `<div class="die ${cls} ${i < pairs && lost ? 'lost' : ''}" style="background:${cls === 'a' ? ac : dc}">${v}</div>`;
  const aLost = b.ar.map((v, i) => i < pairs && v <= b.dr[i]);
  const dLost = b.dr.map((v, i) => i < pairs && b.ar[i] > v);
  const box = $('#dice');
  box.innerHTML = `<div class="dice-row"><div class="grp">${b.ar.map((v, i) => die(v, i, 'a', aLost[i])).join('')}</div>
    <span>vs</span><div class="grp">${b.dr.map((v, i) => die(v, i, 'd', dLost[i])).join('')}</div></div>
    <div>${esc(TERR[b.from].name)} → ${esc(TERR[b.to].name)}${b.rounds > 1 ? ` · ${b.rounds} rolls` : ''} · lost ${b.lostA} / ${b.lostD}${b.won ? ' · <b>conquered!</b>' : ''}</div>`;
  box.hidden = false;
  app.board.flash(b.to);
  clearTimeout(diceTimer);
  diceTimer = setTimeout(() => (box.hidden = true), b.won ? 2600 : 2000);
}

// ---------------------------------------------------------------- cards
function openCards() {
  app.ui.picked = new Set();
  renderCards();
  if (!$('#cardsDlg').open) $('#cardsDlg').showModal();
}

function renderCards() {
  const s = app.state, seat = viewerSeat();
  if (seat < 0) return;
  const hand = s.players[seat].cards;
  const picked = app.ui.picked;
  for (const id of [...picked]) if (!hand.some(c => c.id === id)) picked.delete(id);
  const canTrade = isMyTurn() && s.current === seat && (s.phase === 'reinforce' || s.phase === 'tradeAfterKill') && !app.pending;
  $('#cardsList').innerHTML = hand.length ? hand.map(c => {
    const owned = c.territory && s.territories[c.territory].owner === seat;
    return `<div class="gcard ${picked.has(c.id) ? 'picked' : ''} ${owned ? 'owned' : ''}" data-cid="${c.id}">
      <div class="kind">${c.symbol}</div><div class="sym">${SYM[c.symbol]}</div>
      <div class="tn">${c.territory ? esc(TERR[c.territory].name) : 'Wild'}</div></div>`;
  }).join('') : '';
  $('#cardsValue').textContent = s.options.cards === 'escalating' ? `· next set: ${nextTradeValue(s)} armies` : '· ♟♟♟ 4 · ♞♞♞ 6 · ✸✸✸ 8 · mixed 10';
  const sel = hand.filter(c => picked.has(c.id));
  const v = sel.length === 3 ? setValue(s, sel) : 0;
  $('#cardsTrade').disabled = !(canTrade && v);
  $('#cardsTrade').textContent = v ? `Trade for ${v}` : 'Trade';
  $('#cardsAuto').disabled = !canTrade || !findSets(s, hand).length;
  let note;
  if (!hand.length) note = 'No cards yet. Conquer at least one territory in a turn to earn a card.';
  else if (!canTrade) note = 'Sets can be traded at the start of your turn (reinforce phase).';
  else if (sel.length === 3 && !v) note = 'Not a valid set: pick 3 of a kind or one of each (★ is wild).';
  else if (mustTrade(s)) note = 'You must trade now.';
  else note = 'Pick 3 cards: 3 of a kind or one of each (★ is wild). Bold names: +2 armies there.';
  $('#cardsNote').textContent = note;
}

function initCards() {
  $('#cardsList').addEventListener('click', e => {
    const c = e.target.closest('[data-cid]');
    if (!c) return;
    const p = app.ui.picked, id = c.dataset.cid;
    if (p.has(id)) p.delete(id);
    else if (p.size < 3) p.add(id);
    renderCards();
  });
  $('#cardsAuto').onclick = () => {
    const s = app.state, seat = viewerSeat();
    const hand = s.players[seat].cards;
    const sets = findSets(s, hand).map(x => ({
      ...x, bonus: x.cards.some(id => { const c = hand.find(h => h.id === id); return c.territory && s.territories[c.territory].owner === seat; }),
      wilds: x.cards.filter(id => id.startsWith('w')).length,
    })).sort((a, b) => b.value - a.value || b.bonus - a.bonus || a.wilds - b.wilds);
    if (sets.length) app.ui.picked = new Set(sets[0].cards);
    renderCards();
  };
  $('#cardsTrade').onclick = () => {
    const cards = [...app.ui.picked];
    app.ui.picked = new Set();
    act({ type: 'trade', cards });
    const s = app.state;
    if (app.mode === 'client' || !mustTrade(s)) $('#cardsDlg').close();
    else renderCards();
  };
  $('#cardsClose').onclick = () => $('#cardsDlg').close();
}

// ---------------------------------------------------------------- wiring
function initGameUI() {
  $('#panel').addEventListener('click', onPanelClick);
  $('#zoomCtl').addEventListener('click', e => {
    const z = e.target.closest('[data-z]');
    if (!z || !app.board) return;
    if (z.dataset.z === 'fit') app.board.fit();
    else app.board.zoomBy(z.dataset.z === 'in' ? 1.4 : 1 / 1.4);
  });
  $('#btnGameMenu').onclick = () => $('#menuDlg').showModal();
  $('#mClose').onclick = () => $('#menuDlg').close();
  $('#mLog').onclick = () => { $('#menuDlg').close(); openLog(); };
  $('#mRules').onclick = () => { $('#menuDlg').close(); $('#rulesDlg').showModal(); };
  $('#mQuit').onclick = quitToMenu;
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && app.state && !document.querySelector('dialog[open]')) { app.ui.sel = app.ui.to = null; render(); }
  });
  // countdown refresh for disconnected players
  setInterval(() => {
    const s = app.state;
    if (s && app.mode === 'host' && s.players[s.current].type === 'remote' && !s.players[s.current].connected) renderPanel();
  }, 1000);
}

initMenu();
initLocalSetup();
initLobby();
initCards();
initGameUI();
refreshMenu();
