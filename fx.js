// Sparkles and petals drawn over the picture, plus reading smiles, winks and open mouths
// from the face landmarks (no extra model needed).

const rnd = (a, b) => a + Math.random() * (b - a);
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

const GOLD = ["#fff6d6", "#f7de9a", "#e3b85c", "#ffffff"];
const PETAL = ["#fff1c9", "#f5d98a", "#ffffff", "#ffe9a8"];
const MAX_PARTS = 320;

export function createFx(canvas) {
  const g = canvas.getContext("2d");
  const parts = [];
  let last = 0;
  let flashAmt = 0;

  // People who ask their phone for less motion get no sparkles or flashes
  const calm = !!(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches);
  const add = (p) => { if (!calm && parts.length < MAX_PARTS) parts.push(p); };
  const pick = (list) => list[(Math.random() * list.length) | 0];

  // A four-point glint that twinkles in and out
  function star(x, y, s, o = {}) {
    add({
      k: "star", x, y, s, life: 0, max: o.max || rnd(0.5, 0.95),
      vx: o.vx || 0, vy: o.vy || 0, g: o.g || 0,
      rot: rnd(0, 1.57), vr: rnd(-2, 2), c: pick(GOLD),
    });
  }

  // A drifting golden petal
  function petal(x, y, s, o = {}) {
    add({
      k: "petal", x, y, s, life: 0, max: o.max || rnd(1.4, 2.2),
      vx: o.vx || rnd(-20, 20), vy: o.vy || rnd(20, 60), g: o.g || 40,
      rot: rnd(0, 6.28), vr: rnd(-3, 3), sway: rnd(0, 6.28), c: pick(PETAL),
    });
  }

  // Glints flying outward from a point
  function burst(x, y, radius, n, size) {
    for (let i = 0; i < n; i++) {
      const a = rnd(0, 6.28), r = rnd(0.2, 1) * radius;
      const sp = rnd(0.6, 1.4) * radius * 1.3;
      star(x + Math.cos(a) * r * 0.4, y + Math.sin(a) * r * 0.4, size * rnd(0.5, 1.3),
        { vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, max: rnd(0.5, 1.0) });
    }
  }

  function petals(x, y, width, n, size) {
    for (let i = 0; i < n; i++) petal(x + rnd(-0.5, 0.5) * width, y + rnd(-0.1, 0.1) * width, size * rnd(0.7, 1.2));
  }

  function drawStar(p, a) {
    const s = p.s;
    g.save();
    g.translate(p.x, p.y);
    g.rotate(p.rot);
    g.globalAlpha = a;
    for (const [k, col] of [[1, p.c], [0.5, "#ffffff"]]) {
      g.fillStyle = col;
      g.beginPath();
      for (let i = 0; i < 8; i++) {
        const r = (i % 2 ? 0.2 : 1) * s * k;
        const ang = (i * Math.PI) / 4;
        i ? g.lineTo(Math.cos(ang) * r, Math.sin(ang) * r) : g.moveTo(r, 0);
      }
      g.closePath();
      g.fill();
    }
    g.restore();
  }

  function drawPetal(p, a) {
    g.save();
    g.translate(p.x, p.y);
    g.rotate(p.rot);
    g.globalAlpha = a * 0.9;
    g.fillStyle = p.c;
    g.beginPath();
    g.ellipse(0, 0, p.s * 0.55, p.s * 0.26, 0, 0, Math.PI * 2);
    g.fill();
    g.globalAlpha = a * 0.5;
    g.strokeStyle = "#d9a841";
    g.lineWidth = Math.max(1, p.s * 0.05);
    g.beginPath(); g.moveTo(-p.s * 0.45, 0); g.lineTo(p.s * 0.45, 0); g.stroke();
    g.restore();
  }

  function update(now) {
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 0.016;
    last = now;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, canvas.width, canvas.height);
    if (flashAmt > 0.01) {
      g.fillStyle = `rgba(255,244,214,${flashAmt})`;
      g.fillRect(0, 0, canvas.width, canvas.height);
      flashAmt *= Math.pow(0.002, dt);     // fades in about a third of a second
    } else flashAmt = 0;

    g.globalCompositeOperation = "lighter";
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.life += dt;
      if (p.life >= p.max) { parts.splice(i, 1); continue; }
      const t = p.life / p.max;
      p.vy += p.g * dt;
      p.vx *= p.k === "star" ? Math.pow(0.15, dt) : 1;
      p.vy *= p.k === "star" ? Math.pow(0.15, dt) : 1;
      if (p.k === "petal") p.x += Math.sin(p.life * 4 + p.sway) * 22 * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
      const a = Math.sin(Math.min(1, t) * Math.PI);           // fade in and out
      if (p.k === "star") drawStar(p, a); else { g.globalCompositeOperation = "source-over"; drawPetal(p, a); g.globalCompositeOperation = "lighter"; }
    }
    g.globalCompositeOperation = "source-over";
  }

  return {
    star, petal, burst, petals, update,
    flash: (a = 0.55) => { if (!calm) flashAmt = Math.max(flashAmt, a); },
    alive: () => parts.length > 0 || flashAmt > 0,
    clear: () => { parts.length = 0; flashAmt = 0; g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, canvas.width, canvas.height); },
  };
}

// ---------- expressions, read from landmark distances ----------
// smile: mouth stretches wide and its corners lift above the lip centre
// open: lips apart; wink: one eye shut while the other stays open
export function readFace(P) {
  const faceW = dist(P[234], P[454]) || 1;
  const faceH = dist(P[10], P[152]) || 1;
  const dx = (P[152].x - P[10].x) / faceH, dy = (P[152].y - P[10].y) / faceH;     // unit "down"

  const mouthW = dist(P[61], P[291]) / faceW;
  const cx = (P[13].x + P[14].x) / 2, cy = (P[13].y + P[14].y) / 2;
  const mx = (P[61].x + P[291].x) / 2, my = (P[61].y + P[291].y) / 2;
  const lift = ((cx - mx) * dx + (cy - my) * dy) / faceH;                          // corners above centre
  const open = dist(P[13], P[14]) / faceH;

  const eyeA = dist(P[159], P[145]) / (dist(P[33], P[133]) || 1);
  const eyeB = dist(P[386], P[374]) / (dist(P[263], P[362]) || 1);
  return { faceW, faceH, mouthW, lift, open, eyeA, eyeB };
}
