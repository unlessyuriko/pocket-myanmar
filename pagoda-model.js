// The 3D pieces of "Pagoda at Home", all built from simple shapes in code (no model files):
// a golden stupa in the style of Shwedagon, the eight weekday shrines around it, and the
// small things you offer (water, lamps, flowers, a bell).
import * as THREE from "three";

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

export function makeMaterials() {
  return {
    gold: new THREE.MeshStandardMaterial({ color: 0xe3b85c, metalness: 0.92, roughness: 0.26 }),
    goldDeep: new THREE.MeshStandardMaterial({ color: 0xb98826, metalness: 0.9, roughness: 0.34 }),
    marble: new THREE.MeshStandardMaterial({ color: 0xf0e6d2, metalness: 0.05, roughness: 0.55 }),
    red: new THREE.MeshStandardMaterial({ color: 0x8e2c28, metalness: 0.2, roughness: 0.5 }),
    wood: new THREE.MeshStandardMaterial({ color: 0x5a3a22, metalness: 0.05, roughness: 0.7 }),
    jade: new THREE.MeshStandardMaterial({ color: 0x1f6b52, metalness: 0.3, roughness: 0.4 }),
  };
}

const lathe = (pts, seg, mat) => new THREE.Mesh(new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg), mat);

// ---------- the stupa ----------
export function buildStupa(m) {
  const g = new THREE.Group();

  // wide marble platform, then three gold octagonal terraces
  const plinth = new THREE.Mesh(new THREE.CylinderGeometry(3.1, 3.2, 0.1, 8), m.marble);
  plinth.position.y = 0.05; plinth.rotation.y = Math.PI / 8;
  g.add(plinth);
  let y = 0.1;
  for (const [r, h] of [[1.55, 0.14], [1.32, 0.13], [1.12, 0.12]]) {
    const t = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.04, h, 8), m.gold);
    t.position.y = y + h / 2; t.rotation.y = Math.PI / 8;
    g.add(t); y += h;
  }
  const bellBase = y;

  // the bell: wide at the foot, curving in to a slender spire
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
  // fine raised rings up the bell
  for (let yy = 0.22; yy < 1.7; yy += 0.12) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(rAt(yy) + 0.004, 0.011, 8, 56), m.goldDeep);
    ring.rotation.x = Math.PI / 2; ring.position.y = bellBase + yy;
    g.add(ring);
  }
  const top = bellBase + 1.74;

  // lotus band, banana bud, then the umbrella (hti) with its vane and jewel
  const lotus = lathe([[0.26, 0], [0.36, 0.05], [0.4, 0.1], [0.34, 0.17], [0.22, 0.24], [0.16, 0.26]], 40, m.gold);
  lotus.position.y = top;
  g.add(lotus);
  const bud = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 20), m.gold);
  bud.scale.set(0.15, 0.27, 0.15); bud.position.y = top + 0.5;
  g.add(bud);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.014, 0.62, 10), m.goldDeep);
  pole.position.y = top + 0.88;
  g.add(pole);
  for (let k = 0; k < 4; k++) {
    const tier = new THREE.Mesh(new THREE.ConeGeometry(0.3 - k * 0.045, 0.07, 28, 1, true), m.gold);
    tier.material = m.gold.clone(); tier.material.side = THREE.DoubleSide;
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
  g.userData.height = top + 1.45;
  g.userData.jewel = jewel;
  return g;
}

// ---------- a seated Buddha image ----------
export function buildBuddha(m) {
  const g = new THREE.Group();
  const pedestal = lathe([[0.0, 0], [0.26, 0], [0.3, 0.04], [0.24, 0.1], [0.2, 0.13], [0.0, 0.13]], 32, m.goldDeep);
  g.add(pedestal);
  const legs = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), m.gold);
  legs.scale.set(0.24, 0.07, 0.16); legs.position.y = 0.17;
  g.add(legs);
  const body = lathe([[0.0, 0], [0.14, 0], [0.13, 0.08], [0.115, 0.17], [0.1, 0.24], [0.0, 0.26]], 28, m.gold);
  body.position.y = 0.2;
  g.add(body);
  const shoulders = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), m.gold);
  shoulders.scale.set(0.15, 0.065, 0.1); shoulders.position.y = 0.4;
  g.add(shoulders);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.07, 24, 18), m.gold);
  head.position.y = 0.5;
  g.add(head);
  const knot = new THREE.Mesh(new THREE.SphereGeometry(0.04, 16, 12), m.gold);
  knot.position.y = 0.57;
  g.add(knot);
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.014, 0.05, 10), m.gold);
  flame.position.y = 0.625;
  g.add(flame);
  const hands = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), m.gold);
  hands.scale.set(0.085, 0.03, 0.055); hands.position.set(0, 0.255, 0.1);
  g.add(hands);
  return g;
}

// ---------- small textures ----------
function plaqueTexture(day, font) {
  const c = document.createElement("canvas");
  c.width = 320; c.height = 300;
  const x = c.getContext("2d");
  x.fillStyle = "rgba(6, 32, 26, 0.9)";
  x.beginPath(); x.roundRect(6, 6, 308, 288, 34); x.fill();
  x.strokeStyle = "#e3b85c"; x.lineWidth = 6; x.stroke();
  x.font = "130px system-ui, 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', sans-serif";
  x.textAlign = "center"; x.textBaseline = "middle";
  x.fillText(day.emoji, 160, 112);
  x.fillStyle = "#f7de9a";
  x.font = `700 40px ${font}`;
  x.fillText(day.day, 160, 208, 280);
  x.fillStyle = "#d6bf9f";
  x.font = `400 30px ${font}`;
  x.fillText(day.animal, 160, 254, 280);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
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

// ---------- a weekday shrine ----------
// Local +z points away from the pagoda, towards the worshipper.
export function buildShrine(m, day, font) {
  const g = new THREE.Group();
  const W = 0.62, D = 0.5;

  const base = new THREE.Mesh(new THREE.BoxGeometry(W, 0.06, D), m.marble);
  base.position.y = 0.03;
  g.add(base);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.02, 0.8, 10), m.red);
    p.position.set(sx * (W / 2 - 0.04), 0.46, sz * (D / 2 - 0.04));
    g.add(p);
  }
  // the roof sits back a little and is smaller, so the Buddha still shows when you look down at it
  const roof = new THREE.Mesh(new THREE.ConeGeometry(0.4, 0.16, 4), m.red);
  roof.position.set(0, 0.97, -0.1); roof.rotation.y = Math.PI / 4;
  g.add(roof);
  const roofTop = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.16, 4), m.gold);
  roofTop.position.set(0, 1.08, -0.1); roofTop.rotation.y = Math.PI / 4;
  g.add(roofTop);
  const finial = new THREE.Mesh(new THREE.SphereGeometry(0.022, 12, 10), m.gold);
  finial.position.set(0, 1.18, -0.1);
  g.add(finial);

  const buddha = buildBuddha(m);
  buddha.scale.setScalar(0.8);
  buddha.position.set(0, 0.06, -0.02);
  g.add(buddha);

  // name plaque in front, with the weekday and its animal
  const plaque = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.26),
    new THREE.MeshBasicMaterial({ map: plaqueTexture(day, font), transparent: true }));
  plaque.position.set(0, 0.13, D / 2 + 0.08);
  plaque.rotation.x = -0.6;
  g.add(plaque);

  // offering bowl for flowers (right) and a water cup (left)
  const bowl = lathe([[0, 0], [0.07, 0.0], [0.09, 0.035], [0.1, 0.05], [0.085, 0.05], [0.06, 0.02], [0, 0.015]], 20, m.gold);
  bowl.position.set(0.2, 0.06, 0.3);
  g.add(bowl);
  const cup = lathe([[0, 0], [0.03, 0], [0.04, 0.07], [0.045, 0.1], [0.038, 0.1], [0.03, 0.06], [0, 0.01]], 18, m.gold);
  cup.position.set(-0.2, 0.06, 0.3);
  g.add(cup);

  // two lamps, off until you light them
  const flames = [];
  for (const sx of [-1, 1]) {
    const stand = lathe([[0, 0], [0.04, 0], [0.025, 0.05], [0.02, 0.12], [0.045, 0.16], [0.0, 0.16]], 16, m.gold);
    stand.position.set(sx * 0.27, 0.06, 0.12);
    g.add(stand);
    const f = new THREE.Sprite(new THREE.SpriteMaterial({ map: flameTexture(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    f.scale.set(0.1, 0.16, 1); f.position.set(sx * 0.27, 0.27, 0.12); f.visible = false;
    g.add(f); flames.push(f);
  }
  const light = new THREE.PointLight(0xffb45a, 0, 1.4, 1.6);
  light.position.set(0, 0.3, 0.2);
  g.add(light);

  // a hanging bell on a small frame beside the shrine
  const frame = new THREE.Group();
  frame.position.set(-0.58, 0, 0.1);
  for (const sx of [-0.12, 0.12]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.018, 0.46, 8), m.wood);
    post.position.set(sx, 0.23, 0); frame.add(post);
  }
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.28, 8), m.wood);
  beam.rotation.z = Math.PI / 2; beam.position.y = 0.46; frame.add(beam);
  const pivot = new THREE.Group();
  pivot.position.y = 0.45;
  const bellMesh = lathe([[0.0, 0], [0.06, 0], [0.075, -0.02], [0.065, -0.09], [0.04, -0.14], [0.0, -0.16]], 24, m.goldDeep);
  bellMesh.scale.y = 1; bellMesh.position.y = -0.02;
  pivot.add(bellMesh);
  frame.add(pivot);
  g.add(frame);

  g.userData = { day, buddha, flames, light, bowl, cup, bell: pivot, flowers: [] };
  return g;
}

// A few flower petals for the bowl: jasmine and a pink one
export function addFlowers(shrine, n = 5) {
  const ud = shrine.userData;
  const cols = [0xffffff, 0xfff3d6, 0xffc2d4, 0xffffff];
  for (let i = 0; i < n; i++) {
    const f = new THREE.Mesh(
      new THREE.SphereGeometry(0.018 + Math.random() * 0.01, 10, 8),
      new THREE.MeshStandardMaterial({ color: cols[(Math.random() * cols.length) | 0], roughness: 0.6 }));
    const a = Math.random() * Math.PI * 2, r = Math.random() * 0.055;
    f.position.set(ud.bowl.position.x + Math.cos(a) * r, 0.09 + ud.flowers.length * 0.004, ud.bowl.position.z + Math.sin(a) * r);
    f.scale.y = 0.55;
    shrine.add(f);
    ud.flowers.push(f);
  }
}
