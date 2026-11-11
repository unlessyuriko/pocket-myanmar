// Where each face-mesh point sits on the flat, unwrapped face picture (the "texture").
// The face fills the middle of the square, leaving room above for the forehead extension.
import { UV } from "./facemesh.js";

export const TEX_SIZE = 1024;

// Texture coordinates for the 468 mesh points: x and y from 0 to 1, y downward
// On the cheeks, one step along the map's height covers about 0.86 times the face surface that
// one step across does, so squeeze the height by that much: then a circle painted on the texture
// is round on the cheek, not a flat oval.
const KX = 0.8, KY = 0.69;
export const TC = new Float32Array(UV.length);
for (let i = 0; i < UV.length; i += 2) {
  TC[i] = 0.5 + (UV[i] - 0.5) * KX;
  TC[i + 1] = 0.28 + (0.893 - UV[i + 1]) * KY;
}

// The same points as pixel positions on a texture of size S, shaped like face landmarks,
// so the shape-drawing code can paint on the flat face exactly as it does on a photo.
const cache = new Map();
export function texPoints(S) {
  if (!cache.has(S)) {
    const P = [];
    for (let i = 0; i < TC.length / 2; i++) P.push({ x: TC[2 * i] * S, y: TC[2 * i + 1] * S, z: 0 });
    cache.set(S, P);
  }
  return cache.get(S);
}
