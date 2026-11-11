// GPU blender: lays the thanakha paste onto the face so it takes on the skin's
// own light, shadow and pore detail, instead of floating on top as a flat colour.
//
// For each pixel under the paste:
//   shade  = skin brightness here / average face brightness  (the face's shading)
//   paste  = paste colour * shade * overall light level
//   result = mix(skin, paste, paste thickness)

const VERT = `
attribute vec2 aPos;
varying vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const FRAG = `
precision mediump float;
uniform sampler2D uSkin;
uniform sampler2D uPaste;
uniform float uMirror;
uniform float uStrength;
uniform float uFaceLum;     // average skin brightness on the face (0..1)
uniform vec2 uTexel;        // 1 / size, for a small blur
varying vec2 vUv;

float lum(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

vec3 skinAt(vec2 uv) {
  return texture2D(uSkin, vec2(uMirror > 0.5 ? 1.0 - uv.x : uv.x, uv.y)).rgb;
}

void main() {
  vec3 skin = skinAt(vUv);
  vec4 p = texture2D(uPaste, vUv);
  if (p.a < 0.002) { gl_FragColor = vec4(skin, 1.0); return; }

  // Broad shading (soft) + fine pore detail (sharp), both relative to the face average
  vec2 d = uTexel * 3.0;
  float Lb = (lum(skinAt(vUv + vec2(d.x, 0.0))) + lum(skinAt(vUv - vec2(d.x, 0.0))) +
              lum(skinAt(vUv + vec2(0.0, d.y))) + lum(skinAt(vUv - vec2(0.0, d.y)))) * 0.25;
  float L = lum(skin);
  float ref = max(uFaceLum, 0.04);
  float broad = clamp(Lb / ref, 0.45, 1.35);
  float detail = clamp(1.0 + (L - Lb) / ref * 0.9, 0.75, 1.25);

  // Overall light level: a dim room should make the paste dimmer too.
  // Kept gentle, because darker skin isn't the same as darker light.
  float light = clamp(pow(ref / 0.42, 0.3), 0.75, 1.08);

  // Paste is matte, so it shows shading a little less strongly than skin
  float shade = mix(1.0, broad, 0.7) * detail * light;
  vec3 paste = p.rgb * shade;
  // In shadow, chalky paste turns greyish-beige rather than olive
  float g = lum(paste);
  paste = mix(vec3(g) * vec3(1.04, 0.99, 0.93), paste, clamp(0.35 + 0.65 * shade, 0.0, 1.0));

  // Specular highlights (shine on the skin) still come through thin paste
  float spec = smoothstep(0.82, 1.0, L) * 0.35;

  float a = clamp(p.a * uStrength, 0.0, 1.0);
  vec3 col = mix(skin, paste, a) + spec * (1.0 - a * 0.6);
  gl_FragColor = vec4(col, 1.0);
}`;

function compile(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
  return s;
}

export function createBlender(canvas) {
  const gl = canvas.getContext("webgl", { preserveDrawingBuffer: true, alpha: false, antialias: false });
  if (!gl) return null;
  try {
    const prog = gl.createProgram();
    gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "aPos");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    const makeTex = (unit) => {
      const t = gl.createTexture();
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return t;
    };
    const skinTex = makeTex(0);
    const pasteTex = makeTex(1);
    gl.uniform1i(gl.getUniformLocation(prog, "uSkin"), 0);
    gl.uniform1i(gl.getUniformLocation(prog, "uPaste"), 1);
    const U = (n) => gl.getUniformLocation(prog, n);
    const uMirror = U("uMirror"), uStrength = U("uStrength"), uFaceLum = U("uFaceLum"), uTexel = U("uTexel");

    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);

    return {
      render(source, pasteCanvas, { mirror, strength, faceLum }) {
        const W = canvas.width, H = canvas.height;
        gl.viewport(0, 0, W, H);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, skinTex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, source);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, pasteTex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, pasteCanvas);
        gl.uniform1f(uMirror, mirror ? 1 : 0);
        gl.uniform1f(uStrength, strength);
        gl.uniform1f(uFaceLum, faceLum);
        gl.uniform2f(uTexel, 1 / W, 1 / H);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      },
    };
  } catch (e) {
    console.warn("WebGL blender unavailable, using simple blending", e);
    return null;
  }
}
