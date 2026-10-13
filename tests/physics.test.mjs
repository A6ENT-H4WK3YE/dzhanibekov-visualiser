// Physics tests. Run with: node --test tests/
// Each test states the ground-truth property from CLAUDE.md it checks and where it comes from.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_DT,
  eulerRHS,
  quatMul,
  quatConj,
  quatRotate,
  quatFromAxisAngle,
  rk4Step,
  simulate,
  energy,
  angularMomentumSq,
  angularMomentumWorld,
  initialState,
  growthRate,
  jacobiEllipticSNCNDN,
  exactOmega,
} from '../src/physics.js';

const I_DEFAULT = [1, 2, 3];
const OMEGA = 1;
const EPS = 1e-3;
const TOL = 1e-6;

const norm = (v) => Math.hypot(...v);
const sub = (a, b) => a.map((x, i) => x - b[i]);
const close = (a, b, tol, msg) =>
  assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} expected ${b}, got ${a} (tol ${tol})`);

// ---------------------------------------------------------------------------
// Quaternion sanity checks (Hamilton convention, body -> world).

test('quaternion: 90 degrees about z maps x to y', () => {
  const q = quatFromAxisAngle([0, 0, 1], Math.PI / 2);
  const v = quatRotate(q, [1, 0, 0]);
  [0, 1, 0].forEach((x, i) => close(v[i], x, 1e-15));
});

test('quaternion: q q* is the identity, rotation preserves length', () => {
  const q = quatFromAxisAngle([1 / Math.sqrt(3), 1 / Math.sqrt(3), 1 / Math.sqrt(3)], 1.234);
  const p = quatMul(q, quatConj(q));
  [1, 0, 0, 0].forEach((x, i) => close(p[i], x, 1e-15));
  close(norm(quatRotate(q, [0.3, -1.2, 2.5])), norm([0.3, -1.2, 2.5]), 1e-14);
});

test('orientation: constant spin about a principal axis rotates by Omega*t about that axis', () => {
  // Spin exactly about axis 3 is a fixed point of Euler's equations, so q(t) must be the
  // rotation by angle Omega*t about z. Checks the sign convention of dq/dt = 0.5 q (0, w).
  const s = simulate({ w: [0, 0, 2], q: [1, 0, 0, 0] }, I_DEFAULT, DEFAULT_DT, 1000);
  const expected = quatFromAxisAngle([0, 0, 1], 2 * 1.0);
  s.q.forEach((x, i) => close(x, expected[i], 1e-12));
});

// ---------------------------------------------------------------------------
// RK4 order check: halving dt should reduce the global error by about 2^4 = 16.

test('integrator: RK4 shows 4th-order convergence', () => {
  const s0 = initialState(2, OMEGA, 0.1);
  const T = 10;
  const run = (dt) => simulate(s0, I_DEFAULT, dt, Math.round(T / dt)).w;
  const ref = run(0.02 / 16);
  const e1 = norm(sub(run(0.02), ref));
  const e2 = norm(sub(run(0.01), ref));
  const ratio = e1 / e2;
  assert.ok(ratio > 12 && ratio < 20, `error ratio ${ratio}, expected about 16`);
});

// ---------------------------------------------------------------------------
// Conservation over 1000 time units at the default step (CLAUDE.md ground truth 1-3).
// One long run per spin axis is shared by the three conservation tests.

const longRuns = new Map();
function longRun(axis) {
  if (longRuns.has(axis)) return longRuns.get(axis);
  const s0 = initialState(axis, OMEGA, EPS);
  const E0 = energy(s0.w, I_DEFAULT);
  const L20 = angularMomentumSq(s0.w, I_DEFAULT);
  const Lw0 = angularMomentumWorld(s0, I_DEFAULT);
  let dE = 0;
  let dL2 = 0;
  let dLw = 0;
  simulate(s0, I_DEFAULT, DEFAULT_DT, Math.round(1000 / DEFAULT_DT), (s) => {
    dE = Math.max(dE, Math.abs(energy(s.w, I_DEFAULT) - E0) / E0);
    dL2 = Math.max(dL2, Math.abs(angularMomentumSq(s.w, I_DEFAULT) - L20) / L20);
    dLw = Math.max(dLw, norm(sub(angularMomentumWorld(s, I_DEFAULT), Lw0)) / norm(Lw0));
  });
  const r = { dE, dL2, dLw };
  longRuns.set(axis, r);
  return r;
}

for (const axis of [1, 2, 3]) {
  test(`conservation (axis ${axis}): energy relative drift < 1e-6 over 1000 time units`, () => {
    const { dE } = longRun(axis);
    assert.ok(dE < TOL, `max relative energy drift ${dE}`);
  });

  test(`conservation (axis ${axis}): |L|^2 relative drift < 1e-6 over 1000 time units`, () => {
    const { dL2 } = longRun(axis);
    assert.ok(dL2 < TOL, `max relative |L|^2 drift ${dL2}`);
  });

  test(`conservation (axis ${axis}): world-frame L vector constant to 1e-6 over 1000 time units`, () => {
    // Strictest test of the orientation integration: rotate body L by q and compare as a vector.
    const { dLw } = longRun(axis);
    assert.ok(dLw < TOL, `max |L_world(t) - L_world(0)| / |L| = ${dLw}`);
  });
}

// ---------------------------------------------------------------------------
// Stability (CLAUDE.md ground truth 4): perturbation 1e-3, I = (1, 2, 3), Omega = 1, T = 200.
// For I = (1, 2, 3) the axis-2 flip happens at roughly ln(1/eps)/lambda = 6.9/0.577 = 12 time units,
// so T = 200 shows many flips while giving axes 1 and 3 plenty of time to misbehave.

function trackSpin(axis, I, eps, T) {
  const k = axis - 1;
  const others = [0, 1, 2].filter((i) => i !== k);
  const sign0 = Math.sign(OMEGA);
  let maxPerp = 0;
  let firstFlip = null;
  simulate(initialState(axis, OMEGA, eps), I, DEFAULT_DT, Math.round(T / DEFAULT_DT), (s, t) => {
    maxPerp = Math.max(maxPerp, Math.hypot(s.w[others[0]], s.w[others[1]]));
    if (firstFlip === null && Math.sign(s.w[k]) !== sign0) firstFlip = t;
  });
  return { maxPerp, firstFlip };
}

for (const axis of [1, 3]) {
  test(`stability: spin about axis ${axis} stays in a small neighbourhood`, () => {
    const { maxPerp, firstFlip } = trackSpin(axis, I_DEFAULT, EPS, 200);
    assert.equal(firstFlip, null, `spin component changed sign at t = ${firstFlip}`);
    // Linear theory gives an ellipse with semi-axes of order eps times O(1) inertia ratios.
    assert.ok(maxPerp < 10 * EPS, `max off-axis |w| = ${maxPerp}, bound ${10 * EPS}`);
  });
}

test('stability: spin about axis 2 flips (w2 changes sign)', () => {
  const { firstFlip } = trackSpin(2, I_DEFAULT, EPS, 200);
  assert.notEqual(firstFlip, null, 'w2 never changed sign');
});

test('stability: default perturbation flips promptly even when (eps, ., eps) is the decaying mode', () => {
  // For I = (0.5, 1.7, 2), lambda = 0.6 and the eigenvector ratio is 1. With a growing-mode part
  // of order eps the flip comes at about ln(1/eps)/lambda = 11.5; seeded only by round-off it
  // would take about ln(1e16)/lambda = 61. Require the first flip before 2 ln(1/eps)/lambda.
  const I = [0.5, 1.7, 2.0];
  const bound = (2 * Math.log(1 / EPS)) / growthRate(I, OMEGA);
  const { firstFlip } = trackSpin(2, I, EPS, 100);
  assert.ok(firstFlip !== null && firstFlip < bound, `first flip at ${firstFlip}, bound ${bound}`);
});

// ---------------------------------------------------------------------------
// Growth rate (CLAUDE.md ground truth 5).
// Start with a tiny perturbation (1e-8) so the linear regime is long, skip 3/lambda for the
// decaying mode exp(-lambda t) to die away, then least-squares fit ln|(w1, w3)| against t until
// the perturbation reaches 1e-4 * Omega (still well inside the linear regime).
// The perturbation is (1e-8, 0) in (w1, w3), NOT (1e-8, 1e-8): the linear system has growing and
// decaying eigenvectors d3/d1 = -/+ sqrt(I1 (I3 - I2) / (I3 (I2 - I1))), and when that ratio is 1
// (e.g. I = (0.5, 1.7, 2)) an equal perturbation lies exactly on the decaying eigenvector and only
// grows from round-off. A single nonzero component always has a growing-mode part.

function fittedGrowthRate(I, Omega) {
  const lambda = growthRate(I, Omega);
  const tStart = 3 / lambda;
  const ts = [];
  const ys = [];
  let s = { w: [1e-8, Omega, 0], q: [1, 0, 0, 0] };
  let t = 0;
  while (true) {
    s = rk4Step(s, I, DEFAULT_DT);
    t += DEFAULT_DT;
    const p = Math.hypot(s.w[0], s.w[2]);
    if (p > 1e-4 * Math.abs(Omega)) break;
    if (t >= tStart) {
      ts.push(t);
      ys.push(Math.log(p));
    }
  }
  const n = ts.length;
  const mt = ts.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < n; i++) {
    sxy += (ts[i] - mt) * (ys[i] - my);
    sxx += (ts[i] - mt) ** 2;
  }
  return { fitted: sxy / sxx, lambda, nPoints: n };
}

for (const [I, Omega] of [
  [[1, 2, 3], 1],
  [[1, 2, 3], 2.5],
  [[0.5, 1.7, 2.0], 1],
  [[1, 1.1, 5], 3],
]) {
  test(`growth rate: I = (${I}), Omega = ${Omega} matches linear theory within 5%`, () => {
    const { fitted, lambda, nPoints } = fittedGrowthRate(I, Omega);
    assert.ok(nPoints > 100, `too few points in fit window (${nPoints})`);
    const rel = Math.abs(fitted - lambda) / lambda;
    assert.ok(rel < 0.05, `fitted ${fitted}, theory ${lambda}, relative error ${rel}`);
  });
}

// ---------------------------------------------------------------------------
// Degenerate case (CLAUDE.md ground truth 6): two equal moments, a symmetric top.
// With I1 = I2 Euler's third equation gives dw3/dt = 0 exactly, so w3 stays at eps and (w1, w2)
// just precess slowly at rate (I3 - I1) w3 / I1 (here ~2e-3 rad/time). No exponential growth,
// no flip. Similarly for I2 = I3 with w1 constant. Over T = 200 the slow precession turns
// (w1, w2) by at most ~0.4 rad, so w2 keeps its sign; the asymmetric body flips at t ~ 12.

for (const [I, symAxis] of [
  [[1, 1, 3], 3],
  [[1, 3, 3], 1],
]) {
  test(`degenerate: I = (${I}) spun about axis 2 does not flip`, () => {
    assert.equal(growthRate(I, OMEGA), 0);
    const k = symAxis - 1;
    // Perturb both off-axis components so the symmetry-axis component is nonzero and the
    // precession is actually exercised (initialState perturbs only one component).
    const s = { w: [EPS, OMEGA, EPS], q: [1, 0, 0, 0] };
    const c0 = s.w[k];
    let maxDev = 0;
    let flipped = false;
    simulate(s, I, DEFAULT_DT, Math.round(200 / DEFAULT_DT), (st) => {
      maxDev = Math.max(maxDev, Math.abs(st.w[k] - c0));
      if (st.w[1] <= 0) flipped = true;
    });
    assert.equal(flipped, false, 'w2 changed sign');
    assert.ok(maxDev < 1e-15, `symmetry-axis component drifted by ${maxDev}`);
  });
}

// ---------------------------------------------------------------------------
// Stretch: exact solution (Jacobi elliptic functions).

test('jacobi: identities sn^2 + cn^2 = 1, dn^2 + m sn^2 = 1, and limits', () => {
  for (const m of [0, 0.1, 0.5, 0.9, 0.999999, 1]) {
    for (const u of [-3.1, -0.4, 0, 0.7, 2.2, 10]) {
      const { sn, cn, dn } = jacobiEllipticSNCNDN(u, m);
      close(sn * sn + cn * cn, 1, 1e-14, `m=${m} u=${u}`);
      close(dn * dn + m * sn * sn, 1, 1e-14, `m=${m} u=${u}`);
    }
  }
  const z = jacobiEllipticSNCNDN(0.7, 0);
  close(z.sn, Math.sin(0.7), 1e-15);
  const o = jacobiEllipticSNCNDN(0.7, 1);
  close(o.sn, Math.tanh(0.7), 1e-15);
});

test('jacobi: derivatives sn\' = cn dn, cn\' = -sn dn, dn\' = -m sn cn (finite differences)', () => {
  const h = 1e-5;
  for (const m of [0.2, 0.7, 0.95]) {
    for (const u of [0.3, 1.5, 4.0]) {
      const p = jacobiEllipticSNCNDN(u + h, m);
      const q = jacobiEllipticSNCNDN(u - h, m);
      const c = jacobiEllipticSNCNDN(u, m);
      close((p.sn - q.sn) / (2 * h), c.cn * c.dn, 1e-9, `sn' m=${m} u=${u}`);
      close((p.cn - q.cn) / (2 * h), -c.sn * c.dn, 1e-9, `cn' m=${m} u=${u}`);
      close((p.dn - q.dn) / (2 * h), -m * c.sn * c.cn, 1e-9, `dn' m=${m} u=${u}`);
    }
  }
});

test('exact solution satisfies Euler\'s equations', () => {
  const I = [1, 2, 3];
  const exact = exactOmega([0.4, 0, 1.0], I);
  const h = 1e-5;
  for (const t of [0.3, 2.0, 7.5]) {
    const dw = sub(exact(t + h), exact(t - h)).map((x) => x / (2 * h));
    const rhs = eulerRHS(exact(t), I);
    dw.forEach((x, i) => close(x, rhs[i], 1e-8, `t=${t} component ${i + 1}`));
  }
});

for (const [w0, I, label] of [
  [[0.4, 0, 1.0], [1, 2, 3], 'far from separatrix'],
  [[-1.0, 0, 0.6], [1, 2, 3], 'near separatrix (m close to 1), negative w1'],
  [[0.3, 0, -2.0], [0.5, 1.7, 2.0], 'other inertia, negative w3'],
]) {
  test(`exact solution: RK4 matches Jacobi solution over 50 time units (${label})`, () => {
    const exact = exactOmega(w0, I);
    const scale = norm(w0);
    let maxErr = 0;
    simulate({ w: w0, q: [1, 0, 0, 0] }, I, DEFAULT_DT, Math.round(50 / DEFAULT_DT), (s, t) => {
      maxErr = Math.max(maxErr, norm(sub(s.w, exact(t))) / scale);
    });
    assert.ok(maxErr < 1e-8, `max relative error ${maxErr}`);
  });
}
