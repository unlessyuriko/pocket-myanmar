// Pagoda at Home: a golden pagoda on your table, seen through the phone camera.
// The camera picture is a plain <video>; the 3D scene is drawn over it. The phone's motion sensors
// turn the 3D camera as you turn the phone, so the pagoda stays where you put it.
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { DAYS, makeMaterials, buildCorner, setCornerDay, buildBackdrop, TABLE_Y, addFlowers, glowTexture } from "./pagoda-model.js";

const $ = (s) => document.querySelector(s);
const app = $("#app"), stage = $("#stage"), video = $("#video"), glCanvas = $("#gl");
const FONT = '"Noto Sans Myanmar","Myanmar Text","Padauk",sans-serif';
const MM = "၀၁၂၃၄၅၆၇၈၉";
const mm = (n) => String(n).replace(/\d/g, (d) => MM[d]);
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const TABLE_DROP = 0.45;       // without surface detection (iPhone): metres the table is assumed to be below the phone

const S = {
  phase: "intro",              // intro -> place -> worship
  dayIdx: null,
  placed: false,
  gyro: false,
  xr: false,                   // true while the phone's own AR (WebXR) tracks the surface
  hasCam: false,
  scale: 0.12,
  done: { water: false, lamp: false, flower: false, bell: false },
  sadhuShown: false,
  yaw: 0, pitch: -0.5,         // look direction when there are no motion sensors (desktop)
};

// ---------- saved merit (kept on this phone only) ----------
const todayKey = () => new Date().toISOString().slice(0, 10);
function loadMerit() {
  try { return JSON.parse(localStorage.getItem("mv.merit")) || { total: 0, days: [] }; } catch { return { total: 0, days: [] }; }
}
const merit = loadMerit();
function saveMerit() { try { localStorage.setItem("mv.merit", JSON.stringify(merit)); } catch { /* private mode */ } }
function streak() {
  let n = 0;
  const d = new Date();
  for (;;) {
    const k = d.toISOString().slice(0, 10);
    if (!merit.days.includes(k)) { if (n === 0 && k === todayKey()) { d.setDate(d.getDate() - 1); n = -1; continue; } break; }
    if (n < 0) n = 0;
    n++; d.setDate(d.getDate() - 1);
  }
  return Math.max(n, 0);
}
function addMerit() {
  merit.total++;
  if (!merit.days.includes(todayKey())) merit.days.push(todayKey());
  merit.days = merit.days.slice(-400);
  saveMerit(); showChips();
}
let savedDay = null;
try { savedDay = JSON.parse(localStorage.getItem("mv.day")); } catch { /* ignore */ }

// ---------- time of day in Yangon (UTC+6:30) ----------
function yangon() {
  const d = new Date(Date.now() + (6.5 * 60 + new Date().getTimezoneOffset()) * 60000);
  const h = d.getHours() + d.getMinutes() / 60;
  const [name, sun, hemi, exposure, night] =
    h >= 5.5 && h < 9 ? ["နံနက်", 0xffe2b0, 0xbfd7ff, 1.0, 0]
    : h >= 9 && h < 16 ? ["နေ့လည်", 0xffffff, 0xcfe4ff, 1.05, 0]
    : h >= 16 && h < 18.7 ? ["ညနေ", 0xffa862, 0xffd2a0, 0.95, 0.35]
    : ["ည", 0x8aa0ff, 0x30406a, 0.8, 1];
  return { name, sun, hemi, exposure, night };
}

// ---------- three.js scene ----------
const renderer = new THREE.WebGLRenderer({ canvas: glCanvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
renderer.setClearColor(0x000000, 0);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
const scene = new THREE.Scene();
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
const camera = new THREE.PerspectiveCamera(62, 1, 0.03, 40);
camera.rotation.order = "YXZ";

const hemi = new THREE.HemisphereLight(0xcfe4ff, 0x503820, 0.9);
const sun = new THREE.DirectionalLight(0xffffff, 2.2);
sun.position.set(2, 4, 3);
scene.add(hemi, sun);

const world = new THREE.Group();     // sits on the table: its origin is the middle of the corner's floor
world.visible = false;
scene.add(world);
const pagoda = new THREE.Group();    // the corner and its backdrop; turns to face you
world.add(pagoda);

const mats = makeMaterials();
const backdrop = buildBackdrop(mats);
pagoda.add(backdrop);
const stupa = backdrop.userData.stupa;
let corner = null;

// soft shadow under the corner
{
  const c = document.createElement("canvas"); c.width = c.height = 128;
  const x = c.getContext("2d");
  const g = x.createRadialGradient(64, 64, 20, 64, 64, 62);
  g.addColorStop(0, "rgba(0,0,0,0.5)"); g.addColorStop(0.7, "rgba(0,0,0,0.25)"); g.addColorStop(1, "rgba(0,0,0,0)");
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  const sh = new THREE.Mesh(new THREE.PlaneGeometry(7, 7), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }));
  sh.rotation.x = -Math.PI / 2; sh.position.set(0, -0.125, -0.4);
  world.add(sh);
}
// glow behind the jewel at the top of Shwedagon, strong at night
const jewelGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.35 }));
jewelGlow.scale.setScalar(1.1);
jewelGlow.position.copy(stupa.userData.jewel.position);
stupa.add(jewelGlow);

// the ring that shows where it will land on a real surface (phone AR)
const reticle = new THREE.Mesh(new THREE.RingGeometry(0.1, 0.13, 48),
  new THREE.MeshBasicMaterial({ color: 0xf7de9a, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }));
reticle.rotation.x = -Math.PI / 2;
const reticleHolder = new THREE.Group();
reticleHolder.add(reticle);
reticleHolder.visible = false;
scene.add(reticleHolder);

async function buildTheCorner() {
  try { await document.fonts.load(`700 40px ${FONT}`); await document.fonts.load(`400 30px ${FONT}`); } catch { /* fall back to system font */ }
  const i = S.dayIdx != null ? S.dayIdx : savedDay != null && DAYS[savedDay] ? savedDay : 0;
  corner = buildCorner(mats, DAYS[i], FONT);
  pagoda.add(corner);
  corner.add(kettle, drops);
  if (S.dayIdx != null) selectDay(S.dayIdx, true);
}

// the kettle and the water that falls from it
const kettle = new THREE.Group();
{
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.055, 18, 14), mats.gold);
  body.scale.y = 0.85;
  const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.014, 0.075, 10), mats.gold);
  spout.rotation.z = Math.PI / 2.6; spout.position.set(-0.07, 0.025, 0);
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.007, 8, 18, Math.PI), mats.goldDeep);
  handle.position.set(0.045, 0.02, 0); handle.rotation.z = -Math.PI / 2;
  kettle.add(body, spout, handle);
  kettle.scale.setScalar(3);
  kettle.visible = false;
}
const DROPS = 70;
const dropPos = new Float32Array(DROPS * 3), dropVel = new Float32Array(DROPS * 3), dropLife = new Float32Array(DROPS);
const dropGeo = new THREE.BufferGeometry();
dropGeo.setAttribute("position", new THREE.BufferAttribute(dropPos, 3));
const dotTex = (() => {
  const c = document.createElement("canvas"); c.width = c.height = 32;
  const x = c.getContext("2d"), g = x.createRadialGradient(16, 16, 2, 16, 16, 15);
  g.addColorStop(0, "rgba(255,255,255,1)"); g.addColorStop(0.7, "rgba(255,255,255,0.9)"); g.addColorStop(1, "rgba(255,255,255,0)");
  x.fillStyle = g; x.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(c);
})();
const drops = new THREE.Points(dropGeo, new THREE.PointsMaterial({ color: 0xb4defa, size: 0.03, map: dotTex, alphaTest: 0.05, transparent: true, opacity: 0.95, depthWrite: false }));
drops.frustumCulled = false;
dropPos.fill(-100);
buildTheCorner();

let pour = null, swing = null, popping = [];

function applyTime() {
  const t = yangon();
  hemi.color.setHex(t.hemi); sun.color.setHex(t.sun);
  hemi.intensity = t.night > 0.8 ? 0.55 : 0.9; sun.intensity = t.night > 0.8 ? 0.7 : 2.2;
  renderer.toneMappingExposure = t.exposure;
  jewelGlow.material.opacity = 0.25 + 0.6 * t.night;
  stupa.userData.jewel.material.emissiveIntensity = 1 + 2 * t.night;
  $("#chipTime").textContent = `ရန်ကုန် · ${t.name}`;
  S.night = t.night;
}
applyTime();

// ---------- camera orientation ----------
const zee = new THREE.Vector3(0, 0, 1), q0 = new THREE.Quaternion(), q1 = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5));
const eul = new THREE.Euler(), qGyro = new THREE.Quaternion();
let orient = null, firstGyro = true;
function onOrient(e) {
  if (e.alpha == null || e.beta == null) return;
  S.gyro = true;
  const D = Math.PI / 180;
  const o = ((screen.orientation && screen.orientation.angle) || window.orientation || 0) * D;
  eul.set(e.beta * D, e.alpha * D, -e.gamma * D, "YXZ");
  qGyro.setFromEuler(eul).multiply(q1).multiply(q0.setFromAxisAngle(zee, -o));
  orient = qGyro;
}
async function startSensors() {
  try {
    if (window.DeviceOrientationEvent && typeof DeviceOrientationEvent.requestPermission === "function") {
      const r = await DeviceOrientationEvent.requestPermission();    // iPhone asks here
      if (r !== "granted") return;
    }
  } catch { return; }
  window.addEventListener("deviceorientation", onOrient);
}

// ---------- camera picture ----------
async function startCamera() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return false;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
    video.srcObject = stream;
    await video.play().catch(() => {});
    S.hasCam = true;
    stage.classList.remove("nocam");
    return true;
  } catch { return false; }
}

// ---------- sound (made in code, so there is nothing to download) ----------
const Sound = (() => {
  let ctx = null;
  const get = () => {
    if (!ctx) { const A = window.AudioContext || window.webkitAudioContext; if (!A) return null; ctx = new A(); }
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  };
  const partial = (c, t, f, a, len, type = "sine") => {
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.value = f;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(a, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0006, t + len);
    o.connect(g).connect(c.destination); o.start(t); o.stop(t + len + 0.05);
  };
  return {
    unlock: get,
    bell() {
      const c = get(); if (!c) return; const t = c.currentTime;
      [[1, 0.3, 3.6], [2.01, 0.17, 2.6], [2.76, 0.12, 2.0], [4.07, 0.07, 1.4], [5.43, 0.045, 1.0]].forEach(([m, a, l]) => partial(c, t, 392 * m, a, l));
      partial(c, t, 96, 0.22, 2.2);
    },
    pour() {
      const c = get(); if (!c) return; const t = c.currentTime, len = 2.4;
      const buf = c.createBuffer(1, c.sampleRate * len, c.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      const src = c.createBufferSource(); src.buffer = buf;
      const bp = c.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 1500; bp.Q.value = 0.7;
      const lp = c.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 3200;
      const g = c.createGain();
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.18, t + 0.4); g.gain.setValueAtTime(0.18, t + len - 0.7); g.gain.linearRampToValueAtTime(0, t + len);
      src.connect(bp).connect(lp).connect(g).connect(c.destination); src.start(t);
    },
    flame() { const c = get(); if (!c) return; const t = c.currentTime; partial(c, t, 880, 0.05, 0.5); partial(c, t + 0.08, 1320, 0.035, 0.6); },
    petals() { const c = get(); if (!c) return; const t = c.currentTime; partial(c, t, 1046, 0.05, 0.4, "triangle"); },
    sadhu() {
      const c = get(); if (!c) return; const t = c.currentTime;
      [0, 0.5, 1.0].forEach((dt, i) => [392, 494, 587].forEach((f) => partial(c, t + dt, f * (1 + i * 0.12), 0.07, 1.8, "triangle")));
    },
  };
})();

// ---------- choosing the birth day ----------
const daysEl = $("#days");
DAYS.forEach((d, i) => {
  const b = document.createElement("button");
  b.className = "day"; b.type = "button"; b.setAttribute("role", "radio"); b.setAttribute("aria-checked", "false");
  b.dataset.i = i;
  b.innerHTML = `<span class="em" aria-hidden="true">${d.emoji}</span><span class="dn">${d.day}</span>`;
  b.setAttribute("aria-label", `${d.day}၊ ${d.animal}`);
  b.onclick = () => { pickDay(i); };
  daysEl.append(b);
});
let pickedDay = null;
function pickDay(i) {
  pickedDay = i;
  daysEl.querySelectorAll(".day").forEach((b) => b.setAttribute("aria-checked", String(+b.dataset.i === i)));
  $("#btnStart").disabled = false;
}
if (savedDay != null && DAYS[savedDay]) pickDay(savedDay);

let changingDay = false;
function selectDay(i, instant = false) {
  S.dayIdx = i;
  try { localStorage.setItem("mv.day", JSON.stringify(i)); } catch { /* ignore */ }
  if (!corner) return;                  // built once the fonts are in; it then calls this again
  S.corner = corner;
  setCornerDay(corner, DAYS[i], mats, FONT);
  const ud = corner.userData;
  ud.flames.forEach((f) => (f.visible = false));
  ud.lit = false;
  ud.light.intensity = 0;
  ud.flowers.forEach((f) => { corner.remove(f); f.geometry.dispose(); f.material.dispose(); });
  ud.flowers.length = 0;
  kettle.visible = false;
  S.done = { water: false, lamp: false, flower: false, bell: false };
  S.sadhuShown = false;
  refreshOfferButtons();
  faceYawTarget(instant);
}
let rotTarget = 0;
const viewerPos = new THREE.Vector3();      // where the phone is (phone AR); the origin otherwise
function faceYawTarget(instant) {
  // turn the corner so its front points at you
  const p = world.position;
  rotTarget = Math.atan2(viewerPos.x - p.x, viewerPos.z - p.z);
  if (instant) pagoda.rotation.y = rotTarget;
}
const angDiff = (a, b) => { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };

// ---------- placing it ----------
const ray = new THREE.Raycaster();
function placeAt(cx, cy) {
  const r = stage.getBoundingClientRect();
  ray.setFromCamera(new THREE.Vector2(((cx - r.left) / r.width) * 2 - 1, -(((cy - r.top) / r.height) * 2 - 1)), camera);
  const d = ray.ray.direction;
  let t = 1.1, y = -TABLE_DROP;
  if (d.y < -0.08) t = THREE.MathUtils.clamp(TABLE_DROP / -d.y, 0.45, 2.6);
  world.position.set(d.x * t, y, d.z * t);
  finishPlace();
}
function finishPlace() {
  world.scale.setScalar(S.scale);
  world.visible = true;
  S.placed = true;
  faceYawTarget(true);
  if (S.phase === "place") enterWorship();
}

// ---------- phone AR (WebXR): find the real surface and stay on it ----------
// Android Chrome has this. iPhone Safari does not, so there the table is only assumed (see TABLE_DROP).
let xrSession = null, xrSource = null, xrOK = false, hitReady = false;
if (navigator.xr && navigator.xr.isSessionSupported) {
  navigator.xr.isSessionSupported("immersive-ar").then((v) => { xrOK = !!v; }).catch(() => {});
}
async function startXR() {
  try {
    const session = await navigator.xr.requestSession("immersive-ar", {
      requiredFeatures: ["hit-test"], optionalFeatures: ["dom-overlay"], domOverlay: { root: app },
    });
    renderer.xr.setReferenceSpaceType("local");
    await renderer.xr.setSession(session);
    xrSource = await session.requestHitTestSource({ space: await session.requestReferenceSpace("viewer") });
    xrSession = session;
    S.xr = true;
    app.classList.add("xr");
    session.addEventListener("select", () => { if (S.phase === "place" && hitReady) { world.position.copy(reticleHolder.position); finishPlace(); } });
    session.addEventListener("end", () => {
      S.xr = false; xrSession = null; xrSource = null; hitReady = false;
      app.classList.remove("xr", "started");
      reticleHolder.visible = false; world.visible = false;
      S.phase = "intro"; S.placed = false; $("#intro").hidden = false; setHint("");
    });
    return true;
  } catch { return false; }
}
for (const sel of ["#panel", "#intro", ".topbar", ".shutter-row", "#toast"]) {
  const el = document.querySelector(sel);
  if (el) el.addEventListener("beforexrselect", (e) => e.preventDefault());
}

function enterWorship() {
  S.phase = "worship";
  setHint("");
  $("#btnShutter").disabled = false;
  for (const id of ["#btnReplace", "#btnDay"]) $(id).disabled = false;
  refreshOfferButtons();
  showChips();
  flash(`${DAYS[S.dayIdx].day} · ${DAYS[S.dayIdx].animal} ထောင့်သို့ ကြိုဆိုပါတယ်`, 3200);
}
function refreshOfferButtons() {
  const on = S.phase === "worship";
  for (const [id, key] of [["#offWater", "water"], ["#offLamp", "lamp"], ["#offFlower", "flower"], ["#offBell", "bell"]]) {
    $(id).disabled = !on;
    $(id).classList.toggle("done", S.done[key]);
  }
}
function showChips() {
  $("#chips").hidden = false;
  const s = streak();
  $("#chipMerit").textContent = merit.total ? `ကုသိုလ် ${mm(merit.total)}${s > 1 ? ` · ${mm(s)} ရက်ဆက်` : ""}` : "";
}

// ---------- messages ----------
let toastT = 0;
function flash(msg, ms = 2600) {
  const t = $("#toast");
  t.textContent = msg; t.hidden = !msg;
  clearTimeout(toastT);
  if (msg && ms) toastT = setTimeout(() => (t.hidden = true), ms);
}
function setHint(msg) { const h = $("#hint"); h.textContent = msg; h.hidden = !msg; }

// ---------- offerings ----------
function offered(key) {
  S.done[key] = true;
  addMerit();
  refreshOfferButtons();
  if (!S.sadhuShown && Object.values(S.done).every(Boolean)) {
    S.sadhuShown = true;
    setTimeout(sadhu, 900);
  }
}
function sadhu() {
  Sound.sadhu();
  $("#sadhuSub").textContent = `${DAYS[S.dayIdx].day} ${DAYS[S.dayIdx].animal} ထောင့်မှာ ပူဇော်ပြီးပါပြီ`;
  const el = $("#sadhu");
  el.hidden = false;
  el.style.animation = "none"; void el.offsetWidth; el.style.animation = "";
  setTimeout(() => (el.hidden = true), 3500);
  if (corner) for (let i = 0; i < 24; i++) spawnSpark();
}

$("#offWater").onclick = () => {
  if (pour || !S.corner) return;
  pour = { t: 0, dur: 2.6, acc: 0 };
  kettle.visible = true;
  Sound.pour();
  offered("water");
};
$("#offLamp").onclick = () => {
  const ud = S.corner && S.corner.userData;
  if (!ud) return;
  const on = !ud.flames[0].visible;
  ud.flames.forEach((f) => (f.visible = on));
  ud.lit = on;
  if (on) { Sound.flame(); offered("lamp"); }
};
$("#offFlower").onclick = () => {
  if (!S.corner) return;
  const before = S.corner.userData.flowers.length;
  addFlowers(S.corner, 6);
  const fresh = S.corner.userData.flowers.slice(before);
  fresh.forEach((f, i) => { f.userData.s = f.scale.clone(); f.scale.setScalar(0.001); popping.push({ f, t: -i * 0.06 }); });
  Sound.petals();
  offered("flower");
};
$("#offBell").onclick = () => {
  if (!S.corner) return;
  swing = { t: 0, ud: S.corner.userData };
  Sound.bell();
  offered("bell");
};

// golden sparkles for the sadhu moment
const sparks = [];
const sparkTex = glowTexture();
function spawnSpark() {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: sparkTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 1 }));
  s.scale.setScalar(0.12 + Math.random() * 0.16);
  s.scale.multiplyScalar(2.5);
  const a = Math.random() * Math.PI * 2, r = 0.3 + Math.random() * 1.6;
  s.position.set(Math.cos(a) * r, 0.5 + Math.random() * 1.5, Math.sin(a) * r * 0.6 + 0.3);
  s.userData = { v: new THREE.Vector3((Math.random() - 0.5) * 0.4, 0.5 + Math.random() * 0.8, (Math.random() - 0.5) * 0.4), life: 0, max: 1.8 + Math.random() };
  pagoda.add(s); sparks.push(s);
}

// ---------- touch: place, spin, pinch, look around ----------
const pts = new Map();
let pinch = null, downAt = null;
stage.addEventListener("pointerdown", (e) => {
  if (S.phase === "intro" || e.target.closest("button, .intro, label, input")) return;
  stage.setPointerCapture && stage.setPointerCapture(e.pointerId);
  pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pts.size === 1) downAt = { x: e.clientX, y: e.clientY, moved: 0 };
  if (pts.size === 2) {
    const [a, b] = [...pts.values()];
    pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), s: S.scale };
  }
});
stage.addEventListener("pointermove", (e) => {
  const p = pts.get(e.pointerId);
  if (!p) return;
  const dx = e.clientX - p.x, dy = e.clientY - p.y;
  p.x = e.clientX; p.y = e.clientY;
  if (pts.size === 2 && pinch) {
    const [a, b] = [...pts.values()];
    setScale(pinch.s * (Math.hypot(a.x - b.x, a.y - b.y) / pinch.d));
    return;
  }
  if (downAt) downAt.moved += Math.abs(dx) + Math.abs(dy);
  if (!S.gyro && !S.xr) {                       // no motion sensors: drag to look around
    S.yaw += dx * 0.005; S.pitch = THREE.MathUtils.clamp(S.pitch + dy * 0.005, -1.35, 0.6);
  } else if (S.phase === "worship") {           // otherwise drag turns the corner
    rotTarget += dx * 0.012; pagoda.rotation.y += dx * 0.012;
  }
});
function endPointer(e) {
  const had = pts.delete(e.pointerId);
  if (!had) return;
  if (pts.size < 2) pinch = null;
  if (pts.size === 0 && downAt && downAt.moved < 12 && S.phase === "place" && !S.xr) placeAt(e.clientX, e.clientY);
  if (pts.size === 0) downAt = null;
}
stage.addEventListener("pointerup", endPointer);
stage.addEventListener("pointercancel", endPointer);
function setScale(s) {
  S.scale = THREE.MathUtils.clamp(s, 0.04, 0.3);
  world.scale.setScalar(S.scale);
  $("#size").value = S.scale;
}
$("#size").oninput = (e) => setScale(+e.target.value);

// ---------- start and navigation ----------
$("#btnStart").onclick = async () => {
  if (pickedDay == null) return;
  Sound.unlock();
  selectDay(pickedDay, true);
  $("#intro").hidden = true;
  if (changingDay) {                                  // just switching to another day's shrine
    changingDay = false;
    faceYawTarget(false);
    flash(`${DAYS[S.dayIdx].day} · ${DAYS[S.dayIdx].animal} ထောင့်သို့`, 2400);
    return;
  }
  app.classList.add("started");
  S.phase = "place";
  setTimeout(() => { if (S.phase === "place") flash("မြေပြင်ပေါ် မတင်ပါနဲ့ — ရိုသေစွာ မြင့်တဲ့နေရာမှာ တင်ပါ", 4200); }, 1500);
  // Phone AR (Android Chrome) finds the real surface. It has to be asked for straight from the tap.
  if (xrOK) {
    setHint("ဖုန်းကို စားပွဲဆီ ညွှန်ပါ။ ရွှေရောင်စက်ဝိုင်း ပေါ်လာရင် တစ်ချက်ထိပါ");
    if (await startXR()) return;
  }
  setHint("စားပွဲ ဒါမှမဟုတ် စင်ပေါ်မှာ တစ်ချက်ထိပြီး တင်ပါ");
  // The phone asks permission for the sensors and the camera; the scene shows as soon as they answer
  startSensors();
  startCamera().then((ok) => {
    if (ok) stage.classList.remove("nocam");
    else { stage.classList.add("nocam"); flash("ကင်မရာ မရပါ၊ ညနေခင်းနောက်ခံနဲ့ ပြပေးပါမယ်", 3500); }
  });
  stage.classList.add("nocam");                    // until the camera picture arrives
  setTimeout(() => {
    if (S.phase === "place" && !S.gyro) setHint("ဖုန်းမလှုပ်ရင် ဆွဲပြီး ကြည့်ပါ၊ ပြီးရင် တစ်ချက်ထိပါ");
  }, 2500);
};
$("#btnReplace").onclick = () => {
  S.phase = "place"; S.placed = false; world.visible = false;
  setHint(S.xr ? "ဖုန်းကို စားပွဲဆီ ညွှန်ပြီး စက်ဝိုင်းပေါ်မှာ တစ်ချက်ထိပါ" : "နေရာအသစ်မှာ တစ်ချက်ထိပြီး တင်ပါ");
  for (const id of ["#offWater", "#offLamp", "#offFlower", "#offBell"]) $(id).disabled = true;
};
$("#btnDay").onclick = () => {
  changingDay = true;
  pickDay(S.dayIdx);
  $("#btnStart").textContent = "ပြောင်းမယ်";
  $("#intro").hidden = false;
};

// ---------- photo to share ----------
function coverDraw(ctx, el, W, H, vw, vh) {
  const k = Math.max(W / vw, H / vh);
  ctx.drawImage(el, (W - vw * k) / 2, (H - vh * k) / 2, vw * k, vh * k);
}
async function capture() {
  renderer.render(scene, camera);
  const W = glCanvas.width, H = glCanvas.height;
  const out = document.createElement("canvas");
  out.width = W; out.height = H;
  const x = out.getContext("2d");
  if (S.hasCam && video.videoWidth) coverDraw(x, video, W, H, video.videoWidth, video.videoHeight);
  else {
    const g = x.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#14324a"); g.addColorStop(0.55, "#6a5f66"); g.addColorStop(0.62, "#2a2118"); g.addColorStop(1, "#15100b");
    x.fillStyle = g; x.fillRect(0, 0, W, H);
  }
  x.drawImage(glCanvas, 0, 0);
  // caption strip along the bottom
  const u = W / 390, sh = 118 * u;
  const g = x.createLinearGradient(0, H - sh, 0, H);
  g.addColorStop(0, "rgba(4,24,19,0)"); g.addColorStop(0.45, "rgba(4,24,19,0.82)"); g.addColorStop(1, "rgba(4,24,19,0.95)");
  x.fillStyle = g; x.fillRect(0, H - sh, W, sh);
  x.textAlign = "center";
  const d = DAYS[S.dayIdx];
  x.fillStyle = "#f7de9a"; x.font = `700 ${22 * u}px ${FONT}`;
  x.fillText("ဒီနေ့ ဘုရားဖူးပြီးပါပြီ 🙏", W / 2, H - 62 * u, W - 24 * u);
  x.fillStyle = "#f9eed8"; x.font = `400 ${15 * u}px ${FONT}`;
  x.fillText(`${d.day} ${d.animal} ${d.emoji}${merit.total ? `  ·  ကုသိုလ် ${mm(merit.total)}` : ""}`, W / 2, H - 36 * u, W - 24 * u);
  x.fillStyle = "#e3b85c"; x.font = `700 ${13 * u}px "Playfair Display", Georgia, serif`;
  x.fillText("Myanmar Vibe", W / 2, H - 13 * u);
  return out;
}
let shot = null;
$("#btnShutter").onclick = async () => {
  const c = await capture();
  const blob = await new Promise((r) => c.toBlob(r, "image/jpeg", 0.92));
  shot = new File([blob], "myanmar-vibe-pagoda.jpg", { type: "image/jpeg" });
  const url = URL.createObjectURL(blob);
  $("#resultImg").src = url; $("#btnSave").href = url;
  $("#result").hidden = false;
};
$("#btnBack").onclick = () => { $("#result").hidden = true; };
$("#btnShare").onclick = async () => {
  try {
    if (navigator.canShare && navigator.canShare({ files: [shot] })) await navigator.share({ files: [shot], text: "ဒီနေ့ ဘုရားဖူးပြီးပါပြီ 🙏" });
    else $("#btnSave").click();
  } catch { /* cancelled */ }
};

// ---------- animation loop ----------
function resize() {
  const w = stage.clientWidth, h = stage.clientHeight;
  if (!w || !h || renderer.xr.isPresenting) return;
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.setSize(w, h, false);
  camera.aspect = w / h; camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(stage);
resize();

const hitPos = new THREE.Vector3();
let last = performance.now();
function frame(now, xrFrame) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  const tt = now / 1000;

  if (xrFrame && xrSession) {
    // phone AR: the phone gives the camera pose; look for the surface under the middle of the screen
    const ref = renderer.xr.getReferenceSpace();
    const vp = xrFrame.getViewerPose(ref);
    if (vp) viewerPos.set(vp.transform.position.x, vp.transform.position.y, vp.transform.position.z);
    hitReady = false;
    if (S.phase === "place" && xrSource) {
      const hits = xrFrame.getHitTestResults(xrSource);
      if (hits.length) {
        const p = hits[0].getPose(ref);
        if (p) { hitPos.set(p.transform.position.x, p.transform.position.y, p.transform.position.z); hitReady = true; }
      }
    }
    reticleHolder.visible = hitReady;
    if (hitReady) {
      reticleHolder.position.copy(hitPos);
      reticleHolder.scale.setScalar(S.scale * 3 * (1 + 0.06 * Math.sin(tt * 4)) / 0.36);
    }
  } else if (S.gyro && orient) {
    if (firstGyro) { camera.quaternion.copy(orient); firstGyro = false; } else camera.quaternion.slerp(orient, 0.4);
  } else { camera.rotation.set(S.pitch, S.yaw, 0, "YXZ"); }

  if (world.visible) {
    pagoda.rotation.y += angDiff(pagoda.rotation.y, rotTarget) * Math.min(1, dt * 4);
    jewelGlow.material.opacity = (0.25 + 0.6 * (S.night || 0)) * (0.85 + 0.15 * Math.sin(tt * 3));
  }

  // lamp flames flicker, and light the corner a little
  if (corner) {
    const ud = corner.userData;
    if (ud.lit) {
      ud.flames.forEach((f, i) => {
        const k = 1 + 0.12 * Math.sin(tt * 11 + i * 2) + 0.07 * Math.sin(tt * 23 + i);
        f.scale.set(0.2 * k, 0.32 * (1.1 - (k - 1)), 1);
      });
      ud.light.intensity += (3 + 0.5 * Math.sin(tt * 9) - ud.light.intensity) * 0.1;
    } else ud.light.intensity += (0 - ud.light.intensity) * 0.1;
  }

  // pouring water: the kettle tips over the animal and drops fall onto it
  drops.material.size = 0.3 * S.scale;
  if (pour && S.corner) {
    pour.t += dt;
    const p = pour.t / pour.dur;
    const tilt = Math.min(1, p * 4, (1 - p) * 4);
    const KX = 0.62, KZ = 1.0, ang = tilt * 0.75, K = 3;
    kettle.position.set(KX, 1.72, KZ);
    kettle.rotation.z = ang;
    if (p < 0.9 && tilt > 0.5) {
      pour.acc += dt * 38;
      while (pour.acc >= 1) {
        pour.acc -= 1;
        const i = dropLife.findIndex((l) => l <= 0);
        if (i < 0) break;
        // the spout tip, turned with the kettle
        const tipx = KX + K * (-0.105 * Math.cos(ang) - 0.045 * Math.sin(ang)), tipy = 1.72 + K * (-0.105 * Math.sin(ang) + 0.045 * Math.cos(ang));
        dropPos.set([tipx, tipy, KZ + (Math.random() - 0.5) * 0.04], i * 3);
        dropVel.set([-0.3 - Math.random() * 0.15, 0, (Math.random() - 0.5) * 0.1], i * 3);
        dropLife[i] = 1;
      }
    }
    if (pour.t >= pour.dur) { pour = null; kettle.visible = false; }
  }
  for (let i = 0; i < DROPS; i++) {
    if (dropLife[i] <= 0) continue;
    dropVel[3 * i + 1] -= 4.8 * dt;
    dropPos[3 * i] += dropVel[3 * i] * dt; dropPos[3 * i + 1] += dropVel[3 * i + 1] * dt; dropPos[3 * i + 2] += dropVel[3 * i + 2] * dt;
    if (dropPos[3 * i + 1] < 0.08) { dropLife[i] = 0; dropPos.set([0, -100, 0], 3 * i); }
  }
  dropGeo.attributes.position.needsUpdate = true;

  // bell swing
  if (swing) {
    swing.t += dt;
    swing.ud.bell.rotation.z = Math.sin(swing.t * 9) * 0.5 * Math.exp(-swing.t * 1.3);
    if (swing.t > 3.5) { swing.ud.bell.rotation.z = 0; swing = null; }
  }
  // flowers pop in
  popping = popping.filter((o) => {
    o.t += dt;
    if (o.t < 0) return true;
    const k = Math.min(1, o.t / 0.35), e = 1 - Math.pow(1 - k, 3);
    o.f.scale.set(o.f.userData.s.x * e, o.f.userData.s.y * e, o.f.userData.s.z * e);
    return k < 1;
  });
  // sparkles
  for (let i = sparks.length - 1; i >= 0; i--) {
    const s = sparks[i], u = s.userData;
    u.life += dt;
    s.position.addScaledVector(u.v, dt);
    s.material.opacity = Math.max(0, 1 - u.life / u.max);
    if (u.life >= u.max) { pagoda.remove(s); s.material.dispose(); sparks.splice(i, 1); }
  }

  renderer.render(scene, camera);
}
renderer.setAnimationLoop(frame);          // also what phone AR needs

// small hook for testing: open with ?debug
if (new URLSearchParams(location.search).has("debug")) {
  window.__pagoda = { S, world, pagoda, camera, scene, renderer, get corner() { return corner; }, selectDay, placeAt, enterWorship, sadhu, merit, setScale };
}
