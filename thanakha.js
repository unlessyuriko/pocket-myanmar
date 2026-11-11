// Draws thanakha onto a canvas, using MediaPipe face landmarks (478 points).
// Each shape is drawn in a small "face-local" space so it turns, tilts and
// shrinks with the head: u points outward (away from the nose), v points down.

import { texPoints } from "./facemap.js";

export const SHAPES = [
  { id: "circle",  mm: "အဝိုင်း" },
  { id: "square",  mm: "လေးထောင့်" },
  { id: "leaf",    mm: "ညောင်ရွက်" },
  { id: "stripes", mm: "မျဉ်းကြောင်း" },
  { id: "heart",   mm: "နှလုံး" },
  { id: "flower",  mm: "ပန်း" },
  { id: "full",    mm: "မျက်နှာအပြည့်" },
  { id: "none",    mm: "မလိမ်း" },
];

export const TONES = [
  { id: "fresh",   label: "လတ်ဆတ်",   base: [232, 212, 158] },
  { id: "classic", label: "ရိုးရိုး",     base: [238, 226, 192] },
  { id: "dry",     label: "ခြောက်သွေ့", base: [244, 239, 226] },
];

// Landmark indices
const FACE_OVAL = [10,338,297,332,284,251,389,356,454,323,361,288,397,365,379,378,400,377,152,148,176,149,150,136,172,58,132,93,234,127,162,21,54,103,67,109];
const EYE_L = [33,7,163,144,145,153,154,155,133,173,157,158,159,160,161,246];
const EYE_R = [263,249,390,373,374,380,381,382,362,398,384,385,386,387,388,466];
const BROW_L = [70,63,105,66,107,55,65,52,53,46];
const BROW_R = [300,293,334,296,336,285,295,282,283,276];
const LIPS = [61,146,91,181,84,17,314,405,321,375,291,409,270,269,267,0,37,39,40,185];

// ---------- texture ----------
const patternCache = new Map();

function makeTexture(tone) {
  const S = 256;
  const c = document.createElement("canvas");
  c.width = c.height = S;
  const g = c.getContext("2d");
  const [r, gr, b] = tone.base;
  g.fillStyle = `rgb(${r},${gr},${b})`;
  g.fillRect(0, 0, S, S);

  // Seeded random so the texture looks the same every time
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

  // Finger-swipe streaks
  for (let i = 0; i < 90; i++) {
    const y = rnd() * S, x = rnd() * S, len = 40 + rnd() * 120;
    const light = rnd() > 0.5;
    g.strokeStyle = light ? `rgba(255,252,240,${0.08 + rnd() * 0.12})` : `rgba(150,120,70,${0.05 + rnd() * 0.08})`;
    g.lineWidth = 1 + rnd() * 3;
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo(x + len / 2, y + (rnd() - 0.5) * 14, x + len, y + (rnd() - 0.5) * 10);
    g.stroke();
    // wrap so the tile repeats without seams
    g.save(); g.translate(-S, 0); g.stroke(); g.restore();
  }
  // Grain
  for (let i = 0; i < 4200; i++) {
    const x = rnd() * S, y = rnd() * S, s = rnd() * 1.8 + 0.4;
    g.fillStyle = rnd() > 0.55 ? `rgba(255,255,248,${rnd() * 0.35})` : `rgba(120,95,55,${rnd() * 0.22})`;
    g.fillRect(x, y, s, s);
  }

  // Uneven thickness: thin, see-through patches and finger drags where skin shows
  g.globalCompositeOperation = "destination-out";
  for (let i = 0; i < 26; i++) {
    const x = rnd() * S, y = rnd() * S, r = 14 + rnd() * 46;
    const a = 0.12 + rnd() * 0.3;
    for (const [ox, oy] of [[0, 0], [-S, 0], [S, 0], [0, -S], [0, S]]) {
      const grd = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
      grd.addColorStop(0, `rgba(0,0,0,${a})`);
      grd.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = grd;
      g.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
    }
  }
  for (let i = 0; i < 40; i++) {
    const y = rnd() * S, x = rnd() * S, len = 30 + rnd() * 90;
    g.strokeStyle = `rgba(0,0,0,${0.08 + rnd() * 0.18})`;
    g.lineWidth = 1 + rnd() * 2.5;
    for (const ox of [0, -S]) {
      g.beginPath();
      g.moveTo(x + ox, y);
      g.lineTo(x + ox + len, y + (rnd() - 0.5) * 8);
      g.stroke();
    }
  }
  g.globalCompositeOperation = "source-over";
  return c;
}

function getPattern(ctx, toneId) {
  const tone = TONES.find(t => t.id === toneId) || TONES[0];
  let tex = patternCache.get(tone.id);
  if (!tex) { tex = makeTexture(tone); patternCache.set(tone.id, tex); }
  return ctx.createPattern(tex, "repeat");
}

// ---------- geometry helpers ----------
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y });
const mul = (a, k) => ({ x: a.x * k, y: a.y * k });
const lerp = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

function centroid(P, idx) {
  let x = 0, y = 0;
  for (const i of idx) { x += P[i].x; y += P[i].y; }
  return { x: x / idx.length, y: y / idx.length };
}

function polygon(ctx, P, idx, scale = 1, center = null) {
  const c = center || centroid(P, idx);
  idx.forEach((i, k) => {
    const p = lerp(c, P[i], scale);
    k ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y);
  });
  ctx.closePath();
}

// How long the "painting on" spread takes, and how far along a face is (0 to 1)
export const REVEAL_MS = 750;
export function revealProgress(P, opts) {
  if (opts.now == null) return 1;
  const born = Math.max((P.meta && P.meta.birth) || 0, opts.restart || 0);
  return Math.min(1, Math.max(0, ((opts.now || 0) - born) / REVEAL_MS));
}

// ---------- head turn ----------
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const smoothstep = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// Real (3D) width of the face between the two cheek edges; stays steady as the head turns
function faceW3(P) {
  const a = P[234], b = P[454];
  return Math.hypot(a.x - b.x, a.y - b.y, (a.z || 0) - (b.z || 0)) || 1;
}

// How a cheek faces the camera. A cheek's surface points ~55 degrees outward from the
// nose; turning the head toward that side swings it to face the lens, turning away hides it.
//   vis:  0 (hidden) to 1 (fully visible)
//   fore: how squeezed the cheek looks sideways (1 = face-on)
const CHEEK_ANGLE = 0.8;
function cheekPose(P, edge, other) {
  const e = P[edge], o = P[other];
  const len = Math.hypot(e.x - o.x, e.y - o.y, (e.z || 0) - (o.z || 0)) || 1;
  const turn = Math.asin(clamp(((o.z || 0) - (e.z || 0)) / len, -1, 1));   // + = this side nearer the camera
  const facing = Math.cos(CHEEK_ANGLE - turn);
  return {
    vis: smoothstep(-0.05, 0.2, facing),
    fore: clamp(facing / Math.cos(CHEEK_ANGLE), 0.3, 1.4),
  };
}

// Draw something at a given opacity, keeping its internal cut-outs (scrapes, torn edges) crisp
let scratch = null;
function withLayer(ctx, alpha, draw) {
  if (alpha >= 0.98) { ctx.save(); draw(ctx); ctx.restore(); return; }
  if (!scratch) scratch = document.createElement("canvas");
  if (scratch.width !== ctx.canvas.width || scratch.height !== ctx.canvas.height) {
    scratch.width = ctx.canvas.width; scratch.height = ctx.canvas.height;
  }
  const g = scratch.getContext("2d");
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, scratch.width, scratch.height);
  g.save(); draw(g); g.restore();
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha *= alpha;
  ctx.drawImage(scratch, 0, 0);
  ctx.restore();
}

// Face outline path, with the top lifted to cover the whole forehead
// (the landmark outline stops partway up the forehead, below the hairline)
function faceOutline(ctx, P, scale) {
  const c = centroid(P, FACE_OVAL);
  const d = sub(P[152], P[10]);
  const H2 = d.x * d.x + d.y * d.y || 1;
  FACE_OVAL.forEach((i, k) => {
    const p = lerp(c, P[i], scale);
    const t = ((P[i].x - P[10].x) * d.x + (P[i].y - P[10].y) * d.y) / H2;   // 0 = top, 1 = chin
    const w = 1 - smoothstep(0, 0.4, t);
    const q = { x: p.x - d.x * 0.24 * w, y: p.y - d.y * 0.24 * w };
    k ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y);
  });
  ctx.closePath();
}

// Put the canvas into a face-local space: origin O, axes U (outward) and V (down)
function frame(ctx, O, U, V) {
  ctx.setTransform(U.x, U.y, V.x, V.y, O.x, O.y);
}

// Thanakha texture is ~2.5 face-units per tile
function fillPaste(ctx, pattern, unitPx = 1) {
  if (pattern.setTransform) {
    const k = 2.5 / 256;
    pattern.setTransform(new DOMMatrix([k * unitPx, 0, 0, k * unitPx, 0, 0]));
  }
  ctx.fillStyle = pattern;
  ctx.fill();
  // Break up the outline so it isn't a perfect geometric edge
  ctx.save();
  ctx.globalCompositeOperation = "destination-out";
  ctx.strokeStyle = "rgba(0,0,0,0.5)";
  ctx.lineWidth = 0.13;
  ctx.setLineDash([0.07, 0.04, 0.16, 0.05, 0.04, 0.09]);
  ctx.stroke();
  ctx.lineWidth = 0.06;
  ctx.setLineDash([0.03, 0.11, 0.09, 0.06]);
  ctx.strokeStyle = "rgba(0,0,0,0.35)";
  ctx.stroke();
  ctx.restore();
}

// Scrape lines out of the paste (like dragging a comb or fingernail through it)
function scrape(ctx, draw, width) {
  ctx.save();
  ctx.globalCompositeOperation = "destination-out";
  ctx.lineCap = "round";
  ctx.lineWidth = width;
  ctx.strokeStyle = "rgba(0,0,0,0.9)";
  ctx.beginPath();
  draw();
  ctx.stroke();
  ctx.restore();
}

// ---------- shapes in unit space ----------
function roundRect(ctx, x, y, w, h, r) {
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function cheekShape(ctx, shape, pattern) {
  ctx.beginPath();
  switch (shape) {
    case "circle":
      ctx.arc(0, 0, 0.62, 0, Math.PI * 2);
      fillPaste(ctx, pattern);
      break;

    case "square":
      roundRect(ctx, -0.55, -0.5, 1.1, 1.0, 0.1);
      fillPaste(ctx, pattern);
      break;

    case "leaf": {
      // Bodhi (peepal) leaf: heart-shaped with a long drip tip, tip pointing down and inward
      ctx.rotate(-0.35);
      ctx.moveTo(0, 1.05);
      ctx.bezierCurveTo(-0.05, 0.85, -0.18, 0.7, -0.35, 0.5);
      ctx.bezierCurveTo(-0.72, 0.12, -0.72, -0.42, -0.42, -0.6);
      ctx.bezierCurveTo(-0.22, -0.72, -0.06, -0.62, 0, -0.5);
      ctx.bezierCurveTo(0.06, -0.62, 0.22, -0.72, 0.42, -0.6);
      ctx.bezierCurveTo(0.72, -0.42, 0.72, 0.12, 0.35, 0.5);
      ctx.bezierCurveTo(0.18, 0.7, 0.05, 0.85, 0, 1.05);
      ctx.closePath();
      fillPaste(ctx, pattern);
      scrape(ctx, () => {
        ctx.moveTo(0, -0.42); ctx.lineTo(0, 0.85);                 // midrib
        for (const t of [-0.25, 0.05, 0.32]) {                      // side veins
          ctx.moveTo(0, t); ctx.lineTo(-0.38, t - 0.22);
          ctx.moveTo(0, t); ctx.lineTo(0.38, t - 0.22);
        }
      }, 0.045);
      break;
    }

    case "stripes":
      // A round patch with comb lines dragged through it
      ctx.arc(0, 0, 0.66, 0, Math.PI * 2);
      fillPaste(ctx, pattern);
      scrape(ctx, () => {
        for (let i = -2; i <= 2; i++) {
          const x = i * 0.24;
          ctx.moveTo(x - 0.25, -0.75);
          ctx.quadraticCurveTo(x + 0.05, 0, x + 0.25, 0.75);
        }
      }, 0.075);
      break;

    case "heart":
      ctx.moveTo(0, 0.68);
      ctx.bezierCurveTo(-0.95, 0.05, -0.55, -0.8, 0, -0.32);
      ctx.bezierCurveTo(0.55, -0.8, 0.95, 0.05, 0, 0.68);
      ctx.closePath();
      fillPaste(ctx, pattern);
      break;

    case "flower":
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
        const cx = Math.cos(a) * 0.34, cy = Math.sin(a) * 0.34;
        ctx.moveTo(cx + Math.cos(a) * 0.3, cy + Math.sin(a) * 0.3);
        ctx.ellipse(cx, cy, 0.3, 0.2, a, 0, Math.PI * 2);
      }
      ctx.moveTo(0.2, 0);
      ctx.arc(0, 0, 0.2, 0, Math.PI * 2);
      fillPaste(ctx, pattern);
      scrape(ctx, () => { ctx.arc(0, 0, 0.09, 0, Math.PI * 2); }, 0.06);
      break;
  }
}

// ---------- main entry ----------
// P: landmarks in pixel space. opts: { shape, tone, extras: {forehead, nose, chin} }
// faces: a list of landmark sets (one per person). Each face is painted on its own layer
// so one person's edge-trimming never erases another's paste.
let faceLayer = null;
export function drawThanakha(ctx, faces, opts) {
  const list = Array.isArray(faces) ? faces : (faces ? [faces] : []);
  if (list.length <= 1) { drawFace(ctx, list[0] || null, opts); return; }
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.restore();
  if (!faceLayer) faceLayer = document.createElement("canvas");
  if (faceLayer.width !== ctx.canvas.width || faceLayer.height !== ctx.canvas.height) {
    faceLayer.width = ctx.canvas.width; faceLayer.height = ctx.canvas.height;
  }
  const fctx = faceLayer.getContext("2d");
  for (const P of list) {
    drawFace(fctx, P, opts);
    ctx.drawImage(faceLayer, 0, 0);
  }
}

// Paint the shapes on the flat, unwrapped face picture (used as the 3D mesh's texture).
// Same drawing code as for a photo, just on the face laid out frontal.
export function drawFaceTexture(canvas, opts) {
  drawFace(canvas.getContext("2d"), texPoints(canvas.width), { ...opts, uv: true, now: undefined, restart: 0 });
}

function drawFace(ctx, P, opts) {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  if (!P) { ctx.restore(); return; }

  const pattern = getPattern(ctx, opts.tone);
  const faceW = dist(P[234], P[454]);
  // face-down axis. On the flat face map, "down" is as long as one shape unit sideways,
  // so shapes keep their proportions there (the map's own height is not to scale)
  const dv = sub(P[152], P[10]);
  const down = opts.uv ? mul(dv, (0.25 * faceW) / (Math.hypot(dv.x, dv.y) || 1)) : mul(dv, 0.2);
  const across = mul(sub(P[454], P[234]), 0.25);       // face-across axis
  const noseMid = P[195];

  // Soft edge like paste on skin (canvas filter where supported)
  const soft = opts.shape === "full" ? 0.016 : 0.0035;
  if ("filter" in ctx) ctx.filter = `blur(${Math.max(0.6, faceW * soft).toFixed(2)}px)`;

  if (opts.shape === "full") {
    ctx.beginPath();
    faceOutline(ctx, P, 0.97);
    ctx.globalAlpha = 0.82;   // full-face wash is usually a thinner layer
    ctx.fillStyle = pattern;
    if (pattern.setTransform) pattern.setTransform(new DOMMatrix([faceW / 600, 0, 0, faceW / 600, 0, 0]));
    ctx.fill();
    // keep eyes, brows and lips clear
    ctx.globalCompositeOperation = "destination-out";
    ctx.fillStyle = "#000";
    for (const [idx, s] of [[EYE_L, 1.7], [EYE_R, 1.7], [BROW_L, 1.35], [BROW_R, 1.35], [LIPS, 1.12]]) {
      ctx.beginPath();
      polygon(ctx, P, idx, s);
      ctx.fill();
    }
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
  } else if (opts.shape !== "none") {
    for (const [cheek, edge, other] of [[50, 234, 454], [280, 454, 234]]) {
      const { vis, fore } = cheekPose(P, edge, other);
      if (vis < 0.02) continue;                       // cheek is turned away from the camera
      // Outward direction across the face in the image (follows head roll), sized by the
      // real cheek-to-cheek width and squeezed by how side-on this cheek is
      const dir = sub(P[edge], P[other]);
      const len = Math.hypot(dir.x, dir.y) || 1;
      let U = mul(dir, (0.25 * faceW3(P) * fore) / len);
      let O = add(lerp(P[cheek], P[edge], 0.12), mul(down, 0.25));
      // Keep the patch on the face. When the head is turned, the far cheek is squeezed between the
      // nose and the face edge (the cheek point can even sit past the edge point), so pull the patch
      // inward and narrow it to fit, instead of letting the face outline cut it off.
      const nose = P[195];
      const uHat = mul(dir, 1 / len);
      const sEdge = (P[edge].x - nose.x) * uHat.x + (P[edge].y - nose.y) * uHat.y;   // nose to edge, outward
      const sCheek = (O.x - nose.x) * uHat.x + (O.y - nose.y) * uHat.y;
      const sMid = Math.min(sCheek, 0.7 * Math.max(sEdge, 0));
      if (sMid < sCheek) O = add(O, mul(uHat, sMid - sCheek));
      const room = Math.max(sEdge - sMid, 0);
      const reach = 0.8 * 0.88 * Math.hypot(U.x, U.y);
      if (reach > room * 1.25) U = mul(U, Math.max(0.3, (room * 1.25) / reach));
      withLayer(ctx, vis, g => {
        frame(g, O, U, down);
        g.scale(0.88, 0.88);
        cheekShape(g, opts.shape, pattern);
      });
    }
  }

  const ex = opts.extras || {};
  if (ex.forehead) {
    const O = lerp(P[151], P[9], 0.35);
    ctx.save(); frame(ctx, O, across, down);
    ctx.beginPath(); ctx.ellipse(0, 0, 0.42, 0.36, 0, 0, Math.PI * 2);
    fillPaste(ctx, pattern); ctx.restore();
  }
  if (ex.nose) {
    const O = lerp(P[168], P[4], 0.45);
    const V = mul(sub(P[4], P[168]), 0.5);
    ctx.save(); frame(ctx, O, across, V);
    ctx.beginPath(); roundRect(ctx, -0.13, -0.95, 0.26, 1.9, 0.13);
    fillPaste(ctx, pattern); ctx.restore();
  }
  if (ex.chin) {
    const O = lerp(P[17], P[152], 0.55);
    ctx.save(); frame(ctx, O, across, down);
    ctx.beginPath(); ctx.ellipse(0, 0, 0.34, 0.3, 0, 0, Math.PI * 2);
    fillPaste(ctx, pattern); ctx.restore();
  }

  // Keep everything on the face: trim anything past the face outline
  // (e.g. the far cheek when the head is turned), with a soft edge
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if ("filter" in ctx) ctx.filter = `blur(${Math.max(1, faceW * 0.012).toFixed(2)}px)`;
  ctx.globalCompositeOperation = "destination-in";
  ctx.fillStyle = "#000";
  ctx.beginPath();
  faceOutline(ctx, P, 0.98);
  ctx.fill();

  // "Painting on": the paste spreads out from the nose when a face appears or the shape changes
  const rv = revealProgress(P, opts);
  if (rv < 1) {
    const e = 1 - Math.pow(1 - rv, 3);
    const R = faceW * (0.1 + 0.9 * e);
    const grd = ctx.createRadialGradient(noseMid.x, noseMid.y, R * 0.5, noseMid.x, noseMid.y, R);
    grd.addColorStop(0, "rgba(0,0,0,1)");
    grd.addColorStop(1, "rgba(0,0,0,0)");
    ctx.filter = "none";
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  }

  ctx.restore();
}

// Small round preview icon for the shape picker
export function drawShapeIcon(canvas, shapeId, toneId) {
  const ctx = canvas.getContext("2d");
  const S = canvas.width;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, S, S);
  // skin-tone disc
  const grd = ctx.createRadialGradient(S * 0.4, S * 0.35, S * 0.1, S / 2, S / 2, S / 2);
  grd.addColorStop(0, "#c48a5c");
  grd.addColorStop(1, "#8a5634");
  ctx.fillStyle = grd;
  ctx.beginPath(); ctx.arc(S / 2, S / 2, S / 2, 0, Math.PI * 2); ctx.fill();

  // Draw the paste on its own layer (its erase effects must not cut into the skin disc)
  const layer = document.createElement("canvas");
  layer.width = layer.height = S;
  const lc = layer.getContext("2d");
  const pattern = getPattern(lc, toneId);
  if (shapeId === "full") {
    lc.translate(S / 2, S / 2);
    lc.beginPath(); lc.ellipse(0, S * 0.04, S * 0.3, S * 0.38, 0, 0, Math.PI * 2);
    lc.fillStyle = pattern; lc.fill();
    lc.globalCompositeOperation = "destination-out";
    lc.beginPath();
    lc.ellipse(-S * 0.12, -S * 0.06, S * 0.07, S * 0.04, 0, 0, Math.PI * 2);
    lc.ellipse(S * 0.12, -S * 0.06, S * 0.07, S * 0.04, 0, 0, Math.PI * 2);
    lc.fill();
    lc.beginPath(); lc.ellipse(0, S * 0.2, S * 0.09, S * 0.035, 0, 0, Math.PI * 2); lc.fill();
  } else if (shapeId === "none") {
    lc.strokeStyle = "rgba(255,255,255,.7)"; lc.lineWidth = S * 0.05; lc.lineCap = "round";
    lc.beginPath(); lc.moveTo(S * 0.3, S * 0.3); lc.lineTo(S * 0.7, S * 0.7); lc.stroke();
  } else {
    const k = S * 0.36;
    lc.setTransform(k, 0, 0, k, S / 2, S / 2);
    cheekShape(lc, shapeId, pattern);
  }
  ctx.drawImage(layer, 0, 0);
}
