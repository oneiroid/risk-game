// Heuristic computer player: returns one action at a time for the current phase.
import { TERRITORIES, TERR, ADJ, CONTINENTS } from './map.js';
import { findSets, reachable, territoriesOf } from './engine.js';

const CONT_SIZE = {};
for (const t of TERRITORIES) CONT_SIZE[t.continent] = (CONT_SIZE[t.continent] || 0) + 1;

const enemyNbrs = (s, id) => ADJ[id].filter(n => s.territories[n].owner !== s.territories[id].owner);
const threat = (s, id) => enemyNbrs(s, id).reduce((a, n) => a + s.territories[n].armies, 0);

function continentStats(s, p) {
  const st = {};
  for (const c in CONTINENTS) st[c] = { mine: 0, enemy: 0, owners: new Set() };
  for (const t of TERRITORIES) {
    const o = s.territories[t.id];
    const c = st[t.continent];
    c.owners.add(o.owner);
    if (o.owner === p) c.mine++;
    else c.enemy += o.armies;
  }
  return st;
}

function targetContinent(s, p) {
  const st = continentStats(s, p);
  let best = null, bestScore = -1e9;
  for (const c in CONTINENTS) {
    const frac = st[c].mine / CONT_SIZE[c];
    if (frac === 1) continue;
    const score = frac * 3 + CONTINENTS[c].bonus / CONT_SIZE[c] - st[c].enemy / 25;
    if (score > bestScore) { bestScore = score; best = c; }
  }
  return best;
}

function placementTarget(s, p) {
  const tc = targetContinent(s, p);
  const st = continentStats(s, p);
  let best = null, bestScore = -1e9;
  for (const id of territoriesOf(s, p)) {
    const en = enemyNbrs(s, id);
    if (!en.length) continue;
    const me = s.territories[id];
    let score = 0;
    if (TERR[id].continent === tc) score += 3;
    // good attack opportunity next to a weak enemy
    const weakest = Math.min(...en.map(n => s.territories[n].armies));
    score += Math.min(3, (me.armies + 3) / (weakest + 1)) * 0.6;
    if (en.some(n => TERR[n].continent === tc)) score += 2;
    // break enemy-held continents
    if (en.some(n => st[TERR[n].continent].owners.size === 1)) score += 2;
    // defend a continent I fully own
    if (st[TERR[id].continent].mine === CONT_SIZE[TERR[id].continent]) score += Math.min(4, threat(s, id) / (me.armies + 1));
    score -= me.armies / 30; // avoid infinite stacking on one spot
    if (score > bestScore) { bestScore = score; best = id; }
  }
  return best || territoriesOf(s, p)[0];
}

function bestAttack(s, p) {
  const st = continentStats(s, p);
  const tc = targetContinent(s, p);
  let best = null, bestScore = 0;
  for (const from of territoriesOf(s, p)) {
    const a = s.territories[from].armies;
    if (a < 2) continue;
    for (const to of enemyNbrs(s, from)) {
      const d = s.territories[to].armies;
      const ratio = (a - 1) / d;
      const c = TERR[to].continent;
      let score = ratio;
      if (c === tc) score += 0.8;
      if (st[c].mine === CONT_SIZE[c] - 1) score += 1.5; // would complete continent
      const owner = s.territories[to].owner;
      if (st[c].owners.size === 1) score += 1.2; // breaks a continent
      if (territoriesOf(s, owner).length === 1) score += 2.5; // eliminates player
      const needed = s.conquered ? 1.4 : 1.0;
      if (a - 1 < d + (s.conquered ? 1 : 0) || ratio < needed) continue;
      if (score > bestScore) { bestScore = score; best = { from, to }; }
    }
  }
  return best;
}

export function aiAction(s, p) {
  const me = s.players[p];
  switch (s.phase) {
    case 'setup':
      return { type: 'place', territory: placementTarget(s, p), count: s.reinforcements };
    case 'tradeAfterKill':
    case 'reinforce': {
      const sets = findSets(s, me.cards);
      if (sets.length && (me.cards.length >= 5 || s.phase === 'tradeAfterKill' || s.options.cards === 'escalating' || me.cards.length >= 4)) {
        sets.sort((x, y) => y.value - x.value);
        return { type: 'trade', cards: sets[0].cards };
      }
      const target = placementTarget(s, p);
      // split large reinforcements between the top spot and the most threatened border
      const n = s.reinforcements;
      return { type: 'place', territory: target, count: n > 6 ? Math.ceil(n * 0.7) : n };
    }
    case 'attack': {
      const atk = bestAttack(s, p);
      if (!atk) return { type: 'endAttack' };
      const d = s.territories[atk.to].armies;
      return { type: 'attack', from: atk.from, to: atk.to, blitz: true, stopAt: Math.max(1, Math.min(3, Math.floor(d / 2))) };
    }
    case 'occupy': {
      const { from, to, min } = s.occupy;
      const max = s.territories[from].armies - 1;
      const tf = threat(s, from), tt = threat(s, to);
      let n = max;
      if (tf > 0) n = Math.round(max * (tt + 1) / (tf + tt + 2));
      return { type: 'occupy', count: Math.max(min, Math.min(max, n)) };
    }
    case 'fortify': {
      let src = null, srcA = 1;
      for (const id of territoriesOf(s, p)) {
        const a = s.territories[id].armies;
        if (a > srcA && !enemyNbrs(s, id).length) { src = id; srcA = a; }
      }
      if (!src) return { type: 'endTurn' };
      let dst = null, need = -1;
      for (const id of reachable(s, src)) {
        if (!enemyNbrs(s, id).length) continue;
        const v = threat(s, id) / (s.territories[id].armies + 1);
        if (v > need) { need = v; dst = id; }
      }
      if (!dst) return { type: 'endTurn' };
      return { type: 'fortify', from: src, to: dst, count: srcA - 1 };
    }
    default:
      return null;
  }
}

