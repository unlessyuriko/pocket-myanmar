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

## Feature 2: Pagoda at Home (ဘုရားဖူး)

Open `pagoda.html` (linked from the start screen). Only your own birth-day corner appears over the rear camera, like the weekday corners at the Shwedagon: a seated Buddha on a gold drum, your animal in a tiled basin in front, a bell frame beside it, and the foundation of the golden Shwedagon rising behind it. The eight animals are tiger, lion, two elephants, rat, guinea pig, naga and garuda.

- **Place it:** pick your birth day (Wednesday morning and Rahu are separate), point at a table or shelf and tap.
  - On phones with WebXR AR (Android Chrome), the app finds the real flat surface: a ring shows where it will land, and the corner stays stuck to that surface as you walk around. The camera is shown by the phone, so the photo button is off there; use the phone's screenshot.
  - On iPhone Safari there is no surface detection. It uses the motion sensors and assumes the table is 0.45 m below the phone, so it holds its direction but not its position if you walk.
  - Pinch or use the slider to change its size; drag to turn it.
- **Worship:** pour water over your animal, light the lamps, offer flowers and ring the bell. Doing all four gives "သာဓု သာဓု သာဓု". A small merit count and day streak are kept on the phone only.
- **Lighting** follows the time in Yangon (morning, day, evening, night).
- **Photo:** a share card with the scene, your weekday animal and merit count.
- The Shwedagon behind the corner is at real size (1 unit is about 1 m: 99 m to the dome, 112 m with the hti): the plinth, terraces, bell and spire are built in code, and 64 shrine-stupas around the base repeat one generated model (`models/shrine.glb`). The Buddha, silver table, bell and holder, tiger and guinea pig are also compressed generated models in `models/`; the other animals and small offerings are built in code. Sounds use the Web Audio API.
- Respect: the page asks people to place it on a table or shelf, never on the ground.

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
- `occlude.js`: finds what sits in front of the face so the paste stays under it. Hair comes from MediaPipe's small hair model (under 1 MB): a fringe or loose strands over the forehead and temples. Only the area above the eye line is used, because the model mistakes shadowed jaw and ear skin for hair. Hands come from MediaPipe's hand landmarks (about 8 MB), drawn as a palm-and-fingers shape. Both load in the background after the face tracker, and the hand model is skipped on data-saver and slow connections.
- `blend.js`: WebGL shader that blends the paste into the skin using its light and shadow
- `pagoda.html`, `pagoda.css`, `pagoda.js`, `pagoda-model.js`: the pagoda feature (page, scene and interaction, and the 3D shapes). Add `?debug` to the address to expose `window.__pagoda` for testing.
- `logo.svg`: logo, also used as the browser tab icon

To add a new shape, add an entry to `SHAPES` and a `case` in `cheekShape()` in `thanakha.js`. Shapes are drawn in face-local units, where `u` points outward from the nose and `v` points down.
