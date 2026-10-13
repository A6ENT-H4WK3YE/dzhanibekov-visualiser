# Dzhanibekov Effect Visualiser

An interactive browser tool showing the "tennis racket flip". A rigid body spinning freely about
its **intermediate** principal axis periodically flips over by 180 degrees. Spin about the axis of
largest or smallest moment of inertia is stable.

Open the page, press **Axis 2** and watch the body flip. Then press **Axis 1** or **Axis 3** and
watch it stay put.

## Running it

ES modules do not load from `file://`, so serve the folder locally:

```sh
python3 -m http.server 8000
# then open http://localhost:8000
```

Three.js 0.160 is loaded from cdnjs, so the first load needs an internet connection. There is
no build step and nothing to install.

To run the physics tests you need Node.js 18 or newer (developed with Node 22):

```sh
node --test tests/*.test.mjs
```

On Node 22, `node --test tests/` (passing a directory) does not work; use the glob above.

## What you see

| Panel | Shows |
|---|---|
| 3D view | The body: three perpendicular arms, coloured by principal axis (1 blue, 2 orange, 3 green). A ball marks the + end of each arm so a 180 degree flip is visible. The violet arrow is the angular momentum **L** in the world frame; it should never move. Drag to orbit, scroll to zoom. |
| Body-frame angular velocity | ω₁, ω₂, ω₃ over the last 30 time units. A flip appears as the spin component changing sign. Hover for values. |
| Conservation drift | Relative drift of the energy E, of the magnitude \|L\| and of the world-frame L vector since t = 0, on a log scale. The dashed line is the test tolerance of 1e-6. |
| Polhode | The path of ω on the energy ellipsoid, viewed down axis 3 and scaled so the ellipsoid is the unit circle. Grey curves are the closed-form trajectories for this body; the dashed curve is the separatrix through ±axis 2. |
| State | t, ω, the moments I₁ to I₃, the linear growth rate λ for the chosen axis, a flip counter, and the maximum drift of each conserved quantity so far. |

### Controls

- **Spin about axis 1 / 2 / 3** restarts the run spinning about that axis. Each button is labelled
  smallest, intermediate or largest I for the current body.
- **Arm 1 to 3** set the arm lengths, which set the moments of inertia (see below). The drawn shape
  always matches the simulated moments.
- **Spin rate Ω** sets the initial spin about the chosen axis.
- **Perturbation** is a small initial angular velocity about one other axis, from 1e-8 to 1e-1.
  Smaller values delay the first flip.
- **Sim speed** scales simulated time relative to real time, from 0.1x to 10x.
- **Pause** and **Reset**. Keys: `1` `2` `3` choose an axis, space pauses, `r` resets.
- URL parameters preselect a demo, for example `?axis=2&speed=3`.

## The physics

A torque-free rigid body with principal moments I₁, I₂, I₃ obeys Euler's equations in the body
frame (Landau & Lifshitz, *Mechanics*, eq. 36.5):

    I1 dw1/dt = (I2 - I3) w2 w3
    I2 dw2/dt = (I3 - I1) w3 w1
    I3 dw3/dt = (I1 - I2) w1 w2

Orientation is a unit quaternion q (body to world) with `dq/dt = 0.5 q (0, w)`, w in the body
frame. Both are integrated together with classical RK4 at a fixed step `dt = 1e-3`, and q is
renormalised after each step. The step size does not depend on the frame rate: each animation
frame runs a whole number of steps and carries the remainder to the next frame.

**Body model.** The body is three thin uniform rods along the body axes, each centred on the
origin, with mass proportional to length. A rod of mass m and length a has moment m a²/12 about a
perpendicular axis through its centre, so

    I1 = (a2³ + a3³)/12,  I2 = (a1³ + a3³)/12,  I3 = (a1³ + a2³)/12.

The longest arm lies along the axis of smallest moment. The default arms (3, 2, 1) give
I = (0.75, 2.33, 2.92).

**Conventions.** Units are dimensionless. Quaternions are scalar-first `[w, x, y, z]`, Hamilton
product. The physics world frame is used unchanged as the Three.js world frame. All conventions
are written out at the top of `src/physics.js`.

## What was verified

All checks below are automated in `tests/physics.test.mjs` (34 tests, all passing, about 2.5 s).

| Property | How it is checked | Result |
|---|---|---|
| Energy conserved | Max relative drift over 1000 time units at dt = 1e-3, spin about each axis | about 1e-13 (tolerance 1e-6) |
| \|L\|² conserved | Same | about 1e-13 (tolerance 1e-6) |
| World-frame L constant **as a vector** | Body L rotated by q, compared component-wise with its t = 0 value | about 1e-13 (tolerance 1e-6) |
| Axes 1 and 3 stable | Perturbation 1e-3 over 200 time units: spin component never changes sign, off-axis part stays below 10x the perturbation | pass |
| Axis 2 unstable | Same setup: ω₂ changes sign | pass |
| Growth rate | Least-squares fit of the early exponential growth against λ = Ω √((I₃−I₂)(I₂−I₁)/(I₁I₃)), for four inertia and Ω sets | within 5% |
| Symmetric top does not flip | I = (1,1,3) and (1,3,3) spun about axis 2: no sign change, symmetry-axis component exactly constant | pass |
| Exact solution (stretch) | RK4 against the Jacobi elliptic solution (Landau & Lifshitz section 37) over 50 time units, including a near-separatrix case | relative error < 1e-8 |
| Integrator order | Halving dt reduces the error by about 16 | pass |
| Quaternion convention | Steady spin about z gives rotation by Ωt about z | pass |
| Frame-rate independence | The same 10 time units in 60 fps frames, 7 fps frames or a single frame give a bit-identical state | pass |
| Body model | Single rod gives m a²/12; ordering and equal-arm cases; default body flips about 2 only | pass |
| Default perturbation | Flips promptly even for inertia sets where an equal two-component perturbation lies on the decaying mode | pass |

**In the browser.** The page was loaded in headless Chrome and run in real time for about 40 time
units per axis at 5x speed. Axis 2 flipped 4 times, axes 1 and 3 never flipped, and there were no
page errors. Drift readouts stayed at or below 1e-12. Screenshots in light and dark mode were
inspected for layout, colours, a fixed L arrow and the flip of the orange +2 tip.

**Colours.** The axis and drift palettes were checked with a colour-vision-deficiency validator
in both light and dark mode. Every plot line also has a direct text label, so identity never
relies on colour alone.

## Limitations and assumptions

- The "T-handle" is modelled as a symmetric three-arm cross. A one-sided T would move the centre
  of mass off the hub and is not modelled.
- Rod thickness and the tip balls are left out of the inertia; the balls are visual markers only.
- The polhode background curves assume I₁ < I₂ < I₃. For other orderings, or equal moments, only
  the simulated trail is drawn.
- The flip counter counts sign changes of the spin component once per frame, which is ample at
  the available speeds.

## Files

    index.html              page, layout and controls
    src/physics.js          Euler equations, quaternions, RK4, conserved quantities, exact solution (pure, no DOM)
    src/render.js           Three.js scene and the body model
    src/plots.js            time series, conservation and polhode plots (2D canvas)
    src/main.js             glue: controls, fixed-step loop, sampling
    tests/physics.test.mjs  physics tests (node:test, no dependencies)
    AI_LOG.md               disclosure log of AI assistance
    CLAUDE.md               project brief and working rules

## AI disclosure

This project was built with an AI coding agent (Claude Code). `AI_LOG.md` records what was asked
at each milestone, what was produced, how it was checked, and what had to be fixed, following
the European Commission's living guidelines on responsible use of generative AI in research.
