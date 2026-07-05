"use strict";

// All adjustments and filters operate on ImageData. Parametric ones are
// described in Filters.defs (drives the live-preview dialog); parameterless
// ones live in Filters.direct.
const Filters = {

  // ---- region helpers -------------------------------------------------

  // Rect of the active selection (or whole doc), expressed in the layer's
  // local pixel space and clipped to the layer canvas. Null if no overlap.
  layerRegion(layer, selection) {
    const rect = selection
      ? Utils.roundRect(selection)
      : { x: 0, y: 0, w: Editor.doc.width, h: Editor.doc.height };
    return Utils.intersectRect(
      { x: rect.x - Math.round(layer.x), y: rect.y - Math.round(layer.y), w: rect.w, h: rect.h },
      { x: 0, y: 0, w: layer.canvas.width, h: layer.canvas.height }
    );
  },

  applyDirect(name) {
    const layer = Editor.activeLayer();
    if (!layer) return;
    const region = this.layerRegion(layer, Editor.selection);
    if (!region) return;
    History.record(name);
    const img = layer.ctx.getImageData(region.x, region.y, region.w, region.h);
    const out = this.direct[name](img) || img;
    layer.ctx.putImageData(out, region.x, region.y);
    Editor.render();
    UI.refreshLayers();
  },

  // ---- pixel helpers ---------------------------------------------------

  applyLUT(img, lut) {
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      d[i] = lut[d[i]];
      d[i + 1] = lut[d[i + 1]];
      d[i + 2] = lut[d[i + 2]];
    }
    return img;
  },

  // ---- parameterless ops ----------------------------------------------

  direct: {
    invert(img) {
      const d = img.data;
      for (let i = 0; i < d.length; i += 4) {
        d[i] = 255 - d[i]; d[i + 1] = 255 - d[i + 1]; d[i + 2] = 255 - d[i + 2];
      }
    },
    grayscale(img) {
      const d = img.data;
      for (let i = 0; i < d.length; i += 4) {
        const v = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
        d[i] = d[i + 1] = d[i + 2] = v;
      }
    },
    sepia(img) {
      const d = img.data;
      for (let i = 0; i < d.length; i += 4) {
        const r = d[i], g = d[i + 1], b = d[i + 2];
        d[i] = Math.min(255, r * .393 + g * .769 + b * .189);
        d[i + 1] = Math.min(255, r * .349 + g * .686 + b * .168);
        d[i + 2] = Math.min(255, r * .272 + g * .534 + b * .131);
      }
    },
    emboss(img) {
      return Filters.convolve(img, [-2, -1, 0, -1, 1, 1, 0, 1, 2], 1, 0);
    },
    edge(img) {
      return Filters.sobel(img);
    },
    solarize(img) {
      const d = img.data;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i] > 128) d[i] = 255 - d[i];
        if (d[i + 1] > 128) d[i + 1] = 255 - d[i + 1];
        if (d[i + 2] > 128) d[i + 2] = 255 - d[i + 2];
      }
    },
    // Stretch luminance to full range, clipping 0.5% at each end.
    "auto-contrast"(img) {
      const d = img.data;
      const hist = new Uint32Array(256);
      let count = 0;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] === 0) continue;
        hist[Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2])]++;
        count++;
      }
      if (!count) return;
      const clip = count * 0.005;
      let lo = 0, hi = 255, acc = 0;
      for (let i = 0; i < 256; i++) { acc += hist[i]; if (acc > clip) { lo = i; break; } }
      acc = 0;
      for (let i = 255; i >= 0; i--) { acc += hist[i]; if (acc > clip) { hi = i; break; } }
      if (hi <= lo) return;
      const lut = new Uint8ClampedArray(256);
      for (let i = 0; i < 256; i++) lut[i] = Utils.clamp((i - lo) * 255 / (hi - lo), 0, 255);
      Filters.applyLUT(img, lut);
    },
  },

  // ---- convolution -----------------------------------------------------

  convolve(img, kernel, divisor = 1, offset = 0) {
    const w = img.width, h = img.height, src = img.data;
    const out = new ImageData(w, h);
    const dst = out.data;
    const side = Math.round(Math.sqrt(kernel.length));
    const half = (side - 1) / 2;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let r = 0, g = 0, b = 0;
        for (let ky = 0; ky < side; ky++) {
          for (let kx = 0; kx < side; kx++) {
            const sy = Utils.clamp(y + ky - half, 0, h - 1);
            const sx = Utils.clamp(x + kx - half, 0, w - 1);
            const si = (sy * w + sx) * 4;
            const kv = kernel[ky * side + kx];
            r += src[si] * kv;
            g += src[si + 1] * kv;
            b += src[si + 2] * kv;
          }
        }
        const di = (y * w + x) * 4;
        dst[di] = Utils.clamp(r / divisor + offset, 0, 255);
        dst[di + 1] = Utils.clamp(g / divisor + offset, 0, 255);
        dst[di + 2] = Utils.clamp(b / divisor + offset, 0, 255);
        dst[di + 3] = src[di + 3];
      }
    }
    return out;
  },

  sobel(img) {
    const w = img.width, h = img.height, src = img.data;
    const gray = new Float32Array(w * h);
    for (let i = 0, p = 0; i < src.length; i += 4, p++) {
      gray[p] = 0.299 * src[i] + 0.587 * src[i + 1] + 0.114 * src[i + 2];
    }
    const out = new ImageData(w, h);
    const dst = out.data;
    const at = (x, y) => gray[Utils.clamp(y, 0, h - 1) * w + Utils.clamp(x, 0, w - 1)];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const gx = -at(x - 1, y - 1) - 2 * at(x - 1, y) - at(x - 1, y + 1)
                 +  at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1);
        const gy = -at(x - 1, y - 1) - 2 * at(x, y - 1) - at(x + 1, y - 1)
                 +  at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1);
        const m = Utils.clamp(Math.sqrt(gx * gx + gy * gy), 0, 255);
        const di = (y * w + x) * 4;
        dst[di] = dst[di + 1] = dst[di + 2] = m;
        dst[di + 3] = src[di + 3];
      }
    }
    return out;
  },

  // ---- blur (3-pass box blur ≈ gaussian, premultiplied alpha) -----------

  gaussianBlur(img, radius) {
    radius = Math.round(radius);
    if (radius < 1) return img;
    const w = img.width, h = img.height, d = img.data;
    const n = w * h;
    let r = new Float32Array(n), g = new Float32Array(n), b = new Float32Array(n), a = new Float32Array(n);
    for (let i = 0, p = 0; p < n; i += 4, p++) {
      const al = d[i + 3] / 255;
      r[p] = d[i] * al; g[p] = d[i + 1] * al; b[p] = d[i + 2] * al; a[p] = d[i + 3];
    }
    for (let pass = 0; pass < 3; pass++) {
      r = this._boxH(r, w, h, radius); r = this._boxV(r, w, h, radius);
      g = this._boxH(g, w, h, radius); g = this._boxV(g, w, h, radius);
      b = this._boxH(b, w, h, radius); b = this._boxV(b, w, h, radius);
      a = this._boxH(a, w, h, radius); a = this._boxV(a, w, h, radius);
    }
    for (let i = 0, p = 0; p < n; i += 4, p++) {
      const al = a[p] > 0.01 ? a[p] / 255 : 1;
      d[i] = Utils.clamp(r[p] / al, 0, 255);
      d[i + 1] = Utils.clamp(g[p] / al, 0, 255);
      d[i + 2] = Utils.clamp(b[p] / al, 0, 255);
      d[i + 3] = Utils.clamp(a[p], 0, 255);
    }
    return img;
  },

  _boxH(src, w, h, radius) {
    const out = new Float32Array(src.length);
    const size = radius * 2 + 1;
    for (let y = 0; y < h; y++) {
      const row = y * w;
      let sum = 0;
      for (let x = -radius; x <= radius; x++) sum += src[row + Utils.clamp(x, 0, w - 1)];
      for (let x = 0; x < w; x++) {
        out[row + x] = sum / size;
        sum += src[row + Utils.clamp(x + radius + 1, 0, w - 1)];
        sum -= src[row + Utils.clamp(x - radius, 0, w - 1)];
      }
    }
    return out;
  },

  _boxV(src, w, h, radius) {
    const out = new Float32Array(src.length);
    const size = radius * 2 + 1;
    for (let x = 0; x < w; x++) {
      let sum = 0;
      for (let y = -radius; y <= radius; y++) sum += src[Utils.clamp(y, 0, h - 1) * w + x];
      for (let y = 0; y < h; y++) {
        out[y * w + x] = sum / size;
        sum += src[Utils.clamp(y + radius + 1, 0, h - 1) * w + x];
        sum -= src[Utils.clamp(y - radius, 0, h - 1) * w + x];
      }
    }
    return out;
  },

  // ---- flood fill --------------------------------------------------------

  floodFill(layer, x, y, hexColor, tolerance, clipRect) {
    const w = layer.canvas.width, h = layer.canvas.height;
    x = Math.floor(x); y = Math.floor(y);
    const bounds = clipRect || { x: 0, y: 0, w, h };
    if (x < bounds.x || y < bounds.y || x >= bounds.x + bounds.w || y >= bounds.y + bounds.h) return false;
    const img = layer.ctx.getImageData(0, 0, w, h);
    const d = img.data;
    const idx = (y * w + x) * 4;
    const tr = d[idx], tg = d[idx + 1], tb = d[idx + 2], ta = d[idx + 3];
    const fill = Utils.hexToRgb(hexColor);
    if (tr === fill.r && tg === fill.g && tb === fill.b && ta === 255) return false;
    const visited = new Uint8Array(w * h);
    const stack = [y * w + x];
    const match = (i) => {
      const j = i * 4;
      return Math.abs(d[j] - tr) <= tolerance &&
             Math.abs(d[j + 1] - tg) <= tolerance &&
             Math.abs(d[j + 2] - tb) <= tolerance &&
             Math.abs(d[j + 3] - ta) <= tolerance;
    };
    while (stack.length) {
      const p = stack.pop();
      if (visited[p]) continue;
      visited[p] = 1;
      const px = p % w, py = (p / w) | 0;
      if (px < bounds.x || py < bounds.y || px >= bounds.x + bounds.w || py >= bounds.y + bounds.h) continue;
      if (!match(p)) continue;
      const j = p * 4;
      d[j] = fill.r; d[j + 1] = fill.g; d[j + 2] = fill.b; d[j + 3] = 255;
      if (px > 0) stack.push(p - 1);
      if (px < w - 1) stack.push(p + 1);
      if (py > 0) stack.push(p - w);
      if (py < h - 1) stack.push(p + w);
    }
    layer.ctx.putImageData(img, 0, 0);
    return true;
  },

  // ---- parametric filter definitions (drive the preview dialog) ----------

  defs: {
    "brightness-contrast": {
      title: "Brightness / Contrast",
      params: [
        { k: "brightness", label: "Brightness", min: -100, max: 100, step: 1, v: 0 },
        { k: "contrast", label: "Contrast", min: -100, max: 100, step: 1, v: 0 },
      ],
      fn(img, v) {
        const b = v.brightness * 1.28;
        const c = v.contrast * 2.55;
        const f = (259 * (c + 255)) / (255 * (259 - c));
        const lut = new Uint8ClampedArray(256);
        for (let i = 0; i < 256; i++) lut[i] = Utils.clamp(f * (i - 128) + 128 + b, 0, 255);
        return Filters.applyLUT(img, lut);
      },
    },

    "hue-saturation": {
      title: "Hue / Saturation / Lightness",
      params: [
        { k: "hue", label: "Hue", min: -180, max: 180, step: 1, v: 0 },
        { k: "saturation", label: "Saturation", min: -100, max: 100, step: 1, v: 0 },
        { k: "lightness", label: "Lightness", min: -100, max: 100, step: 1, v: 0 },
      ],
      fn(img, v) {
        const d = img.data;
        const satMul = 1 + v.saturation / 100;
        const lightAdd = v.lightness / 100;
        for (let i = 0; i < d.length; i += 4) {
          let [h, s, l] = Utils.rgbToHsl(d[i], d[i + 1], d[i + 2]);
          h += v.hue;
          s = Utils.clamp(s * satMul, 0, 1);
          l = Utils.clamp(l + lightAdd, 0, 1);
          const [r, g, b] = Utils.hslToRgb(h, s, l);
          d[i] = r; d[i + 1] = g; d[i + 2] = b;
        }
        return img;
      },
    },

    "temperature": {
      title: "Temperature / Tint",
      params: [
        { k: "temp", label: "Temperature", min: -100, max: 100, step: 1, v: 0 },
        { k: "tint", label: "Tint", min: -100, max: 100, step: 1, v: 0 },
      ],
      fn(img, v) {
        const d = img.data;
        const t = v.temp * 0.6, g = v.tint * 0.6;
        for (let i = 0; i < d.length; i += 4) {
          d[i] = Utils.clamp(d[i] + t, 0, 255);
          d[i + 1] = Utils.clamp(d[i + 1] + g, 0, 255);
          d[i + 2] = Utils.clamp(d[i + 2] - t, 0, 255);
        }
        return img;
      },
    },

    "exposure": {
      title: "Exposure / Gamma",
      params: [
        { k: "exposure", label: "Exposure", min: -30, max: 30, step: 1, v: 0 },   // tenths of a stop
        { k: "gamma", label: "Gamma", min: 20, max: 300, step: 1, v: 100 },       // /100
      ],
      fn(img, v) {
        const ev = Math.pow(2, v.exposure / 10);
        const gamma = 1 / (v.gamma / 100);
        const lut = new Uint8ClampedArray(256);
        for (let i = 0; i < 256; i++) {
          lut[i] = Utils.clamp(255 * Math.pow((i / 255) * ev, gamma), 0, 255);
        }
        return Filters.applyLUT(img, lut);
      },
    },

    "vibrance": {
      title: "Vibrance",
      params: [{ k: "amount", label: "Amount", min: -100, max: 100, step: 1, v: 0 }],
      fn(img, v) {
        const d = img.data;
        const amt = v.amount / 100;
        for (let i = 0; i < d.length; i += 4) {
          const r = d[i], g = d[i + 1], b = d[i + 2];
          const mx = Math.max(r, g, b);
          const avg = (r + g + b) / 3;
          const scale = amt * (1 - (mx - avg) / 128) * 1.2;
          d[i] = Utils.clamp(r + (r - avg) * scale, 0, 255);
          d[i + 1] = Utils.clamp(g + (g - avg) * scale, 0, 255);
          d[i + 2] = Utils.clamp(b + (b - avg) * scale, 0, 255);
        }
        return img;
      },
    },

    "posterize": {
      title: "Posterize",
      params: [{ k: "levels", label: "Levels", min: 2, max: 16, step: 1, v: 4 }],
      fn(img, v) {
        const levels = v.levels;
        const lut = new Uint8ClampedArray(256);
        for (let i = 0; i < 256; i++) {
          lut[i] = Utils.clamp(Math.round(Math.round((i / 255) * (levels - 1)) / (levels - 1) * 255), 0, 255);
        }
        return Filters.applyLUT(img, lut);
      },
    },

    "threshold": {
      title: "Threshold",
      params: [{ k: "level", label: "Level", min: 0, max: 255, step: 1, v: 128 }],
      fn(img, v) {
        const d = img.data;
        for (let i = 0; i < d.length; i += 4) {
          const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
          const out = lum >= v.level ? 255 : 0;
          d[i] = d[i + 1] = d[i + 2] = out;
        }
        return img;
      },
    },

    "blur": {
      title: "Gaussian Blur",
      params: [{ k: "radius", label: "Radius", min: 1, max: 40, step: 1, v: 5 }],
      fn(img, v) { return Filters.gaussianBlur(img, v.radius); },
    },

    "sharpen": {
      title: "Sharpen",
      params: [{ k: "amount", label: "Amount", min: 1, max: 100, step: 1, v: 30 }],
      fn(img, v) {
        const a = v.amount / 50;
        return Filters.convolve(img, [0, -a, 0, -a, 1 + 4 * a, -a, 0, -a, 0], 1, 0);
      },
    },

    "pixelate": {
      title: "Pixelate",
      params: [{ k: "size", label: "Block size", min: 2, max: 80, step: 1, v: 10 }],
      fn(img, v) {
        const w = img.width, h = img.height, d = img.data, s = v.size;
        for (let by = 0; by < h; by += s) {
          for (let bx = 0; bx < w; bx += s) {
            let r = 0, g = 0, b = 0, a = 0, n = 0;
            const ey = Math.min(by + s, h), ex = Math.min(bx + s, w);
            for (let y = by; y < ey; y++) {
              for (let x = bx; x < ex; x++) {
                const i = (y * w + x) * 4;
                r += d[i]; g += d[i + 1]; b += d[i + 2]; a += d[i + 3]; n++;
              }
            }
            r /= n; g /= n; b /= n; a /= n;
            for (let y = by; y < ey; y++) {
              for (let x = bx; x < ex; x++) {
                const i = (y * w + x) * 4;
                d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = a;
              }
            }
          }
        }
        return img;
      },
    },

    "noise": {
      title: "Noise",
      params: [{ k: "amount", label: "Amount", min: 1, max: 100, step: 1, v: 20 }],
      fn(img, v) {
        const d = img.data;
        const amt = v.amount * 1.28;
        for (let i = 0; i < d.length; i += 4) {
          const n = (Math.random() - 0.5) * amt;
          d[i] = Utils.clamp(d[i] + n, 0, 255);
          d[i + 1] = Utils.clamp(d[i + 1] + n, 0, 255);
          d[i + 2] = Utils.clamp(d[i + 2] + n, 0, 255);
        }
        return img;
      },
    },

    "levels": {
      title: "Levels",
      params: [
        { k: "black", label: "Black point", min: 0, max: 254, step: 1, v: 0 },
        { k: "white", label: "White point", min: 1, max: 255, step: 1, v: 255 },
        { k: "gamma", label: "Midtones", min: 10, max: 300, step: 1, v: 100 }, // /100
      ],
      fn(img, v) {
        const black = Math.min(v.black, v.white - 1);
        const range = v.white - black;
        const gamma = 1 / (v.gamma / 100);
        const lut = new Uint8ClampedArray(256);
        for (let i = 0; i < 256; i++) {
          const t = Utils.clamp((i - black) / range, 0, 1);
          lut[i] = Math.round(255 * Math.pow(t, gamma));
        }
        return Filters.applyLUT(img, lut);
      },
    },

    "gradient-map": {
      title: "Gradient Map",
      params: [
        { k: "shadow", label: "Shadows", type: "color", v: "#101040" },
        { k: "highlight", label: "Highlights", type: "color", v: "#ffe0a0" },
        { k: "mix", label: "Mix", min: 0, max: 100, step: 1, v: 100 },
      ],
      fn(img, v) {
        const lo = Utils.hexToRgb(v.shadow);
        const hi = Utils.hexToRgb(v.highlight);
        const mix = v.mix / 100;
        const d = img.data;
        for (let i = 0; i < d.length; i += 4) {
          const t = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255;
          d[i] = d[i] + (lo.r + (hi.r - lo.r) * t - d[i]) * mix;
          d[i + 1] = d[i + 1] + (lo.g + (hi.g - lo.g) * t - d[i + 1]) * mix;
          d[i + 2] = d[i + 2] + (lo.b + (hi.b - lo.b) * t - d[i + 2]) * mix;
        }
        return img;
      },
    },

    "glow": {
      title: "Glow",
      params: [
        { k: "radius", label: "Radius", min: 1, max: 40, step: 1, v: 10 },
        { k: "intensity", label: "Intensity", min: 1, max: 100, step: 1, v: 50 },
      ],
      // Screen-blend a blurred copy over the original (soft bloom).
      fn(img, v) {
        const blurred = new ImageData(new Uint8ClampedArray(img.data), img.width, img.height);
        Filters.gaussianBlur(blurred, v.radius);
        const d = img.data, b = blurred.data;
        const mix = v.intensity / 100;
        for (let i = 0; i < d.length; i += 4) {
          for (let c = 0; c < 3; c++) {
            const screen = 255 - (255 - d[i + c]) * (255 - b[i + c]) / 255;
            d[i + c] += (screen - d[i + c]) * mix;
          }
        }
        return img;
      },
    },

    "motion-blur": {
      title: "Motion Blur",
      params: [
        { k: "distance", label: "Distance", min: 2, max: 60, step: 1, v: 15 },
        { k: "angle", label: "Angle", min: -90, max: 90, step: 1, v: 0 },
      ],
      fn(img, v) {
        const w = img.width, h = img.height, src = img.data;
        const out = new ImageData(w, h);
        const dst = out.data;
        const rad = v.angle * Math.PI / 180;
        const dx = Math.cos(rad), dy = Math.sin(rad);
        const half = v.distance / 2;
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            let r = 0, g = 0, b = 0, a = 0, n = 0;
            for (let t = -half; t <= half; t++) {
              const sx = Utils.clamp(Math.round(x + dx * t), 0, w - 1);
              const sy = Utils.clamp(Math.round(y + dy * t), 0, h - 1);
              const i = (sy * w + sx) * 4;
              const al = src[i + 3] / 255;
              r += src[i] * al; g += src[i + 1] * al; b += src[i + 2] * al; a += src[i + 3];
              n++;
            }
            const i = (y * w + x) * 4;
            const al = a / n > 0.01 ? (a / n) / 255 : 1;
            dst[i] = r / n / al;
            dst[i + 1] = g / n / al;
            dst[i + 2] = b / n / al;
            dst[i + 3] = a / n;
          }
        }
        return out;
      },
    },

    "twirl": {
      title: "Twirl",
      params: [
        { k: "angle", label: "Angle", min: -360, max: 360, step: 1, v: 120 },
        { k: "radius", label: "Radius %", min: 10, max: 100, step: 1, v: 80 },
      ],
      fn(img, v) {
        const w = img.width, h = img.height;
        const src = new Uint8ClampedArray(img.data);
        const dst = img.data;
        const cx = w / 2, cy = h / 2;
        const R = Math.min(w, h) / 2 * (v.radius / 100);
        const maxAngle = v.angle * Math.PI / 180;
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            const rx = x - cx, ry = y - cy;
            const r = Math.sqrt(rx * rx + ry * ry);
            if (r >= R) continue;
            const f = 1 - r / R;
            const theta = maxAngle * f * f;
            const cos = Math.cos(theta), sin = Math.sin(theta);
            const sx = Utils.clamp(cx + rx * cos - ry * sin, 0, w - 1);
            const sy = Utils.clamp(cy + rx * sin + ry * cos, 0, h - 1);
            // bilinear sample
            const x0 = Math.floor(sx), y0 = Math.floor(sy);
            const x1 = Math.min(x0 + 1, w - 1), y1 = Math.min(y0 + 1, h - 1);
            const fx = sx - x0, fy = sy - y0;
            const di = (y * w + x) * 4;
            for (let c = 0; c < 4; c++) {
              const p00 = src[(y0 * w + x0) * 4 + c], p10 = src[(y0 * w + x1) * 4 + c];
              const p01 = src[(y1 * w + x0) * 4 + c], p11 = src[(y1 * w + x1) * 4 + c];
              dst[di + c] = (p00 * (1 - fx) + p10 * fx) * (1 - fy) + (p01 * (1 - fx) + p11 * fx) * fy;
            }
          }
        }
        return img;
      },
    },

    "vignette": {
      title: "Vignette",
      params: [
        { k: "amount", label: "Amount", min: 1, max: 100, step: 1, v: 50 },
        { k: "spread", label: "Spread", min: 10, max: 100, step: 1, v: 60 },
      ],
      fn(img, v) {
        const w = img.width, h = img.height, d = img.data;
        const cx = w / 2, cy = h / 2;
        const maxDist = Math.sqrt(cx * cx + cy * cy);
        const amt = v.amount / 100;
        const falloff = 4 - (v.spread / 100) * 3; // low spread -> sharper edge
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            const dx = x - cx, dy = y - cy;
            const dist = Math.sqrt(dx * dx + dy * dy) / maxDist;
            const f = 1 - amt * Math.pow(dist, falloff);
            const i = (y * w + x) * 4;
            d[i] *= f; d[i + 1] *= f; d[i + 2] *= f;
          }
        }
        return img;
      },
    },
  },
};
