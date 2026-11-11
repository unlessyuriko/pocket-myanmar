// Finds what sits in front of the face so the paste can stay underneath it:
//  - hair (a fringe or loose strands over the forehead and temples), from MediaPipe's small
//    hair model (under 1 MB)
//  - hands (a hand raised in front of the face), from MediaPipe's hand landmarks (about 8 MB),
//    drawn as a palm-and-fingers shape
// Both load in the background after the face tracker, so they never delay the first picture.
// The result is one small, soft alpha mask in camera orientation that blend.js reads.
import { ImageSegmenter, HandLandmarker, FilesetResolver } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs";

const HAIR_URL = "https://storage.googleapis.com/mediapipe-models/image_segmenter/hair_segmenter/float32/latest/hair_segmenter.tflite";
const HAND_URL = "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";
const SOFT_W = 192;      // masks are this wide, so their edges come out soft when stretched back up

const FINGERS = [[1, 2, 3, 4], [5, 6, 7, 8], [9, 10, 11, 12], [13, 14, 15, 16], [17, 18, 19, 20]];
const PALM = [0, 1, 2, 5, 9, 13, 17];

export function createOccluder(wasmUrl) {
  let fileset = null;
  const files = () => (fileset ||= FilesetResolver.forVisionTasks(wasmUrl));

  const make = () => document.createElement("canvas");
  const hairC = make(), handC = make(), out = make();
  const hairX = hairC.getContext("2d"), handX = handC.getContext("2d"), outX = out.getContext("2d");
  let work = null, wctx = null;                         // full-size hair mask
  let hasHair = false, hasHand = false;
  let seg = null, segLoad = null, segMode = null;
  let hands = null, handLoad = null, handMode = null;
  let tick = 0;

  // Keep all three small canvases the same size, matching the picture's shape
  function size(srcW, srcH) {
    const h = Math.max(1, Math.round((SOFT_W * srcH) / srcW));
    if (out.width !== SOFT_W || out.height !== h) for (const c of [hairC, handC, out]) { c.width = SOFT_W; c.height = h; }
  }
  function combine() {
    outX.clearRect(0, 0, out.width, out.height);
    if (hasHair) outX.drawImage(hairC, 0, 0);
    if (hasHand) outX.drawImage(handC, 0, 0);
  }

  async function load() {
    if (segLoad) return segLoad;
    segLoad = (async () => {
      const fs = await files();
      const opts = (delegate) => ({
        baseOptions: { modelAssetPath: HAIR_URL, delegate },
        runningMode: "VIDEO", outputCategoryMask: true, outputConfidenceMasks: false,
      });
      try { seg = await ImageSegmenter.createFromOptions(fs, opts("GPU")); }
      catch { seg = await ImageSegmenter.createFromOptions(fs, opts("CPU")); }
      segMode = "VIDEO";
      return seg;
    })().catch((e) => { segLoad = null; console.warn("Hair detection unavailable", e); return null; });
    return segLoad;
  }

  async function loadHands() {
    if (handLoad) return handLoad;
    handLoad = (async () => {
      const fs = await files();
      const opts = (delegate) => ({ baseOptions: { modelAssetPath: HAND_URL, delegate }, runningMode: "VIDEO", numHands: 2 });
      try { hands = await HandLandmarker.createFromOptions(fs, opts("GPU")); }
      catch { hands = await HandLandmarker.createFromOptions(fs, opts("CPU")); }
      handMode = "VIDEO";
      return hands;
    })().catch((e) => { handLoad = null; console.warn("Hand detection unavailable", e); return null; });
    return handLoad;
  }

  // Hair: turn the model's answer into the soft mask. Returns false if the answer looks wrong
  // (e.g. "hair" on the nose), so a bad frame never wipes the paste off the face.
  function storeHair(result, info) {
    const { probes, zones } = info || {};
    const m = result.categoryMask;
    if (!m) return false;
    const w = m.width, h = m.height, data = m.getAsUint8Array();
    if (!work) { work = make(); wctx = work.getContext("2d", { willReadFrequently: true }); }
    if (work.width !== w || work.height !== h) { work.width = w; work.height = h; }
    // Sanity check: the nose tip and middle of each cheek are never hair. `probes` are those
    // points as 0..1 positions in the picture the model saw.
    for (const [px, py] of probes || []) {
      const x = Math.min(w - 1, Math.max(0, Math.round(px * (w - 1)))), y = Math.min(h - 1, Math.max(0, Math.round(py * (h - 1))));
      if (data[y * w + x]) return false;
    }
    const img = wctx.createImageData(w, h);
    let n = 0;
    for (let i = 0; i < data.length; i++) if (data[i]) { img.data[4 * i + 3] = 255; n++; }
    wctx.putImageData(img, 0, 0);
    // Keep hair only where it can cover paste: the forehead and temples. Shadowed jaw and ear skin
    // reads as hair to the model, so the lower face is left alone.
    wctx.globalCompositeOperation = "destination-in";
    wctx.fillStyle = "#000";
    wctx.beginPath();
    for (const poly of zones || []) {
      poly.forEach(([x, y], i) => (i ? wctx.lineTo(x * w, y * h) : wctx.moveTo(x * w, y * h)));
      wctx.closePath();
    }
    wctx.fill();
    wctx.globalCompositeOperation = "source-over";
    hasHair = n > 0 && (zones || []).length > 0;
    size(w, h);
    hairX.clearRect(0, 0, hairC.width, hairC.height);
    hairX.drawImage(work, 0, 0, hairC.width, hairC.height);
    return true;
  }

  // Hands: draw a palm and fingers from the 21 landmarks of each hand
  function storeHands(result, srcW, srcH) {
    size(srcW, srcH);
    const W = handC.width, H = handC.height;
    handX.clearRect(0, 0, W, H);
    hasHand = false;
    handX.fillStyle = handX.strokeStyle = "#000";
    handX.lineCap = handX.lineJoin = "round";
    for (const lm of result.landmarks || []) {
      const p = lm.map((q) => ({ x: q.x * W, y: q.y * H }));
      const d = (a, b) => Math.hypot(p[a].x - p[b].x, p[a].y - p[b].y);
      const fw = Math.max(1.5, (d(5, 17) / 4) * 1.2);        // about one finger's width, a little generous
      // palm, widened a little so its outline covers the skin's edge
      handX.beginPath();
      PALM.forEach((i, k) => (k ? handX.lineTo(p[i].x, p[i].y) : handX.moveTo(p[i].x, p[i].y)));
      handX.closePath();
      handX.fill();
      handX.lineWidth = fw * 0.8;
      handX.stroke();
      // fingers: thinner towards the tip, thumb a bit thicker
      FINGERS.forEach((chain, f) => {
        for (let k = 0; k < chain.length - 1; k++) {
          handX.lineWidth = fw * (f === 0 ? 1.15 : 1) * (1 - 0.1 * k);
          handX.beginPath();
          handX.moveTo(p[chain[k]].x, p[chain[k]].y);
          handX.lineTo(p[chain[k + 1]].x, p[chain[k + 1]].y);
          handX.stroke();
        }
      });
      hasHand = true;
    }
    return true;
  }

  const dims = (s) => [s.videoWidth || s.width, s.videoHeight || s.height];

  return {
    load, loadHands,
    get ready() { return !!seg || !!hands; },
    // Camera frames. Hands move fast, so they are looked for on every call; hair changes
    // slowly, so it is looked for on every other call.
    async video(source, info) {
      const [w, h] = dims(source);
      if (hands) {
        if (handMode !== "VIDEO") { await hands.setOptions({ runningMode: "VIDEO" }); handMode = "VIDEO"; }
        try { storeHands(hands.detectForVideo(source, performance.now()), w, h); } catch { /* skip this frame */ }
      }
      if (seg && tick++ % 2 === 0) {
        if (segMode !== "VIDEO") { await seg.setOptions({ runningMode: "VIDEO" }); segMode = "VIDEO"; }
        let r;
        try { r = seg.segmentForVideo(source, performance.now()); } catch { r = null; }
        if (r) { try { storeHair(r, info); } finally { r.close && r.close(); } }
      }
      combine();
    },
    // A single photo
    async image(source, info) {
      const [w, h] = dims(source);
      await Promise.all([load(), loadHands()]);
      if (seg) {
        if (segMode !== "IMAGE") { await seg.setOptions({ runningMode: "IMAGE" }); segMode = "IMAGE"; }
        let r;
        try { r = seg.segment(source); } catch { r = null; }
        if (r) { try { storeHair(r, info); } finally { r.close && r.close(); } }
      }
      if (hands) {
        if (handMode !== "IMAGE") { await hands.setOptions({ runningMode: "IMAGE" }); handMode = "IMAGE"; }
        try { storeHands(hands.detect(source), w, h); } catch { /* no hands */ }
      }
      combine();
      return hasHair || hasHand;
    },
    clear() {
      hasHair = hasHand = false;
      for (const x of [hairX, handX, outX]) x.clearRect(0, 0, out.width, out.height);
    },
    // Canvas for the shader, or null when nothing is in front of the face
    get mask() { return hasHair || hasHand ? out : null; },
  };
}
