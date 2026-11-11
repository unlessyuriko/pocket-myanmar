// Draws the thanakha as a texture on a 3D face mesh, the way phone face filters do.
// The paste is painted once on a flat picture of the face; the mesh (fitted to each tracked
// face every frame) wraps it around cheeks, turns and tilts with the head. Depth testing hides
// the far cheek behind the nose, and the paste fades out where the skin turns edge-on.
import { TRIANGLES } from "./facemesh.js";
import { TC } from "./facemap.js";
import { revealProgress } from "./thanakha.js";

// The mesh stops partway up the forehead, so add a cap above its top edge to reach the hairline
const RING = [162, 21, 54, 103, 67, 109, 10, 338, 297, 332, 284, 251, 389];   // temple to temple
const LIFT = 0.24;                                                           // of face height
const BASE = 468;
const NV = BASE + RING.length;
const WEIGHT = RING.map((_, k) => 0.3 + 0.7 * Math.sin((Math.PI * k) / (RING.length - 1)));

const INDEX = new Uint16Array(TRIANGLES.length + (RING.length - 1) * 6);
INDEX.set(TRIANGLES);
{
  let o = TRIANGLES.length;
  for (let k = 0; k < RING.length - 1; k++) {
    const a = RING[k], b = RING[k + 1], a2 = BASE + k, b2 = BASE + k + 1;
    INDEX.set([a, b, b2, a, b2, a2], o);
    o += 6;
  }
}

const UVS = new Float32Array(NV * 2);
UVS.set(TC);
{
  const upx = TC[20] - TC[304], upy = TC[21] - TC[305];     // texture-space "up": point 10 minus point 152
  RING.forEach((i, k) => {
    UVS[2 * (BASE + k)] = TC[2 * i] + upx * LIFT * WEIGHT[k];
    UVS[2 * (BASE + k) + 1] = TC[2 * i + 1] + upy * LIFT * WEIGHT[k];
  });
}
const FACE_UV_W = Math.abs(TC[2 * 454] - TC[2 * 234]);

const VERT = `
attribute vec3 aPos;
attribute vec3 aNor;
attribute vec2 aUv;
uniform vec2 uSize;
uniform float uZ;
varying vec2 vUv;
varying float vFacing;
void main() {
  vUv = aUv;
  vFacing = -aNor.z;      // 1 when the skin faces the camera, 0 when edge-on
  gl_Position = vec4(aPos.x / uSize.x * 2.0 - 1.0, 1.0 - aPos.y / uSize.y * 2.0, clamp(aPos.z * uZ, -0.98, 0.98), 1.0);
}`;

const FRAG = `
precision mediump float;
uniform sampler2D uTex;
uniform float uReveal;
uniform vec2 uNose;
uniform float uFaceW;
varying vec2 vUv;
varying float vFacing;
void main() {
  vec4 c = texture2D(uTex, vUv);
  float a = smoothstep(0.02, 0.32, vFacing);
  if (uReveal < 1.0) {
    float e = 1.0 - pow(1.0 - uReveal, 3.0);
    float R = uFaceW * (0.1 + 0.9 * e);
    a *= 1.0 - smoothstep(R * 0.5, R, distance(vUv, uNose));
  }
  gl_FragColor = c * a;     // texture is premultiplied
}`;

function compile(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
  return s;
}

export function createMeshRenderer(canvas) {
  const gl = canvas.getContext("webgl", { alpha: true, premultipliedAlpha: true, antialias: false, preserveDrawingBuffer: true, depth: true });
  if (!gl) return null;
  try {
    const prog = gl.createProgram();
    gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    gl.useProgram(prog);

    const attr = (name, size, data, usage) => {
      const b = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.bufferData(gl.ARRAY_BUFFER, data, usage);
      const loc = gl.getAttribLocation(prog, name);
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
      return b;
    };
    const posArr = new Float32Array(NV * 3), norArr = new Float32Array(NV * 3);
    const posBuf = attr("aPos", 3, posArr, gl.DYNAMIC_DRAW);
    const norBuf = attr("aNor", 3, norArr, gl.DYNAMIC_DRAW);
    attr("aUv", 2, UVS, gl.STATIC_DRAW);
    const idxBuf = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idxBuf);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, INDEX, gl.STATIC_DRAW);

    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.uniform1i(gl.getUniformLocation(prog, "uTex"), 0);

    const U = (n) => gl.getUniformLocation(prog, n);
    const uSize = U("uSize"), uZ = U("uZ"), uReveal = U("uReveal"), uNose = U("uNose"), uFaceW = U("uFaceW");
    gl.uniform2f(uNose, TC[2 * 195], TC[2 * 195 + 1]);
    gl.uniform1f(uFaceW, FACE_UV_W);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.clearColor(0, 0, 0, 0);

    // Fit the mesh to one face's landmarks: positions, plus the skin's direction at each point
    function fit(P) {
      for (let i = 0; i < BASE; i++) {
        posArr[3 * i] = P[i].x; posArr[3 * i + 1] = P[i].y; posArr[3 * i + 2] = P[i].z || 0;
      }
      const ux = P[10].x - P[152].x, uy = P[10].y - P[152].y;
      RING.forEach((i, k) => {
        const o = 3 * (BASE + k);
        posArr[o] = P[i].x + ux * LIFT * WEIGHT[k];
        posArr[o + 1] = P[i].y + uy * LIFT * WEIGHT[k];
        posArr[o + 2] = (P[i].z || 0) + Math.hypot(ux, uy) * 0.04;      // forehead leans back a little
      });
      norArr.fill(0);
      for (let t = 0; t < TRIANGLES.length; t += 3) {
        const a = 3 * TRIANGLES[t], b = 3 * TRIANGLES[t + 1], c = 3 * TRIANGLES[t + 2];
        const e1x = posArr[b] - posArr[a], e1y = posArr[b + 1] - posArr[a + 1], e1z = posArr[b + 2] - posArr[a + 2];
        const e2x = posArr[c] - posArr[a], e2y = posArr[c + 1] - posArr[a + 1], e2z = posArr[c + 2] - posArr[a + 2];
        const nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
        for (const v of [a, b, c]) { norArr[v] += nx; norArr[v + 1] += ny; norArr[v + 2] += nz; }
      }
      // Point every normal out of the face (toward the camera at the nose tip), then normalise
      const flip = norArr[3 * 1 + 2] > 0 ? -1 : 1;
      for (let i = 0; i < BASE; i++) {
        const o = 3 * i;
        const l = Math.hypot(norArr[o], norArr[o + 1], norArr[o + 2]) || 1;
        norArr[o] = (norArr[o] / l) * flip; norArr[o + 1] = (norArr[o + 1] / l) * flip; norArr[o + 2] = (norArr[o + 2] / l) * flip;
      }
      RING.forEach((i, k) => {
        const o = 3 * (BASE + k), s = 3 * i;
        norArr[o] = norArr[s]; norArr[o + 1] = norArr[s + 1]; norArr[o + 2] = norArr[s + 2];
      });
    }

    return {
      // Use a canvas holding the flat painted face as the paste texture
      setTexture(source) {
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
        gl.generateMipmap(gl.TEXTURE_2D);
      },
      // Paste every face into the canvas (transparent where there is no paste)
      render(faces, opts) {
        const W = canvas.width, H = canvas.height;
        gl.viewport(0, 0, W, H);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.uniform2f(uSize, W, H);
        gl.uniform1f(uZ, 1 / (W * 0.5));
        for (const P of faces) {
          fit(P);
          gl.clear(gl.DEPTH_BUFFER_BIT);
          gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
          gl.bufferSubData(gl.ARRAY_BUFFER, 0, posArr);
          gl.bindBuffer(gl.ARRAY_BUFFER, norBuf);
          gl.bufferSubData(gl.ARRAY_BUFFER, 0, norArr);
          gl.uniform1f(uReveal, revealProgress(P, opts));
          gl.drawElements(gl.TRIANGLES, INDEX.length, gl.UNSIGNED_SHORT, 0);
        }
        return canvas;
      },
    };
  } catch (e) {
    console.warn("3D face mesh unavailable, using flat shapes", e);
    return null;
  }
}
