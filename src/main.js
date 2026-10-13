// Glue: reads the controls, owns the simulation state, steps the physics on a fixed step
// independent of the frame rate, samples it for the plots, and hands the result to the renderer.

import {
  DEFAULT_DT,
  advance,
  angularMomentumSq,
  angularMomentumWorld,
  energy,
  growthRate,
  initialState,
  momentsFromArms,
} from './physics.js';
import { createScene } from './render.js';
import { LinePlot, PolhodePlot } from './plots.js';

const $ = (id) => document.getElementById(id);
const MAX_STEPS_PER_FRAME = 20000;
const SAMPLE_EVERY = 20; // physics steps between plot samples (0.02 time units at dt = 1e-3)
const WINDOW = 30; // time-series window, time units
const TRAIL = 3000; // polhode trail length, samples
const DRIFT_MAX_POINTS = 2000; // drift history is halved (decimated) when it grows past this
const FLOOR = 1e-17; // drift values are clamped here for the log plot (0 has no logarithm)

const view = createScene($('scene'));
const plotW = new LinePlot($('plot-w'), {
  series: [
    { label: 'ω₁', colourVar: '--c1' },
    { label: 'ω₂', colourVar: '--c2' },
    { label: 'ω₃', colourVar: '--c3' },
  ],
  format: (v) => v.toFixed(4),
});
const plotDrift = new LinePlot($('plot-drift'), {
  series: [
    { label: 'E', colourVar: '--cE' },
    { label: '|L|', colourVar: '--cL' },
    { label: 'L vec', colourVar: '--cLv' },
  ],
  log: true,
  yFixed: [-17, -4],
  logTickStep: 4,
  refLines: [{ y: 1e-6, label: 'tolerance 1e-6' }],
  format: (v) => (v > FLOOR ? v.toExponential(2) : `< ${FLOOR.toExponential(0)}`),
});
const plotPolhode = new PolhodePlot($('plot-polhode'));

// URL parameters (e.g. ?axis=2&speed=3) preselect a configuration; handy for sharing a demo.
const params = new URLSearchParams(location.search);
const sim = {
  axis: [1, 2, 3].includes(Number(params.get('axis'))) ? Number(params.get('axis')) : 2,
  arms: [3, 2, 1],
  I: [1, 1, 1],
  omega: 3,
  eps: 1e-3,
  speed: 1,
  paused: false,
  state: null,
  step: 0,
  carry: 0,
  flips: 0,
  lastSign: 1,
};
if (params.has('speed')) $('speed').value = Math.log10(Number(params.get('speed')) || 1);

// Sample buffers, refilled on reset.
let buf;
function clearBuffers() {
  buf = {
    tsX: [],
    tsW: [[], [], []],
    driftX: [],
    drift: [[], [], []],
    driftEvery: 100, // physics steps between drift samples; doubles on each decimation
    max: [0, 0, 0],
    trail: [],
    ref: null,
  };
}

function colours() {
  const v = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  return { axes: [v('--c1'), v('--c2'), v('--c3')], L: v('--cLv') };
}

function readControls() {
  sim.arms = ['a1', 'a2', 'a3'].map((id) => Number($(id).value));
  sim.I = momentsFromArms(sim.arms);
  sim.omega = Number($('omega').value);
  sim.eps = 10 ** Number($('eps').value);
  sim.speed = 10 ** Number($('speed').value);
  ['a1', 'a2', 'a3'].forEach((id, k) => ($(id).nextElementSibling.textContent = sim.arms[k].toFixed(2)));
  $('omega').nextElementSibling.textContent = sim.omega.toFixed(1);
  $('eps').nextElementSibling.textContent = `1e${Number($('eps').value)}`;
  $('speed').nextElementSibling.textContent = `${sim.speed.toPrecision(2)}×`;
}

// Rank of each moment: label the axis buttons smallest / intermediate / largest.
function rankLabels(I) {
  return I.map((x, k) => {
    const others = I.filter((_, j) => j !== k);
    if (others.some((y) => Math.abs(y - x) < 1e-9 * Math.max(...I))) return 'equal I';
    const below = others.filter((y) => y < x).length;
    return ['smallest I', 'intermediate I', 'largest I'][below];
  });
}

// Linear growth rate for spin about any axis: put the spin axis in the middle slot of
// growthRate (its formula is symmetric in the two outer moments). Zero means stable.
function lambdaFor(axis, I, omega) {
  const k = axis - 1;
  const [i, j] = [0, 1, 2].filter((x) => x !== k);
  return growthRate([I[i], I[k], I[j]], omega);
}

// Relative drifts of E, |L| and the world-frame L vector against their t = 0 values.
function drifts(s) {
  const { E0, L0, Lw0 } = buf.ref;
  const Lw = angularMomentumWorld(s, sim.I);
  return [
    Math.abs(energy(s.w, sim.I) - E0) / E0,
    Math.abs(Math.sqrt(angularMomentumSq(s.w, sim.I)) - L0) / L0,
    Math.hypot(Lw[0] - Lw0[0], Lw[1] - Lw0[1], Lw[2] - Lw0[2]) / L0,
  ];
}

// Polhode coordinates: w scaled so the energy ellipsoid is the unit sphere (see plots.js).
function polhodePoint(w) {
  const twoE = 2 * buf.ref.E0;
  return [w[0] * Math.sqrt(sim.I[0] / twoE), w[1] * Math.sqrt(sim.I[1] / twoE)];
}

function sample(s) {
  const t = sim.step * DEFAULT_DT;
  buf.tsX.push(t);
  s.w.forEach((v, k) => buf.tsW[k].push(v));
  buf.trail.push(polhodePoint(s.w));
  const d = drifts(s);
  d.forEach((v, k) => (buf.max[k] = Math.max(buf.max[k], v)));
  if (sim.step % buf.driftEvery === 0) {
    buf.driftX.push(t);
    d.forEach((v, k) => buf.drift[k].push(v));
    if (buf.driftX.length > DRIFT_MAX_POINTS) {
      const keep = (_, i) => i % 2 === 0;
      buf.driftX = buf.driftX.filter(keep);
      buf.drift = buf.drift.map((a) => a.filter(keep));
      buf.driftEvery *= 2;
    }
  }
}

function onStep(s) {
  sim.step++;
  if (sim.step % SAMPLE_EVERY === 0) sample(s);
}

function trimBuffers() {
  const t = sim.step * DEFAULT_DT;
  let cut = 0;
  while (cut < buf.tsX.length && buf.tsX[cut] < t - WINDOW) cut++;
  if (cut > 500) {
    buf.tsX.splice(0, cut);
    buf.tsW.forEach((a) => a.splice(0, cut));
  }
  if (buf.trail.length > TRAIL + 500) buf.trail.splice(0, buf.trail.length - TRAIL);
}

function reset() {
  readControls();
  sim.state = initialState(sim.axis, sim.omega, sim.eps);
  sim.step = 0;
  sim.carry = 0;
  sim.flips = 0;
  sim.lastSign = Math.sign(sim.omega);
  clearBuffers();
  buf.ref = {
    E0: energy(sim.state.w, sim.I),
    L0: Math.sqrt(angularMomentumSq(sim.state.w, sim.I)),
    Lw0: angularMomentumWorld(sim.state, sim.I),
  };
  sample(sim.state);
  view.setArms(sim.arms, colours());
  plotPolhode.setBody(sim.I);
  const labels = rankLabels(sim.I);
  document.querySelectorAll('.axis-buttons button').forEach((b) => {
    const a = Number(b.dataset.axis);
    b.classList.toggle('active', a === sim.axis);
    b.querySelector('small').textContent = labels[a - 1];
  });
  $('I').textContent = sim.I.map((x) => x.toFixed(3)).join(', ');
  const lam = lambdaFor(sim.axis, sim.I, sim.omega);
  $('lambda').textContent = lam > 0 ? lam.toFixed(3) : '0 (stable)';
  draw();
}

function draw() {
  const t = sim.step * DEFAULT_DT;
  view.update(sim.state.q, angularMomentumWorld(sim.state, sim.I));
  $('t').textContent = t.toFixed(2);
  $('w').textContent = sim.state.w.map((x) => x.toFixed(3)).join(', ');
  $('flips').textContent = String(sim.flips);
  ['dE', 'dL', 'dLv'].forEach((id, k) => ($(id).textContent = buf.max[k].toExponential(1)));
  plotW.setData(buf.tsX, buf.tsW, [Math.max(0, t - WINDOW), Math.max(WINDOW, t)]);
  plotDrift.setData(buf.driftX, buf.drift, [0, Math.max(t, 1)]);
  plotPolhode.setTrail(buf.trail);
}

function setPaused(p) {
  sim.paused = p;
  $('pause').textContent = p ? 'Resume' : 'Pause';
}

let lastFrame = performance.now();
function frame(now) {
  // Clamp real elapsed time so returning to a background tab does not jump the simulation.
  const realDt = Math.min((now - lastFrame) / 1000, 0.1);
  lastFrame = now;
  if (!sim.paused) {
    const r = advance(sim.state, sim.I, DEFAULT_DT, realDt * sim.speed, sim.carry, MAX_STEPS_PER_FRAME, onStep);
    sim.state = r.state;
    sim.carry = r.carry;
    // Count sign changes of the spin-axis component (a flip of the body).
    const sign = Math.sign(sim.state.w[sim.axis - 1]);
    if (sign !== 0 && sign !== sim.lastSign) {
      sim.flips++;
      sim.lastSign = sign;
    }
    trimBuffers();
  }
  draw();
  requestAnimationFrame(frame);
}

// Controls.
document.querySelectorAll('.axis-buttons button').forEach((b) =>
  b.addEventListener('click', () => {
    sim.axis = Number(b.dataset.axis);
    reset();
  }),
);
['a1', 'a2', 'a3', 'omega', 'eps'].forEach((id) => $(id).addEventListener('input', reset));
$('speed').addEventListener('input', readControls);
$('pause').addEventListener('click', () => setPaused(!sim.paused));
$('reset').addEventListener('click', reset);
window.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement && e.key !== ' ') return;
  if (['1', '2', '3'].includes(e.key)) {
    sim.axis = Number(e.key);
    reset();
  } else if (e.key === ' ') {
    e.preventDefault();
    setPaused(!sim.paused);
  } else if (e.key === 'r') {
    reset();
  }
});
// Re-colour the 3D body when the system switches between light and dark mode.
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => view.setArms(sim.arms, colours()));

reset();
requestAnimationFrame(frame);
