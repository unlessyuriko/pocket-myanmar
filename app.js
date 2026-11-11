import { FaceLandmarker, FilesetResolver } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs";
import { SHAPES, TONES, REVEAL_MS, drawThanakha, drawFaceTexture, drawShapeIcon } from "./thanakha.js";
import { createMeshRenderer } from "./mesh.js";
import { TEX_SIZE } from "./facemap.js";
import { createFx, readFace } from "./fx.js";
import { createBlender } from "./blend.js";
import { createOccluder } from "./occlude.js";

const WASM_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";
const MODEL_URL = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

const $ = (s) => document.querySelector(s);
const video = $("#video");
let view = $("#view");
// Prefer the GPU blender; fall back to plain canvas blending if WebGL isn't available
let blender = createBlender(view);
if (!blender && view.getContext("webgl")) {
  const fresh = view.cloneNode();
  view.replaceWith(fresh);
  view = fresh;
}
const ctx = blender ? null : view.getContext("2d");
const layer = document.createElement("canvas");
const lctx = layer.getContext("2d");
// 3D face mesh (paste wrapped around the head). Add ?mesh=0 to the address to use the flat shapes instead.
const meshCanvas = document.createElement("canvas");
const mesh = blender && new URLSearchParams(location.search).get("mesh") !== "0" ? createMeshRenderer(meshCanvas) : null;
const texCanvas = document.createElement("canvas");
texCanvas.width = texCanvas.height = TEX_SIZE;
let texKey = "";
const shade = document.createElement("canvas");
const sctx = shade.getContext("2d");
const occ = createOccluder("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm");   // hair in front of the paste
const stage = $("#stage");
const fxCanvas = $("#fx");
const fx = createFx(fxCanvas);
const appEl = $(".app");

const state = {
  shape: "circle",
  tone: "fresh",
  strength: 0.85,
  extras: { forehead: false, nose: false, chin: false },
  mode: null,          // "camera" | "photo"
  photo: null,         // canvas holding the chosen photo
  faces: [],           // every tracked face
  points: null,        // smoothed landmarks (pixels)
  facing: "user",      // "user" (front) | "environment" (back)
  mirror: true,        // front camera is shown mirrored
  restart: 0,          // when the "painting on" last restarted (shape or colour change)
  now: 0,              // time of the frame being drawn
};

let landmarker = null;
let landmarkerPromise = null;
let runningMode = null;
let stream = null;
let lastVideoTime = -1;
let loopRunning = false;

// ---------- UI ----------
// Radio groups: one tab stop, arrow keys move the choice
function selectRadio(wrap, chosen) {
  wrap.querySelectorAll('[role="radio"]').forEach((x) => {
    const on = x === chosen;
    x.setAttribute("aria-checked", String(on));
    x.tabIndex = on ? 0 : -1;
  });
}

function enableRadioKeys(wrap) {
  wrap.addEventListener("keydown", (e) => {
    const keys = ["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp", "Home", "End"];
    if (!keys.includes(e.key)) return;
    const items = [...wrap.querySelectorAll('[role="radio"]')];
    let i = items.findIndex((x) => x.getAttribute("aria-checked") === "true");
    if (e.key === "Home") i = 0;
    else if (e.key === "End") i = items.length - 1;
    else i = (i + (e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
    e.preventDefault();
    items[i].click();
    // the group may be rebuilt on click, so look the item up again
    (wrap.querySelectorAll('[role="radio"]')[i] || items[i]).focus();
  });
}

function buildShapePicker() {
  const wrap = $("#shapes");
  const hadFocus = wrap.contains(document.activeElement);
  wrap.innerHTML = "";
  for (const s of SHAPES) {
    const b = document.createElement("button");
    b.className = "shape";
    b.setAttribute("role", "radio");
    b.dataset.shape = s.id;
    b.setAttribute("aria-checked", String(s.id === state.shape));
    b.tabIndex = s.id === state.shape ? 0 : -1;
    const c = document.createElement("canvas");
    c.width = c.height = 116;
    drawShapeIcon(c, s.id, state.tone);
    b.append(c);
    b.insertAdjacentHTML("beforeend", `<span class="mm">${s.mm}</span>`);
    b.onclick = () => {
      state.shape = s.id;
      selectRadio(wrap, b);
      b.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
      paintAgain();
    };
    wrap.append(b);
  }
  if (hadFocus) wrap.querySelector('[aria-checked="true"]')?.focus();
}

function buildTones() {
  const wrap = $("#tones");
  for (const t of TONES) {
    const b = document.createElement("button");
    b.className = "tone";
    b.title = t.label;
    b.setAttribute("aria-label", t.label);
    b.setAttribute("role", "radio");
    b.setAttribute("aria-checked", String(t.id === state.tone));
    b.tabIndex = t.id === state.tone ? 0 : -1;
    b.style.setProperty("--c", `rgb(${t.base.join(",")})`);
    b.onclick = () => {
      state.tone = t.id;
      selectRadio(wrap, b);
      buildShapePicker();
      paintAgain();
    };
    wrap.append(b);
  }
}

document.querySelectorAll("[data-extra]").forEach(b => {
  b.onclick = () => {
    const k = b.dataset.extra;
    state.extras[k] = !state.extras[k];
    b.setAttribute("aria-pressed", String(state.extras[k]));
    redraw();
  };
});

$("#strength").oninput = (e) => { state.strength = +e.target.value; redraw(); };

let toastTimer;
function toast(msg, ms = 0) {
  const t = $("#toast");
  clearTimeout(toastTimer);
  if (!msg) { t.hidden = true; return; }
  t.textContent = msg;
  t.hidden = false;
  if (ms) toastTimer = setTimeout(() => (t.hidden = true), ms);
}

// ---------- face tracking ----------
// Loaded once, and started in the background as soon as the page opens,
// so it is usually ready by the time someone taps "open camera".
function ensureLandmarker() {
  if (!landmarkerPromise) {
    landmarkerPromise = (async () => {
      const fileset = await FilesetResolver.forVisionTasks(WASM_URL);
      const opts = (delegate) => ({
        baseOptions: { modelAssetPath: MODEL_URL, delegate },
        runningMode: "VIDEO",
        numFaces: MAX_FACES,
      });
      try {
        landmarker = await FaceLandmarker.createFromOptions(fileset, opts("GPU"));
      } catch {
        landmarker = await FaceLandmarker.createFromOptions(fileset, opts("CPU"));
      }
      runningMode = "VIDEO";
      return landmarker;
    })().catch((e) => { landmarkerPromise = null; throw e; });
  }
  return landmarkerPromise;
}

async function getLandmarker(mode) {
  if (!landmarker) {
    toast("မျက်နှာရှာစနစ် ပြင်ဆင်နေပါတယ်…");
    try { await ensureLandmarker(); } finally { toast(""); }
  }
  if (runningMode !== mode) {
    await landmarker.setOptions({ runningMode: mode });
    runningMode = mode;
  }
  return landmarker;
}

const MAX_FACES = 4;   // how many people can wear thanakha at once

const TRACKER_ERROR = "မျက်နှာရှာစနစ် မရရှိပါ။ အင်တာနက်စစ်ပြီး ထပ်ကြိုးစားပါ။";

function toPixels(lms, w, h, mirror) {
  // z is depth (same scale as x), kept so the filter can tell when the head is turned
  return lms.map(l => ({ x: (mirror ? 1 - l.x : l.x) * w, y: l.y * h, z: (l.z || 0) * w }));
}

// Keep the list of tracked faces; state.points is the biggest one (used for the light reading)
function setFaces(list) {
  const now = performance.now();
  for (const P of list) if (!P.meta) P.meta = { birth: now };
  list.sort((a, b) => faceWidth(b) - faceWidth(a));
  state.faces = list;
  state.points = list[0] || null;
}
const faceWidth = (P) => Math.hypot(P[234].x - P[454].x, P[234].y - P[454].y);

// Smooth every face against the same person in the last frame (matched by nearest nose)
function smoothFaces(nextList) {
  const free = (state.faces || []).slice();
  return nextList.map((next) => {
    let best = -1, bestD = Infinity;
    free.forEach((p, i) => {
      const d = Math.hypot(p[1].x - next[1].x, p[1].y - next[1].y);
      if (d < bestD) { bestD = d; best = i; }
    });
    if (best < 0 || bestD > faceWidth(next) * 0.8) return next;
    const prev = free.splice(best, 1)[0];
    const out = smooth(next, prev);
    out.meta = prev.meta || {};
    out.meta.filt = out.filt;      // filter state travels with the face
    return out;
  });
}

// One Euro filter per landmark: very steady when the head is still, follows fast moves with
// almost no lag. The cutoff rises with the point's speed (measured in face widths per second),
// and the blend uses the real time between frames, so it behaves the same at 15 or 60 fps.
const OE = { minCut: 1.0, beta: 20, dCut: 1 };
const oeAlpha = (cut, dt) => 1 / (1 + 1 / (2 * Math.PI * cut) / dt);

function smooth(next, prev) {
  if (!prev || prev.length !== next.length) return next;
  const now = performance.now();
  const f = prev.meta && prev.meta.filt;
  const dt = f ? Math.min(0.1, Math.max(1 / 120, (now - f.t) / 1000)) : 1 / 30;
  const faceW = Math.hypot(next[234].x - next[454].x, next[234].y - next[454].y) || 1;
  const dx = f ? f.dx : new Float32Array(next.length * 3);
  const aD = oeAlpha(OE.dCut, dt);
  const out = next.map((p, i) => {
    const q = prev[i], o = 3 * i;
    const vx = (p.x - q.x) / dt / faceW, vy = (p.y - q.y) / dt / faceW, vz = (p.z - q.z) / dt / faceW;
    dx[o] += (vx - dx[o]) * aD; dx[o + 1] += (vy - dx[o + 1]) * aD; dx[o + 2] += (vz - dx[o + 2]) * aD;
    const a = oeAlpha(OE.minCut + OE.beta * Math.hypot(dx[o], dx[o + 1], dx[o + 2]), dt);
    return { x: q.x + (p.x - q.x) * a, y: q.y + (p.y - q.y) * a, z: q.z + (p.z - q.z) * a };
  });
  out.filt = { t: now, dx };
  return out;
}

// ---------- rendering ----------
function sizeCanvases(w, h) {
  if (view.width !== w || view.height !== h) {
    view.width = layer.width = fxCanvas.width = meshCanvas.width = w;
    view.height = layer.height = fxCanvas.height = meshCanvas.height = h;
  }
}

// Average skin brightness across the cheeks and nose, used so the paste
// picks up the room's light level. Measured on a tiny copy, a few times a second.
const probe = document.createElement("canvas");
probe.width = probe.height = 24;
const pctx = probe.getContext("2d", { willReadFrequently: true });
let faceLum = 0.45;
let probeTick = 0;

function measureFace(source, mirror) {
  const P = state.points;
  if (!P) return;
  if (state.mode === "camera" && probeTick++ % 6 !== 0) return;
  const W = view.width;
  let x0 = Math.min(P[234].x, P[454].x), x1 = Math.max(P[234].x, P[454].x);
  const y0 = P[6].y, y1 = P[164].y;
  // shrink to the middle of the face so hair and background stay out
  const cx = (x0 + x1) / 2, hw = (x1 - x0) * 0.32;
  x0 = cx - hw; x1 = cx + hw;
  if (mirror) [x0, x1] = [W - x1, W - x0];
  if (x1 - x0 < 4 || y1 - y0 < 4) return;
  pctx.drawImage(source, x0, y0, x1 - x0, y1 - y0, 0, 0, 24, 24);
  const d = pctx.getImageData(0, 0, 24, 24).data;
  let sum = 0;
  for (let i = 0; i < d.length; i += 4) sum += (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255;
  const lum = sum / (d.length / 4);
  faceLum = state.mode === "camera" ? faceLum + (lum - faceLum) * 0.3 : lum;
}

function compose(source, mirror) {
  const W = view.width, H = view.height;
  state.now = performance.now();
  if (blender) {
    let paste = layer;
    if (mesh) {
      // repaint the flat face picture only when the look changes
      const key = state.shape + "|" + state.tone + "|" + Object.values(state.extras).join();
      if (key !== texKey) { texKey = key; drawFaceTexture(texCanvas, state); mesh.setTexture(texCanvas); }
      paste = mesh.render(state.faces, state);
    } else {
      drawThanakha(lctx, state.faces, state);
    }
    measureFace(source, mirror);
    blender.render(source, paste, { mirror, strength: state.points ? state.strength : 0, faceLum, occluder: state.points ? occ.mask : null });
    return;
  }
  ctx.save();
  if (mirror) ctx.setTransform(-1, 0, 0, 1, W, 0);
  ctx.drawImage(source, 0, 0, W, H);
  ctx.restore();

  drawThanakha(lctx, state.faces, state);
  if (state.points) {
    ctx.save();
    ctx.globalAlpha = state.strength;
    ctx.drawImage(layer, 0, 0);
    ctx.restore();

    // Bring the face's own light and shadow back over the paste,
    // so it sits on the skin instead of floating like a sticker
    if (shade.width !== W || shade.height !== H) { shade.width = W; shade.height = H; }
    sctx.save();
    sctx.globalCompositeOperation = "copy";
    if (mirror) sctx.setTransform(-1, 0, 0, 1, W, 0);
    sctx.drawImage(source, 0, 0, W, H);
    sctx.setTransform(1, 0, 0, 1, 0, 0);
    sctx.globalCompositeOperation = "destination-in";
    sctx.drawImage(layer, 0, 0);
    sctx.restore();
    ctx.save();
    ctx.globalCompositeOperation = "multiply";
    ctx.globalAlpha = 0.35 * state.strength;
    ctx.drawImage(shade, 0, 0);
    ctx.restore();
  }
}

function redraw() {
  // Camera mode redraws every frame anyway; photo mode needs a nudge
  if (state.mode === "photo" && state.photo) compose(state.photo, false);
}

// ---------- effects: painting-on, sparkles, reactions ----------
// Thresholds for reading expressions from the face shape (ratios of face size)
const REACT = { smileOn: 0.395, smileOff: 0.375, liftOn: 0.01, liftOff: 0.0, open: 0.07, shut: 0.14, eyeOpen: 0.2 };
const GLINT_POINTS = [50, 280, 101, 330, 151, 9, 4, 205, 425, 117, 346, 234, 454, 10, 152, 195];

function paintAgain() {
  state.restart = performance.now();
  animate();
}

function react(P, m, r, now) {
  const cheeks = [50, 280];
  // big smile: glints on both cheeks and a few petals
  const smiling = m.smile
    ? r.mouthW > REACT.smileOff && r.lift > REACT.liftOff
    : r.mouthW > REACT.smileOn && r.lift > REACT.liftOn;
  if (smiling && !m.smile && now > (m.coolSmile || 0)) {
    for (const c of cheeks) fx.burst(P[c].x, P[c].y, r.faceW * 0.25, 8, r.faceW * 0.07);
    fx.petals(P[10].x, P[10].y - r.faceH * 0.1, r.faceW * 0.7, 6, r.faceW * 0.09);
    m.coolSmile = now + 2000;
  }
  m.smile = smiling;

  // open mouth: petals rain down
  if (r.open > REACT.open && now > (m.nextPetal || 0)) {
    fx.petals(P[10].x, P[10].y - r.faceH * 0.25, r.faceW * 0.9, 1, r.faceW * 0.09);
    m.nextPetal = now + 70;
  }

  // wink: a big glint pops at the closed eye
  const a = r.eyeA < REACT.shut, b = r.eyeB < REACT.shut;
  const winking = a !== b && (a ? r.eyeB : r.eyeA) > REACT.eyeOpen;
  m.winkN = winking ? (m.winkN || 0) + 1 : 0;
  if (m.winkN === 4 && now > (m.coolWink || 0)) {
    const eye = a ? P[159] : P[386];
    fx.burst(eye.x, eye.y, r.faceW * 0.3, 12, r.faceW * 0.07);
    fx.star(eye.x, eye.y, r.faceW * 0.22, { max: 0.9 });
    m.coolWink = now + 1500;
  }
}

// One step of the effects. Returns true while the painting-on spread is still running.
function stepEffects(now) {
  let revealing = false;
  for (const P of state.faces) {
    const m = P.meta;
    if (!m) continue;
    const r = readFace(P);
    const age = now - Math.max(m.birth, state.restart);
    if (age < REVEAL_MS) {
      revealing = true;
      // glints appear on the spreading edge of the paste
      const e = 1 - Math.pow(1 - age / REVEAL_MS, 3);
      const R = r.faceW * (0.1 + 0.9 * e), nose = P[195];
      for (let i = 0; i < 3; i++) {
        const q = P[GLINT_POINTS[(Math.random() * GLINT_POINTS.length) | 0]];
        const d = Math.hypot(q.x - nose.x, q.y - nose.y);
        if (d < R && d > R * 0.55) fx.star(q.x, q.y, r.faceW * 0.05 * (0.6 + Math.random()), { max: 0.5 });
      }
    }
    if (state.mode === "camera") react(P, m, r, now);
  }
  fx.update(now);
  return revealing;
}

// Photo mode has no per-frame loop, so run one while something is animating
let animating = false;
function animate() {
  if (animating) return;
  animating = true;
  const step = () => {
    if (state.mode !== "photo") { animating = false; return; }
    const now = performance.now();
    const revealing = stepEffects(now);
    if (state.photo) compose(state.photo, false);
    if (revealing || fx.alive()) requestAnimationFrame(step);
    else animating = false;
  };
  requestAnimationFrame(step);
}

// Flash and a burst of glints when the photo is taken
function celebrate() {
  fx.flash(0.5);
  const faces = state.faces.length ? state.faces : [null];
  for (const P of faces) {
    if (P) {
      const w = faceWidth(P), n = P[195];
      fx.burst(n.x, n.y, w * 0.8, 22, w * 0.07);
    } else {
      fx.burst(fxCanvas.width / 2, fxCanvas.height / 2, fxCanvas.width * 0.3, 22, fxCanvas.width * 0.03);
    }
  }
  if (state.mode === "photo") animate();
}

let missed = 0, frameNo = 0, occBusy = false;

// Points that are certainly not hair (nose tip, cheek middles), as 0..1 positions in the camera picture
// and, per face, the forehead and temple area where hair may cover the paste (above the eye line)
function probesFor(faces, mirror) {
  const W = view.width, H = view.height;
  const nx = (p) => [mirror ? 1 - p.x / W : p.x / W, p.y / H];
  const probes = [], zones = [];
  for (const P of faces) {
    for (const i of [1, 50, 280]) probes.push(nx(P[i]));
    const a = P[127], b = P[356];
    const wx = (b.x - a.x) * 0.35, wy = (b.y - a.y) * 0.35;
    const ux = P[10].x - P[152].x, uy = P[10].y - P[152].y;
    const q = [{ x: a.x - wx, y: a.y - wy }, { x: b.x + wx, y: b.y + wy }];
    zones.push([q[0], q[1], { x: q[1].x + ux * 1.1, y: q[1].y + uy * 1.1 }, { x: q[0].x + ux * 1.1, y: q[0].y + uy * 1.1 }].map(nx));
  }
  return { probes, zones };
}

function cameraLoop() {
  if (state.mode !== "camera") { loopRunning = false; return; }
  if (video.readyState >= 2 && video.currentTime !== lastVideoTime) {
    lastVideoTime = video.currentTime;
    sizeCanvases(video.videoWidth, video.videoHeight);
    const res = landmarker.detectForVideo(video, performance.now());
    const found = (res.faceLandmarks || []).map((l) => toPixels(l, view.width, view.height, state.mirror));
    if (found.length) {
      setFaces(smoothFaces(found));
      if (missed > 10) toast("");
      missed = 0;
      // find hair a few times a second (it changes slowly next to the face itself)
      if (occ.ready && !occBusy && frameNo++ % 3 === 0) {
        occBusy = true;
        occ.video(video, probesFor(state.faces, state.mirror)).finally(() => { occBusy = false; });
      }
    } else if (++missed > 10) {
      occ.clear();
      setFaces([]);
      toast("မျက်နှာ မမြင်ရပါ၊ အလင်းရောင်ရှိတဲ့နေရာ ရွှေ့ပါ");
    }
    compose(video, state.mirror);
  }
  stepEffects(performance.now());
  if (rec) recordFrame();
  requestAnimationFrame(cameraLoop);
}

// ---------- modes ----------
function cameraErrorMessage(err) {
  if (!window.isSecureContext || !navigator.mediaDevices) return "ကင်မရာသုံးဖို့ လုံခြုံတဲ့လင့်ခ် လိုပါတယ်။";
  switch (err && err.name) {
    case "NotAllowedError":
    case "SecurityError":
      return "ကင်မရာကို ခွင့်မပြုထားပါ။ ခွင့်ပြုပြီး “ကင်မရာဖွင့်မယ်” ကို ထပ်နှိပ်ပါ။";
    case "NotFoundError":
    case "OverconstrainedError":
      return "ကင်မရာ မတွေ့ပါ။ “ဓာတ်ပုံရွေးမယ်” ကို သုံးကြည့်ပါ။";
    case "NotReadableError":
      return "တခြားအက်ပ်က ကင်မရာကို သုံးနေပါတယ်။ ပိတ်ပြီး ထပ်ကြိုးစားပါ။";
    default:
      return "ကင်မရာ မဖွင့်နိုင်ပါ။ ထပ်ကြိုးစားပါ။";
  }
}

function openStream(facing) {
  return navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: facing }, width: { ideal: 1280 }, height: { ideal: 960 } },
    audio: false,
  });
}

async function attachStream(s, requested) {
  stream = s;
  const settings = (s.getVideoTracks()[0] && s.getVideoTracks()[0].getSettings()) || {};
  state.facing = settings.facingMode || requested;
  state.mirror = state.facing !== "environment";
  video.srcObject = s;
  await video.play().catch(() => {});
}

async function startCamera(facing = "user") {
  const flipping = state.mode === "camera";
  const before = state.facing;
  toast("");
  stopCamera();
  occ.clear();
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    toast(cameraErrorMessage());
    return;
  }
  try {
    await attachStream(await openStream(facing), facing);
  } catch (err) {
    if (flipping) {
      // couldn't switch: go back to the camera we had
      try { await attachStream(await openStream(before), before); } catch {}
      toast("ကင်မရာ ပြောင်းမရပါ", 4000);
    } else {
      toast(cameraErrorMessage(err));   // stays on screen until the next try
    }
    return;
  }
  try {
    await getLandmarker("VIDEO");
  } catch {
    stopCamera();
    toast(TRACKER_ERROR);
    return;
  }
  state.mode = "camera";
  setFaces([]);
  stage.classList.remove("photo");
  enterApp();
  updateFlipButton();
  updateRecButton();
  if (!loopRunning) { loopRunning = true; requestAnimationFrame(cameraLoop); }
}

function stopCamera() {
  if (stream) stream.getTracks().forEach(t => t.stop());
  stream = null;
}

// Only offer the switch when the phone really has more than one camera
async function updateFlipButton() {
  let many = false;
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    many = devices.filter((d) => d.kind === "videoinput").length > 1;
  } catch {}
  $("#btnFlip").hidden = !(many && state.mode === "camera");
}

function updateRecButton() {
  $("#btnRec").hidden = !(recSupported && state.mode === "camera");
}

async function startPhoto(src) {
  stopCamera();
  state.mode = "photo";
  toast("");
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.src = src;
  try { await img.decode(); } catch { toast("ဓာတ်ပုံကို ဖွင့်မရပါ", 4000); return; }

  // Keep it a sensible size for phones
  const scale = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
  sizeCanvases(Math.round(img.naturalWidth * scale), Math.round(img.naturalHeight * scale));
  const sized = document.createElement("canvas");
  sized.width = view.width;
  sized.height = view.height;
  sized.getContext("2d").drawImage(img, 0, 0, sized.width, sized.height);
  state.photo = sized;
  stage.classList.add("photo");
  setFaces([]);
  enterApp();
  $("#btnFlip").hidden = true;
  updateRecButton();
  redraw();

  let lm;
  try { lm = await getLandmarker("IMAGE"); } catch { toast(TRACKER_ERROR); return; }
  const res = lm.detect(sized);
  const found = (res.faceLandmarks || []).map((l) => toPixels(l, view.width, view.height, false));
  setFaces(found);
  if (!found.length) toast("ဒီဓာတ်ပုံထဲမှာ မျက်နှာ မတွေ့ပါ", 4000);
  occ.clear();
  redraw();
  animate();
  if (found.length && blender) {
    // keep the paste under hair; repaint when the hair model answers (it downloads on first use)
    occ.image(sized, probesFor(state.faces, false)).then((ok) => { if (ok && state.photo === sized) { redraw(); } }).catch(() => {});
  }
}

function enterApp() {
  appEl.classList.add("started");
  $("#intro").hidden = true;
  $("#btnShutter").disabled = false;
  $("#btnSwitch").hidden = false;
}

$("#btnCamera").onclick = () => startCamera("user");
$("#btnFlip").onclick = () => !rec && startCamera(state.facing === "user" ? "environment" : "user");
$("#filePhoto").onchange = (e) => {
  const f = e.target.files && e.target.files[0];
  if (f) startPhoto(URL.createObjectURL(f));
  e.target.value = "";
};
$("#btnSwitch").onclick = () => {
  cancelRecording();
  fx.clear();
  stopCamera();
  state.mode = null;
  appEl.classList.remove("started");
  $("#intro").hidden = false;
  $("#btnShutter").disabled = true;
  $("#btnFlip").hidden = true;
  $("#btnRec").hidden = true;
  toast("");
  $("#btnCamera").focus();
};

// ---------- capture & share ----------
let lastBlob = null;
let lastType = "image/jpeg";
let lastName = "myanmar-vibe-thanakha.jpg";
let lastUrl = null;
const resultEl = $("#result");
let returnFocusTo = null;

function openResult(kind = "image") {
  returnFocusTo = document.activeElement;
  const isVideo = kind === "video";
  $("#resultImg").hidden = isVideo;
  const rv = $("#resultVideo");
  rv.hidden = !isVideo;
  if (isVideo) { rv.src = lastUrl; rv.play().catch(() => {}); } else { rv.pause(); rv.removeAttribute("src"); }
  appEl.inert = true;          // keep keyboard and screen-reader focus inside the popup
  resultEl.hidden = false;
  $("#btnShare").focus();
}

function closeResult() {
  $("#resultVideo").pause();
  resultEl.hidden = true;
  appEl.inert = false;
  const back = returnFocusTo && document.contains(returnFocusTo) ? returnFocusTo : $("#btnShutter");
  back.focus();
}

resultEl.addEventListener("keydown", (e) => {
  if (e.key === "Escape") { closeResult(); return; }
  if (e.key !== "Tab") return;
  const items = [...resultEl.querySelectorAll("button, a.btn")].filter((x) => !x.closest("[hidden]"));
  const first = items[0], last = items[items.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
});
resultEl.addEventListener("click", (e) => { if (e.target === resultEl) closeResult(); });

$("#btnShutter").onclick = () => {
  if (rec) return;
  const out = document.createElement("canvas");
  out.width = view.width;
  out.height = view.height;
  const o = out.getContext("2d");
  o.drawImage(view, 0, 0);

  // Small caption in the corner
  const fs = Math.round(out.width * 0.032);
  o.font = `600 ${fs}px "Noto Sans Myanmar", "Myanmar Text", sans-serif`;
  const text = "Myanmar Vibe · သနပ်ခါး";
  const pad = fs * 0.6;
  const tw = o.measureText(text).width;
  o.fillStyle = "rgba(27,20,16,0.55)";
  o.beginPath();
  o.roundRect
    ? o.roundRect(pad, out.height - fs * 2.6 - pad, tw + fs * 1.4, fs * 2.6, fs * 1.3)
    : o.rect(pad, out.height - fs * 2.6 - pad, tw + fs * 1.4, fs * 2.6);
  o.fill();
  o.fillStyle = "#e3b85c";
  o.textBaseline = "middle";
  o.fillText(text, pad + fs * 0.7, out.height - fs * 1.3 - pad);

  // The saved picture is clean; the flash and glints play on screen for a moment first
  celebrate();
  $("#btnShutter").disabled = true;
  out.toBlob((blob) => {
    setResultFile(blob, "image/jpeg", "jpg");
    $("#resultImg").src = lastUrl;
    setTimeout(() => { $("#btnShutter").disabled = false; openResult("image"); }, 450);
  }, "image/jpeg", 0.92);
};

function setResultFile(blob, type, ext) {
  lastBlob = blob;
  lastType = type;
  lastName = "myanmar-vibe-thanakha." + ext;
  if (lastUrl) URL.revokeObjectURL(lastUrl);
  lastUrl = URL.createObjectURL(blob);
  $("#btnSave").href = lastUrl;
  $("#btnSave").download = lastName;
}

// ---------- 5-second video ----------
const REC_MS = 5000;
const recSupported = !!(window.MediaRecorder && HTMLCanvasElement.prototype.captureStream);
let rec = null;

function pickMime() {
  const types = ["video/mp4;codecs=avc1", "video/mp4", "video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];
  return types.find((t) => MediaRecorder.isTypeSupported(t)) || "";
}

function startRecording() {
  const k = Math.min(1, 960 / Math.max(view.width, view.height));
  const c = document.createElement("canvas");
  c.width = Math.max(2, Math.round(view.width * k) & ~1);
  c.height = Math.max(2, Math.round(view.height * k) & ~1);
  const mime = pickMime();
  let mr;
  try {
    mr = new MediaRecorder(c.captureStream(30), mime ? { mimeType: mime, videoBitsPerSecond: 3500000 } : {});
  } catch {
    toast("ဗီဒီယို မရိုက်နိုင်ပါ", 4000);
    return;
  }
  // caption, drawn once and stamped on every frame
  const wm = document.createElement("canvas");
  const fs = Math.round(c.width * 0.032);
  const text = "Myanmar Vibe · သနပ်ခါး";
  const wg = wm.getContext("2d");
  wg.font = `600 ${fs}px "Noto Sans Myanmar", "Myanmar Text", sans-serif`;
  wm.width = Math.ceil(wg.measureText(text).width + fs * 1.4);
  wm.height = Math.ceil(fs * 2.6);
  wg.font = `600 ${fs}px "Noto Sans Myanmar", "Myanmar Text", sans-serif`;
  wg.fillStyle = "rgba(6,32,26,0.6)";
  wg.beginPath();
  wg.roundRect ? wg.roundRect(0, 0, wm.width, wm.height, fs * 1.3) : wg.rect(0, 0, wm.width, wm.height);
  wg.fill();
  wg.fillStyle = "#e3b85c";
  wg.textBaseline = "middle";
  wg.fillText(text, fs * 0.7, wm.height / 2);

  rec = { c, g: c.getContext("2d"), mr, wm, chunks: [], t0: performance.now(), mime: mr.mimeType || mime, cancelled: false };
  const mine = rec;
  mr.ondataavailable = (e) => { if (e.data && e.data.size) mine.chunks.push(e.data); };
  mr.onstop = () => finishRecording(mine);
  mr.start(250);
  mine.timer = setTimeout(stopRecording, REC_MS);
  $("#btnRec").classList.add("on");
  $("#btnRec").setAttribute("aria-label", "ရပ်မယ်");
  $("#btnShutter").disabled = true;
  toast("ဗီဒီယို ရိုက်နေပါတယ်…");
}

function recordFrame() {
  const { c, g, wm, t0 } = rec;
  g.drawImage(view, 0, 0, c.width, c.height);
  g.drawImage(fxCanvas, 0, 0, c.width, c.height);
  g.drawImage(wm, wm.height * 0.25, c.height - wm.height * 1.25);
  $("#btnRec").style.setProperty("--p", Math.min(1, (performance.now() - t0) / REC_MS).toFixed(3));
}

function stopRecording() {
  if (!rec) return;
  clearTimeout(rec.timer);
  if (rec.mr.state !== "inactive") rec.mr.stop();
}

function cancelRecording() {
  if (!rec) return;
  rec.cancelled = true;
  stopRecording();
}

function finishRecording(r) {
  if (rec === r) rec = null;
  const btn = $("#btnRec");
  btn.classList.remove("on");
  btn.style.removeProperty("--p");
  btn.setAttribute("aria-label", "ဗီဒီယိုရိုက်မယ် (၅ စက္ကန့်)");
  $("#btnShutter").disabled = state.mode === null;
  toast("");
  if (r.cancelled || !r.chunks.length) return;
  const type = (r.mime || "video/webm").split(";")[0];
  setResultFile(new Blob(r.chunks, { type }), type, type.includes("mp4") ? "mp4" : "webm");
  openResult("video");
}

$("#btnRec").onclick = () => (rec ? stopRecording() : startRecording());

$("#btnBack").onclick = closeResult;
$("#btnShare").onclick = async () => {
  if (!lastBlob) return;
  const file = new File([lastBlob], lastName, { type: lastType });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: "Myanmar Vibe", text: "သနပ်ခါး လိမ်းထားတယ် 🌼" }); } catch {}
  } else {
    $("#btnSave").click();
  }
};

// ---------- boot ----------
buildShapePicker();
buildTones();
enableRadioKeys($("#shapes"));
enableRadioKeys($("#tones"));

// Start fetching the face tracker right away (skipped when the phone asks to save data)
if (!(navigator.connection && navigator.connection.saveData)) {
  const warm = () => ensureLandmarker().then(() => blender && occ.load()).catch(() => {});
  if ("requestIdleCallback" in window) requestIdleCallback(warm, { timeout: 4000 });
  else setTimeout(warm, 2000);
}

// Testing helper: ?img=<url> opens a photo straight away
const testImg = new URLSearchParams(location.search).get("img");
if (testImg) { window.__thanakha = { state, layer, readFace, fx, mesh, texCanvas, occ }; startPhoto(testImg); }
