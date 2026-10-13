# Dzhanibekov Effect Visualiser

An interactive browser tool showing the "tennis racket flip": a rigid body spinning freely about its
intermediate principal axis periodically flips over, while spin about the largest or smallest axis is
stable. Built for the PhD agentic coding session (Wednesday). Time budget: roughly one to two hours.

## The problem

A torque-free rigid body with principal moments of inertia I1 < I2 < I3 obeys Euler's equations
(body frame, angular velocity w = (w1, w2, w3)):

    I1 dw1/dt = (I2 - I3) w2 w3
    I2 dw2/dt = (I3 - I1) w3 w1
    I3 dw3/dt = (I1 - I2) w1 w2

Spin about axis 1 or axis 3 is stable. Spin about axis 2 (intermediate) is unstable: a tiny
perturbation grows until the body flips by 180 degrees, then returns, repeating periodically.

Orientation is tracked with a unit quaternion q (body to world):

    dq/dt = 0.5 * q * (0, w)        (quaternion product, w in body frame)

Renormalise q after every step.

## What the tool must show

1. **3D view** of a generic T-handle (three perpendicular arms of different lengths, so the
   inertia ordering is visible) spinning in real time. Colour each arm by its principal axis.
   Draw the fixed world-frame angular momentum vector L as an arrow.
2. **Controls**: I1, I2, I3 (or arm lengths that set them), which axis to spin about
   (1, 2 or 3), spin rate, perturbation size, simulation speed, pause and reset.
3. **Time series plot** of w1, w2, w3 so the flips appear as sign changes in the spin component.
4. **Conservation panel** showing relative drift in energy and in |L| over time.
5. **Polhode view** (stretch goal): the path of w on the energy ellipsoid, showing that
   trajectories near axis 2 sit on the separatrix.

The "aha" moment must be reachable in one click: spin about axis 2, watch it flip; switch to
axis 1 or 3, watch it stay stable.

## Ground truth (how we know it is right)

Every one of these must be checked by an automated test, not by eye:

- **Energy** E = 0.5 * (I1 w1^2 + I2 w2^2 + I3 w3^2) is conserved. Relative drift < 1e-6 over
  1000 time units at the default step size.
- **Angular momentum magnitude** |L|^2 = (I1 w1)^2 + (I2 w2)^2 + (I3 w3)^2 is conserved, same tolerance.
- **World-frame L vector** (rotate body-frame L by q) is constant as a vector, not just in length.
  This is the strictest test that the orientation integration is correct.
- **Stability**: with a perturbation of 1e-3, spin about axis 1 and axis 3 stays within a small
  bounded neighbourhood; spin about axis 2 flips (w2 changes sign).
- **Growth rate**: for spin Omega about axis 2, the linearised perturbation grows as exp(lambda t) with

      lambda = Omega * sqrt( (I3 - I2) * (I2 - I1) / (I1 * I3) )

  The test fits the early exponential growth and must match lambda within 5 percent.
- **Degenerate case**: if two moments are equal the flip must not occur (symmetric top).
- **Stretch**: compare w(t) against the exact Jacobi elliptic function solution.

If a test fails, fix the physics. Never loosen a tolerance or edit a test to make it pass
without explaining why in the AI log and getting approval.

## Technical approach

- Plain HTML, CSS and JavaScript. No build step, no framework.
- Three.js for 3D, loaded from cdnjs. Plots drawn on a 2D canvas (or a small CDN plotting library).
- Integrator: RK4 for w and q with a fixed small step, several physics steps per animation frame.
  Keep the step size independent of the frame rate.
- **Physics is separate from rendering.** All physics lives in pure functions in `src/physics.js`
  (no DOM, no Three.js) so it can be tested in Node.

## File layout

    index.html            page, controls, layout
    src/physics.js        Euler equations, quaternion update, RK4, energy, L, helpers (pure)
    src/render.js         Three.js scene and the T-handle model
    src/plots.js          time series, conservation and polhode plots
    tests/physics.test.mjs
    AI_LOG.md             disclosure log (see below)
    README.md             what it is, how to run it, what was verified

## Commands

    node --test tests/*.test.mjs    # run physics tests (Node 22 does not accept a bare directory)
    python3 -m http.server 8000     # serve locally, then open http://localhost:8000

ES modules do not load from file://, so always use the local server.

## How to work on this project

Follow the session principles: **specify, verify, interrogate, disclose**.

- **Plan before code.** For any non-trivial step, propose a short plan and wait for approval.
- **Build in this order**: physics core, then tests (all passing), then 3D view, then plots and
  controls, then polish. Do not start rendering until the physics tests pass.
- **Small steps.** One milestone at a time, run the tests after each change, and commit with a clear
  message at each milestone.
- **Explain the physics.** When writing an equation or a test, state where it comes from.
  If unsure of a formula, say so rather than guessing.
- **Flag assumptions.** Units, sign conventions, frame conventions (body vs world) must be
  written down in comments in `src/physics.js`.
- **Do not** add dependencies beyond Three.js and one optional plotting library without asking.

## Disclosure

Keep `AI_LOG.md` up to date. For each milestone record: what was asked, what the agent produced,
what was checked and how, what was wrong and had to be fixed, and any parts written by hand.
This is the record for the Wednesday discussion and follows the European Commission's living
guidelines on responsible use of generative AI in research.

## Definition of done

- All tests in `tests/` pass.
- Spinning about axis 2 visibly flips; axes 1 and 3 visibly stay stable.
- Conservation drift is displayed and stays within tolerance during a long run.
- README explains how to run it and lists what was verified.
- AI_LOG.md is complete.
