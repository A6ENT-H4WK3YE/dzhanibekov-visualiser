// Physics core for the Dzhanibekov (tennis racket) visualiser.
// Pure functions only: no DOM, no Three.js, so this module can be tested in Node.
//
// CONVENTIONS (read these before changing anything)
// - Units: dimensionless. Moments of inertia I = [I1, I2, I3] in arbitrary mass*length^2 units,
//   time in arbitrary units, angular velocity in rad per time unit.
// - Body frame: axes 1, 2, 3 are the principal axes of the body. The interesting ordering is
//   I1 < I2 < I3, but nothing here enforces it (degenerate cases are allowed).
// - Angular velocity w = [w1, w2, w3] is ALWAYS expressed in the body frame.
// - Quaternion q = [qw, qx, qy, qz] (scalar first), unit length, rotates BODY -> WORLD:
//       v_world = q (0, v_body) q*
//   At t = 0, q = identity, so body and world frames coincide.
// - Orientation kinematics: dq/dt = 0.5 * q (0, w_body). The body-frame w multiplies on the
//   RIGHT; a world-frame w would multiply on the left.
// - State: { w: [w1, w2, w3], q: [qw, qx, qy, qz] }.

export const DEFAULT_DT = 1e-3;

// ---------------------------------------------------------------------------
// Euler's equations for a torque-free rigid body (body frame, principal axes):
//   I1 dw1/dt = (I2 - I3) w2 w3
//   I2 dw2/dt = (I3 - I1) w3 w1
//   I3 dw3/dt = (I1 - I2) w1 w2
// Source: Landau & Lifshitz, Mechanics, eq. (36.5) with zero torque.
export function eulerRHS(w, I) {
  const [w1, w2, w3] = w;
  const [I1, I2, I3] = I;
  return [
    ((I2 - I3) * w2 * w3) / I1,
    ((I3 - I1) * w3 * w1) / I2,
    ((I1 - I2) * w1 * w2) / I3,
  ];
}

// ---------------------------------------------------------------------------
// Quaternion helpers (Hamilton convention, scalar first).

export function quatMul(a, b) {
  const [aw, ax, ay, az] = a;
  const [bw, bx, by, bz] = b;
  return [
    aw * bw - ax * bx - ay * by - az * bz,
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
  ];
}

export function quatConj(q) {
  return [q[0], -q[1], -q[2], -q[3]];
}

export function quatNormalize(q) {
  const n = Math.hypot(q[0], q[1], q[2], q[3]);
  return [q[0] / n, q[1] / n, q[2] / n, q[3] / n];
}

// Rotate vector v by unit quaternion q: returns vector part of q (0, v) q*.
// With q body->world, this maps a body-frame vector to the world frame.
export function quatRotate(q, v) {
  const r = quatMul(quatMul(q, [0, v[0], v[1], v[2]]), quatConj(q));
  return [r[1], r[2], r[3]];
}

// Unit quaternion for a rotation by `angle` about unit vector `axis`.
export function quatFromAxisAngle(axis, angle) {
  const s = Math.sin(angle / 2);
  return [Math.cos(angle / 2), axis[0] * s, axis[1] * s, axis[2] * s];
}

// dq/dt = 0.5 * q (0, w) with w in the BODY frame.
export function quatDeriv(q, w) {
  const p = quatMul(q, [0, w[0], w[1], w[2]]);
  return [0.5 * p[0], 0.5 * p[1], 0.5 * p[2], 0.5 * p[3]];
}

// ---------------------------------------------------------------------------
// Classical 4th-order Runge-Kutta on the combined 7-component state (w, q).
// The w equations do not depend on q, but integrating them together keeps q in step with w at
// the RK4 substages. q is renormalised after each full step (a projection back onto the unit
// sphere; it removes the slow norm drift that RK4 alone would accumulate).

function deriv(s, I) {
  return { w: eulerRHS(s.w, I), q: quatDeriv(s.q, s.w) };
}

function axpy(s, d, h) {
  return {
    w: [s.w[0] + h * d.w[0], s.w[1] + h * d.w[1], s.w[2] + h * d.w[2]],
    q: [s.q[0] + h * d.q[0], s.q[1] + h * d.q[1], s.q[2] + h * d.q[2], s.q[3] + h * d.q[3]],
  };
}

export function rk4Step(s, I, dt) {
  const k1 = deriv(s, I);
  const k2 = deriv(axpy(s, k1, dt / 2), I);
  const k3 = deriv(axpy(s, k2, dt / 2), I);
  const k4 = deriv(axpy(s, k3, dt), I);
  const c = dt / 6;
  const w = [0, 1, 2].map((i) => s.w[i] + c * (k1.w[i] + 2 * k2.w[i] + 2 * k3.w[i] + k4.w[i]));
  const q = [0, 1, 2, 3].map((i) => s.q[i] + c * (k1.q[i] + 2 * k2.q[i] + 2 * k3.q[i] + k4.q[i]));
  return { w, q: quatNormalize(q) };
}

// Advance `nSteps` fixed steps of size dt. If `onStep` is given it is called as
// onStep(state, t) after every step (t measured from the start of this call).
export function simulate(s, I, dt, nSteps, onStep) {
  let state = s;
  for (let n = 1; n <= nSteps; n++) {
    state = rk4Step(state, I, dt);
    if (onStep) onStep(state, n * dt);
  }
  return state;
}

// ---------------------------------------------------------------------------
// Conserved quantities.

// Rotational kinetic energy E = 0.5 * (I1 w1^2 + I2 w2^2 + I3 w3^2).
export function energy(w, I) {
  return 0.5 * (I[0] * w[0] * w[0] + I[1] * w[1] * w[1] + I[2] * w[2] * w[2]);
}

// Body-frame angular momentum L_body = (I1 w1, I2 w2, I3 w3) (principal axes).
export function angularMomentumBody(w, I) {
  return [I[0] * w[0], I[1] * w[1], I[2] * w[2]];
}

// |L|^2 = (I1 w1)^2 + (I2 w2)^2 + (I3 w3)^2. Frame independent.
export function angularMomentumSq(w, I) {
  const L = angularMomentumBody(w, I);
  return L[0] * L[0] + L[1] * L[1] + L[2] * L[2];
}

// World-frame L = q L_body q*. With no torque this vector is constant.
export function angularMomentumWorld(s, I) {
  return quatRotate(s.q, angularMomentumBody(s.w, I));
}

// ---------------------------------------------------------------------------
// Initial conditions and linear stability.

// Spin Omega about body axis `axis` (1, 2 or 3), plus a perturbation `eps` (absolute units,
// rad/time) on ONE other component: the lowest-numbered axis that is not the spin axis.
// Orientation starts at the identity.
// Why only one component: the linearised equations about axis 2 have growing and decaying
// eigenvectors with both components nonzero, d3/d1 = -/+ sqrt(I1 (I3 - I2) / (I3 (I2 - I1))).
// An equal perturbation (eps, ., eps) lies exactly on the decaying one whenever that ratio is 1
// (e.g. I = (0.5, 1.7, 2)), delaying the flip until round-off grows. A single nonzero component
// always has a growing-mode part, whatever the moments.
export function initialState(axis, Omega, eps = 1e-3) {
  const w = [0, 0, 0];
  w[axis - 1] = Omega;
  w[axis === 1 ? 1 : 0] = eps;
  return { w, q: [1, 0, 0, 0] };
}

// Linearised growth rate for spin Omega about the intermediate axis 2:
//   lambda = Omega * sqrt((I3 - I2)(I2 - I1) / (I1 I3))
// Derivation: put w = (d1, Omega, d3) into Euler's equations and drop second-order terms:
//   d1' = (I2 - I3)/I1 * Omega * d3,  d3' = (I1 - I2)/I3 * Omega * d1
// so d1'' = (I2 - I3)(I1 - I2)/(I1 I3) * Omega^2 * d1 = lambda^2 d1, which is positive when
// I2 lies strictly between I1 and I3. Returns 0 if the product is not positive (stable).
export function growthRate(I, Omega) {
  const [I1, I2, I3] = I;
  const p = ((I3 - I2) * (I2 - I1)) / (I1 * I3);
  return p > 0 ? Math.abs(Omega) * Math.sqrt(p) : 0;
}

// ---------------------------------------------------------------------------
// Stretch goal: exact solution via Jacobi elliptic functions.

// sn(u|m), cn(u|m), dn(u|m) with parameter m = k^2 in [0, 1], by the arithmetic-geometric mean
// method (Abramowitz & Stegun, Handbook of Mathematical Functions, 16.4).
export function jacobiEllipticSNCNDN(u, m) {
  if (m < 0 || m > 1) throw new RangeError(`parameter m must lie in [0, 1], got ${m}`);
  if (m < 1e-16) return { sn: Math.sin(u), cn: Math.cos(u), dn: 1 };
  if (m > 1 - 1e-16) {
    const sech = 1 / Math.cosh(u);
    return { sn: Math.tanh(u), cn: sech, dn: sech };
  }
  const a = [1];
  const c = [Math.sqrt(m)];
  let b = Math.sqrt(1 - m);
  let n = 0;
  while (Math.abs(c[n]) > 1e-16 && n < 30) {
    const an = a[n];
    a.push((an + b) / 2);
    c.push((an - b) / 2);
    b = Math.sqrt(an * b);
    n++;
  }
  // phi_N = 2^N a_N u, then phi_{n-1} = (phi_n + asin(c_n / a_n * sin phi_n)) / 2.
  let phi = Math.pow(2, n) * a[n] * u;
  let phiPrev = phi;
  for (let j = n; j >= 1; j--) {
    phiPrev = phi;
    phi = (phi + Math.asin((c[j] / a[j]) * Math.sin(phi))) / 2;
  }
  // phi is now phi_0 and phiPrev is phi_1. dn = cos(phi_0) / cos(phi_1 - phi_0) (A&S 16.4.3).
  return { sn: Math.sin(phi), cn: Math.cos(phi), dn: Math.cos(phi) / Math.cos(phiPrev - phi) };
}

// Exact w(t) for the torque-free body (Landau & Lifshitz, Mechanics, section 37, eq. 37.10).
// Requires I1 < I2 < I3, initial w0 = (w1, 0, w3) with w1, w3 nonzero, and L^2 > 2 E I2
// (the trajectory circles axis 3). These choices put the elliptic functions at phase u = 0.
// Writing M^2 = |L|^2:
//   w1 = s1 * sqrt((2E I3 - M^2) / (I1 (I3 - I1))) cn(tau)
//   w2 = s1 s3 * sqrt((2E I3 - M^2) / (I2 (I3 - I2))) sn(tau)
//   w3 = s3 * sqrt((M^2 - 2E I1) / (I3 (I3 - I1))) dn(tau)
//   tau = t * sqrt((I3 - I2)(M^2 - 2E I1) / (I1 I2 I3))
//   m = k^2 = (I2 - I1)(2E I3 - M^2) / ((I3 - I2)(M^2 - 2E I1))
// s1, s3 are the signs of w1(0), w3(0). Using the symmetries (w1, w2) -> -(w1, w2) and
// (w2, w3) -> -(w2, w3) of Euler's equations, w2 carries the sign s1*s3.
// Returns a function t -> [w1, w2, w3].
export function exactOmega(w0, I) {
  const [I1, I2, I3] = I;
  if (!(I1 < I2 && I2 < I3)) throw new RangeError('exactOmega needs I1 < I2 < I3');
  if (w0[1] !== 0 || w0[0] === 0 || w0[2] === 0) {
    throw new RangeError('exactOmega needs w0 = (w1, 0, w3) with w1, w3 nonzero');
  }
  const E2 = 2 * energy(w0, I);
  const M2 = angularMomentumSq(w0, I);
  if (!(M2 > E2 * I2)) throw new RangeError('exactOmega needs L^2 > 2 E I2');
  const s1 = Math.sign(w0[0]);
  const s3 = Math.sign(w0[2]);
  const A = Math.sqrt((E2 * I3 - M2) / (I1 * (I3 - I1)));
  const B = Math.sqrt((E2 * I3 - M2) / (I2 * (I3 - I2)));
  const C = Math.sqrt((M2 - E2 * I1) / (I3 * (I3 - I1)));
  const rate = Math.sqrt(((I3 - I2) * (M2 - E2 * I1)) / (I1 * I2 * I3));
  const m = ((I2 - I1) * (E2 * I3 - M2)) / ((I3 - I2) * (M2 - E2 * I1));
  return (t) => {
    const { sn, cn, dn } = jacobiEllipticSNCNDN(rate * t, m);
    return [s1 * A * cn, s1 * s3 * B * sn, s3 * C * dn];
  };
}
