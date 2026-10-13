// Glue: reads the controls, owns the simulation state, steps the physics on a fixed step
// independent of the frame rate, and hands the result to the renderer.

import {
  DEFAULT_DT,
  advance,
  angularMomentumWorld,
  growthRate,
  initialState,
  momentsFromArms,
} from './physics.js';
import { createScene } from './render.js';

const $ = (id) => document.getElementById(id);
const MAX_STEPS_PER_FRAME = 20000;

const view = createScene($('scene'));

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
  t: 0,
  carry: 0,
  flips: 0,
  lastSign: 1,
};
if (params.has('speed')) $('speed').value = Math.log10(Number(params.get('speed')) || 1);

function readControls() {
  sim.arms = ['a1', 'a2', 'a3'].map((id) => Number($(id).value));
  sim.I = momentsFromArms(sim.arms);
  sim.omega = Number($('omega').value);
  sim.eps = 10 ** Number($('eps').value);
  sim.speed = 10 ** Number($('speed').value);
  ['a1', 'a2', 'a3'].forEach((id, k) => ($(`${id}`).nextElementSibling.textContent = sim.arms[k].toFixed(2)));
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

function reset() {
  readControls();
  sim.state = initialState(sim.axis, sim.omega, sim.eps);
  sim.t = 0;
  sim.carry = 0;
  sim.flips = 0;
  sim.lastSign = Math.sign(sim.omega);
  view.setArms(sim.arms);
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
  view.update(sim.state.q, angularMomentumWorld(sim.state, sim.I));
  $('t').textContent = sim.t.toFixed(2);
  $('w').textContent = sim.state.w.map((x) => x.toFixed(3)).join(', ');
  $('flips').textContent = String(sim.flips);
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
    const r = advance(sim.state, sim.I, DEFAULT_DT, realDt * sim.speed, sim.carry, MAX_STEPS_PER_FRAME);
    sim.state = r.state;
    sim.carry = r.carry;
    sim.t += r.steps * DEFAULT_DT;
    // Count sign changes of the spin-axis component (a flip of the body).
    const sign = Math.sign(sim.state.w[sim.axis - 1]);
    if (sign !== 0 && sign !== sim.lastSign) {
      sim.flips++;
      sim.lastSign = sign;
    }
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

reset();
requestAnimationFrame(frame);
