# Myanmar Vibe

Myanmar in your pocket: small AR experiences for people who miss home, running in the phone's browser with no install.

## Feature 1: Thanakha (သနပ်ခါး)

A face filter that paints Myanmar thanakha on your face through the phone camera.

- **Shapes:** Round, Square, Bodhi leaf, Comb lines, Heart, Flower, Full face
- **Extras:** forehead, nose and chin dots, which can be combined with any shape
- **Tones:** fresh paste, classic, dried; adjustable strength
- **Photo:** take a selfie with a small caption, then save or share it. You can also use an existing photo instead of the camera.
- **Video:** record 5 seconds with the effects (MP4 where the browser supports it, otherwise WebM), then save or share.
- **Group:** up to 4 faces at once, each tracked and painted separately.
- **Effects:** the paste spreads on when a face appears or the shape changes; a flash and glints on capture; a smile makes glints and petals, an open mouth rains petals, a wink pops a glint. Expressions are read from landmark distances (see `REACT` in `app.js`). Effects are skipped when the phone asks for reduced motion.

Face tracking uses Google MediaPipe Face Landmarker and runs entirely on the device. Nothing is uploaded.

## Run locally

```bash
node server.js
```

Open http://localhost:5173. Camera access works on `localhost` without extra setup.

## Test on a phone

Phones only allow camera access on **https** links. Host the folder on any static host, for example:
- Netlify Drop (drag the folder onto app.netlify.com/drop)
- GitHub Pages
- Cloudflare Pages

## Files

- `index.html`, `style.css`: page layout
- `app.js`: camera, face tracking, photo capture and sharing
- `thanakha.js`: thanakha shapes, paste texture and how they're placed on the face
- `fx.js`: sparkles and petals, and smile / wink / open-mouth detection
- `mesh.js`, `facemesh.js`, `facemap.js`: the paste is painted once on a flat picture of the face and wrapped onto a 3D face mesh (MediaPipe's canonical face model, Apache 2.0) fitted to each tracked face every frame, the way phone face filters work. Add `?mesh=0` to the address to use the older flat drawing instead.
- `blend.js`: WebGL shader that blends the paste into the skin using its light and shadow
- `logo.svg`: logo, also used as the browser tab icon

To add a new shape, add an entry to `SHAPES` and a `case` in `cheekShape()` in `thanakha.js`. Shapes are drawn in face-local units, where `u` points outward from the nose and `v` points down.
