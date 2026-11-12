// The 3D pieces of "Pagoda at Home", all built from simple shapes in code (no model files):
// your birth-day corner (a seated Buddha on a gold drum, the animal statue in a tiled basin below),
// and, far behind it, Shwedagon and an arcade wall. Plus the small things you offer
// (water, lamps, flowers, a bell).
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";

// Real 3D models (made from reference images, compressed) for the pieces that are in models/.
// Any that fail to load keep the simple shape built in code.
const gltf = new GLTFLoader();
gltf.setMeshoptDecoder(MeshoptDecoder);
const modelCache = new Map();
const MODELS = new Map([["mon", 1.45], ["fri", 1.5]]);       // birth-day id -> height in corner units
export function loadModel(name, height) {
  if (!modelCache.has(name)) {
    modelCache.set(name, gltf.loadAsync(`models/${name}.glb`).then((g) => {
      const o = g.scene;
      const box = new THREE.Box3().setFromObject(o);
      const size = box.getSize(new THREE.Vector3());
      o.scale.setScalar(height / size.y);
      box.setFromObject(o);
      const c = box.getCenter(new THREE.Vector3());
      o.position.set(-c.x, -box.min.y, -c.z);
      o.traverse((n) => { if (n.isMesh && n.material) { n.material.side = THREE.DoubleSide; n.material.envMapIntensity = 1.2; if (n.material.metalness != null) n.material.metalness = Math.max(n.material.metalness, 0.7); } });
      const wrap = new THREE.Group();
      wrap.add(o);
      return wrap;
    }));
  }
  return modelCache.get(name).then((w) => w.clone(true));
}

// The eight birth-day posts. Wednesday is split into morning and afternoon (Rahu), as in Myanmar.
export const DAYS = [
  { id: "mon", day: "တနင်္လာ", animal: "ကျား", emoji: "🐯" },
  { id: "tue", day: "အင်္ဂါ", animal: "ခြင်္သေ့", emoji: "🦁" },
  { id: "wed", day: "ဗုဒ္ဓဟူး", animal: "ဆင်", emoji: "🐘" },
  { id: "rahu", day: "ရာဟု", animal: "ဆင် (အစွယ်မဲ့)", emoji: "🐘" },
  { id: "thu", day: "ကြာသပတေး", animal: "ကြွက်", emoji: "🐭" },
  { id: "fri", day: "သောကြာ", animal: "ပူး", emoji: "🐹" },
  { id: "sat", day: "စနေ", animal: "နဂါး", emoji: "🐉" },
  { id: "sun", day: "တနင်္ဂနွေ", animal: "ဂဠုန်", emoji: "🦅" },
];

// ---------- painted textures ----------
function canvasTex(w, h, draw, repeat) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  return t;
}
const archPath = (x, x0, y0, w, h) => {
  x.beginPath();
  x.moveTo(x0, y0 + h);
  x.lineTo(x0, y0 + w / 2);
  x.arc(x0 + w / 2, y0 + w / 2, w / 2, Math.PI, 0);
  x.lineTo(x0 + w, y0 + h);
  x.closePath();
};

// white and grey floor tiles
const tileTex = (repeat) => canvasTex(256, 256, (x, w, h) => {
  x.fillStyle = "#e9e6df"; x.fillRect(0, 0, w, h);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
    x.fillStyle = (i + j) % 2 ? "#e2ded5" : "#ece9e2";
    x.fillRect(i * 64 + 2, j * 64 + 2, 60, 60);
  }
  x.strokeStyle = "#b9b4a8"; x.lineWidth = 2;
  for (let i = 0; i <= 4; i++) { x.beginPath(); x.moveTo(i * 64, 0); x.lineTo(i * 64, h); x.stroke(); x.beginPath(); x.moveTo(0, i * 64); x.lineTo(w, i * 64); x.stroke(); }
}, repeat);

// gold drum with a ring of arched panels, like the bases at the Shwedagon corners
const drumTex = () => canvasTex(1024, 256, (x, w, h) => {
  const g = x.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, "#e8c068"); g.addColorStop(1, "#c8962f");
  x.fillStyle = g; x.fillRect(0, 0, w, h);
  const n = 8, pw = w / n;
  for (let i = 0; i < n; i++) {
    const x0 = i * pw + pw * 0.14, aw = pw * 0.72;
    archPath(x, x0, h * 0.1, aw, h * 0.8);
    x.fillStyle = "#f3d68a"; x.fill();
    x.lineWidth = 7; x.strokeStyle = "#7a4d12"; x.stroke();
    archPath(x, x0 + 14, h * 0.1 + 14, aw - 28, h * 0.8 - 28);
    x.fillStyle = "#d9a843"; x.fill();
    x.lineWidth = 3; x.strokeStyle = "#8a5a18"; x.stroke();
    // a small flower in the middle of each arch
    x.fillStyle = "#9c3b2a";
    for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; x.beginPath(); x.arc(x0 + aw / 2 + Math.cos(a) * 14, h * 0.5 + Math.sin(a) * 14, 8, 0, 7); x.fill(); }
    x.fillStyle = "#f7de9a"; x.beginPath(); x.arc(x0 + aw / 2, h * 0.5, 8, 0, 7); x.fill();
  }
});

// the long gold arcade wall behind the corner
const arcadeTex = () => canvasTex(1536, 320, (x, w, h) => {
  x.fillStyle = "#d9a53a"; x.fillRect(0, 0, w, h);
  const n = 6, pw = w / n;
  for (let i = 0; i < n; i++) {
    const x0 = i * pw + pw * 0.16, aw = pw * 0.68;
    archPath(x, x0 - 12, 30, aw + 24, h - 30);
    x.fillStyle = "#b9862a"; x.fill();
    archPath(x, x0, 48, aw, h - 48);
    const g = x.createLinearGradient(0, 40, 0, h);
    g.addColorStop(0, "#0e5e4c"); g.addColorStop(1, "#06382e");
    x.fillStyle = g; x.fill();
    x.lineWidth = 6; x.strokeStyle = "#f3d68a"; x.stroke();
  }
  x.fillStyle = "#f3d68a"; x.fillRect(0, 0, w, 14);
  x.fillStyle = "#8a5a18"; x.fillRect(0, 14, w, 6);
});

export function makeMaterials() {
  const std = (o) => new THREE.MeshStandardMaterial(o);
  return {
    gold: std({ color: 0xe3b85c, metalness: 0.92, roughness: 0.26 }),
    goldDeep: std({ color: 0xb98826, metalness: 0.9, roughness: 0.34 }),
    marble: std({ color: 0xf0e6d2, metalness: 0.05, roughness: 0.55 }),
    red: std({ color: 0x8e2c28, metalness: 0.2, roughness: 0.5 }),
    wood: std({ color: 0x5a3a22, metalness: 0.05, roughness: 0.7 }),
    skin: std({ color: 0xf4eadb, metalness: 0.0, roughness: 0.55 }),
    dark: std({ color: 0x1a1208, metalness: 0.0, roughness: 0.4 }),
    drum: std({ map: drumTex(), metalness: 0.55, roughness: 0.4 }),
    arcade: std({ map: arcadeTex(), metalness: 0.2, roughness: 0.55 }),
    floor: std({ map: tileTex([7, 6]), roughness: 0.55 }),
    tile: std({ map: tileTex([1.2, 0.5]), roughness: 0.5 }),
  };
}

const lathe = (pts, seg, mat) => new THREE.Mesh(new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg), mat);
const ell = (m, rx, ry, rz, x, y, z, mat) => {
  const o = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), mat);
  o.scale.set(rx, ry, rz); o.position.set(x, y, z);
  return o;
};
const cyl = (r0, r1, h, x, y, z, mat) => {
  const o = new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, h, 14), mat);
  o.position.set(x, y, z);
  return o;
};
const cone = (r, h, x, y, z, mat, rx = 0, rz = 0) => {
  const o = new THREE.Mesh(new THREE.ConeGeometry(r, h, 14), mat);
  o.position.set(x, y, z); o.rotation.set(rx, 0, rz);
  return o;
};
const tube = (pts, r, mat, seg = 28) =>
  new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p))), seg, r, 10, false), mat);

// ---------- the stupa (Shwedagon style) ----------
export function buildStupa(m, { plinth = true } = {}) {
  const g = new THREE.Group();
  let y = 0;
  if (plinth) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(3.1, 3.2, 0.1, 8), m.marble);
    p.position.y = 0.05; p.rotation.y = Math.PI / 8;
    g.add(p); y = 0.1;
  }
  for (const [r, h] of [[1.55, 0.14], [1.32, 0.13], [1.12, 0.12]]) {
    const t = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.04, h, 8), m.gold);
    t.position.y = y + h / 2; t.rotation.y = Math.PI / 8;
    g.add(t); y += h;
  }
  const bellBase = y;
  const prof = new THREE.SplineCurve([
    [0.86, 0], [0.86, 0.03], [0.8, 0.14], [0.68, 0.34], [0.55, 0.6], [0.44, 0.88],
    [0.36, 1.14], [0.3, 1.38], [0.26, 1.58], [0.24, 1.74],
  ].map(([r, yy]) => new THREE.Vector2(r, yy))).getPoints(48);
  const bell = new THREE.Mesh(new THREE.LatheGeometry(prof, 56), m.gold);
  bell.position.y = bellBase;
  g.add(bell);
  const rAt = (yy) => {
    for (let i = 1; i < prof.length; i++) if (prof[i].y >= yy) {
      const a = prof[i - 1], b = prof[i], k = (yy - a.y) / (b.y - a.y || 1);
      return a.x + (b.x - a.x) * k;
    }
    return prof[prof.length - 1].x;
  };
  for (let yy = 0.22; yy < 1.7; yy += 0.12) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(rAt(yy) + 0.004, 0.011, 8, 56), m.goldDeep);
    ring.rotation.x = Math.PI / 2; ring.position.y = bellBase + yy;
    g.add(ring);
  }
  const top = bellBase + 1.74;
  const lotus = lathe([[0.26, 0], [0.36, 0.05], [0.4, 0.1], [0.34, 0.17], [0.22, 0.24], [0.16, 0.26]], 40, m.gold);
  lotus.position.y = top;
  g.add(lotus);
  const bud = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 20), m.gold);
  bud.scale.set(0.15, 0.27, 0.15); bud.position.y = top + 0.5;
  g.add(bud);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.014, 0.62, 10), m.goldDeep);
  pole.position.y = top + 0.88;
  g.add(pole);
  const tierMat = m.gold.clone(); tierMat.side = THREE.DoubleSide;
  for (let k = 0; k < 4; k++) {
    const tier = new THREE.Mesh(new THREE.ConeGeometry(0.3 - k * 0.045, 0.07, 28, 1, true), tierMat);
    tier.position.y = top + 0.72 + k * 0.1;
    g.add(tier);
  }
  const vane = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.2, 14), m.gold);
  vane.position.y = top + 1.28;
  g.add(vane);
  const jewel = new THREE.Mesh(
    new THREE.SphereGeometry(0.05, 18, 14),
    new THREE.MeshStandardMaterial({ color: 0xfff6dd, emissive: 0xffe9a8, emissiveIntensity: 1.2, roughness: 0.2 }));
  jewel.position.y = top + 1.42;
  g.add(jewel);
  g.userData.jewel = jewel;
  g.userData.height = top + 1.45;
  return g;
}

// ---------- a seated Buddha image ----------
export function buildBuddha(m) {
  const g = new THREE.Group();
  const legs = ell(m, 0.24, 0.07, 0.16, 0, 0.17, 0, m.gold);
  const body = lathe([[0.0, 0], [0.14, 0], [0.13, 0.08], [0.115, 0.17], [0.1, 0.24], [0.0, 0.26]], 28, m.gold);
  body.position.y = 0.2;
  const shoulders = ell(m, 0.15, 0.065, 0.1, 0, 0.4, 0, m.gold);
  const head = ell(m, 0.07, 0.075, 0.07, 0, 0.5, 0, m.skin);
  const knot = ell(m, 0.04, 0.04, 0.04, 0, 0.57, 0, m.dark);
  const flame = cone(0.014, 0.05, 0, 0.625, 0, m.gold);
  const hands = ell(m, 0.085, 0.03, 0.055, 0, 0.255, 0.1, m.skin);
  const crown = lathe([[0.072, 0], [0.078, 0.015], [0.07, 0.03]], 24, m.gold);
  crown.position.y = 0.535;
  const eyes = [-1, 1].map((s) => ell(m, 0.009, 0.005, 0.006, s * 0.026, 0.508, 0.066, m.dark));
  const mouth = ell(m, 0.014, 0.004, 0.005, 0, 0.47, 0.067, m.red);
  g.add(legs, body, shoulders, head, knot, flame, hands, crown, mouth, ...eyes);
  return g;
}

// ---------- the eight animal statues (golden, in a simple style), all facing +z ----------
export function buildAnimal(id, m) {
  const g = new THREE.Group();
  const eye = (x, y, z, r = 0.025) => ell(m, r, r, r, x, y, z, m.dark);
  const gold = m.gold;

  // a cat sitting up, facing you: tiger, or lion with a mane
  const cat = (lion) => {
    g.add(ell(m, 0.3, 0.3, 0.36, 0, 0.3, -0.12, gold));
    g.add(ell(m, 0.25, 0.42, 0.26, 0, 0.56, 0.0, gold));
    for (const s of [-1, 1]) {
      g.add(cyl(0.075, 0.08, 0.5, s * 0.15, 0.27, 0.16, gold));
      g.add(ell(m, 0.09, 0.05, 0.13, s * 0.15, 0.04, 0.22, gold));
      g.add(ell(m, 0.075, 0.075, 0.07, s * 0.14, 1.18, -0.02, gold));          // ears
      g.add(eye(s * 0.085, 1.02, 0.18));
    }
    if (lion) { g.add(ell(m, 0.36, 0.38, 0.28, 0, 1.0, -0.06, m.goldDeep)); }
    g.add(ell(m, 0.21, 0.2, 0.2, 0, 1.0, 0.06, gold));                             // head
    g.add(ell(m, 0.11, 0.08, 0.11, 0, 0.94, 0.22, gold));                          // muzzle
    g.add(ell(m, 0.03, 0.02, 0.02, 0, 0.98, 0.32, m.dark));                        // nose
    g.add(tube([[0.24, 0.1, -0.25], [0.5, 0.18, -0.05], [0.52, 0.4, 0.2], [0.4, 0.55, 0.25]], 0.05, gold));
    if (!lion) for (let i = 0; i < 4; i++) {                                       // stripes
      const s = ell(m, 0.26, 0.018, 0.27, 0, 0.35 + i * 0.12, 0.0, m.goldDeep);
      g.add(s);
    }
  };

  const elephant = (tusks) => {
    g.add(ell(m, 0.44, 0.42, 0.62, 0, 0.68, -0.1, gold));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(cyl(0.12, 0.13, 0.5, sx * 0.26, 0.25, sz * 0.32 - 0.05, gold));
    g.add(ell(m, 0.3, 0.33, 0.3, 0, 0.88, 0.42, gold));
    for (const s of [-1, 1]) {
      const ear = ell(m, 0.3, 0.32, 0.05, s * 0.36, 0.9, 0.36, m.goldDeep);
      ear.rotation.y = s * 0.55; g.add(ear);
      g.add(eye(s * 0.14, 0.97, 0.68, 0.028));
    }
    g.add(tube([[0, 0.85, 0.66], [0, 0.55, 0.82], [0, 0.28, 0.84], [0.02, 0.12, 0.98]], 0.085, gold));
    if (tusks) for (const s of [-1, 1]) {
      const t = cone(0.035, 0.34, s * 0.17, 0.66, 0.78, m.skin, Math.PI / 2 + 0.5, 0);
      g.add(t);
    }
    g.add(tube([[0, 0.8, -0.7], [0.03, 0.55, -0.78], [0.02, 0.32, -0.72]], 0.025, gold));
    g.scale.setScalar(0.9);
  };

  const rat = () => {
    g.add(ell(m, 0.28, 0.38, 0.28, 0, 0.4, -0.02, gold));
    g.add(ell(m, 0.19, 0.18, 0.22, 0, 0.84, 0.08, gold));
    g.add(cone(0.1, 0.22, 0, 0.8, 0.3, gold, Math.PI / 2, 0));
    g.add(ell(m, 0.03, 0.03, 0.03, 0, 0.8, 0.41, m.dark));
    for (const s of [-1, 1]) {
      g.add(ell(m, 0.12, 0.13, 0.03, s * 0.16, 1.0, 0.0, m.goldDeep));
      g.add(eye(s * 0.085, 0.89, 0.24, 0.022));
      g.add(ell(m, 0.05, 0.05, 0.1, s * 0.1, 0.52, 0.23, gold));
      g.add(ell(m, 0.08, 0.04, 0.14, s * 0.13, 0.04, 0.12, gold));
    }
    g.add(tube([[0, 0.1, -0.22], [0.25, 0.04, -0.45], [0.5, 0.06, -0.4], [0.62, 0.2, -0.25]], 0.025, gold));
    g.scale.setScalar(1.1);
  };

  const guineaPig = () => {
    g.add(ell(m, 0.42, 0.34, 0.5, 0, 0.34, -0.05, gold));
    g.add(ell(m, 0.27, 0.27, 0.28, 0, 0.4, 0.42, gold));
    g.add(ell(m, 0.05, 0.04, 0.04, 0, 0.38, 0.68, m.dark));
    for (const s of [-1, 1]) {
      g.add(ell(m, 0.08, 0.1, 0.04, s * 0.2, 0.6, 0.34, m.goldDeep));
      g.add(eye(s * 0.12, 0.47, 0.64, 0.03));
      g.add(ell(m, 0.08, 0.05, 0.12, s * 0.16, 0.05, 0.4, gold));
    }
    g.scale.setScalar(1.15);
  };

  // a naga: coils with a raised, hooded head
  const naga = () => {
    const pts = [];
    for (let i = 0; i <= 26; i++) {
      const a = (i / 26) * Math.PI * 5, r = 0.52 - i * 0.008;
      pts.push([Math.cos(a) * r, 0.1 + (i / 26) * 0.3 + (Math.sin(a * 2) * 0.01), Math.sin(a) * r]);
    }
    pts.push([0.12, 0.5, 0.1], [0.02, 0.8, 0.05], [0.0, 1.05, 0.1], [0, 1.2, 0.16]);
    g.add(tube(pts, 0.11, gold, 90));
    g.add(ell(m, 0.3, 0.3, 0.05, 0, 1.25, 0.04, m.goldDeep));                       // hood
    g.add(ell(m, 0.13, 0.11, 0.18, 0, 1.2, 0.2, gold));
    for (const s of [-1, 1]) g.add(eye(s * 0.07, 1.25, 0.31, 0.022));
    g.add(cone(0.03, 0.12, 0, 1.52, 0.04, m.skin));
  };

  // garuda, standing with wings spread
  const garuda = () => {
    g.add(ell(m, 0.22, 0.36, 0.18, 0, 0.62, 0, gold));
    for (const s of [-1, 1]) {
      g.add(cyl(0.05, 0.06, 0.34, s * 0.1, 0.17, 0.04, gold));
      g.add(ell(m, 0.08, 0.03, 0.14, s * 0.1, 0.03, 0.1, gold));
      const w = ell(m, 0.5, 0.07, 0.2, s * 0.5, 0.92, -0.08, m.goldDeep);
      w.rotation.z = s * 0.7; g.add(w);
      const w2 = ell(m, 0.4, 0.05, 0.15, s * 0.58, 0.72, -0.1, gold);
      w2.rotation.z = s * 0.35; g.add(w2);
      g.add(eye(s * 0.05, 1.12, 0.13, 0.02));
    }
    g.add(ell(m, 0.13, 0.14, 0.13, 0, 1.1, 0.04, m.skin));
    g.add(cone(0.05, 0.16, 0, 1.06, 0.2, gold, Math.PI / 2 + 0.4, 0));
    g.add(cone(0.06, 0.16, 0, 1.3, 0.04, gold));
    for (let i = -2; i <= 2; i++) { const t = ell(m, 0.04, 0.2, 0.025, i * 0.07, 0.36, -0.2, m.goldDeep); t.rotation.z = i * 0.2; g.add(t); }
    g.scale.setScalar(1.05);
  };

  ({ mon: () => cat(false), tue: () => cat(true), wed: () => elephant(true), rahu: () => elephant(false),
     thu: rat, fri: guineaPig, sat: naga, sun: garuda })[id]();
  return g;
}

// ---------- small textures ----------
function plaqueTexture(day, font, bare = false) {
  const c = document.createElement("canvas");
  c.width = 512; c.height = 200;
  const x = c.getContext("2d");
  if (!bare) {                                    // a plain plate drawn in code
    const g = x.createLinearGradient(0, 0, 0, 200);
    g.addColorStop(0, "#d9dde0"); g.addColorStop(1, "#9aa1a6");
    x.fillStyle = g; x.beginPath(); x.roundRect(4, 4, 504, 192, 16); x.fill();
    x.strokeStyle = "#5c6368"; x.lineWidth = 6; x.stroke();
  }
  x.fillStyle = bare ? "#3a2606" : "#1c2226"; x.textAlign = "center"; x.textBaseline = "middle";
  x.font = `700 70px ${font}`; x.fillText(day.day, 256, 66, 470);
  x.font = `600 52px ${font}`; x.fillText(day.animal, 256, 140, 470);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

let flameTex = null;
export function flameTexture() {
  if (flameTex) return flameTex;
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const x = c.getContext("2d");
  const g = x.createRadialGradient(64, 78, 4, 64, 70, 60);
  g.addColorStop(0, "rgba(255,250,220,1)");
  g.addColorStop(0.25, "rgba(255,210,110,0.95)");
  g.addColorStop(0.6, "rgba(255,140,40,0.35)");
  g.addColorStop(1, "rgba(255,100,20,0)");
  x.fillStyle = g;
  x.save(); x.translate(64, 70); x.scale(0.62, 1); x.translate(-64, -70);
  x.fillRect(0, 0, 128, 128); x.restore();
  flameTex = new THREE.CanvasTexture(c);
  return flameTex;
}

export function glowTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const x = c.getContext("2d");
  const g = x.createRadialGradient(64, 64, 4, 64, 64, 62);
  g.addColorStop(0, "rgba(255,225,150,0.9)");
  g.addColorStop(1, "rgba(255,200,90,0)");
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

// ---------- the corner you worship at ----------
// Local +z points towards you. The floor is y = 0.
export const TABLE_Y = 1.86;       // top of the drum the Buddha sits on
export const BOWL_Y = 2.34;        // top of the gold bowl under the Buddha
export function buildCorner(m, day, font) {
  const g = new THREE.Group();

  // low marble slab with tiled floor
  const slab = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.12, 4.6), m.floor);
  slab.position.set(0, -0.06, -0.4);
  g.add(slab);

  // the tiled basin that holds the animal: a half ring in front, open towards the pillars
  const ringShape = new THREE.Shape();
  ringShape.absarc(0, 0, 1.95, -Math.PI / 2, Math.PI / 2, false);
  ringShape.absarc(0, 0, 1.75, Math.PI / 2, -Math.PI / 2, true);
  const basin = new THREE.Mesh(new THREE.ExtrudeGeometry(ringShape, { depth: 0.3, bevelEnabled: false, curveSegments: 32 }), m.tile);
  basin.rotation.x = -Math.PI / 2; basin.rotation.z = -Math.PI / 2;
  basin.position.set(0, 0, 0);
  g.add(basin);
  // inside: a slightly raised tiled floor
  const inner = new THREE.Mesh(new THREE.CircleGeometry(1.75, 48, -Math.PI / 2, Math.PI), m.floor);
  inner.rotation.x = -Math.PI / 2; inner.rotation.z = -Math.PI / 2; inner.position.y = 0.01;
  g.add(inner);

  // four gold pillars and the drum on top (the animal stands between them)
  const oldTable = new THREE.Group();             // simple shapes, used until the real table model loads
  for (const a of [-135, -60, 60, 135]) {
    const r = 0.88, ang = (a * Math.PI) / 180;
    oldTable.add(cyl(0.1, 0.12, 1.5, Math.sin(ang) * r, 0.75, Math.cos(ang) * r, m.goldDeep));
  }
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.05, 0.36, 32, 1), m.drum);
  drum.position.y = TABLE_Y - 0.18;
  oldTable.add(drum);
  for (const [r, y, h] of [[1.12, TABLE_Y - 0.36, 0.06], [1.12, TABLE_Y, 0.06], [0.98, TABLE_Y + 0.04, 0.04]]) {
    oldTable.add(cyl(r, r, h, 0, y, 0, m.gold));
  }
  g.add(oldTable);

  // name plate on the front of the drum, like the silver ones at the pagoda
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.2), new THREE.MeshBasicMaterial({ map: plaqueTexture(day, font), transparent: true }));
  plate.position.set(0, TABLE_Y - 0.18, 1.06);
  g.add(plate);

  // the gold bowl and the Buddha on it
  const bowl = lathe([[0.0, 0], [0.6, 0], [0.7, 0.06], [0.76, 0.2], [0.72, 0.34], [0.62, 0.42], [0.56, 0.44], [0.0, 0.44]], 40, m.gold);
  bowl.position.y = TABLE_Y + 0.04;
  bowl.scale.set(0.62, 0.8, 0.62);
  g.add(bowl);
  const buddha = buildBuddha(m);
  buddha.scale.setScalar(2.1);
  buddha.position.set(0, TABLE_Y + 0.04 + 0.44 * 0.8 - 0.02, 0);
  g.add(buddha);

  // offering bowl for flowers (right) and a water cup (left) on the drum's rim
  const flowerBowl = lathe([[0, 0], [0.18, 0], [0.24, 0.07], [0.26, 0.11], [0.22, 0.11], [0.16, 0.04], [0, 0.03]], 24, m.gold);
  flowerBowl.position.set(0.72, TABLE_Y + 0.04, 0.5);
  g.add(flowerBowl);
  const cup = lathe([[0, 0], [0.07, 0], [0.1, 0.16], [0.11, 0.24], [0.09, 0.24], [0.07, 0.14], [0, 0.02]], 20, m.gold);
  cup.position.set(-0.72, TABLE_Y + 0.04, 0.5);
  g.add(cup);

  // two lamps, off until you light them
  const flames = [];
  for (const sx of [-1, 1]) {
    const stand = lathe([[0, 0], [0.09, 0], [0.05, 0.1], [0.04, 0.26], [0.09, 0.34], [0.0, 0.34]], 20, m.gold);
    stand.position.set(sx * 0.86, TABLE_Y + 0.04, -0.05);
    g.add(stand);
    const f = new THREE.Sprite(new THREE.SpriteMaterial({ map: flameTexture(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    f.scale.set(0.2, 0.32, 1); f.position.set(sx * 0.86, TABLE_Y + 0.46, -0.05); f.visible = false;
    g.add(f); flames.push(f);
  }
  const light = new THREE.PointLight(0xffb45a, 0, 6, 1.6);
  light.position.set(0, TABLE_Y + 0.5, 1.2);
  g.add(light);

  // a hanging bell on a wooden frame to the left
  const frame = new THREE.Group();
  frame.position.set(-2.0, 0, 0.5);
  frame.scale.setScalar(2.6);
  for (const sx of [-0.12, 0.12]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.018, 0.5, 8), m.wood);
    post.position.set(sx, 0.25, 0); frame.add(post);
  }
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.28, 8), m.wood);
  beam.rotation.z = Math.PI / 2; beam.position.y = 0.5; frame.add(beam);
  const pivot = new THREE.Group();
  pivot.position.y = 0.49;
  const bellMesh = lathe([[0.0, 0], [0.06, 0], [0.075, -0.02], [0.065, -0.09], [0.04, -0.14], [0.0, -0.16]], 24, m.goldDeep);
  bellMesh.position.y = -0.02;
  pivot.add(bellMesh);
  frame.add(pivot);
  g.add(frame);

  // the drum, Buddha and lamps sit towards the back; the animal stands in the basin in front
  const core = new THREE.Group();
  core.position.z = -0.45;
  for (const o of [...g.children]) if (o !== slab && o !== basin && o !== inner) core.add(o);
  g.add(core);
  // the silver table with its gold name plate replaces the drum and pillars
  loadModel("table", 2.07).then((t) => {
    core.add(t);
    core.remove(oldTable);
    // the generated table has no tabletop surface, so lay a silver one inside the raised rim
    const tb = new THREE.Box3().setFromObject(t), ts = tb.getSize(new THREE.Vector3());
    const top = new THREE.Mesh(new THREE.CylinderGeometry(ts.x * 0.44, ts.x * 0.44, 0.04, 48),
      new THREE.MeshStandardMaterial({ color: 0xdfe3e6, metalness: 0.85, roughness: 0.28 }));
    top.position.set((tb.min.x + tb.max.x) / 2, TABLE_Y - 0.03, (tb.min.z + tb.max.z) / 2);
    core.add(top);
    const ud = g.userData;
    ud.bare = true;                                // the model already has a gold plate: only draw the text on it
    plate.position.set(0, 1.245, 1.32);
    plate.scale.set(1.45, 1.0, 1);
    plate.material.map.dispose();
    plate.material.map = plaqueTexture(ud.day, font, true);
    plate.material.needsUpdate = true;
  }).catch(() => {});
  loadModel("buddha", 1.5).then((o) => {            // the real Buddha on its lotus base replaces the simple one
    o.position.set(0, TABLE_Y + 0.04, 0);
    core.add(o);
    bowl.visible = false; buddha.visible = false;
  }).catch(() => {});

  g.userData = {
    day, plate, buddha, flames, light, cup, bell: pivot, flowers: [], animal: null,
    bowlPos: flowerBowl.position.clone().add(new THREE.Vector3(0, 0, -0.45)), font,
  };
  // the silver bell and its holder: two real models, so the bell can swing on its chain from the hook
  const FRAME_H = 2.2, BELL_H = FRAME_H * 0.6, HOOK = 0.786;
  Promise.all([loadModel("bellframe", FRAME_H), loadModel("bell", BELL_H)]).then(([fr, bell]) => {
    const holder = new THREE.Group();
    holder.position.set(-2.1, 0, -0.1);
    holder.rotation.y = 0.35;
    holder.add(fr);
    const pivot = new THREE.Group();            // swings from the hook
    pivot.position.set(0, FRAME_H * HOOK, 0);
    bell.position.y = -BELL_H;
    pivot.add(bell);
    holder.add(pivot);
    core.add(holder);
    core.remove(frame);
    g.userData.bell = pivot;
  }).catch(() => {});

  setCornerDay(g, day, m, font);
  return g;
}

// Swap in the animal and name plate for another birth day
export function setCornerDay(corner, day, m, font = corner.userData.font) {
  const ud = corner.userData;
  ud.day = day;
  if (ud.animal) corner.remove(ud.animal);
  ud.animal = buildAnimal(day.id, m);
  ud.animal.scale.multiplyScalar(0.85);
  ud.animal.position.set(0, 0.02, 1.0);
  corner.add(ud.animal);
  if (MODELS.has(day.id)) {                       // swap in the real model once it has loaded
    loadModel(day.id, MODELS.get(day.id)).then((o) => {
      if (ud.day !== day) return;
      corner.remove(ud.animal);
      ud.animal = o;
      o.position.set(0, 0.02, 1.0);
      corner.add(o);
    }).catch(() => {});
  }
  ud.plate.material.map.dispose();
  ud.plate.material.map = plaqueTexture(day, font, !!ud.bare);
  ud.plate.material.needsUpdate = true;
}

// ---------- the view behind: an arcade wall and Shwedagon ----------
export function buildBackdrop(m) {
  const g = new THREE.Group();
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(11, 2.0), m.arcade);
  wall.position.set(0, 1.0, -2.8);
  g.add(wall);
  for (const sx of [-1, 1]) {
    g.add(cyl(0.16, 0.2, 2.3, sx * 5.5, 1.15, -2.75, m.gold));
    g.add(cyl(0.26, 0.18, 0.18, sx * 5.5, 2.38, -2.75, m.gold));
  }
  // a platform step in front of the wall
  const step = new THREE.Mesh(new THREE.BoxGeometry(11.2, 0.12, 0.7), m.marble);
  step.position.set(0, 0.06, -2.65);
  g.add(step);
  const stupa = buildStupa(m, { plinth: false });
  stupa.scale.setScalar(1.5);
  stupa.position.set(0, 0, -6.2);
  g.add(stupa);
  // smaller stupas on either side, as on the Shwedagon platform
  for (const sx of [-1, 1]) for (const [x, z, s] of [[4.2, -5.0, 0.5], [6.4, -6.6, 0.4]]) {
    const small = buildStupa(m, { plinth: false });
    small.scale.setScalar(s); small.position.set(sx * x, 0, z);
    g.add(small);
  }
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(22, 9), new THREE.MeshStandardMaterial({ color: 0xcfc6b2, roughness: 0.7 }));
  ground.rotation.x = -Math.PI / 2; ground.position.set(0, -0.13, -5.5);
  g.add(ground);
  g.userData.stupa = stupa;
  return g;
}

// A few flower petals for the bowl: jasmine and a pink one
export function addFlowers(corner, n = 6) {
  const ud = corner.userData;
  const cols = [0xffffff, 0xfff3d6, 0xffc2d4, 0xffffff];
  for (let i = 0; i < n; i++) {
    const f = new THREE.Mesh(
      new THREE.SphereGeometry(0.05 + Math.random() * 0.025, 10, 8),
      new THREE.MeshStandardMaterial({ color: cols[(Math.random() * cols.length) | 0], roughness: 0.6 }));
    const a = Math.random() * Math.PI * 2, r = Math.random() * 0.13;
    f.position.set(ud.bowlPos.x + Math.cos(a) * r, ud.bowlPos.y + 0.12 + ud.flowers.length * 0.006, ud.bowlPos.z + Math.sin(a) * r);
    f.scale.y = 0.6;
    corner.add(f);
    ud.flowers.push(f);
  }
}
