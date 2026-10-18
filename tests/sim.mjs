// AI-vs-AI simulation: checks rule invariants and that games terminate.
import { createGame, applyAction, viewFor } from '../js/engine.js';
import { aiAction } from '../js/ai.js';
import { IDS } from '../js/map.js';

const N = Number(process.argv[2] || 200);
let turns = [], stalls = 0, wins = {};
for (let g = 0; g < N; g++) {
  const np = 2 + (g % 3);
  const opts = { setup: g % 2 ? 'auto' : 'manual', cards: g % 4 < 2 ? 'escalating' : 'fixed', fortify: g % 5 ? 'connected' : 'adjacent' };
  const s = createGame(Array.from({ length: np }, (_, i) => ({ name: 'AI' + i, type: 'ai' })), opts, g + 1);
  let steps = 0;
  while (s.phase !== 'gameover' && s.turn < 400) {
    const p = s.current;
    const a = aiAction(s, p);
    const r = applyAction(s, p, a);
    if (!r.ok) throw new Error(`game ${g} step ${steps} phase ${s.phase}: ${JSON.stringify(a)} -> ${r.error}`);
    for (const id of IDS) {
      const t = s.territories[id];
      if (t.armies < 1 && s.phase !== 'occupy') throw new Error(`armies<1 at ${id}`);
      if (s.players[t.owner].eliminated) throw new Error('owner eliminated');
    }
    const cardTotal = s.deck.length + s.discard.length + s.players.reduce((x, pl) => x + pl.cards.length, 0);
    if (cardTotal !== 44) throw new Error('card count ' + cardTotal);
    if (++steps > 200000) throw new Error('too many steps');
  }
  JSON.stringify(viewFor(s, 0));
  if (s.phase !== 'gameover') stalls++;
  else { turns.push(s.turn); wins[np] = (wins[np] || 0) + 1; }
}
turns.sort((a, b) => a - b);
console.log(`games=${N} finished=${turns.length} stalled(400 rounds)=${stalls} median rounds=${turns[turns.length >> 1]} max=${turns.at(-1)}`);
