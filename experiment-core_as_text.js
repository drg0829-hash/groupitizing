/* Groupitizing experiment - testable, browser-independent trial design and stimulus generation.
 * Use Math.random for spatial sampling; grid selections are independent uniform draws (no balancing).
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.GroupitizingCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const CONFIG = Object.freeze({
    VERSION: '2.0.0',
    CANVAS_WIDTH: 960,
    CANVAS_HEIGHT: 540,
    DOT_RADIUS: 7,
    MIN_DISTANCE: 25,
    MARGIN: 20,
    CLUSTER_RADIUS_MIN: 48,
    CLUSTER_RADIUS_MAX: 78,
    CLUSTER_BOUNDARY_GAP: 8,
    CLUSTER_BETWEEN_GAP: 38,
    FIXATION_DURATION: 1000,
    RESPONSE_DEADLINE: 4000,
    ITI_DURATION: 300,
    BLOCK_COUNT: 6,
    TRIALS_PER_BLOCK: 70,
    PRACTICE_COUNT: 4,
    COLORS: Object.freeze({
      GRAY: [128, 128, 128],
      RED: [255, 0, 0],
      CYAN: [0, 255, 255]
    })
  });

  const N_VALUES = Object.freeze([8, 9, 10, 11, 12]);
  const CONDITION_IDS = Object.freeze(['R1', 'R2', 'R3', 'C1', 'C2', 'C3', 'C4']);
  const PARTITIONS = Object.freeze({
    8: [[3, 5], [4, 4]],
    9: [[3, 6], [4, 5]],
    10: [[4, 6], [5, 5]],
    11: [[4, 7], [5, 6]],
    12: [[5, 7], [6, 6]]
  });

  const isClusterCondition = condition => condition.startsWith('C');
  const isColorCondition = condition => !['R1', 'C1'].includes(condition);
  const randomInt = (n, rng = Math.random) => Math.floor(rng() * n);
  const randomRange = (a, b, rng = Math.random) => a + (b - a) * rng();
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const sum = array => array.reduce((a, b) => a + b, 0);
  const fmtPair = pair => pair ? pair.join('+') : '';

  function shuffle(items, rng = Math.random) {
    const out = items.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = randomInt(i + 1, rng);
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }

  // Create exactly 2 trials of each condition × N per block; across six blocks each
  // spatial or color partition is A 6 times and B 6 times, as appropriate.
  function buildMainBlocks(rng = Math.random) {
    const blocks = Array.from({ length: CONFIG.BLOCK_COUNT }, () => []);
    for (const n of N_VALUES) {
      for (const condition of CONDITION_IDS) {
        const slots = Array.from({ length: CONFIG.BLOCK_COUNT }, () => []);
        if (condition === 'C4') {
          // Four spatial×color partition combinations, each 3 times.
          const patterns = shuffle([0, 0, 0, 1, 1, 1], rng);
          for (let b = 0; b < 6; b++) {
            // Each block gets spatial A + B and color A + B.
            const p = patterns[b];
            slots[b].push({ spatial_partition_id: 0, color_partition_id: p });
            slots[b].push({ spatial_partition_id: 1, color_partition_id: 1 - p });
          }
        } else {
          for (let b = 0; b < 6; b++) {
            for (let p = 0; p < 2; p++) {
              slots[b].push({
                spatial_partition_id: isClusterCondition(condition) ? p : null,
                color_partition_id: isColorCondition(condition)
                  ? (condition === 'C3' ? 1 - p : p)
                  : null
              });
            }
          }
        }

        const specs = [];
        for (let b = 0; b < 6; b++) {
          for (const slot of slots[b]) {
            specs.push({
              phase: 'main',
              n,
              condition,
              block: b + 1,
              spatial_partition_id: slot.spatial_partition_id,
              color_partition_id: slot.color_partition_id
            });
          }
        }

        // Assign group side independently of grid position; exact left/right balance.
        for (let sp = 0; sp < 2; sp++) {
          const group = specs.filter(s => s.spatial_partition_id === sp);
          if (group.length === 0) continue;
          if (group.length % 2) throw new Error('Odd spatial partition count');
          const directions = shuffle([
            ...Array(group.length / 2).fill('A_left'),
            ...Array(group.length / 2).fill('A_right')
          ], rng);
          group.forEach((s, i) => { s.side_assignment = directions[i]; });
        }

        // redCount=a vs b exactly 50/50 for every color partition. This also
        // controls color side/reversal when a=b (e.g. 4+4, 5+5, 6+6).
        for (let cp = 0; cp < 2; cp++) {
          const group = specs.filter(s => s.color_partition_id === cp);
          if (group.length === 0) continue;
          if (group.length % 2) throw new Error('Odd color partition count');
          const variants = shuffle([
            ...Array(group.length / 2).fill(0),
            ...Array(group.length / 2).fill(1)
          ], rng);
          group.forEach((s, i) => {
            s.color_variant = variants[i];
            s.red_count = PARTITIONS[n][cp][variants[i]];
            s.cyan_count = n - s.red_count;
          });
        }

        // For R2, half of each color partition is red on the left, half cyan.
        if (condition === 'R2') {
          for (let cp = 0; cp < 2; cp++) {
            const group = specs.filter(s => s.color_partition_id === cp);
            const directions = shuffle([0, 0, 0, 1, 1, 1], rng);
            group.forEach((s, i) => { s.red_on_left = Boolean(directions[i]); });
          }
        }

        specs.forEach(s => {
          if (s.spatial_partition_id !== null) {
            s.spatial_partition = PARTITIONS[n][s.spatial_partition_id].slice();
          } else {
            s.spatial_partition = null;
          }
          s.color_partition = s.color_partition_id !== null
            ? PARTITIONS[n][s.color_partition_id].slice() : null;
          blocks[s.block - 1].push(s);
        });
      }
    }

    let trialNumber = 1;
    return blocks.map((block, i) => shuffle(block, rng).map((s, j) => ({
      ...s,
      block: i + 1,
      trial_in_block: j + 1,
      main_trial_number: trialNumber++,
      condition_repeat: null
    })));
  }

  // Practice: four representative examples, same generator and response deadline.
  function buildPracticeSpecs() {
    return [
      { n: 8, condition: 'R1', spatial_partition_id: null, color_partition_id: null },
      { n: 9, condition: 'R2', spatial_partition_id: null, color_partition_id: 1, color_variant: 0, red_count: 4, cyan_count: 5, red_on_left: true },
      { n: 10, condition: 'C2', spatial_partition_id: 1, color_partition_id: 1, color_variant: 0, red_count: 5, cyan_count: 5, side_assignment: 'A_left' },
      { n: 12, condition: 'C4', spatial_partition_id: 0, color_partition_id: 1, color_variant: 0, red_count: 6, cyan_count: 6, side_assignment: 'A_right' }
    ].map((s, i) => ({
      ...s,
      phase: 'practice', block: 0, trial_in_block: i + 1, main_trial_number: null,
      spatial_partition: s.spatial_partition_id === null ? null : PARTITIONS[s.n][s.spatial_partition_id].slice(),
      color_partition: s.color_partition_id === null ? null : PARTITIONS[s.n][s.color_partition_id].slice()
    }));
  }

  function validateTrialSchedule(blocks) {
    if (blocks.length !== 6 || blocks.some(b => b.length !== 70)) throw new Error('Expected 6 × 70 trials');
    const rows = blocks.flat();
    for (const n of N_VALUES) {
      for (const condition of CONDITION_IDS) {
        const group = rows.filter(s => s.n === n && s.condition === condition);
        if (group.length !== 12) throw new Error(`Expected 12 repetitions for ${n}/${condition}`);
        for (let b = 1; b <= 6; b++) {
          if (group.filter(s => s.block === b).length !== 2) throw new Error('Unbalanced block');
        }
        for (let cp = 0; cp < 2; cp++) {
          const sub = group.filter(s => s.color_partition_id === cp);
          if (sub.length) {
            if (sub.length !== 6 || sub.filter(s => s.color_variant === 0).length !== 3 ||
                sub.filter(s => s.color_variant === 1).length !== 3) throw new Error('Color direction imbalance');
          }
        }
        for (let sp = 0; sp < 2; sp++) {
          const sub = group.filter(s => s.spatial_partition_id === sp);
          if (sub.length && (sub.length !== 6 || sub.filter(s => s.side_assignment === 'A_left').length !== 3)) {
            throw new Error('Spatial direction imbalance');
          }
        }
        if (condition === 'C4') {
          for (let sp = 0; sp < 2; sp++) for (let cp = 0; cp < 2; cp++) {
            if (group.filter(s => s.spatial_partition_id === sp && s.color_partition_id === cp).length !== 3) {
              throw new Error('C4 joint partition imbalance');
            }
          }
        }
        if (condition === 'R2') {
          for (let cp = 0; cp < 2; cp++) {
            if (group.filter(s => s.color_partition_id === cp && s.red_on_left).length !== 3) {
              throw new Error('R2 side imbalance');
            }
          }
        }
      }
    }
    return true;
  }

  function sampleUniform(n, rng) {
    const points = [];
    for (let i = 0; i < n; i++) {
      let added = false;
      for (let attempt = 0; attempt < 15000; attempt++) {
        const candidate = {
          x: randomRange(CONFIG.MARGIN + CONFIG.DOT_RADIUS,
            CONFIG.CANVAS_WIDTH - CONFIG.MARGIN - CONFIG.DOT_RADIUS, rng),
          y: randomRange(CONFIG.MARGIN + CONFIG.DOT_RADIUS,
            CONFIG.CANVAS_HEIGHT - CONFIG.MARGIN - CONFIG.DOT_RADIUS, rng),
          cluster: -1, grid_cell: null, side: null
        };
        if (points.every(q => distance(q, candidate) >= CONFIG.MIN_DISTANCE)) {
          points.push(candidate);
          added = true;
          break;
        }
      }
      if (!added) throw new Error('Cannot generate full-screen random points');
    }
    return { dots: points, cluster_meta: null };
  }

  // A grid is sampled *once* per cluster per trial. Rejections only resample
  // centers inside the same selected grid cells; they never change cell IDs.
  function gridBounds(side, cell) {
    const row = Math.floor(cell / 3);
    const col = cell % 3;
    const x0 = side === 'left' ? 0 : CONFIG.CANVAS_WIDTH / 2;
    const cellW = CONFIG.CANVAS_WIDTH / 6;
    const cellH = CONFIG.CANVAS_HEIGHT / 3;
    return {
      minX: x0 + col * cellW,
      maxX: x0 + (col + 1) * cellW,
      minY: row * cellH,
      maxY: (row + 1) * cellH
    };
  }

  function sampleCenterInCell(side, cell, rng) {
    const b = gridBounds(side, cell);
    const pad = CONFIG.CLUSTER_RADIUS_MIN + CONFIG.CLUSTER_BOUNDARY_GAP + CONFIG.DOT_RADIUS;
    const halfMin = side === 'left' ? 0 : CONFIG.CANVAS_WIDTH / 2;
    const halfMax = side === 'left' ? CONFIG.CANVAS_WIDTH / 2 : CONFIG.CANVAS_WIDTH;
    const minX = Math.max(b.minX, halfMin + CONFIG.MARGIN + pad);
    const maxX = Math.min(b.maxX, halfMax - CONFIG.MARGIN - pad);
    const minY = Math.max(b.minY, CONFIG.MARGIN + pad);
    const maxY = Math.min(b.maxY, CONFIG.CANVAS_HEIGHT - CONFIG.MARGIN - pad);
    if (minX > maxX || minY > maxY) throw new Error('Cluster center grid has no feasible region');
    return { x: randomRange(minX, maxX, rng), y: randomRange(minY, maxY, rng) };
  }

  function maxRadiusAt(center, side) {
    const w = CONFIG.CANVAS_WIDTH;
    const h = CONFIG.CANVAS_HEIGHT;
    const p = CONFIG.DOT_RADIUS + CONFIG.CLUSTER_BOUNDARY_GAP + CONFIG.MARGIN;
    const halfMin = side === 'left' ? 0 : w / 2;
    const halfMax = side === 'left' ? w / 2 : w;
    return Math.min(CONFIG.CLUSTER_RADIUS_MAX,
      center.x - halfMin - p, halfMax - center.x - p,
      center.y - p, h - center.y - p);
  }

  function sampleClusterPoints(center, radius, count, cluster, side, gridCell, rng) {
    const out = [];
    for (let i = 0; i < count; i++) {
      let found = false;
      for (let attempt = 0; attempt < 10000; attempt++) {
        const a = rng() * Math.PI * 2;
        const r = radius * Math.sqrt(rng());
        const p = {
          x: center.x + r * Math.cos(a),
          y: center.y + r * Math.sin(a),
          cluster, side, grid_cell: gridCell + 1
        };
        if (out.every(q => distance(p, q) >= CONFIG.MIN_DISTANCE)) {
          out.push(p);
          found = true;
          break;
        }
      }
      if (!found) return null;
    }
    return out;
  }

  function sampleClusters(spec, rng) {
    const cells = [randomInt(9, rng), randomInt(9, rng)]; // 0-based left/right, independent.
    for (let attempt = 0; attempt < 4000; attempt++) {
      const leftCenter = sampleCenterInCell('left', cells[0], rng);
      const rightCenter = sampleCenterInCell('right', cells[1], rng);
      const d = distance(leftCenter, rightCenter);
      const leftMax = maxRadiusAt(leftCenter, 'left');
      const rightMax = maxRadiusAt(rightCenter, 'right');
      if (leftMax < CONFIG.CLUSTER_RADIUS_MIN || rightMax < CONFIG.CLUSTER_RADIUS_MIN ||
          d < CONFIG.CLUSTER_RADIUS_MIN * 2 + CONFIG.CLUSTER_BETWEEN_GAP) continue;
      let leftRadius, rightRadius;
      let acceptedRadii = false;
      for (let rTry = 0; rTry < 100; rTry++) {
        leftRadius = randomRange(CONFIG.CLUSTER_RADIUS_MIN, leftMax, rng);
        rightRadius = randomRange(CONFIG.CLUSTER_RADIUS_MIN, rightMax, rng);
        if (d - leftRadius - rightRadius >= CONFIG.CLUSTER_BETWEEN_GAP) {
          acceptedRadii = true;
          break;
        }
      }
      if (!acceptedRadii) continue;
      const aLeft = spec.side_assignment === 'A_left';
      const sizeLeft = spec.spatial_partition[aLeft ? 0 : 1];
      const sizeRight = spec.spatial_partition[aLeft ? 1 : 0];
      const leftDots = sampleClusterPoints(leftCenter, leftRadius, sizeLeft,
        aLeft ? 0 : 1, 'left', cells[0], rng);
      if (!leftDots) continue;
      const rightDots = sampleClusterPoints(rightCenter, rightRadius, sizeRight,
        aLeft ? 1 : 0, 'right', cells[1], rng);
      if (!rightDots) continue;
      // Enclosing circles guarantee inter-cluster separation; check anyway.
      if (leftDots.some(a => rightDots.some(b => distance(a, b) < CONFIG.MIN_DISTANCE))) continue;
      return {
        dots: leftDots.concat(rightDots),
        cluster_meta: {
          grid_left: cells[0] + 1,
          grid_right: cells[1] + 1,
          center_left: leftCenter,
          center_right: rightCenter,
          radius_left: leftRadius,
          radius_right: rightRadius,
          center_distance: d
        }
      };
    }
    throw new Error(`Cannot place cluster centers inside fixed cells ${cells[0]+1},${cells[1]+1}`);
  }

  function assignColors(spec, dots, rng) {
    const n = dots.length;
    const labels = Array(n).fill('gray');
    if (!isColorCondition(spec.condition)) return labels;
    const redCount = spec.red_count;
    if (spec.condition === 'R2') {
      const order = dots.map((_, i) => i).sort((a, b) => dots[a].x - dots[b].x);
      const leftCount = spec.red_on_left ? redCount : n - redCount;
      order.forEach((idx, rank) => { labels[idx] = rank < leftCount
        ? (spec.red_on_left ? 'red' : 'cyan') : (spec.red_on_left ? 'cyan' : 'red'); });
    } else if (spec.condition === 'R3') {
      // Pure random color labels, excluding the two completely x-separated cases.
      let found = false;
      for (let attempt = 0; attempt < 500; attempt++) {
        const indexes = shuffle(Array.from({ length: n }, (_, i) => i), rng);
        labels.fill('cyan');
        indexes.slice(0, redCount).forEach(i => { labels[i] = 'red'; });
        const ordered = dots.map((_, i) => i).sort((a, b) => dots[a].x - dots[b].x);
        const sequence = ordered.map(i => labels[i]);
        const transitions = sequence.slice(1).filter((color, i) => color !== sequence[i]).length;
        if (transitions >= 2) { found = true; break; }
      }
      if (!found) throw new Error('Cannot make R3 mixed color labels');
    } else if (spec.condition === 'C2') {
      const [a, b] = spec.spatial_partition;
      const redCluster = a === b ? spec.color_variant : (redCount === a ? 0 : 1);
      dots.forEach((p, i) => { labels[i] = p.cluster === redCluster ? 'red' : 'cyan'; });
    } else if (spec.condition === 'C3') {
      // Find the monochrome-cluster assignment that requires exactly one flip.
      const [a, b] = spec.spatial_partition;
      const options = [a, b].map((size, k) => ({ cluster: k, flips: Math.abs(redCount - size) }));
      const minimum = Math.min(...options.map(o => o.flips));
      const candidates = options.filter(o => o.flips === minimum);
      if (minimum !== 1) throw new Error('C3 must differ by exactly one dot');
      const redCluster = candidates[randomInt(candidates.length, rng)].cluster;
      dots.forEach((p, i) => { labels[i] = p.cluster === redCluster ? 'red' : 'cyan'; });
      const currentRed = labels.filter(c => c === 'red').length;
      const changeFrom = currentRed < redCount ? 'cyan' : 'red';
      const possible = dots.map((_, i) => i).filter(i => labels[i] === changeFrom);
      labels[possible[randomInt(possible.length, rng)]] = changeFrom === 'red' ? 'cyan' : 'red';
    } else if (spec.condition === 'C4') {
      // Truly shuffled subject to: both colors occur in both spatial clusters.
      let found = false;
      for (let attempt = 0; attempt < 2000; attempt++) {
        const indexes = shuffle(Array.from({ length: n }, (_, i) => i), rng);
        labels.fill('cyan');
        indexes.slice(0, redCount).forEach(i => { labels[i] = 'red'; });
        if ([0, 1].every(k => {
          const colors = dots.filter(p => p.cluster === k).map(p => labels[dots.indexOf(p)]);
          return colors.includes('red') && colors.includes('cyan');
        })) { found = true; break; }
      }
      if (!found) throw new Error('Cannot make C4 both-cluster mixing');
    } else {
      throw new Error(`Unknown condition ${spec.condition}`);
    }
    if (labels.filter(c => c === 'red').length !== redCount) throw new Error('Wrong red count');
    return labels;
  }

  function meanNN(points) {
    if (!points || points.length < 2) return null;
    return sum(points.map((p, i) => Math.min(...points.filter((_, j) => i !== j).map(q => distance(p, q))))) / points.length;
  }

  function convexHullArea(points) {
    if (points.length < 3) return 0;
    const sorted = points.slice().sort((a, b) => a.x - b.x || a.y - b.y);
    const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
    function half(list) {
      const h = [];
      for (const p of list) {
        while (h.length >= 2 && cross(h[h.length-2], h[h.length-1], p) <= 0) h.pop();
        h.push(p);
      }
      return h;
    }
    const hull = half(sorted).slice(0,-1).concat(half(sorted.slice().reverse()).slice(0,-1));
    return Math.abs(hull.reduce((acc,p,i) => acc + p.x * hull[(i+1)%hull.length].y - p.y * hull[(i+1)%hull.length].x,0))/2;
  }

  function generateStimulus(spec, rng = Math.random) {
    const geometry = isClusterCondition(spec.condition) ? sampleClusters(spec, rng) : sampleUniform(spec.n, rng);
    const labels = assignColors(spec, geometry.dots, rng);
    const dots = shuffle(geometry.dots.map((p, i) => ({ ...p, color: labels[i] })), rng);
    const within = [0, 1].map(k => meanNN(dots.filter(p => p.cluster === k)));
    const cross = isClusterCondition(spec.condition)
      ? Math.min(...dots.filter(p => p.cluster === 0).flatMap(a =>
        dots.filter(p => p.cluster === 1).map(b => distance(a,b)))) : null;
    const ratio = isClusterCondition(spec.condition) ? cross / ((within[0] + within[1])/2) : null;
    const spread = Math.max(...dots.map(p => Math.hypot(p.x - CONFIG.CANVAS_WIDTH/2, p.y - CONFIG.CANVAS_HEIGHT/2)));
    return {
      dots,
      cluster_meta: geometry.cluster_meta,
      geometry: {
        hull_area: convexHullArea(dots),
        mean_nn_all: meanNN(dots),
        cross_cluster_min_distance: cross,
        within_cluster_mean_nn: isClusterCondition(spec.condition) ? (within[0] + within[1])/2 : null,
        spatial_ratio_actual: ratio,
        max_center_distance: spread
      }
    };
  }

  function validateStimulus(spec, stim) {
    const dots = stim.dots;
    if (dots.length !== spec.n) throw new Error('Wrong total dot count');
    for (let i = 0; i < dots.length; i++) {
      const p = dots[i];
      if (p.x < CONFIG.MARGIN || p.x > CONFIG.CANVAS_WIDTH-CONFIG.MARGIN ||
          p.y < CONFIG.MARGIN || p.y > CONFIG.CANVAS_HEIGHT-CONFIG.MARGIN) throw new Error('Out of canvas');
      for (let j = 0; j < i; j++) if (distance(p,dots[j]) < CONFIG.MIN_DISTANCE-1e-7) throw new Error('Overlapping dots');
    }
    if (isColorCondition(spec.condition)) {
      if (dots.filter(p => p.color === 'red').length !== spec.red_count) throw new Error('Wrong red allocation');
    } else if (dots.some(p => p.color !== 'gray')) throw new Error('Gray condition has colors');
    if (isClusterCondition(spec.condition)) {
      for (let k = 0; k < 2; k++) {
        if (dots.filter(p => p.cluster === k).length !== spec.spatial_partition[k]) throw new Error('Wrong cluster size');
      }
      if (spec.condition === 'C2' && [0,1].some(k => new Set(dots.filter(p => p.cluster === k).map(p => p.color)).size !== 1)) throw new Error('C2 not aligned');
      if (spec.condition === 'C3') {
        const mixed = [0,1].filter(k => new Set(dots.filter(p => p.cluster === k).map(p => p.color)).size > 1);
        if (mixed.length !== 1) throw new Error('C3 must have one mixed cluster');
      }
      if (spec.condition === 'C4' && [0,1].some(k => new Set(dots.filter(p => p.cluster === k).map(p => p.color)).size !== 2)) throw new Error('C4 must have two mixed clusters');
    } else if (dots.some(p => p.cluster !== -1)) throw new Error('Random condition has clusters');
    return true;
  }

  return { CONFIG, N_VALUES, CONDITION_IDS, PARTITIONS, fmtPair, shuffle,
    buildMainBlocks, buildPracticeSpecs, validateTrialSchedule,
    generateStimulus, validateStimulus };
});
