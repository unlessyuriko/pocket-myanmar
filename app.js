import { FaceLandmarker, FilesetResolver } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs";
import { SHAPES, TONES, drawThanakha, drawShapeIcon } from "./thanakha.js";
import { createBlender } from "./blend.js";

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
const shade = document.createElement("canvas");
const sctx = shade.getContext("2d");
const stage = $("#stage");

const state = {
  shape: "circle",
  tone: "fresh",
  strength: 0.85,
  extras: { forehead: false, nose: false, chin: false },
  mode: null,          // "camera" | "photo"
  photo: null,         // HTMLImageElement in photo mode
  points: null,        // smoothed landmarks (pixels)
};

let landmarker = null;
let runningMode = null;
let stream = null;
let lastVideoTime = -1;

// ---------- UI ----------
function buildShapePicker() {
  const wrap = $("#shapes");
  wrap.innerHTML = "";
  for (const s of SHAPES) {
    const b = document.createElement("button");
    b.className = "shape";
    b.setAttribute("role", "radio");
    b.dataset.shape = s.id;
    b.setAttribute("aria-checked", String(s.id === state.shape));
    const c = document.createElement("canvas");
    c.width = c.height = 116;
    drawShapeIcon(c, s.id, state.tone);
    b.append(c);
    b.insertAdjacentHTML("beforeend", `<span class="mm">${s.mm}</span><span class="en">${s.en}</span>`);
    b.onclick = () => {
      state.shape = s.id;
      wrap.querySelectorAll(".shape").forEach(x => x.setAttribute("aria-checked", String(x === b)));
      redraw();
    };
    wrap.append(b);
  }
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
    b.style.background = `rgb(${t.base.join(",")})`;
    b.onclick = () => {
      state.tone = t.id;
      wrap.querySelectorAll(".tone").forEach(x => x.setAttribute("aria-checked", String(x === b)));
      buildShapePicker();
      redraw();
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

// Intro artwork: a face-ish icon with round thanakha
drawShapeIcon($("#introArt"), "circle", "fresh");

// ---------- face tracking ----------
async function getLandmarker(mode) {
  if (!landmarker) {
    toast("Loading face tracker…");
    const fileset = await FilesetResolver.forVisionTasks(WASM_URL);
    const opts = (delegate) => ({
      baseOptions: { modelAssetPath: MODEL_URL, delegate },
      runningMode: mode,
      numFaces: 1,
    });
    try {
      landmarker = await FaceLandmarker.createFromOptions(fileset, opts("GPU"));
    } catch {
      landmarker = await FaceLandmarker.createFromOptions(fileset, opts("CPU"));
    }
    runningMode = mode;
    toast("");
  }
  if (runningMode !== mode) {
    await landmarker.setOptions({ runningMode: mode });
    runningMode = mode;
  }
  return landmarker;
}

function toPixels(lms, w, h, mirror) {
  return lms.map(l => ({ x: (mirror ? 1 - l.x : l.x) * w, y: l.y * h }));
}

// Smooth out jitter; follow fast moves quickly, steady when still
function smooth(next) {
  const prev = state.points;
  if (!prev || prev.length !== next.length) return next;
  const faceW = Math.hypot(next[234].x - next[454].x, next[234].y - next[454].y) || 1;
  const move = Math.hypot(next[1].x - prev[1].x, next[1].y - prev[1].y) / faceW;
  const a = Math.min(1, 0.35 + move * 8);
  return next.map((p, i) => ({ x: prev[i].x + (p.x - prev[i].x) * a, y: prev[i].y + (p.y - prev[i].y) * a }));
}

// ---------- rendering ----------
function sizeCanvases(w, h) {
  if (view.width !== w || view.height !== h) {
    view.width = layer.width = w;
    view.height = layer.height = h;
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
  if (blender) {
    drawThanakha(lctx, state.points, state);
    measureFace(source, mirror);
    blender.render(source, layer, { mirror, strength: state.points ? state.strength : 0, faceLum });
    return;
  }
  ctx.save();
  if (mirror) ctx.setTransform(-1, 0, 0, 1, W, 0);
  ctx.drawImage(source, 0, 0, W, H);
  ctx.restore();

  drawThanakha(lctx, state.points, state);
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

let missed = 0;
function cameraLoop() {
  if (state.mode !== "camera") return;
  if (video.readyState >= 2 && video.currentTime !== lastVideoTime) {
    lastVideoTime = video.currentTime;
    sizeCanvases(video.videoWidth, video.videoHeight);
    const res = landmarker.detectForVideo(video, performance.now());
    const lms = res.faceLandmarks && res.faceLandmarks[0];
    if (lms) {
      state.points = smooth(toPixels(lms, view.width, view.height, true));
      if (missed > 10) toast("");
      missed = 0;
    } else if (++missed > 10) {
      state.points = null;
      toast("Can't see your face — move into the light");
    }
    compose(video, true);
  }
  requestAnimationFrame(cameraLoop);
}

// ---------- modes ----------
async function startCamera() {
  try {
    stopCamera();
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 960 } },
      audio: false,
    });
  } catch (err) {
    toast(location.protocol === "https:" || location.hostname === "localhost"
      ? "Camera blocked — allow camera access and try again"
      : "Camera needs a secure (https) link", 5000);
    return;
  }
  video.srcObject = stream;
  await video.play().catch(() => {});
  await getLandmarker("VIDEO");
  state.mode = "camera";
  state.points = null;
  stage.classList.remove("photo");
  enterApp();
  requestAnimationFrame(cameraLoop);
}

function stopCamera() {
  if (stream) stream.getTracks().forEach(t => t.stop());
  stream = null;
}

async function startPhoto(src) {
  stopCamera();
  state.mode = "photo";
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.src = src;
  try { await img.decode(); } catch { toast("Couldn't open that photo", 4000); return; }

  // Keep it a sensible size for phones
  const scale = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
  sizeCanvases(Math.round(img.naturalWidth * scale), Math.round(img.naturalHeight * scale));
  const sized = document.createElement("canvas");
  sized.width = view.width;
  sized.height = view.height;
  sized.getContext("2d").drawImage(img, 0, 0, sized.width, sized.height);
  state.photo = sized;
  stage.classList.add("photo");
  state.points = null;
  enterApp();
  redraw();

  const lm = await getLandmarker("IMAGE");
  const res = lm.detect(sized);
  const lms = res.faceLandmarks && res.faceLandmarks[0];
  state.points = lms ? toPixels(lms, view.width, view.height, false) : null;
  if (!lms) toast("No face found in this photo", 4000);
  redraw();
}

function enterApp() {
  $("#intro").hidden = true;
  $("#btnShutter").disabled = false;
  $("#btnSwitch").hidden = false;
}

$("#btnCamera").onclick = startCamera;
$("#filePhoto").onchange = (e) => {
  const f = e.target.files && e.target.files[0];
  if (f) startPhoto(URL.createObjectURL(f));
  e.target.value = "";
};
$("#btnSwitch").onclick = () => {
  stopCamera();
  state.mode = null;
  $("#intro").hidden = false;
  $("#btnShutter").disabled = true;
};

// ---------- capture & share ----------
let lastBlob = null;
let lastUrl = null;

$("#btnShutter").onclick = () => {
  const out = document.createElement("canvas");
  out.width = view.width;
  out.height = view.height;
  const o = out.getContext("2d");
  o.drawImage(view, 0, 0);

  // Small caption in the corner
  const fs = Math.round(out.width * 0.032);
  o.font = `600 ${fs}px "Noto Sans Myanmar", "Myanmar Text", sans-serif`;
  const text = "သနပ်ခါး · Thanakha Selfie";
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

  out.toBlob((blob) => {
    lastBlob = blob;
    if (lastUrl) URL.revokeObjectURL(lastUrl);
    lastUrl = URL.createObjectURL(blob);
    $("#resultImg").src = lastUrl;
    $("#btnSave").href = lastUrl;
    $("#result").hidden = false;
  }, "image/jpeg", 0.92);
};

$("#btnBack").onclick = () => { $("#result").hidden = true; };
$("#btnShare").onclick = async () => {
  if (!lastBlob) return;
  const file = new File([lastBlob], "thanakha-selfie.jpg", { type: "image/jpeg" });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: "Thanakha Selfie", text: "သနပ်ခါး လိမ်းထားတယ် 🌼" }); } catch {}
  } else {
    $("#btnSave").click();
  }
};

// ---------- boot ----------
buildShapePicker();
buildTones();

// Testing helper: ?img=<url> opens a photo straight away
const testImg = new URLSearchParams(location.search).get("img");
if (testImg) { window.__thanakha = { state, layer }; startPhoto(testImg); }
