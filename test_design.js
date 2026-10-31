/* Run locally with: node test_design.js */
'use strict';
const assert = require('node:assert/strict');
const core = require('./experiment-core.js');

const blocks = core.buildMainBlocks();
assert.equal(core.validateTrialSchedule(blocks), true);
const trials = blocks.flat();
assert.equal(trials.length, 420);
assert.equal(core.buildPracticeSpecs().length, 4);
const counts = new Map();
const gridLeft = Array(9).fill(0);
const gridRight = Array(9).fill(0);
let clusterCount = 0;
for (const spec of [...core.buildPracticeSpecs(), ...trials]) {
  const stim = core.generateStimulus(spec);
  assert.equal(core.validateStimulus(spec, stim), true);
  if (spec.phase === 'main') {
    const key = `${spec.n}_${spec.condition}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  if (spec.phase === 'main' && spec.condition[0] === 'C') {
    clusterCount++;
    gridLeft[stim.cluster_meta.grid_left - 1]++;
    gridRight[stim.cluster_meta.grid_right - 1]++;
    assert.ok(stim.geometry.spatial_ratio_actual > 1);
  }
  if (spec.condition === 'R2') {
    const sorted = stim.dots.slice().sort((a, b) => a.x - b.x);
    const transitions = sorted.slice(1).filter((p,i) => p.color !== sorted[i].color).length;
    assert.equal(transitions, 1);
  }
  if (spec.condition === 'C3') {
    assert.ok(stim.dots.some(p => p.cluster === 0 && p.color !== stim.dots.find(q => q.cluster === 0).color) ||
      stim.dots.some(p => p.cluster === 1 && p.color !== stim.dots.find(q => q.cluster === 1).color));
  }
}
for (const n of core.N_VALUES) {
  for (const id of core.CONDITION_IDS) {
    assert.equal(counts.get(`${n}_${id}`), 12);
  }
}
assert.equal(clusterCount, 240);
console.log('PASS: 420 main trials + 4 practice, all validated.');
console.log('PASS: 12 per N × condition, 6 blocks × 70; balanced partitions and color reversals.');
console.log('PASS: geometry, color counts, RGB assignment conditions, 3×3 grid labels.');
console.log('Random grid sample counts (NOT balanced by design):');
console.log(' left :', gridLeft.join(', '));
console.log(' right:', gridRight.join(', '));

// Repeat across multiple designs and stress geometry (worst-case cells included by random).
for (let run = 0; run < 9; run++) {
  const repeat = core.buildMainBlocks();
  assert.ok(core.validateTrialSchedule(repeat));
  for (const spec of repeat.flat()) {
    const stim = core.generateStimulus(spec);
    assert.ok(core.validateStimulus(spec, stim));
  }
}
console.log('PASS: 10 randomized full-session design + stimulus generation runs.');
