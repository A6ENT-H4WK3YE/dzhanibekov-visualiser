// 2D canvas plots: time series of w, conservation drift, and the polhode.
// No physics here beyond the closed-form polhode curves (derived in the PolhodePlot comment).
// Colours come from CSS custom properties so light and dark mode each use their own validated steps.

function cssVar(el, name) {
  return getComputedStyle(el).getPropertyValue(name).trim();
}

// Round-number tick positions covering [min, max].
function niceTicks(min, max, count = 5) {
  const span = max - min;
  if (!(span > 0)) return [min];
  const raw = span / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw);
  const ticks = [];
  for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-9; v += step) ticks.push(+v.toPrecision(12));
  return ticks;
}

// Canvas sized to its container at device pixel ratio; calls draw() on resize.
class CanvasBox {
  constructor(container) {
    this.container = container;
    this.canvas = document.createElement('canvas');
    container.appendChild(this.canvas);
    this.w = 0;
    this.h = 0;
    new ResizeObserver(() => this.resize()).observe(container);
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = this.container.clientWidth;
    this.h = this.container.clientHeight;
    this.canvas.width = Math.round(this.w * dpr);
    this.canvas.height = Math.round(this.h * dpr);
    this.ctx = this.canvas.getContext('2d');
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.draw();
  }

  colours() {
    const el = this.container;
    return {
      ink: cssVar(el, '--text'),
      muted: cssVar(el, '--muted'),
      grid: cssVar(el, '--grid'),
      surface: cssVar(el, '--panel'),
    };
  }
}

// Line chart with one shared y axis, direct labels at the line ends, and a hover crosshair whose
// tooltip lists every series at the nearest sample.
//   series:   [{ label, colourVar }]
//   log:      plot log10(|y|) between yFixed = [lo, hi] decades (values below lo are clamped)
//   refLines: [{ y, label }] dashed horizontal reference lines
//   format:   value -> string for the tooltip
export class LinePlot extends CanvasBox {
  constructor(container, opts) {
    super(container);
    this.opts = opts;
    this.x = [];
    this.ys = opts.series.map(() => []);
    this.xRange = [0, 1];
    this.hover = null;
    this.tip = document.createElement('div');
    this.tip.className = 'plot-tip';
    container.appendChild(this.tip);
    this.canvas.addEventListener('pointermove', (e) => {
      this.hover = e.offsetX;
      this.draw();
    });
    this.canvas.addEventListener('pointerleave', () => {
      this.hover = null;
      this.draw();
    });
    this.resize();
  }

  setData(x, ys, xRange) {
    this.x = x;
    this.ys = ys;
    this.xRange = xRange;
    this.draw();
  }

  draw() {
    const { ctx, w, h, opts } = this;
    if (!ctx || w === 0) return;
    const c = this.colours();
    const m = { l: 52, r: 50, t: 10, b: 24 };
    const pw = w - m.l - m.r;
    const ph = h - m.t - m.b;
    ctx.clearRect(0, 0, w, h);
    ctx.font = '11px system-ui, sans-serif';

    // y transform
    let yLo;
    let yHi;
    let yv;
    let yTicks;
    let yTickLabel;
    if (opts.log) {
      [yLo, yHi] = opts.yFixed;
      yv = (v) => Math.max(yLo, Math.log10(Math.abs(v) || 1e-300));
      yTicks = [];
      const step = opts.logTickStep ?? 4;
      for (let d = Math.ceil(yLo / step) * step; d <= yHi; d += step) yTicks.push(d);
      yTickLabel = (d) => `1e${d}`;
    } else {
      let mx = 0;
      this.ys.forEach((s) => s.forEach((v) => (mx = Math.max(mx, Math.abs(v)))));
      mx = mx > 0 ? mx * 1.1 : 1;
      yTicks = niceTicks(-mx, mx, 4);
      yLo = Math.min(-mx, yTicks[0]);
      yHi = Math.max(mx, yTicks[yTicks.length - 1]);
      yv = (v) => v;
      yTickLabel = (v) => String(v);
    }
    const [x0, x1] = this.xRange;
    const px = (x) => m.l + ((x - x0) / (x1 - x0 || 1)) * pw;
    const py = (v) => m.t + (1 - (yv(v) - yLo) / (yHi - yLo)) * ph;
    const pyRaw = (u) => m.t + (1 - (u - yLo) / (yHi - yLo)) * ph;

    // grid and axes (recessive)
    ctx.lineWidth = 1;
    ctx.strokeStyle = c.grid;
    ctx.fillStyle = c.muted;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    yTicks.forEach((u) => {
      const y = Math.round(pyRaw(u)) + 0.5;
      ctx.beginPath();
      ctx.moveTo(m.l, y);
      ctx.lineTo(m.l + pw, y);
      ctx.stroke();
      ctx.fillText(yTickLabel(u), m.l - 6, y);
    });
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    niceTicks(x0, x1, Math.max(2, Math.floor(pw / 80))).forEach((t) => {
      if (t < x0 || t > x1) return;
      ctx.fillText(String(t), px(t), m.t + ph + 6);
    });
    ctx.textAlign = 'right';
    ctx.fillText('t', m.l + pw + 14, m.t + ph + 6);

    // reference lines
    (opts.refLines ?? []).forEach((r) => {
      const y = Math.round(py(r.y)) + 0.5;
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = c.muted;
      ctx.beginPath();
      ctx.moveTo(m.l, y);
      ctx.lineTo(m.l + pw, y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = c.muted;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      ctx.fillText(r.label, m.l + 4, y - 2);
    });

    // series: 2px lines, clipped to the plot area (buffers are trimmed lazily, so they can
    // hold samples just left of the window)
    const n = this.x.length;
    const ends = [];
    ctx.save();
    ctx.beginPath();
    ctx.rect(m.l, m.t - 2, pw, ph + 4);
    ctx.clip();
    opts.series.forEach((s, k) => {
      const col = cssVar(this.container, s.colourVar);
      const ys = this.ys[k];
      if (n === 0) return;
      ctx.strokeStyle = col;
      ctx.lineWidth = 2;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const X = px(this.x[i]);
        const Y = py(ys[i]);
        if (i === 0) ctx.moveTo(X, Y);
        else ctx.lineTo(X, Y);
      }
      ctx.stroke();
      ends.push({ y: py(ys[n - 1]), col, label: s.label });
    });
    ctx.restore();

    // direct labels at the right end: a colour stroke for identity, text in ink.
    ends.sort((a, b) => a.y - b.y);
    for (let i = 1; i < ends.length; i++) ends[i].y = Math.max(ends[i].y, ends[i - 1].y + 13);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ends.forEach((e) => {
      const y = Math.min(Math.max(e.y, m.t + 5), m.t + ph);
      ctx.strokeStyle = e.col;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(m.l + pw + 4, y);
      ctx.lineTo(m.l + pw + 12, y);
      ctx.stroke();
      ctx.fillStyle = c.ink;
      ctx.fillText(e.label, m.l + pw + 15, y);
    });

    // hover: crosshair snapped to the nearest sample, tooltip with every series
    if (this.hover !== null && n > 0 && this.hover >= m.l && this.hover <= m.l + pw) {
      const xt = x0 + ((this.hover - m.l) / pw) * (x1 - x0);
      let lo = 0;
      let hi = n - 1;
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (this.x[mid] < xt) lo = mid;
        else hi = mid;
      }
      const i = Math.abs(this.x[lo] - xt) < Math.abs(this.x[hi] - xt) ? lo : hi;
      const X = Math.round(px(this.x[i])) + 0.5;
      ctx.strokeStyle = c.muted;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(X, m.t);
      ctx.lineTo(X, m.t + ph);
      ctx.stroke();
      opts.series.forEach((s, k) => {
        ctx.fillStyle = cssVar(this.container, s.colourVar);
        ctx.strokeStyle = c.surface;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(X, py(this.ys[k][i]), 4, 0, 2 * Math.PI);
        ctx.fill();
        ctx.stroke();
      });
      this.renderTip(i, X, m, pw);
    } else {
      this.tip.style.display = 'none';
    }
  }

  renderTip(i, X, m, pw) {
    const { tip, opts } = this;
    tip.replaceChildren();
    const head = document.createElement('div');
    head.className = 'plot-tip-head';
    head.textContent = `t = ${this.x[i].toFixed(2)}`;
    tip.appendChild(head);
    opts.series.forEach((s, k) => {
      const row = document.createElement('div');
      const key = document.createElement('i');
      key.style.background = `var(${s.colourVar})`;
      const val = document.createElement('b');
      val.textContent = opts.format(this.ys[k][i]);
      const lab = document.createElement('span');
      lab.textContent = s.label;
      row.append(key, val, lab);
      tip.appendChild(row);
    });
    tip.style.display = 'block';
    const left = X + 12 + tip.offsetWidth > m.l + pw ? X - 12 - tip.offsetWidth : X + 12;
    tip.style.left = `${left}px`;
    tip.style.top = `${m.t}px`;
  }
}

// Polhode: the path of the body-frame angular velocity w on the energy ellipsoid, viewed down
// body axis 3. Coordinates are scaled so the ellipsoid outline is the unit circle:
//   x = w1 sqrt(I1 / 2E),  y = w2 sqrt(I2 / 2E)   (and z = w3 sqrt(I3 / 2E), x^2 + y^2 + z^2 = 1)
// Each trajectory also conserves M^2 = |L|^2. Write r = M^2 / 2E, which lies in [I1, I3].
// Eliminating one component between the energy and |L|^2 equations (valid for I1 < I2 < I3):
// - r > I2 (circulates about axis 3): x = sqrt((I3 - r)/(I3 - I1)) cos(th),
//   y = sqrt((I3 - r)/(I3 - I2)) sin(th). The front and back halves (z > 0, z < 0) project
//   onto the same ellipse.
// - r < I2 (circulates about axis 1): y = sqrt((r - I1)/(I2 - I1)) sin(th),
//   z = sqrt((r - I1)/(I3 - I1)) cos(th), x = +/- sqrt(1 - y^2 - z^2).
// - r = I2 is the separatrix through +/- axis 2. Both formulas give the same curve there.
// E cancels, so the background family depends only on I. The trail is the simulated path.
export class PolhodePlot extends CanvasBox {
  constructor(container) {
    super(container);
    this.I = [1, 2, 3];
    this.trail = [];
    this.resize();
  }

  setBody(I) {
    this.I = I;
    this.trail = [];
    this.draw();
  }

  setTrail(points) {
    this.trail = points;
    this.draw();
  }

  curves() {
    const [I1, I2, I3] = this.I;
    if (!(I1 < I2 && I2 < I3)) return { family: [], separatrix: null };
    const N = 160;
    const ellipse3 = (r) => {
      const a = Math.sqrt((I3 - r) / (I3 - I1));
      const b = Math.sqrt((I3 - r) / (I3 - I2));
      return [Array.from({ length: N + 1 }, (_, i) => {
        const th = (2 * Math.PI * i) / N;
        return [a * Math.cos(th), b * Math.sin(th)];
      })];
    };
    const around1 = (r) => {
      const by = Math.sqrt((r - I1) / (I2 - I1));
      const bz = Math.sqrt((r - I1) / (I3 - I1));
      return [1, -1].map((sgn) =>
        Array.from({ length: N + 1 }, (_, i) => {
          const th = (2 * Math.PI * i) / N;
          const y = by * Math.sin(th);
          const z = bz * Math.cos(th);
          return [sgn * Math.sqrt(Math.max(0, 1 - y * y - z * z)), y];
        }),
      );
    };
    const fr = [0.12, 0.35, 0.6, 0.85];
    const family = [
      ...fr.flatMap((f) => ellipse3(I2 + (I3 - I2) * f)),
      ...fr.flatMap((f) => around1(I1 + (I2 - I1) * f)),
    ];
    return { family, separatrix: ellipse3(I2)[0] };
  }

  draw() {
    const { ctx, w, h } = this;
    if (!ctx || w === 0) return;
    const c = this.colours();
    ctx.clearRect(0, 0, w, h);
    const R = Math.min(w, h) / 2 - 22;
    const cx = w / 2;
    const cy = h / 2;
    const P = ([x, y]) => [cx + R * x, cy - R * y];
    const path = (pts) => {
      ctx.beginPath();
      pts.forEach((p, i) => {
        const [X, Y] = P(p);
        if (i === 0) ctx.moveTo(X, Y);
        else ctx.lineTo(X, Y);
      });
      ctx.stroke();
    };

    // ellipsoid outline
    ctx.strokeStyle = c.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, 2 * Math.PI);
    ctx.stroke();

    const { family, separatrix } = this.curves();
    ctx.strokeStyle = c.grid;
    family.forEach(path);
    if (separatrix) {
      ctx.strokeStyle = c.muted;
      ctx.setLineDash([5, 4]);
      ctx.lineWidth = 1.5;
      path(separatrix);
      ctx.setLineDash([]);
    }

    // axis labels at the fixed points
    ctx.fillStyle = c.muted;
    ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('+2', cx, cy - R - 11);
    ctx.fillText('−2', cx, cy + R + 11);
    ctx.fillText('+1', cx + R + 12, cy);
    ctx.fillText('−1', cx - R - 12, cy);
    ctx.fillText('3', cx + 9, cy - 9);

    // simulated trail (2px) and current point (8px with surface ring)
    if (this.trail.length > 1) {
      ctx.strokeStyle = c.ink;
      ctx.lineWidth = 2;
      ctx.lineJoin = 'round';
      path(this.trail);
      const [X, Y] = P(this.trail[this.trail.length - 1]);
      ctx.fillStyle = c.ink;
      ctx.strokeStyle = c.surface;
      ctx.beginPath();
      ctx.arc(X, Y, 4.5, 0, 2 * Math.PI);
      ctx.fill();
      ctx.stroke();
    }
  }
}
