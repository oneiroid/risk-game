// Rules engine. State is plain JSON; all randomness comes from a seeded RNG kept in state,
// so the host can serialize it and replay deterministically.
import { TERR, ADJ, IDS, CONTINENTS, TERRITORIES } from './map.js';

export const PLAYER_COLORS = ['#c8382c', '#3466b0', '#3c9a68', '#d9a521']; // clans: akane, ai, matsu, kin
export const PLAYER_COLOR_NAMES = ['Red', 'Blue', 'Green', 'Gold'];
const START_ARMIES = { 2: 40, 3: 35, 4: 30 };
const SYMBOLS = ['infantry', 'cavalry', 'artillery'];
const ESCALATION = [4, 6, 8, 10, 12, 15];
const FIXED_VALUES = { infantry: 4, cavalry: 6, artillery: 8, mixed: 10 };

export const DEFAULT_OPTIONS = {
  setup: 'manual',        // 'manual' (players place initial armies in rounds) | 'auto'
  cards: 'escalating',    // 'escalating' | 'fixed'
  fortify: 'connected',   // 'connected' | 'adjacent'
};

function rand(state) {
  // mulberry32
  let t = (state.rng = (state.rng + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const rollDie = s => 1 + Math.floor(rand(s) * 6);
function shuffle(state, arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand(state) * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// players: [{ name, type: 'human' | 'ai' | 'remote', clientId? }]
export function createGame(players, options = {}, seed = (Math.random() * 2 ** 32) >>> 0) {
  const n = players.length;
  if (n < 2 || n > 4) throw new Error('2-4 players');
  const s = {
    id: seed >>> 0,
    version: 0,
    rng: seed | 0,
    options: { ...DEFAULT_OPTIONS, ...options },
    players: players.map((p, i) => ({
      name: p.name, type: p.type, clientId: p.clientId || null,
      color: PLAYER_COLORS[i], cards: [], eliminated: false, connected: true,
    })),
    territories: {},
    deck: [],
    discard: [],
    tradeCount: 0,
    current: 0,
    turn: 1,
    phase: 'setup',
    reinforcements: 0,
    setupLeft: [],
    conquered: false,
    occupy: null,       // { from, to, min }
    killTrade: false,
    afterTrade: null,   // phase to return to after forced mid-attack trade
    fortified: false,
    lastBattle: null,
    log: [],
    winner: null,
    seq: 0,
  };
  const ids = shuffle(s, IDS.slice());
  ids.forEach((id, i) => { s.territories[id] = { owner: i % n, armies: 1 }; });
  s.deck = shuffle(s, [
    ...IDS.map((id, i) => ({ id: 'c' + i, territory: id, symbol: SYMBOLS[i % 3] })),
    { id: 'w0', territory: null, symbol: 'wild' },
    { id: 'w1', territory: null, symbol: 'wild' },
  ]);
  const owned = p => IDS.filter(id => s.territories[id].owner === p).length;
  s.setupLeft = s.players.map((_, p) => START_ARMIES[n] - owned(p));
  s.current = s.firstPlayer = Math.floor(rand(s) * n);
  log(s, `${s.players[s.current].name} goes first.`);
  if (s.options.setup === 'auto') {
    s.players.forEach((_, p) => {
      const mine = IDS.filter(id => s.territories[id].owner === p);
      for (let k = 0; k < s.setupLeft[p]; k++) s.territories[mine[Math.floor(rand(s) * mine.length)]].armies++;
      s.setupLeft[p] = 0;
    });
    startTurn(s);
  } else {
    s.phase = 'setup';
    s.reinforcements = Math.min(3, s.setupLeft[s.current]);
  }
  return s;
}

function log(s, text) {
  s.log.push({ t: s.seq++, text });
  if (s.log.length > 60) s.log.splice(0, s.log.length - 60);
}

export const territoriesOf = (s, p) => IDS.filter(id => s.territories[id].owner === p);
export const armiesOf = (s, p) => IDS.reduce((a, id) => a + (s.territories[id].owner === p ? s.territories[id].armies : 0), 0);
export const continentsOf = (s, p) =>
  Object.keys(CONTINENTS).filter(c => TERRITORIES.every(t => t.continent !== c || s.territories[t.id].owner === p));

export function reinforcementBreakdown(s, p) {
  const terr = territoriesOf(s, p).length;
  const base = Math.max(3, Math.floor(terr / 3));
  const conts = continentsOf(s, p);
  const bonus = conts.reduce((a, c) => a + CONTINENTS[c].bonus, 0);
  return { base, conts, bonus, total: base + bonus };
}

export function nextTradeValue(s) {
  if (s.options.cards === 'fixed') return null;
  const k = s.tradeCount;
  return k < ESCALATION.length ? ESCALATION[k] : 15 + 5 * (k - ESCALATION.length + 1);
}

export function setValue(s, cards) {
  if (cards.length !== 3) return 0;
  const syms = cards.map(c => c.symbol);
  const wilds = syms.filter(x => x === 'wild').length;
  const real = syms.filter(x => x !== 'wild');
  const uniq = new Set(real);
  let kind = null;
  if (wilds >= 2) kind = 'any';
  else if (wilds === 1) kind = uniq.size === 1 ? real[0] : 'mixed';
  else if (uniq.size === 1) kind = real[0];
  else if (uniq.size === 3) kind = 'mixed';
  if (!kind) return 0;
  if (s.options.cards === 'fixed') return kind === 'any' ? FIXED_VALUES.mixed : FIXED_VALUES[kind];
  return nextTradeValue(s);
}

// all valid 3-card combinations in a hand
export function findSets(s, hand) {
  const out = [];
  for (let i = 0; i < hand.length; i++)
    for (let j = i + 1; j < hand.length; j++)
      for (let k = j + 1; k < hand.length; k++) {
        const set = [hand[i], hand[j], hand[k]];
        const v = setValue(s, set);
        if (v) out.push({ cards: set.map(c => c.id), value: v });
      }
  return out;
}

// 5+ cards at the start of reinforcement, or 5+ after taking an eliminated player's cards.
export const mustTrade = s => (s.phase === 'reinforce' || s.phase === 'tradeAfterKill') &&
  s.players[s.current].cards.length >= 5;

export function canReach(s, from, to) {
  const p = s.territories[from].owner;
  if (s.options.fortify === 'adjacent') return ADJ[from].includes(to) && s.territories[to].owner === p;
  const seen = new Set([from]);
  const q = [from];
  while (q.length) {
    const a = q.shift();
    for (const b of ADJ[a]) {
      if (seen.has(b) || s.territories[b].owner !== p) continue;
      if (b === to) return true;
      seen.add(b);
      q.push(b);
    }
  }
  return false;
}

export function reachable(s, from) {
  return IDS.filter(id => id !== from && s.territories[id].owner === s.territories[from].owner && canReach(s, from, id));
}

function startTurn(s) {
  s.phase = 'reinforce';
  s.conquered = false;
  s.fortified = false;
  s.occupy = null;
  const b = reinforcementBreakdown(s, s.current);
  s.reinforcements = b.total;
  const p = s.players[s.current];
  let msg = `Turn ${s.turn}: ${p.name} receives ${b.total} armies`;
  if (b.conts.length) msg += ` (incl. ${b.conts.map(c => CONTINENTS[c].name).join(', ')})`;
  log(s, msg + '.');
}

function nextPlayer(s, from) {
  const n = s.players.length;
  for (let k = 1; k <= n; k++) {
    const i = (from + k) % n;
    if (!s.players[i].eliminated) return i;
  }
  return from;
}

function endTurn(s) {
  const p = s.players[s.current];
  if (s.conquered) {
    const card = drawCard(s);
    if (card) {
      p.cards.push(card);
      log(s, `${p.name} earns a card.`);
    }
  }
  const nxt = nextPlayer(s, s.current);
  if (nxt <= s.current) s.turn++;
  s.current = nxt;
  startTurn(s);
}

function drawCard(s) {
  if (!s.deck.length) {
    s.deck = shuffle(s, s.discard);
    s.discard = [];
  }
  return s.deck.pop() || null;
}

const fail = error => ({ ok: false, error });

// Applies an action for player p. Mutates state; returns { ok, error?, events? }.
export function applyAction(s, p, a) {
  if (s.phase === 'gameover') return fail('Game over');
  if (p !== s.current) return fail('Not your turn');
  const me = s.players[p];
  const res = dispatch(s, p, me, a);
  if (res.ok) s.version++;
  return res;
}

function dispatch(s, p, me, a) {
  const T = id => s.territories[id];
  switch (a.type) {
    case 'place': {
      if (s.phase !== 'setup' && s.phase !== 'reinforce') return fail('Cannot place now');
      if (mustTrade(s)) return fail('You must trade cards first');
      const t = T(a.territory);
      if (!t || t.owner !== p) return fail('Not your territory');
      const n = Math.floor(a.count || 1);
      if (n < 1 || n > s.reinforcements) return fail('Invalid army count');
      t.armies += n;
      s.reinforcements -= n;
      if (s.phase === 'setup') {
        s.setupLeft[p] -= n;
        if (s.reinforcements === 0) advanceSetup(s);
      } else if (s.reinforcements === 0) {
        s.phase = s.afterTrade || 'attack';
        s.afterTrade = null;
      }
      return { ok: true };
    }
    case 'trade': {
      if (s.phase !== 'reinforce' && s.phase !== 'tradeAfterKill') return fail('Cannot trade now');
      const cards = (a.cards || []).map(id => me.cards.find(c => c.id === id));
      if (cards.length !== 3 || cards.some(c => !c) || new Set(a.cards).size !== 3) return fail('Pick 3 of your cards');
      const value = setValue(s, cards);
      if (!value) return fail('Not a valid set');
      me.cards = me.cards.filter(c => !a.cards.includes(c.id));
      s.discard.push(...cards);
      s.tradeCount++;
      s.reinforcements += value;
      // +2 bonus on one owned territory pictured on the cards
      const bonusT = cards.map(c => c.territory).find(id => id && T(id).owner === p);
      if (bonusT) T(bonusT).armies += 2;
      log(s, `${me.name} trades cards for ${value} armies${bonusT ? ` (+2 on ${TERR[bonusT].name})` : ''}.`);
      if (s.phase === 'tradeAfterKill' && me.cards.length < 5) {
        s.phase = 'reinforce';
        s.afterTrade = 'attack';
      }
      return { ok: true };
    }
    case 'attack': {
      if (s.phase !== 'attack') return fail('Not attack phase');
      const from = T(a.from), to = T(a.to);
      if (!from || !to || from.owner !== p || to.owner === p) return fail('Invalid attack');
      if (!ADJ[a.from].includes(a.to)) return fail('Not adjacent');
      if (from.armies < 2) return fail('Need at least 2 armies to attack');
      const rounds = [];
      const defender = to.owner;
      do {
        const ad = Math.min(3, from.armies - 1, a.blitz ? 3 : Math.max(1, a.dice || 3));
        const dd = Math.min(2, to.armies);
        const ar = Array.from({ length: ad }, () => rollDie(s)).sort((x, y) => y - x);
        const dr = Array.from({ length: dd }, () => rollDie(s)).sort((x, y) => y - x);
        let al = 0, dl = 0;
        for (let i = 0; i < Math.min(ad, dd); i++) {
          if (ar[i] > dr[i]) dl++;
          else al++;
        }
        from.armies -= al;
        to.armies -= dl;
        rounds.push({ ar, dr, al, dl });
      } while (a.blitz && to.armies > 0 && from.armies > Math.max(1, a.stopAt || 1));
      const lostA = rounds.reduce((x, r) => x + r.al, 0), lostD = rounds.reduce((x, r) => x + r.dl, 0);
      const won = to.armies === 0;
      const last = rounds[rounds.length - 1];
      s.lastBattle = {
        id: s.version + 1, from: a.from, to: a.to, attacker: p, defender,
        ar: last.ar, dr: last.dr, rounds: rounds.length, lostA, lostD, won,
      };
      const dname = s.players[defender].name;
      log(s, `${me.name} attacks ${TERR[a.to].name} from ${TERR[a.from].name}: loses ${lostA}, ${dname} loses ${lostD}${won ? ' — conquered!' : '.'}`);
      if (won) {
        to.owner = p;
        s.conquered = true;
        const minMove = Math.min(last.ar.length, from.armies - 1);
        s.occupy = { from: a.from, to: a.to, min: Math.max(1, minMove) };
        s.phase = 'occupy';
        if (territoriesOf(s, defender).length === 0) eliminate(s, p, defender);
      }
      return { ok: true };
    }
    case 'occupy': {
      if (s.phase !== 'occupy') return fail('Nothing to occupy');
      const { from, to, min } = s.occupy;
      const max = T(from).armies - 1;
      const n = Math.floor(a.count);
      if (!(n >= min && n <= Math.max(min, max))) return fail(`Move between ${min} and ${max}`);
      T(from).armies -= n;
      T(to).armies += n;
      s.occupy = null;
      if (s.killTrade) {
        s.killTrade = false;
        s.phase = 'tradeAfterKill';
        s.reinforcements = 0;
      } else s.phase = 'attack';
      return { ok: true };
    }
    case 'endAttack': {
      if (s.phase !== 'attack') return fail('Not attack phase');
      s.phase = 'fortify';
      return { ok: true };
    }
    case 'fortify': {
      if (s.phase !== 'fortify') return fail('Not fortify phase');
      const from = T(a.from), to = T(a.to);
      const n = Math.floor(a.count);
      if (!from || !to || from.owner !== p || to.owner !== p || a.from === a.to) return fail('Invalid move');
      if (!canReach(s, a.from, a.to)) return fail('Territories are not connected');
      if (!(n >= 1 && n <= from.armies - 1)) return fail('Invalid army count');
      from.armies -= n;
      to.armies += n;
      log(s, `${me.name} moves ${n} from ${TERR[a.from].name} to ${TERR[a.to].name}.`);
      endTurn(s);
      return { ok: true };
    }
    case 'endTurn': {
      if (s.phase !== 'attack' && s.phase !== 'fortify') return fail('Cannot end turn now');
      endTurn(s);
      return { ok: true };
    }
    default:
      return fail('Unknown action');
  }
}

function eliminate(s, p, d) {
  const me = s.players[p], dead = s.players[d];
  dead.eliminated = true;
  log(s, `${dead.name} has been eliminated by ${me.name}!`);
  if (dead.cards.length) {
    me.cards.push(...dead.cards);
    log(s, `${me.name} takes ${dead.cards.length} card(s).`);
    dead.cards = [];
  }
  const alive = s.players.filter(x => !x.eliminated);
  if (alive.length === 1) {
    s.phase = 'gameover';
    s.winner = p;
    const { from, to } = s.occupy;
    const n = s.territories[from].armies - 1;
    s.territories[from].armies -= n;
    s.territories[to].armies += n;
    s.occupy = null;
    log(s, `${me.name} conquers the world!`);
    return;
  }
  if (me.cards.length >= 6) s.killTrade = true;
}

function advanceSetup(s) {
  const n = s.players.length;
  for (let k = 1; k <= n; k++) {
    const i = (s.current + k) % n;
    if (s.setupLeft[i] > 0) {
      s.current = i;
      s.reinforcements = Math.min(3, s.setupLeft[i]);
      return;
    }
  }
  // setup finished: first player (the one after last placer in order) starts
  s.current = s.firstPlayer;
  startTurn(s);
}

// Hide other players' cards for a given viewer (network payloads).
export function viewFor(s, viewer) {
  const v = structuredClone(s);
  v.players.forEach((pl, i) => {
    if (i !== viewer) pl.cards = pl.cards.map(() => ({ id: 'x', hidden: true }));
  });
  v.deck = v.deck.length;
  v.rng = 0;
  return v;
}

export const deckSize = s => (typeof s.deck === 'number' ? s.deck : s.deck.length);
