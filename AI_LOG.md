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
