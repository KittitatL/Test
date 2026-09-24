// "Introducing SQ²" — hand-drawn canvas animation starring Qumi.
// Every frame is a pure function of the frame number, so render.js can
// capture it deterministically. Open index.html in a browser to preview.

const W = 1920, H = 1080, FPS = 60, DUR = 30, FRAMES = FPS * DUR;
const cv = document.getElementById('c');
const ctx = cv.getContext('2d');

const C = {
  bg: '#141117', ink: '#f4ecdc', pink: '#de5c8e', yellow: '#ffd100',
  grey: '#59595b', lgrey: '#a9a8ae', cyan: '#6fe3ee', red: '#d7263d',
};

// ---------------------------------------------------------------- math
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const seg = (t, a, b) => clamp((t - a) / (b - a));
const eOut = t => 1 - Math.pow(1 - t, 3);
const eIn = t => t * t * t;
const eIO = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const eBack = t => { const c1 = 1.9, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
const eElastic = t => (t <= 0 ? 0 : t >= 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * 2 * Math.PI / 3) + 1);
const frac = x => x - Math.floor(x);

function hash(...n) {
  let h = 2166136261;
  for (const v of n) { h ^= Math.round(v * 997) | 0; h = Math.imul(h, 16777619); h ^= h >>> 15; }
  h = Math.imul(h ^ (h >>> 13), 0x5bd1e995); h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}
let BOIL = 0;                 // changes on twos -> classic line boil
let _id = 0;
const nid = () => ++_id;
const R = (id, k = 0) => hash(id, k, BOIL) * 2 - 1;   // boiling noise [-1,1]
const S = (id, k = 0) => hash(id, k, 4242) * 2 - 1;    // static noise  [-1,1]

// ---------------------------------------------------------------- assets
const IMG = {};
function load(name, src) {
  return new Promise((res, rej) => { const i = new Image(); i.onload = () => { IMG[name] = i; res(); }; i.onerror = rej; i.src = src; });
}
const tintCache = {};
function tinted(col) {
  if (!tintCache[col]) {
    const q = IMG.qumi, c = document.createElement('canvas');
    c.width = q.width; c.height = q.height;
    const g = c.getContext('2d');
    g.drawImage(q, 0, 0);
    g.globalCompositeOperation = 'source-atop';
    g.globalAlpha = 0.6; g.fillStyle = col; g.fillRect(0, 0, c.width, c.height);
    tintCache[col] = c;
  }
  return tintCache[col];
}
let GRAIN;
function makeGrain() {
  GRAIN = document.createElement('canvas'); GRAIN.width = W; GRAIN.height = H;
  const g = GRAIN.getContext('2d');
  for (let i = 0; i < 26000; i++) {
    const x = hash(i, 1) * W, y = hash(i, 2) * H, s = hash(i, 3) < 0.85 ? 1.5 : 2.6;
    g.fillStyle = hash(i, 4) < 0.6 ? `rgba(255,248,235,${0.03 + hash(i, 5) * 0.06})` : `rgba(0,0,0,${0.08 + hash(i, 6) * 0.1})`;
    g.fillRect(x, y, s, s);
  }
  g.lineWidth = 1; g.strokeStyle = 'rgba(255,248,235,0.035)';
  for (let i = 0; i < 90; i++) {           // paper fibres
    const x = hash(i, 7) * W, y = hash(i, 8) * H, a = hash(i, 9) * 6.3, l = 30 + hash(i, 10) * 80;
    g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + Math.cos(a) * l / 2 + 10, y + Math.sin(a) * l / 2, x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
  }
  const v = g.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 1.05);
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.55)');
  g.fillStyle = v; g.fillRect(0, 0, W, H);
}

// ---------------------------------------------------------------- camera
let SHAKE = [];     // list of [time, amplitude]
let TG = 0;         // global (camera-rate) time
function shakeOffset() {
  let a = 0;
  for (const [t0, amp] of SHAKE) if (TG >= t0) a += amp * Math.exp(-(TG - t0) * 10);
  return [R(9001, 1) * a, R(9001, 2) * a];
}
function cam(x = W / 2, y = H / 2, z = 1, rot = 0) {
  const [sx, sy] = shakeOffset();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.translate(W / 2 + sx, H / 2 + sy); ctx.rotate(rot); ctx.scale(z, z); ctx.translate(-x, -y);
}
function screen() { const [sx, sy] = shakeOffset(); ctx.setTransform(1, 0, 0, 1, sx * 0.5, sy * 0.5); }
function bg(col) { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.fillStyle = col; ctx.fillRect(0, 0, W, H); }

// ---------------------------------------------------------------- hand-drawn primitives
function sLine(x1, y1, x2, y2, o = {}) {
  const id = nid(), p = o.prog ?? 1, j = o.j ?? 1, w = o.w || 4;
  if (p <= 0) return;
  const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len;
  ctx.strokeStyle = o.color || C.ink; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (o.dash) ctx.setLineDash(o.dash);
  const passes = o.passes ?? 2;
  for (let k = 0; k < passes; k++) {
    ctx.lineWidth = w * (k ? 0.5 : 1);
    const bow = R(id, k * 5) * Math.min(len * 0.03, 14) * j;
    const ax = x1 + R(id, k * 5 + 1) * 2.5 * j, ay = y1 + R(id, k * 5 + 2) * 2.5 * j;
    const bx = x1 + dx * p + R(id, k * 5 + 3) * 2.5 * j, by = y1 + dy * p + R(id, k * 5 + 4) * 2.5 * j;
    ctx.beginPath(); ctx.moveTo(ax, ay);
    ctx.quadraticCurveTo((ax + bx) / 2 + nx * bow * p, (ay + by) / 2 + ny * bow * p, bx, by); ctx.stroke();
  }
  if (o.dash) ctx.setLineDash([]);
}
function sPath(pts, o = {}) {
  let L = 0; const ls = [];
  for (let i = 1; i < pts.length; i++) { const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); ls.push(l); L += l; }
  let rem = (o.prog ?? 1) * L;
  for (let i = 1; i < pts.length && rem > 0; i++) {
    const f = Math.min(1, rem / (ls[i - 1] || 1));
    sLine(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1], { ...o, prog: f, passes: o.passes ?? 1 });
    rem -= ls[i - 1];
  }
}
function sRect(x, y, w, h, o = {}) {
  const p = o.prog ?? 1;
  sPath([[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y - 3]], { passes: 2, ...o, prog: p });
}
function sCircle(cx, cy, r, o = {}) {
  const id = nid(), p = o.prog ?? 1, j = o.j ?? 1;
  if (p <= 0) return;
  ctx.strokeStyle = o.color || C.ink; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (let k = 0; k < (o.passes ?? 2); k++) {
    ctx.lineWidth = (o.w || 4) * (k ? 0.5 : 1);
    const a0 = S(id, k) * Math.PI + R(id, k + 9) * 0.15 * j, turn = (1.1 + 0.05 * S(id, k + 3)) * 2 * Math.PI * p;
    const p1 = R(id, k + 20) * 3, p2 = R(id, k + 21) * 3;
    const n = Math.max(16, Math.floor(r / 3));
    ctx.beginPath();
    for (let i = 0; i <= n; i++) {
      const a = a0 + turn * i / n;
      const rr = r * (1 + j * (0.035 * Math.sin(a * 2 + p1) + 0.02 * Math.sin(a * 3 + p2)) + 0.03 * i / n);
      const x = cx + Math.cos(a) * rr * (o.sx || 1), y = cy + Math.sin(a) * rr * (o.sy || 1);
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.stroke();
  }
}
function blob(cx, cy, r, col, sx = 1, sy = 1) {
  const id = nid(); ctx.fillStyle = col; ctx.beginPath();
  for (let i = 0; i <= 18; i++) {
    const a = i / 18 * Math.PI * 2, rr = r * (1 + 0.07 * R(id, i % 18));
    const x = cx + Math.cos(a) * rr * sx, y = cy + Math.sin(a) * rr * sy;
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  }
  ctx.fill();
}
function hatch(x, y, w, h, o = {}) {
  const id = nid(); ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  const gap = o.gap || 16, ang = o.ang ?? -0.7, ca = Math.cos(ang), sa = Math.sin(ang);
  ctx.strokeStyle = o.color || C.pink; ctx.lineWidth = o.w || 3; ctx.lineCap = 'round';
  const cx = x + w / 2, cy = y + h / 2, D = Math.hypot(w, h) / 2 + 30;
  ctx.beginPath();
  for (let s = -D, i = 0; s <= D; s += gap, i++) {
    const off = R(id, i) * 3, px = cx - sa * (s + off), py = cy + ca * (s + off);
    ctx.moveTo(px - ca * D, py - sa * D); ctx.lineTo(px + ca * D, py + sa * D + R(id, i + 99) * 8);
  }
  ctx.stroke(); ctx.restore();
}
// scribbly marker wipe across the whole screen (screen space)
function wipe(p, col, dir = 1) {
  if (p <= 0) return;
  const id = nid(); screen();
  const edge = lerp(-260, W + 260, p);
  ctx.fillStyle = col; ctx.beginPath();
  const base = dir > 0 ? 0 : W;
  ctx.moveTo(base, -20);
  for (let y = -20, i = 0; y <= H + 60; y += 60, i++) {
    const x = dir > 0 ? edge + R(id, i) * 50 + Math.sin(y / 130) * 70 : W - edge - R(id, i) * 50 - Math.sin(y / 130) * 70;
    ctx.lineTo(x, y);
  }
  ctx.lineTo(base, H + 60); ctx.fill();
  // loose marker strokes at the leading edge
  ctx.strokeStyle = col; ctx.lineCap = 'round';
  for (let i = 0; i < 9; i++) {
    const y = hash(id, i) * H, x = dir > 0 ? edge + 60 + R(id, i + 30) * 60 : W - edge - 60 - R(id, i + 30) * 60;
    ctx.lineWidth = 20 + hash(i, 5) * 30; ctx.beginPath(); ctx.moveTo(x - 180 * dir, y); ctx.lineTo(x, y + R(id, i + 60) * 30); ctx.stroke();
  }
}
function flash(a, col = C.ink) { if (a <= 0) return; ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = clamp(a); ctx.fillStyle = col; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }

// anime focus lines radiating to the centre
function focusLines(cx, cy, n, rIn, col, w = 3, alpha = 1) {
  const id = nid(); ctx.save(); ctx.globalAlpha *= alpha; ctx.fillStyle = col;
  for (let i = 0; i < n; i++) {
    const a = S(id, i) * Math.PI + R(id, i) * 0.04, r1 = rIn * (1 + 0.35 * Math.abs(R(id, i + 50))), r2 = 1800;
    const th = (w + Math.abs(R(id, i + 80)) * w * 2) / r2 * 6;
    ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
    ctx.lineTo(cx + Math.cos(a + th) * r2, cy + Math.sin(a + th) * r2);
    ctx.lineTo(cx + Math.cos(a - th) * r2, cy + Math.sin(a - th) * r2); ctx.fill();
  }
  ctx.restore();
}
function burst(x, y, r, p, col = C.yellow, n = 10, w = 6) {
  if (p <= 0 || p >= 1) return;
  const id = nid();
  for (let i = 0; i < n; i++) {
    const a = i / n * Math.PI * 2 + S(id, i) * 0.2, r1 = r * (0.5 + p), r2 = r * (0.9 + p * 1.6);
    sLine(x + Math.cos(a) * r1, y + Math.sin(a) * r1, x + Math.cos(a) * r2, y + Math.sin(a) * r2, { color: col, w: w * (1 - p) + 1, passes: 1 });
  }
}
function puff(x, y, p, col = C.ink) {
  if (p <= 0 || p >= 1) return;
  for (let i = 0; i < 5; i++) {
    const d = (i - 2) * 60 * eOut(p), r = (22 + i % 2 * 10) * (1 - p * 0.6);
    sCircle(x + d, y - 10 - 30 * p * (1 + (i % 3)) / 2, r, { color: col, w: 3, passes: 1 });
  }
}
function speedH(y0, y1, col, n = 14, alpha = 1) {
  const id = nid(); ctx.save(); ctx.globalAlpha *= alpha;
  for (let i = 0; i < n; i++) {
    const y = lerp(y0, y1, hash(id, i, BOIL)), x = hash(id, i + 40, BOIL) * W, l = 120 + hash(id, i + 80, BOIL) * 380;
    sLine(x, y, x - l, y, { color: col, w: 3, passes: 1, j: 0.2 });
  }
  ctx.restore();
}

// ---------------------------------------------------------------- pixel art bits
const PIX = {
  note: ['..XXX', '..X.X', '..X..', '..X..', 'XXX..', 'XXX..', 'XX...'],
  spark: ['..X..', '..X..', 'XXXXX', '..X..', '..X..'],
  bang: ['XX', 'XX', 'XX', 'XX', '..', 'XX'],
  heart: ['.X.X.', 'XXXXX', 'XXXXX', '.XXX.', '..X..'],
  cap: ['.....XX.....', '...XXXXXX...', 'XXXXXXXXXXXX', '...XXXXXX..X', '...XXXXXX..X', '...........X'],
};
function pix(name, x, y, ps, col, alpha = 1) {
  const p = PIX[name]; ctx.save(); ctx.globalAlpha *= alpha; ctx.fillStyle = col;
  const w = p[0].length * ps, h = p.length * ps;
  for (let r = 0; r < p.length; r++) for (let c = 0; c < p[r].length; c++)
    if (p[r][c] === 'X') ctx.fillRect(Math.round(x - w / 2 + c * ps), Math.round(y - h / 2 + r * ps), Math.ceil(ps), Math.ceil(ps));
  ctx.restore();
}
function notes(x, y, t, n = 3, ps = 5, spread = 120) {
  for (let i = 0; i < n; i++) {
    const k = frac(t * 0.7 + i / n), col = [C.pink, C.yellow, C.cyan][i % 3];
    pix('note', x + Math.sin(k * 6 + i * 2) * 30 + (i - (n - 1) / 2) * spread * 0.5, y - k * 180, ps, col, k < 0.8 ? 1 : (1 - k) * 5);
  }
}
function sparkles(cx, cy, rx, ry, t, n = 8, ps = 5) {
  for (let i = 0; i < n; i++) {
    const k = frac(t * 0.9 + hash(i, 77)), a = hash(i, 78) * 6.28;
    const s = Math.sin(k * Math.PI);
    if (s > 0.15) pix('spark', cx + Math.cos(a) * rx * (0.6 + hash(i, 79) * 0.5), cy + Math.sin(a) * ry * (0.6 + hash(i, 80) * 0.5), ps * (0.6 + s * 0.6), [C.yellow, C.ink, C.pink][i % 3], s);
  }
}

// ---------------------------------------------------------------- Qumi
// x,y = bottom-centre, ps = size of one sprite pixel
function qumi(x, y, ps, o = {}) {
  const img = o.tint ? tinted(o.tint) : IMG.qumi, w = img.width * ps, h = img.height * ps, id = nid();
  ctx.save();
  if (o.ground) { ctx.globalAlpha *= 0.35; blob(x, y, w * 0.42 * (o.sx || 1), '#000', 1, 0.16); ctx.globalAlpha /= 0.35; }
  ctx.imageSmoothingEnabled = false;
  const j = o.j ?? 1;
  ctx.translate(x + Math.round(R(id, 1) * j) * ps * 0.5, y + Math.round(R(id, 2) * j) * ps * 0.5);
  ctx.rotate((o.rot || 0) + R(id, 3) * 0.012 * j);
  ctx.scale((o.sx || 1) * (o.flip ? -1 : 1), o.sy || 1);
  ctx.globalAlpha *= o.alpha ?? 1;
  ctx.drawImage(img, -w / 2, -h, w, h);
  ctx.restore();
}
const QW = () => IMG.qumi.width, QH = () => IMG.qumi.height;
// glasses sit ~31% down the sprite, slightly right of centre
const glasses = (x, y, ps) => [x + 5 * ps, y - QH() * ps * 0.66];

// ---------------------------------------------------------------- type
function txt(str, x, y, size, o = {}) {
  const id = nid(), font = o.font || 'Fira';
  ctx.font = `${font === 'Pix' ? 400 : 700} ${size}px ${font}`;
  ctx.textBaseline = 'alphabetic';
  const chars = [...str], ws = chars.map(c => ctx.measureText(c).width * (o.track ?? 1));
  const tw = ws.reduce((a, b) => a + b, 0);
  let cx = o.align === 'left' ? x : o.align === 'right' ? x - tw : x - tw / 2;
  const n = o.reveal == null ? chars.length : Math.floor(o.reveal), j = o.j ?? 1;
  ctx.save(); ctx.globalAlpha *= o.alpha ?? 1;
  for (let i = 0; i < chars.length && i < n; i++) {
    const c = chars[i], w = ws[i];
    if (c !== ' ') {
      ctx.save();
      ctx.translate(cx + w / 2 + R(id, i) * size * 0.018 * j, y + R(id, i + 300) * size * 0.022 * j);
      ctx.rotate(R(id, i + 600) * 0.035 * j);
      if (o.pop != null) { const s = eBack(clamp(o.pop - i * (o.popStep ?? 0.06), 0, 1) * 1); ctx.scale(s, s); }
      if (o.shadow) { ctx.fillStyle = o.shadow; ctx.fillText(c, -w / 2 + size * 0.055, size * 0.055); }
      ctx.fillStyle = o.color || C.ink; ctx.fillText(c, -w / 2, 0);
      ctx.restore();
    }
    cx += w;
  }
  ctx.restore();
  if (o.cursor && n < chars.length + 1 && Math.floor(TG * 4) % 2 === 0) {
    ctx.fillStyle = o.cursorColor || C.pink; ctx.fillRect(cx + 6, y - size * 0.72, size * 0.5, size * 0.82);
  }
  return tw;
}
function measure(str, size, font = 'Fira') { ctx.font = `${font === 'Pix' ? 400 : 700} ${size}px ${font}`; return ctx.measureText(str).width; }
// underline scribble
function scribble(x1, x2, y, p, col = C.yellow, w = 7) {
  if (p <= 0) return;
  const len = x2 - x1;
  sPath([[x1, y], [x1 + len, y + 4], [x1 + len * 0.1, y + 18], [x1 + len * 0.95, y + 20]], { color: col, w, prog: p, passes: 1 });
}

// ---------------------------------------------------------------- the real SQ² logo (split into layers)
const LOGO_W = 1500, LOGO_H = 694;
const TWO_C = [503, 193];
const WORD_ROWS = [[105, 250], [265, 445], [450, 620]];
const BRACKET_PATH = [[410, 131], [131, 131], [131, 415], [131, 445], [470, 445], [131, 500], [470, 505], [131, 560], [563, 562], [563, 290]];
function logo(cx, cy, sc, o = {}) {
  ctx.save(); ctx.translate(cx, cy); ctx.scale(sc, sc); ctx.translate(-LOGO_W / 2, -LOGO_H / 2);
  const sq = o.sq ?? 1;
  if (sq > 0) {
    if (sq < 1) {
      // reveal the bracket as if a fat marker is tracing it
      let L = 0; const ls = [];
      for (let i = 1; i < BRACKET_PATH.length; i++) { const l = Math.hypot(BRACKET_PATH[i][0] - BRACKET_PATH[i - 1][0], BRACKET_PATH[i][1] - BRACKET_PATH[i - 1][1]); ls.push(l); L += l; }
      let rem = sq * L, head = BRACKET_PATH[0];
      ctx.save(); ctx.beginPath();
      for (let i = 1; i < BRACKET_PATH.length && rem > 0; i++) {
        const [ax, ay] = BRACKET_PATH[i - 1], [bx, by] = BRACKET_PATH[i], f = Math.min(1, rem / ls[i - 1]);
        for (let s = 0; s <= f; s += 8 / ls[i - 1]) { const x = lerp(ax, bx, s), y = lerp(ay, by, s); ctx.moveTo(x + 48, y); ctx.arc(x, y, 48, 0, 6.3); head = [x, y]; }
        rem -= ls[i - 1];
      }
      ctx.clip(); ctx.drawImage(IMG.sq, 0, 0); ctx.restore();
      pix('spark', head[0], head[1], 9, C.yellow);
    } else ctx.drawImage(IMG.sq, 0, 0);
  }
  const t2 = o.two;
  if (t2 !== false && (t2 == null || t2.alpha !== 0)) {
    const tw = t2 || {};
    ctx.save(); ctx.translate(TWO_C[0] + (tw.dx || 0), TWO_C[1] + (tw.dy || 0)); ctx.rotate(tw.rot || 0);
    ctx.scale((tw.s || 1) * (tw.sx || 1), (tw.s || 1) * (tw.sy || 1));
    ctx.drawImage(IMG.two, -TWO_C[0], -TWO_C[1]); ctx.restore();
  }
  const words = o.words ?? 3;
  for (let i = 0; i < 3; i++) {
    const f = clamp(words - i);
    if (f <= 0) continue;
    const [y0, y1] = WORD_ROWS[i], s = lerp(1.7, 1, eBack(f)), my = (y0 + y1) / 2;
    ctx.save(); ctx.translate(655, my); ctx.scale(s, s); ctx.translate(-655, -my);
    ctx.beginPath(); ctx.rect(640, y0, 800, y1 - y0); ctx.clip();
    ctx.drawImage(IMG.text, 0, 0); ctx.restore();
  }
  ctx.restore();
}
// logo-space -> world-space helper
const L2W = (cx, cy, sc, lx, ly) => [cx + (lx - LOGO_W / 2) * sc, cy + (ly - LOGO_H / 2) * sc];

function guides(p, alpha = 0.12) {
  const col = `rgba(244,236,220,${alpha})`;
  for (let i = 0; i < 4; i++) sLine(-100, 200 + i * 230, W + 100, 205 + i * 230, { color: col, w: 2, prog: p, passes: 1 });
  for (let i = 0; i < 6; i++) sLine(180 + i * 312, -100, 185 + i * 312, H + 100, { color: col, w: 2, prog: p, passes: 1 });
}

// ======================================================================
// SCENES — t: drawing time (on twos), c: camera time (every frame), both local
// ======================================================================

// 0.0 – 2.5  Qumi drops in: INTRODUCING / SQ²
function sIntro(t, c) {
  bg(C.bg);
  const zin = seg(c, 2.15, 2.5);
  const qx = 560, qy = 840, ps = 6.2;
  const [gx, gy] = glasses(qx, qy, ps);
  cam(lerp(960, gx, eIn(zin)), lerp(540, gy, eIn(zin)), (1 + 0.05 * c) * (1 + eIn(zin) * 9), -0.01 + 0.01 * c);
  guides(eOut(seg(t, 0, 0.5)));
  sLine(120, qy + 2, 1800, qy + 6, { color: C.lgrey, w: 3, prog: eOut(seg(t, 0, 0.35)) });

  // fall + squash & stretch
  if (t >= 0.08) {
    const f = seg(t, 0.08, 0.55);
    let y = lerp(-80, qy, f * f), sx = 1, sy = 1;
    if (t < 0.55) { sy = 1 + 0.55 * f; sx = 1 - 0.28 * f; sLine(qx - 60, y - 700, qx - 60, y - 300, { color: C.pink, w: 5 }); sLine(qx + 70, y - 800, qx + 70, y - 350, { color: C.yellow, w: 5 }); }
    else { const e = eElastic(seg(t, 0.55, 1.1)); sy = lerp(0.55, 1, e); sx = lerp(1.45, 1, e); }
    qumi(qx, y, ps, { sx, sy, ground: t >= 0.55 });
    puff(qx, qy, seg(t, 0.55, 1.15));
    burst(qx, qy - 20, 160, seg(t, 0.55, 0.85), C.yellow, 12);
    if (t >= 0.55 && t < 0.7) focusLines(qx, qy - 200, 50, 420, 'rgba(244,236,220,0.25)', 3);
  }
  if (t > 1.2) notes(qx - 10, qy - 470, t, 3, 6);

  // INTRODUCING (typed)
  const tx = 820;
  txt('INTRODUCING', tx, 470, 118, { align: 'left', reveal: seg(t, 1.0, 1.72) * 11 + 0.001, shadow: C.pink, cursor: t < 1.85 && t > 0.9 });
  scribble(tx, tx + 790, 500, seg(t, 1.72, 1.9), C.yellow, 7);
  // SQ² slam
  if (t >= 1.85) {
    const s = lerp(2.4, 1, eBack(seg(t, 1.85, 2.05)));
    ctx.save(); ctx.translate(tx, 720); ctx.scale(s, s); ctx.rotate(-0.03 * (1 - seg(t, 1.85, 2.1)));
    const x = txt('SQ', 0, 0, 230, { align: 'left', color: C.pink, shadow: '#000' });
    txt('2', x + 10, -110, 130, { align: 'left', color: C.yellow, shadow: '#000' });
    ctx.restore();
    burst(tx + 200, 640, 260, seg(t, 1.85, 2.15), C.pink, 14, 8);
  }
}

// 2.5 – 5.5  logo assembles, Qumi rides the bracket, the "2" slams in
function sLogo(t, c) {
  bg(C.bg);
  const LX = 960, LY = 460, SC = 0.9;
  cam(960 + Math.sin(c * 1.3) * 8, 540 + Math.cos(c) * 5, lerp(3.4, 1, eOut(seg(c, 0, 0.5))) * (1 + 0.02 * c));
  guides(1, 0.08);
  // construction lines around the logo
  const cp = eOut(seg(t, 0.05, 0.6));
  sRect(360, 150, 1210, 630, { color: 'rgba(244,236,220,0.22)', w: 2, prog: cp });
  sLine(LX, 90, LX, 850, { color: 'rgba(222,92,142,0.25)', w: 2, prog: cp, dash: [10, 14] });

  const twoIn = seg(t, 1.45, 1.62);
  logo(LX, LY, SC, {
    sq: eIO(seg(t, 0.1, 1.2)),
    two: t < 1.45 ? { alpha: 0 } : { dy: lerp(-900, 0, eIn(twoIn)), rot: lerp(2.5, 0, twoIn), s: lerp(2, 1, twoIn), sy: t < 1.8 ? lerp(0.7, 1, eElastic(seg(t, 1.62, 1.9))) : 1 },
    words: seg(t, 1.9, 2.6) * 3,
  });
  const [tx2, ty2] = L2W(LX, LY, SC, TWO_C[0], TWO_C[1]);
  burst(tx2, ty2, 120, seg(t, 1.62, 1.95), C.yellow, 12, 9);
  if (t >= 1.62 && t < 1.8) focusLines(tx2, ty2, 40, 260, 'rgba(255,209,0,0.5)', 3);

  // Qumi: runs in, leaps onto the bracket's top bar, gets bounced by the "2"
  const [bx, by] = L2W(LX, LY, SC, 250, 114);
  const ps = 2.8;
  if (t >= 0.55) {
    let x, y, rot = 0, sx = 1, sy = 1;
    if (t < 1.0) { const k = seg(t, 0.55, 1.0); x = lerp(-150, 330, k); y = 860; rot = (BOIL % 2 ? 0.1 : -0.06); }
    else if (t < 1.4) { const k = seg(t, 1.0, 1.4); x = lerp(330, bx, k); y = lerp(860, by, k) - Math.sin(k * Math.PI) * 280; rot = k * 6.283; }
    else { x = bx; y = by; const e = eElastic(seg(t, 1.4, 1.8)); sy = lerp(0.6, 1, e); sx = lerp(1.35, 1, e); }
    if (t >= 1.62 && t < 2.1) { const k = seg(t, 1.62, 2.1); y = by - Math.sin(k * Math.PI) * 150; pix('bang', x, y - QH() * ps - 60, 9, C.yellow); }
    if (t < 1.0) speedH(700, 880, 'rgba(244,236,220,0.35)', 8);
    qumi(x, y, ps, { rot, sx, sy, flip: false, ground: t < 1.0 || t > 2.1 });
    if (t > 2.1) notes(x, y - 260, t, 3, 5);
  }
  sparkles(LX, LY, 700, 360, t, 8, 5);
  wipe(eIO(seg(t, 2.72, 3.0)), C.pink);
}

// 5.5 – 9.0  Thailand's largest quantum centre + Samyan Mitrtown stamp
function building(x, w, h, gy, col, id) {
  sRect(x, gy - h, w, h, { color: col, w: 3, passes: 1 });
  for (let r = 0; r < Math.floor(h / 55) - 1; r++) for (let k = 0; k < Math.floor(w / 45); k++)
    if (hash(id, r, k) < 0.55) ctx.fillStyle = hash(id, r, k, 1) < 0.2 ? C.yellow : 'rgba(244,236,220,0.18)', ctx.fillRect(x + 16 + k * 45, gy - h + 22 + r * 55, 18, 24);
}
function sCity(t, c) {
  if (t < 1.8) {
    bg(C.bg);
    cam(960, 540, 1.04 - 0.02 * c, 0.012);
    const gy = 900;
    for (let layer = 0; layer < 2; layer++) {
      const speed = layer ? 1500 : 650, span = 2400, col = layer ? C.lgrey : 'rgba(169,168,174,0.4)';
      for (let i = 0; i < 16; i++) {
        const w = 150 + hash(i, layer, 1) * 120, h = (layer ? 180 : 260) + hash(i, layer, 2) * (layer ? 160 : 200);
        const x = ((i * 190 - t * speed) % span + span) % span - 300;
        building(x, w, h, gy, col, i * 10 + layer);
      }
    }
    sLine(-100, gy, W + 100, gy + 3, { color: C.ink, w: 4 });
    speedH(620, 880, 'rgba(244,236,220,0.5)', 12);
    const qx = 520, bob = Math.abs(Math.sin(t * 22)) * 30;
    qumi(qx, gy - bob, 4.2, { rot: BOIL % 2 ? 0.14 : 0.02, ground: true });
    puff(qx - 90, gy, frac(t * 3));
    // headline
    const w1 = seg(t, 0.12, 0.3), w2 = seg(t, 0.42, 0.6), w3 = seg(t, 0.75, 0.93);
    if (w1 > 0) { ctx.save(); ctx.translate(1230, 200); const s = lerp(2, 1, eBack(w1)); ctx.scale(s, s); txt("THAILAND'S", 0, 0, 104, { shadow: '#000' }); ctx.restore(); }
    if (w2 > 0) { ctx.save(); ctx.translate(1230, 380); const s = lerp(2.4, 1, eBack(w2)); ctx.scale(s, s); ctx.rotate(-0.04); txt('LARGEST', 0, 0, 190, { color: C.yellow, shadow: C.pink }); ctx.restore(); }
    scribble(900, 1570, 410, seg(t, 0.62, 0.8), C.pink, 8);
    if (w3 > 0) { ctx.save(); ctx.translate(1230, 540); const s = lerp(2, 1, eBack(w3)); ctx.scale(s, s); txt('QUANTUM CENTER', 0, 0, 96, { shadow: '#000' }); ctx.restore(); }
    burst(1230, 330, 330, seg(t, 0.42, 0.7), C.yellow, 16, 7);
  } else {
    // Samyan Mitrtown, G floor
    const k = c - 1.8, punch = seg(c, 3.15, 3.5);
    bg(C.bg);
    cam(960, lerp(560, 850, eIn(punch)), (1 + 0.2 * eOut(seg(k, 0, 1.3))) * (1 + eIn(punch) * 8));
    const d = eOut(seg(t, 1.8, 2.3));
    sRect(560, 190, 800, 800, { color: C.ink, w: 5, prog: d });
    for (let r = 0; r < 6; r++) for (let q = 0; q < 6; q++) if (d > 0.5) hatch(610 + q * 122, 330 + r * 85, 80, 50, { color: 'rgba(244,236,220,0.28)', gap: 11, w: 2 });
    sRect(610, 225, 700, 80, { color: C.pink, w: 4, prog: seg(t, 2.0, 2.3) });
    if (t > 2.15) txt('SAMYAN MITRTOWN', 960, 285, 60, { reveal: seg(t, 2.15, 2.5) * 15 + 0.01 });
    // the door
    sRect(830, 850, 260, 140, { color: C.yellow, w: 5, prog: seg(t, 2.1, 2.4) });
    if (t > 2.3) { ctx.save(); ctx.globalAlpha = 0.9; logo(960, 905, 0.11, {}); ctx.restore(); txt('G', 1060, 885, 36, { color: C.yellow }); }
    qumi(740, 990, 3.2, { rot: Math.sin(t * 16) * 0.12, ground: true });
    sLine(-100, 990, W + 100, 992, { color: C.lgrey, w: 3 });
    // screen-space stamp + caption
    screen();
    const st = seg(t, 2.35, 2.5);
    if (st > 0) {
      ctx.save(); ctx.translate(1520, 470); ctx.rotate(-0.16); const s = lerp(2.6, 1, eOut(st)); ctx.scale(s, s); ctx.globalAlpha = lerp(0, 1, st);
      sRect(-250, -95, 500, 190, { color: C.pink, w: 7 }); sRect(-232, -78, 464, 156, { color: C.pink, w: 3 });
      txt('EST.', 0, -18, 48, { color: C.pink, j: 0.5 }); txt('26.01.2026', 0, 52, 60, { color: C.pink, j: 0.5 });
      ctx.restore();
      if (st >= 1) for (let i = 0; i < 16; i++) blob(1520 + S(i, 1) * 320, 470 + S(i, 2) * 180, 3 + hash(i, 3) * 7, C.pink);
    }
    if (t > 2.6) txt('G FLOOR · BANGKOK, THAILAND', 960, 1040, 42, { color: C.lgrey, reveal: seg(t, 2.6, 3.0) * 27 + 0.01 });
    if (t < 1.9) flash(1 - seg(t, 1.8, 1.9));
  }
}

// 9.0 – 14.0  building, connecting, uniting: the network + the world
const ORGS = [
  ['IBM', 'IBM THAILAND', 'TH'], ['QTFT', 'QUANTUM TECH FDN', 'TH'], ['SCB', 'SIAM COMMERCIAL BANK', 'TH'],
  ['WD', 'WESTERN DIGITAL', 'US'], ['AIST', 'AIST · G-QuAT', 'JP'], ['NIMS', 'NIMS', 'JP'],
  ['QUNOVA', 'QUNOVA COMPUTING', 'KR'], ['KAIST', 'KAIST', 'KR'],
];
const PLACES = [ // lon, lat, name, kind (p = partner org, s = SQST 2026 speaker)
  [139.7, 35.7, 'JAPAN', 'p'], [127.4, 36.4, 'KOREA', 'p'], [-121.9, 37.3, 'USA', 'p'],
  [6.6, 46.5, 'SWITZERLAND', 's'], [24.9, 60.2, 'FINLAND', 's'], [103.8, 1.35, 'SINGAPORE', 's', 300, 200], [-114, 51, 'CANADA', 's'],
];
// label offsets from each dot, chosen so the landed Qumis never cover a name
const LABEL_AT = {
  JAPAN: [70, -92], KOREA: [-70, -92], USA: [0, 52], CANADA: [0, -92],
  SWITZERLAND: [-150, 10], FINLAND: [-110, 10], SINGAPORE: [0, 52],
};
function sNetwork(t, c) {
  bg(C.bg);
  if (t < 2.9) {
    const out = seg(c, 2.6, 2.9);
    cam(960, 555, lerp(1.14, 1, eOut(seg(c, 0, 2.4))) * lerp(1, 0.08, eIn(out)), lerp(0.03, -0.01, seg(c, 0, 2.6)) + out * 0.8);
    const HX = 960, HY = 555, rx = 700, ry = 285;
    sCircle(HX, HY, 150, { color: C.pink, w: 6, prog: eOut(seg(t, 0, 0.3)) });
    sCircle(HX, HY, 170, { color: C.pink, w: 2, prog: eOut(seg(t, 0.1, 0.4)) });
    let count = 0; const countries = new Set();
    ORGS.forEach(([ab, name, cc], i) => {
      const a = -Math.PI / 2 + i * Math.PI / 4 + 0.39, nx = HX + Math.cos(a) * rx, ny = HY + Math.sin(a) * ry;
      const ti = 0.3 + i * 0.24;
      const ux = Math.cos(a), uy = Math.sin(a) * ry / rx, ul = Math.hypot(ux, uy);
      const sx = HX + ux / ul * 175, sy = HY + uy / ul * 175, ex = nx - ux / ul * 64, ey = ny - uy / ul * 64;
      const lp = eOut(seg(t, ti, ti + 0.18));
      sLine(sx, sy, ex, ey, { color: C.lgrey, w: 3, prog: lp });
      if (lp >= 1) for (let k = 0; k < 2; k++) {
        const f = frac(t * 0.9 + i * 0.13 + k * 0.5), ff = k ? 1 - f : f;
        ctx.fillStyle = k ? C.cyan : C.yellow; ctx.fillRect(lerp(sx, ex, ff) - 6, lerp(sy, ey, ff) - 6, 12, 12);
      }
      const np = seg(t, ti + 0.1, ti + 0.28);
      if (np > 0) {
        count++; countries.add(cc);
        sCircle(nx, ny, 60, { color: cc === 'TH' ? C.pink : C.yellow, w: 5, prog: eOut(np) });
        ctx.save(); ctx.translate(nx, ny); const s = eBack(np); ctx.scale(s, s);
        txt(ab, 0, 11, ab.length > 4 ? 25 : 32);
        txt(name, 0, 96, 27, { color: C.lgrey });
        txt(cc, 0, 128, 26, { color: cc === 'TH' ? C.pink : C.yellow });
        ctx.restore();
        burst(nx, ny, 70, seg(t, ti + 0.2, ti + 0.45), C.ink, 8, 4);
      }
    });
    qumi(HX, HY + 118, 3.0, { rot: Math.sin(t * 8) * 0.05 });
    notes(HX, HY - 130, t, 2, 4);
    // HUD
    screen();
    ['BUILDING', 'CONNECTING', 'UNITING'].forEach((w, i) => {
      const p = seg(t, i * 0.12, i * 0.12 + 0.2);
      if (p > 0) { ctx.save(); ctx.translate(480 + i * 480, 95); const s = eBack(p); ctx.scale(s, s); txt(w, 0, 0, 58, { color: i === 1 ? C.yellow : C.lgrey }); ctx.restore(); }
      if (i < 2 && p >= 1) txt('·', 720 + i * 480, 95, 58, { color: C.pink });
    });
    txt(String(count).padStart(2, '0'), 90, 1010, 88, { align: 'left', font: 'Pix', color: C.yellow, j: 0.3 });
    txt('ORGS CONNECTED', 280, 1000, 40, { align: 'left', color: C.ink });
    txt(String(countries.size).padStart(2, '0'), 1830, 1010, 88, { align: 'right', font: 'Pix', color: C.pink, j: 0.3 });
    txt('COUNTRIES', 1640, 1000, 40, { align: 'right', color: C.ink });
  } else {
    // zoom out: Thailand wired to the world
    const k = t - 2.9, kc = c - 2.9;
    const wrap = l => ((l - 100 + 540) % 360) - 180;
    const X = lon => 960 + wrap(lon) * 4.3, Y = lat => 600 - lat * 6.3;
    const THX = X(100.5), THY = Y(13.7);
    cam(lerp(THX, 960, eOut(seg(kc, 0, 0.5))), lerp(THY, 520, eOut(seg(kc, 0, 0.5))), lerp(5, 1, eOut(seg(kc, 0, 0.5))) * (1 + 0.03 * kc));
    const gp = eOut(seg(k, 0, 0.5));
    for (const lat of [-30, 0, 30, 60]) sLine(80, Y(lat), 1840, Y(lat) + 2, { color: 'rgba(244,236,220,0.13)', w: 2, prog: gp, passes: 1, dash: [6, 16] });
    for (let lon = -170; lon <= 190; lon += 30) sLine(X(lon + 100), Y(75), X(lon + 100), Y(-45), { color: 'rgba(244,236,220,0.08)', w: 2, prog: gp, passes: 1 });
    const riders = [];
    PLACES.forEach(([lon, lat, name, kind, ox = 0, oy = 0], i) => {
      const ti = 0.25 + i * 0.12, x = X(lon) + ox, y = Y(lat) + oy;
      const mx = (THX + x) / 2, my = (THY + y) / 2 - Math.abs(x - THX) * 0.28 - 60;
      const pts = []; for (let s = 0; s <= 24; s++) { const u = s / 24; pts.push([(1 - u) * (1 - u) * THX + 2 * u * (1 - u) * mx + u * u * x, (1 - u) * (1 - u) * THY + 2 * u * (1 - u) * my + u * u * y]); }
      const col = kind === 'p' ? C.pink : C.yellow;
      sPath(pts, { color: col, w: kind === 'p' ? 5 : 3, prog: eOut(seg(k, ti, ti + 0.4)), dash: kind === 's' ? [14, 12] : null });
      if (k > ti + 0.35) {
        const f = frac(k * 0.8 + i * 0.21), q = pts[Math.floor(f * 24)];
        ctx.fillStyle = C.ink; ctx.fillRect(q[0] - 5, q[1] - 5, 10, 10);
        blob(x, y, 11, col);
        const s = eBack(seg(k, ti + 0.35, ti + 0.55));
        const [lx, ly] = LABEL_AT[name];
        ctx.save(); ctx.translate(x + lx, y + ly); ctx.scale(s, s); txt(name, 0, 0, 30, { color: col }); ctx.restore();
      }
      riders.push([pts, seg(k, ti + 0.3, ti + 1.1), x < THX, i]);
    });
    // a small Qumi rides every path out of Thailand
    for (const [pts, p, left, i] of riders) {
      if (p <= 0) continue;
      const u = eIO(p) * 24, a = Math.min(23, Math.floor(u)), f = u - a;
      const qx = lerp(pts[a][0], pts[a + 1][0], f), qy = lerp(pts[a][1], pts[a + 1][1], f);
      const hop = p >= 1 ? Math.abs(Math.sin(k * 9 + i)) * 10 : 0;
      qumi(qx, qy - hop, 0.85, { rot: p < 1 ? Math.atan2(pts[a + 1][1] - pts[a][1], pts[a + 1][0] - pts[a][0]) * 0.35 * (left ? -1 : 1) + (left ? 0.2 : -0.2) : 0, flip: left, j: 0.5 });
    }
    blob(THX, THY, 16, C.pink); sCircle(THX, THY, 34 + Math.sin(k * 10) * 6, { color: C.pink, w: 3, passes: 1 });
    txt('THAILAND', THX, THY + 70, 34, { color: C.ink });
    screen();
    const tp = seg(k, 0.2, 0.4);
    if (tp > 0) { ctx.save(); ctx.translate(960, 120); ctx.scale(eBack(tp), eBack(tp)); txt('THAILAND × THE WORLD', 0, 0, 76, { shadow: C.pink }); ctx.restore(); }
    const bp = seg(k, 1.1, 1.3);
    if (bp > 0) {
      ctx.save(); ctx.translate(960, 985); ctx.scale(eBack(bp), eBack(bp));
      const w = txt('8 COUNTRIES · ONE QUANTUM NETWORK', 0, 0, 54, { color: C.yellow });
      ctx.restore();
      scribble(960 - w / 2, 960 + w / 2, 1010, seg(k, 1.3, 1.5), C.pink, 5);
    }
    txt('— PARTNERS', 110, 1060, 26, { align: 'left', color: C.pink, j: 0.3 });
    txt('-- SQST 2026 SPEAKERS', 360, 1060, 26, { align: 'left', color: C.yellow, j: 0.3 });
    if (k < 0.12) flash(1 - k / 0.12, C.yellow);
  }
}

// 14.0 – 19.0  rapid-fire stat cards
function jpFlag(x, y) { ctx.fillStyle = C.ink; ctx.fillRect(x - 90, y - 60, 180, 120); blob(x, y, 36, C.red); sRect(x - 90, y - 60, 180, 120, { color: C.bg, w: 4 }); }
function cloud(x, y, s) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
  for (const [bx, by, br, sx, sy] of [[0, 0, 150, 1.3, 0.5], [-90, -30, 70, 1, 1], [20, -60, 90, 1, 1], [110, -20, 60, 1, 1]]) blob(bx, by, br, C.cyan, sx, sy);
  sCircle(-90, -30, 70, { color: C.bg, w: 4, passes: 1, prog: 0.55 }); sCircle(20, -60, 90, { color: C.bg, w: 4, passes: 1, prog: 0.5 });
  ctx.restore();
}
function sStats(t, c) {
  const i = Math.min(4, Math.floor(t)), k = t - i, kc = c - i;
  const cards = [
    { bg: C.pink, big: '5-YEAR', bc: C.bg, sub: 'MoU · AIST G-QuAT · JAPAN', sc: C.bg },
    { bg: C.bg, big: '3-YEAR', bc: C.yellow, sub: 'MoU · QUNOVA COMPUTING · KOREA', sc: C.ink },
    { bg: C.yellow, big: 'SQST 2026', bc: C.bg, sub: '10 WORLD-CLASS SPEAKERS · 4 DAYS', sc: C.bg },
    { bg: C.bg, big: 'MSc + PhD', bc: C.pink, sub: 'INTERNATIONAL QUANTUM PROGRAMS', sc: C.ink },
    { bg: C.ink, big: 'CLOUD-FIRST', bc: C.bg, sub: 'QUANTUM ACCESS FOR THAILAND · WITH IBM', sc: C.bg },
  ];
  const cd = cards[i];
  bg(cd.bg);
  const dir = i % 2 ? 1 : -1;
  cam(960, 540, lerp(1.4, 1, eBack(seg(kc, 0, 0.28))) + 0.04 * kc, lerp(0.07 * dir, 0, eOut(seg(kc, 0, 0.3))));
  const dark = cd.bg === C.bg;
  if (dark) focusLines(960, 470, 50, 520, 'rgba(244,236,220,0.07)', 3);
  else focusLines(960, 470, 50, 520, 'rgba(20,17,23,0.09)', 3);
  const bigY = i === 2 ? 340 : 480, subY = i === 2 ? 450 : 610;
  const bs = i === 4 ? 230 : 260;
  const bw = measure(cd.big, bs);
  txt(cd.big, 960, bigY, bs, { color: cd.bc, shadow: dark ? '#000' : 'rgba(20,17,23,0.25)', pop: k * 12, popStep: 0.12 });
  scribble(960 - bw / 2, 960 + bw / 2, bigY + 40, seg(k, 0.25, 0.45), i === 0 ? C.yellow : i === 1 ? C.pink : i === 2 ? C.pink : i === 3 ? C.yellow : C.pink, 9);
  txt(cd.sub, 960, subY + 40, 54, { color: cd.sc, reveal: seg(k, 0.2, 0.5) * cd.sub.length + 0.01 });
  // counter
  txt(`0${i + 1}/05`, 80, 90, 34, { align: 'left', font: 'Pix', color: dark ? C.lgrey : C.bg, j: 0.2 });
  // Qumi per card
  const bob = Math.abs(Math.sin(k * 12)) * 20;
  if (i === 0) { qumi(lerp(2200, 1640, eBack(seg(k, 0, 0.3))), 1010 - bob, 4.6, { rot: 0.12, ground: true }); jpFlag(260, 830); pix('heart', 1720, 560 - k * 60, 8, C.bg); }
  if (i === 1) { qumi(lerp(-300, 300, eBack(seg(k, 0, 0.3))), 1010 - bob, 4.6, { flip: true, rot: -0.1, ground: true }); sRect(1540, 760, 220, 150, { color: C.yellow, w: 5 }); txt('KR', 1650, 865, 80, { color: C.yellow }); }
  if (i === 2) { const y = lerp(1700, 1440, eOut(seg(k, 0, 0.35))); qumi(960, y, 9.5, {}); for (let s = 0; s < 3; s++) pix('spark', 380 + s * 580, 760 + Math.sin(k * 8 + s) * 30, 10, C.bg); }
  if (i === 3) {
    const qx = lerp(-300, 300, eBack(seg(k, 0, 0.3))), ps = 4.6;
    qumi(qx, 1010, ps, { ground: true, rot: -0.05 });
    const capY = 1010 - QH() * ps - 10 - Math.max(0, 1 - seg(k, 0.25, 0.5)) * 500;
    pix('cap', qx + 12, capY, 13, C.yellow);
    sLine(1500, 780, 1760, 940, { color: C.yellow, w: 6 }); sLine(1760, 940, 1700, 880, { color: C.yellow, w: 6 }); sLine(1760, 940, 1680, 950, { color: C.yellow, w: 6 });
  }
  if (i === 4) { const fy = Math.sin(k * 6) * 18; cloud(1640, 1000 + fy, 0.9); qumi(1640, 965 + fy, 3.4, { rot: 0.05 }); cloud(280, 930 - fy, 0.65); }
  if (k < 0.08) flash(1 - k / 0.08, dark ? C.ink : C.bg);
}

// 19.0 – 23.5  superposition: |SQ²⟩ = |BUILD⟩ + |CONNECT⟩ + |UNITE⟩ -> observe -> collapse
function sSuper(t, c) {
  bg(C.bg);
  const coll = seg(t, 3.55, 4.05);
  cam(960, 540, (1 + 0.04 * Math.sin(c * 2)) * lerp(1, 1.3, eIn(coll)), Math.sin(c * 1.4) * 0.02 + coll * 0.4);
  // faint ket wallpaper
  ctx.save(); ctx.globalAlpha = 0.08;
  for (let r = 0; r < 7; r++) for (let q = 0; q < 9; q++) txt(hash(r, q) < 0.5 ? '|0⟩' : '|1⟩', 110 + q * 215 + (r % 2) * 100, 80 + r * 160, 40, { color: C.ink, j: 0.3 });
  ctx.restore();
  const tints = [C.pink, null, C.yellow];
  if (t < 1.5) {
    for (let i = 0; i < 3; i++) {
      const x = lerp(960, 480 + i * 480, eBack(seg(t, 0.25, 0.65)));
      if (i === 1 || t > 0.25) qumi(x, 810 + Math.sin(t * 9 + i * 2) * 14, 4.2, { tint: tints[i], alpha: i === 1 ? 1 : 0.9, rot: Math.sin(t * 6 + i) * 0.08 });
    }
    // amplitude wave
    const pts = []; for (let s = 0; s <= 60; s++) pts.push([300 + s * 22, 900 + Math.sin(s * 0.45 + t * 10) * 26 * seg(t, 0.4, 0.8)]);
    sPath(pts, { color: C.cyan, w: 4, prog: eOut(seg(t, 0.35, 0.9)) });
    ['|BUILD⟩', '|CONNECT⟩', '|UNITE⟩'].forEach((w, i) => {
      const p = seg(t, 0.7 + i * 0.12, 0.9 + i * 0.12);
      if (p > 0) { ctx.save(); ctx.translate(480 + i * 480, 990); ctx.scale(eBack(p), eBack(p)); txt(w, 0, 0, 58, { color: [C.pink, C.ink, C.yellow][i] }); ctx.restore(); }
      if (i < 2 && p >= 1) txt('+', 720 + i * 480, 990, 64, { color: C.lgrey });
    });
    screen();
    txt('|SQ²⟩ = |BUILD⟩ + |CONNECT⟩ + |UNITE⟩', 960, 170, 64, { reveal: seg(t, 0.05, 0.75) * 37 + 0.01, cursor: true, cursorColor: C.yellow });
    if (t < 0.1) flash(1 - t / 0.1, C.cyan);
  } else {
    // one cat, every state: copies fill the screen, then collapse into the eye
    const cols = 11, rows = 5;
    const eyeOpen = seg(t, 3.05, 3.3);
    for (let r = 0; r < rows; r++) for (let q = 0; q < cols; q++) {
      const idx = r * cols + q, d = Math.hypot(q - 5, r - 2);
      const app = seg(t, 1.5 + d * 0.06, 1.65 + d * 0.06);
      if (app <= 0) continue;
      let x = 110 + q * 170 + (r % 2) * 40, y = 215 + r * 205;
      const k = eIn(coll), a = k * 4;
      const dx = x - 960, dy = y - 540;
      x = 960 + (dx * Math.cos(a) - dy * Math.sin(a)) * (1 - k); y = 540 + (dx * Math.sin(a) + dy * Math.cos(a)) * (1 - k);
      qumi(x, y + 70 + Math.sin(t * 10 + idx) * 10, 1.9 * eBack(app) * (1 - k * 0.7), { tint: [C.pink, C.yellow, C.cyan, null][idx % 4], rot: Math.sin(t * 5 + idx * 1.7) * 0.25 + a, flip: idx % 3 === 0, j: 0.5 });
    }
    screen();
    const banner = (s, from, to, col) => {
      const p = seg(t, from, from + 0.15);
      if (p <= 0 || t >= to) return;
      const w = measure(s, 170) + 80;
      ctx.save(); ctx.translate(960, 560); ctx.rotate(-0.04); const sc = eBack(p); ctx.scale(sc, sc);
      ctx.fillStyle = C.bg; ctx.fillRect(-w / 2, -150, w, 210); hatch(-w / 2, -150, w, 210, { color: 'rgba(222,92,142,0.35)', gap: 12 });
      sRect(-w / 2, -150, w, 210, { color: col, w: 6 });
      txt(s, 0, 20, 170, { color: col, shadow: '#000' }); ctx.restore();
    };
    banner('ONE CAT.', 1.7, 2.35, C.ink);
    banner('EVERY STATE.', 2.35, 3.0, C.yellow);
    if (eyeOpen > 0) {
      // hand-drawn eye opening
      const ey = 540, hw = 380, hh = 170 * eOut(eyeOpen) * (1 - eIn(seg(t, 3.9, 4.1)));
      ctx.fillStyle = C.ink; ctx.beginPath(); ctx.moveTo(960 - hw, ey); ctx.quadraticCurveTo(960, ey - hh * 2, 960 + hw, ey); ctx.quadraticCurveTo(960, ey + hh * 2, 960 - hw, ey); ctx.fill();
      sPath([[960 - hw, ey], [960 - hw / 2, ey - hh * 1.1], [960, ey - hh * 1.5], [960 + hw / 2, ey - hh * 1.1], [960 + hw, ey]], { color: C.pink, w: 7 });
      sPath([[960 - hw, ey], [960 - hw / 2, ey + hh * 1.1], [960, ey + hh * 1.5], [960 + hw / 2, ey + hh * 1.1], [960 + hw, ey]], { color: C.pink, w: 7 });
      if (hh > 20) { blob(960, ey, Math.min(hh, 110), C.bg); blob(960, ey, Math.min(hh, 110) * 0.45, C.pink); ctx.fillStyle = C.ink; ctx.fillRect(975, ey - 40, 24, 24); }
      if (t < 3.55) txt('OBSERVE.', 960, 250, 110, { color: C.yellow, shadow: '#000', pop: seg(t, 3.05, 3.4) * 5, popStep: 0.12 });
    }
    focusLines(960, 540, 60, lerp(700, 60, eIn(coll)), 'rgba(244,236,220,0.18)', 3, coll);
    flash(seg(t, 4.05, 4.2) * 1.0);
  }
}

// 23.5 – 30.0  Qumi lands inside the square; logo + tagline
function sFinal(t, c) {
  bg(C.bg);
  cam(960, 540, 1 + 0.045 * eIO(seg(c, 0.4, 6.5)), 0);
  const LX = 960, LY = 410, SC = 0.78;
  // shockwave rings
  for (let i = 0; i < 3; i++) { const p = seg(t, 0.05 + i * 0.08, 0.7 + i * 0.08); if (p > 0 && p < 1) sCircle(960, 480, 100 + p * 1100, { color: [C.pink, C.yellow, C.ink][i], w: 10 * (1 - p) + 1, passes: 1 }); }
  sRect(330, 125, 1260, 575, { color: 'rgba(244,236,220,0.16)', w: 2, prog: eOut(seg(t, 0.3, 0.9)) });
  for (const [x, y] of [[330, 125], [1590, 125], [330, 700], [1590, 700]]) { sLine(x - 30, y, x + 30, y, { color: C.pink, w: 3, passes: 1 }); sLine(x, y - 30, x, y + 30, { color: C.pink, w: 3, passes: 1 }); }
  const pop = eBack(seg(t, 0, 0.35));
  const land = 0.85, twoK = seg(t, land, land + 0.55);
  ctx.save(); ctx.translate(LX, LY); ctx.scale(lerp(1.5, 1, pop), lerp(1.5, 1, pop)); ctx.translate(-LX, -LY);
  logo(LX, LY, SC, {
    words: seg(t, 0.25, 0.55) * 3,
    two: { dy: t > land ? -110 * Math.sin(Math.PI * twoK) * (1 - twoK) : 0, rot: t > land ? 0.4 * Math.sin(twoK * 9) * (1 - twoK) : 0, sy: t > land ? lerp(0.75, 1, eElastic(twoK)) : 1 },
  });
  ctx.restore();
  // Qumi drops into the square
  const [ix, iy] = L2W(LX, LY, SC, 340, 408), ps = 2.6;
  if (t >= 0.45) {
    const f = seg(t, 0.45, land);
    let y = lerp(-150, iy, eIn(f)), sx = 1, sy = 1;
    if (t < land) { sy = 1 + 0.4 * f; sx = 1 - 0.2 * f; } else { const e = eElastic(seg(t, land, land + 0.5)); sy = lerp(0.6, 1, e); sx = lerp(1.35, 1, e); }
    qumi(ix, y, ps, { sx, sy });
    const [tx2, ty2] = L2W(LX, LY, SC, TWO_C[0], TWO_C[1]);
    burst(tx2, ty2, 90, seg(t, land, land + 0.3), C.yellow, 10, 7);
    burst(ix, iy, 140, seg(t, land, land + 0.3), C.ink, 12, 5);
    if (t > 1.3) notes(ix, iy - 230, t, 3, 4.5, 150);
    // glasses glint
    const g = seg(t, 4.3, 4.8);
    if (g > 0 && g < 1) { const [gx, gy] = glasses(ix, iy, ps); pix('spark', gx - 30 + g * 60, gy, 6 + Math.sin(g * Math.PI) * 8, C.ink); }
  }
  sparkles(LX, LY, 720, 330, t * 0.8, 10, 5);
  // tagline
  const tag = 'BUILDING · CONNECTING · UNITING QUANTUM';
  txt(tag, 960, 830, 56, { reveal: seg(t, 1.2, 2.0) * tag.length + 0.01, cursor: t < 2.3, cursorColor: C.pink });
  const tp = seg(t, 2.2, 2.4);
  if (tp > 0) { ctx.save(); ctx.translate(960, 918); ctx.scale(eBack(tp), eBack(tp)); txt('THAILAND × THE WORLD', 0, 0, 48, { color: C.yellow }); ctx.restore(); }
  txt('sq2.chula.ac.th', 960, 1000, 40, { color: C.lgrey, reveal: seg(t, 2.8, 3.3) * 15 + 0.01 });
  if (t > 3.3) scribble(810, 1110, 1018, seg(t, 3.3, 3.55), C.pink, 4);
  flash(1 - seg(t, 0, 0.25));
}

// ---------------------------------------------------------------- timeline
const SCENES = [
  [0, 2.5, sIntro], [2.5, 5.5, sLogo], [5.5, 9.0, sCity], [9.0, 14.0, sNetwork],
  [14.0, 19.0, sStats], [19.0, 23.5, sSuper], [23.5, 30.0, sFinal],
];
// impacts that shake the camera (global seconds, amplitude px)
SHAKE = [
  [0.7, 22], [1.85, 26], [2.5 + 1.62, 30], [2.5 + 1.9, 10], [2.5 + 2.13, 10], [2.5 + 2.37, 10],
  [5.62, 8], [5.92, 16], [6.25, 8], [5.5 + 2.35, 28],
  ...ORGS.map((_, i) => [9.0 + 0.4 + i * 0.24, 6]), [11.9, 14],
  [14, 24], [15, 24], [16, 24], [17, 24], [18, 24],
  [19.0 + 1.7, 14], [19.0 + 2.35, 14], [19.0 + 3.05, 10], [23.5, 36], [23.5 + 0.85, 26],
];

function renderFrame(f) {
  _id = 0;
  TG = f / FPS;
  const td = TG;                               // motion at full 60 fps
  BOIL = Math.floor(TG * 12);                  // line boil stays at 12 fps (hand-drawn texture)
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1;
  const sc = SCENES.find(s => TG < s[1]) || SCENES[SCENES.length - 1];
  sc[2](Math.max(0, td - sc[0]), TG - sc[0]);
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1;
  ctx.drawImage(GRAIN, 0, 0);
}

window.READY = (async () => {
  await Promise.all([
    load('qumi', 'assets/qumi_8bit.png'), load('sq', 'assets/logo_sq.png'),
    load('two', 'assets/logo_2.png'), load('text', 'assets/logo_text.png'),
    document.fonts.load("700 40px Fira"), document.fonts.load('400 40px Pix'),
  ]);
  makeGrain();
  window.renderFrame = renderFrame;
  window.FRAMES = FRAMES; window.FPS = FPS;
  if (!/render/.test(location.search)) {        // live preview in a browser
    const t0 = performance.now();
    const loop = () => { renderFrame(Math.floor((performance.now() - t0) / 1000 * FPS) % FRAMES); requestAnimationFrame(loop); };
    loop();
  }
})();
