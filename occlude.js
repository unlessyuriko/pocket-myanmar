// Finds hair in the camera picture so the paste can stay under it (a fringe or loose strands
// falling across the forehead or cheek). Uses MediaPipe's small hair model (under 1 MB), loaded in
// the background after the face tracker, so it never delays the first picture.
import { ImageSegmenter, FilesetResolver } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs";

const MODEL_URL = "https://storage.googleapis.com/mediapipe-models/image_segmenter/hair_segmenter/float32/latest/hair_segmenter.tflite";
const SOFT_W = 192;      // the mask is shrunk to this width, so its edge comes out soft when stretched back up

export function createOccluder(wasmUrl) {
  let seg = null, loading = null, mode = null;
  let work = null, wctx = null;                       // full-size hair mask
  const soft = document.createElement("canvas");      // small, blurry copy handed to the shader
  const sctx = soft.getContext("2d");
  let hasHair = false;

  async function load() {
    if (loading) return loading;
    loading = (async () => {
      const fileset = await FilesetResolver.forVisionTasks(wasmUrl);
      const opts = (delegate) => ({
        baseOptions: { modelAssetPath: MODEL_URL, delegate },
        runningMode: "VIDEO", outputCategoryMask: true, outputConfidenceMasks: false,
      });
      try { seg = await ImageSegmenter.createFromOptions(fileset, opts("GPU")); }
      catch { seg = await ImageSegmenter.createFromOptions(fileset, opts("CPU")); }
      mode = "VIDEO";
      return seg;
    })().catch((e) => { loading = null; console.warn("Hair detection unavailable", e); return null; });
    return loading;
  }

  // Turn the model's answer into the soft mask canvas. Returns false if the answer looks wrong
  // (e.g. "hair" on the nose), so a bad frame never wipes the paste off the face.
  function store(result, info) {
    const { probes, zones } = info || {};
    const m = result.categoryMask;
    if (!m) return false;
    const w = m.width, h = m.height, data = m.getAsUint8Array();
    if (!work) { work = document.createElement("canvas"); wctx = work.getContext("2d", { willReadFrequently: true }); }
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
    const sh = Math.max(1, Math.round((SOFT_W * h) / w));
    if (soft.width !== SOFT_W || soft.height !== sh) { soft.width = SOFT_W; soft.height = sh; }
    sctx.clearRect(0, 0, SOFT_W, sh);
    sctx.drawImage(work, 0, 0, SOFT_W, sh);
    return true;
  }

  return {
    load,
    get ready() { return !!seg; },
    // Camera frames: call every few frames
    async video(source, info) {
      if (!seg) return;
      if (mode !== "VIDEO") { await seg.setOptions({ runningMode: "VIDEO" }); mode = "VIDEO"; }
      let r;
      try { r = seg.segmentForVideo(source, performance.now()); } catch { return; }
      try { store(r, info); } finally { r.close && r.close(); }
    },
    // A single photo
    async image(source, info) {
      await load();
      if (!seg) return false;
      if (mode !== "IMAGE") { await seg.setOptions({ runningMode: "IMAGE" }); mode = "IMAGE"; }
      let r;
      try { r = seg.segment(source); } catch { return false; }
      try { return store(r, info); } finally { r.close && r.close(); }
    },
    clear() { hasHair = false; sctx.clearRect(0, 0, soft.width, soft.height); },
    // Canvas for the shader, or null when no hair was found
    get mask() { return hasHair ? soft : null; },
  };
}
