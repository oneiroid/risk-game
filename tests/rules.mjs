// Focused rule checks.
import assert from 'node:assert/strict';
import { createGame, applyAction, setValue, reinforcementBreakdown, nextTradeValue, canReach } from '../js/engine.js';
import { IDS, TERRITORIES, ADJ } from '../js/map.js';

// adjacency is symmetric and complete
for (const a in ADJ) for (const b of ADJ[a]) assert.ok(ADJ[b].includes(a), `${a}-${b} not symmetric`);
assert.equal(IDS.length, 42);

const two = () => createGame([{ name: 'A', type: 'human' }, { name: 'B', type: 'human' }], { setup: 'auto' }, 7);

// starting armies: 40 each for 2 players
{
  const s = two();
  for (const p of [0, 1]) {
    const total = IDS.reduce((x, id) => x + (s.territories[id].owner === p ? s.territories[id].armies : 0), 0);
    assert.equal(total, 40);
  }
  assert.equal(s.phase, 'reinforce');
}

// card set values
{
  const s = two();
  const c = sym => ({ symbol: sym });
  assert.equal(setValue(s, [c('infantry'), c('infantry'), c('infantry')]), 4);
  assert.equal(setValue(s, [c('infantry'), c('cavalry'), c('artillery')]), 4);
  assert.equal(setValue(s, [c('infantry'), c('cavalry'), c('wild')]), 4);
  assert.equal(setValue(s, [c('infantry'), c('infantry'), c('cavalry')]), 0);
  s.tradeCount = 5; assert.equal(nextTradeValue(s), 15);
  s.tradeCount = 6; assert.equal(nextTradeValue(s), 20);
  s.options.cards = 'fixed';
  assert.equal(setValue(s, [c('cavalry'), c('cavalry'), c('wild')]), 6);
  assert.equal(setValue(s, [c('artillery'), c('artillery'), c('artillery')]), 8);
  assert.equal(setValue(s, [c('infantry'), c('cavalry'), c('artillery')]), 10);
}

// reinforcements: territories/3 (min 3) + continent bonus
{
  const s = two();
  for (const id of IDS) s.territories[id].owner = 1;
  for (const t of TERRITORIES.filter(t => t.continent === 'au')) s.territories[t.id].owner = 0;
  assert.deepEqual(reinforcementBreakdown(s, 0), { base: 3, conts: ['au'], bonus: 2, total: 5 });
  for (const t of TERRITORIES.filter(t => t.continent === 'as')) s.territories[t.id].owner = 0;
  assert.equal(reinforcementBreakdown(s, 0).total, 5 + 7 + 2); // 16 territories -> 5
}

// attack constraints, occupy minimum, fortify connectivity
{
  const s = two();
  const p = s.current, e = 1 - p;
  for (const id of IDS) { s.territories[id].owner = e; s.territories[id].armies = 1; }
  s.territories.brazil = { owner: p, armies: 10 };
  s.territories.arg = { owner: p, armies: 1 };
  s.territories.peru = { owner: e, armies: 1 };
  s.phase = 'attack';
  assert.equal(applyAction(s, e, { type: 'endAttack' }).ok, false, 'not your turn');
  assert.equal(applyAction(s, p, { type: 'attack', from: 'arg', to: 'peru', dice: 1 }).ok, false, 'needs 2 armies');
  assert.equal(applyAction(s, p, { type: 'attack', from: 'brazil', to: 'egypt', dice: 3 }).ok, false, 'not adjacent');
  let guard = 0;
  while (s.phase === 'attack' && guard++ < 50) applyAction(s, p, { type: 'attack', from: 'brazil', to: 'peru', dice: 3 });
  assert.equal(s.phase, 'occupy');
  assert.equal(s.occupy.min, 3);
  assert.equal(applyAction(s, p, { type: 'occupy', count: 1 }).ok, false, 'must move >= dice');
  assert.ok(applyAction(s, p, { type: 'occupy', count: 3 }).ok);
  assert.equal(s.territories.peru.armies, 3);
  assert.ok(s.conquered);
  applyAction(s, p, { type: 'endAttack' });
  assert.ok(canReach(s, 'brazil', 'arg'));
  assert.equal(canReach(s, 'peru', 'egypt'), false);
  const before = s.players[p].cards.length;
  assert.ok(applyAction(s, p, { type: 'fortify', from: 'peru', to: 'arg', count: 2 }).ok);
  assert.equal(s.players[p].cards.length, before + 1, 'card for conquest');
  assert.equal(s.current, e);
}
console.log('rules ok');
