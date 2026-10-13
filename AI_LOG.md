# AI Log

Disclosure log for AI-assisted work on this project (Claude Code, model Claude Opus 5.5).

## Milestone 1: physics core and tests (2026-10-13)

**Asked:** Propose a plan for the physics core and tests, then implement `src/physics.js` and
`tests/physics.test.mjs`, run the tests and show the output.

**Produced:**
- `src/physics.js`: Euler's equations, quaternion helpers (scalar-first, body to world,
  `dq/dt = 0.5 q (0, w_body)`), RK4 on the combined (w, q) state with renormalisation of q,
  energy, |L|^2, world-frame L, initial conditions, linear growth rate, and (stretch) Jacobi
  elliptic functions (AGM method, Abramowitz & Stegun 16.4) with the exact solution from
  Landau & Lifshitz section 37. Conventions are written as comments at the top of the file.
  Default step `dt = 1e-3`.
- `tests/physics.test.mjs`: 28 tests using `node:test` (no dependencies).

**Checked and how:** every ground-truth item in CLAUDE.md has an automated test:
- Energy, |L|^2 and the world-frame L vector over 1000 time units at dt = 1e-3, for spin about
  each axis. Measured max relative drift is about 1e-13 (tolerance 1e-6).
- Stability: perturbation 1e-3, T = 200. Axes 1 and 3 never change sign and stay within 10 eps.
  Axis 2 flips.
- Growth rate: least-squares fit of ln|(w1, w3)| in the linear regime for four (I, Omega) sets.
  All are within 5% of `Omega sqrt((I3-I2)(I2-I1)/(I1 I3))`.
- Degenerate: I = (1,1,3) and (1,3,3) spun about axis 2 do not flip, and the symmetry-axis
  component stays constant.
- Stretch: the elliptic functions satisfy their identities and derivative relations, the exact
  solution satisfies Euler's equations, and RK4 matches it to relative error < 1e-8 over 50
  time units, including a near-separatrix case (m about 0.93).
- Extra checks: quaternion sign convention (constant spin about z gives rotation by Omega t
  about z) and RK4 order (error ratio about 16 when dt is halved).

**What was wrong and had to be fixed:**
- The first run had one failure: the growth-rate test for I = (0.5, 1.7, 2) fitted 0.246 against
  a theory value of 0.600. Cause: the test's initial perturbation (eps, Omega, eps) lies exactly
  on the *decaying* eigenvector of the linearised system for these moments (the eigenvector
  ratio is 1), so the perturbation shrank before growing from round-off. This was a flaw in the
  test setup, not the physics. The fix changed the test to a generic perturbation (eps, Omega, 0).
  **The tolerance was not changed.** The reason is documented in a comment in the test.
  The user approved this test change ("commit the fix") before it was committed.
- Open point for later milestones: `initialState` uses equal perturbations on both off-axis
  components, so for some inertia sets the UI's axis-2 flip would be delayed in the same way.
  Consider an asymmetric default perturbation when building the controls.
- Tooling: Node.js was not installed. Node v22.11.0 (checksum verified) was downloaded to a
  temporary directory to run the tests. On Node 22, `node --test tests/` does not accept a
  directory, so the tests were run with `node --test tests/*.test.mjs`.

**Written by hand:** nothing yet.

## Follow-up fixes after milestone 1 (2026-10-13)

**Asked:** Commit the fix and resolve the open issues.

**Produced:**
- `initialState` now perturbs only one off-axis component by eps: w2 for spin about axis 1,
  and w1 for spin about axes 2 and 3. A single component always contains part of the growing
  mode. The reason is in the code comment.
- New test: with I = (0.5, 1.7, 2) and eps = 1e-3, the default start must flip before
  2 ln(1/eps)/lambda, which is 23 time units.
- The degenerate-case tests now build their (eps, Omega, eps) start explicitly. With the new
  `initialState`, the I = (1,1,3) case would have w3 = 0, making it a steady spin and so a
  trivial test.
- CLAUDE.md test command changed to `node --test tests/*.test.mjs` (Node 22 compatibility).

**Checked:** 29/29 tests pass. Running the old perturbation through the same setup gives a first
flip at t = 79.9, which would fail the new test. The new perturbation flips at t = 13.5, so the
test does distinguish the two.

## Milestone 2: 3D view and controls (2026-10-13)

**Asked:** Build the 3D view and controls. The physics tests must still pass.

**Produced:**
- `src/physics.js`, two additions (both pure and tested):
  - `momentsFromArms`: the body is three thin uniform rods along the body axes, centred on the
    origin, so `I1 = (a2^3 + a3^3)/12` and cyclic. The longest arm lies along the
    smallest-moment axis.
  - `advance`: a fixed-step driver that carries leftover time between frames, so results do
    not depend on frame rate.
- `src/render.js`: Three.js 0.160 (cdnjs ES module) scene.
  - Arms are coloured by axis, with a massless sphere on each + end so 180 degree flips are
    visible on this symmetric body.
  - A world-frame L arrow is recomputed from the state every frame.
  - Simple drag-orbit and wheel-zoom camera.
  - The physics world frame is used unchanged as the Three.js frame.
- `src/main.js` + `index.html`:
  - One-click "spin about axis 1/2/3" buttons, labelled smallest/intermediate/largest I.
  - Sliders: arm lengths, which set I1..I3 so the drawn shape always matches the simulated
    moments; spin rate; perturbation on a log scale; simulation speed on a log scale.
  - Pause, Reset and keyboard shortcuts.
  - Readout of t, w, I, lambda and a flip counter (sign changes of the spin-axis component).
  - Light and dark themes; the layout stacks on narrow screens.
- `src/main.js` is a new file not in the CLAUDE.md layout; it holds the glue between the
  controls, physics and rendering.

**Checked and how:**
- 34/34 physics tests pass. New tests cover:
  - `momentsFromArms`: the single-rod `m a^2/12` result, the ordering, and equal arms
    giving equal moments.
  - The default (3, 2, 1) body: it flips about axis 2 and is stable about 1 and 3.
  - `advance`: the same 10 time units split into 60 fps frames, 7 fps frames or a single
    frame gives a bit-identical state and exactly 10000 steps. `maxSteps` caps work.
- Browser check: Chrome headless shell 131 was downloaded to a temporary directory (it is not
  a project dependency) and driven over the DevTools protocol in real time at 5x speed for
  about 50 time units per axis.
  - Axis 1: 0 flips. Axis 2: 5 flips. Axis 3: 0 flips. No page errors.
  - Screenshots confirmed the arms are coloured, the L arrow stays fixed, and a flip turns
    the green +2 tip from up to down (w2 = -3.000).

**What was wrong and had to be fixed:**
- Headless Chrome's `--virtual-time-budget` does not drive `requestAnimationFrame`, so the
  first automated check showed t = 0. It was replaced by a real-time DevTools-protocol run.
- The tip spheres were oversized relative to the short arm 3 and were shrunk.

**Written by hand:** nothing yet.

**Assumptions to flag:** the "T-handle" is modelled as a symmetric three-arm cross (centred
rods) rather than a one-sided T. This keeps the body frame the principal frame with the centre
of mass at the origin. Rod thickness and the tip markers are left out of the inertia.

## Milestone 3 and finalisation: plots, README, repository (2026-10-13)

**Asked:** Write the README, finalise the folder, and commit to the repository under the
username A6ENT-H4WK3YE.

**Interpretation:** CLAUDE.md's definition of done requires the w time series and the
conservation-drift display, so the plots (milestone 3, including the stretch polhode) were built
before the README.

**Produced:**
- `src/plots.js` (2D canvas):
  - A line chart with a hover crosshair and tooltip, used for w1..w3 over the last 30 time units
    and for the log-scale relative drift of E, |L| and the world L vector with the 1e-6
    tolerance line.
  - A polhode view: w on the energy ellipsoid seen down axis 3. The background trajectories and
    separatrix are closed-form curves, derived in the code comment by eliminating one component
    between the energy and |L|^2 equations.
- `src/main.js`: samples every 20 physics steps (not every frame). The drift history is
  decimated when long. The state table shows the maximum drift so far.
- `advance` gained an optional `onStep` callback, and its test checks the callback count.
- Colours were replaced after a colour-blindness check (see below) and moved to CSS tokens with
  separate light and dark values. The 3D body reads the same tokens.
- `README.md`: how to run it, the controls, the physics and conventions, the full verification
  table, and limitations.

**Checked and how:**
- 34/34 physics tests pass.
- Headless Chrome, real time at 5x speed for about 40 time units per axis:
  - Axis 2 flipped 4 times; axes 1 and 3 flipped 0 times.
  - Maximum drift was 8e-14 (E), 4e-14 (|L|) and 9e-13 (L vector). No page errors.
- Light and dark screenshots were inspected:
  - The polhode trail for axis 2 lies on the separatrix through +2 and -2.
  - For axis 1 the polhode point stays at +1.
- Palettes were checked with a colour-vision-deficiency validator (OKLab Delta E) in both modes.

**What was wrong and had to be fixed:**
- The milestone 2 axis colours (red, green, blue) failed the colour-blindness check: axis 1 and
  axis 2 were almost indistinguishable for deuteranopes (Delta E 0.7). They were replaced with
  blue, orange and aqua, which pass in both modes.
- Time-series lines were drawn past the left edge of the axis, because buffers are trimmed lazily.
  Fixed by clipping to the plot area.
- Log-axis ticks fell on 1e-17, 1e-13 and so on; they were realigned to 1e-16, 1e-12, ...

**Written by hand:** nothing.
