"use strict";

const Editor = {
  doc: null,                 // { width, height, layers: [bottom..top], active }
  view: { zoom: 1, panX: 0, panY: 0 },
  selection: null,           // { x, y, w, h } in document coords
  projectName: null,
  canvas: null,
  ctx: null,
  checker: null,
  dpr: window.devicePixelRatio || 1,
  pointer: { x: 0, y: 0, sx: 0, sy: 0, over: false }, // doc + screen coords of cursor

  init(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    const pat = Utils.createCanvas(16, 16);
    const pctx = pat.getContext("2d");
    pctx.fillStyle = "#3a3a42"; pctx.fillRect(0, 0, 16, 16);
    pctx.fillStyle = "#4a4a54"; pctx.fillRect(0, 0, 8, 8); pctx.fillRect(8, 8, 8, 8);
    this.checker = this.ctx.createPattern(pat, "repeat");
    this.resizeView();
  },

  resizeView() {
    const wrap = this.canvas.parentElement;
    this.dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.max(1, Math.round(wrap.clientWidth * this.dpr));
    this.canvas.height = Math.max(1, Math.round(wrap.clientHeight * this.dpr));
    this.render();
  },

  // ---- document lifecycle ----------------------------------------------

  newDocument(w, h, background) {
    this.doc = { width: w, height: h, layers: [], active: 0 };
    const layer = this.createLayer("Background");
    if (background && background !== "transparent") {
      layer.ctx.fillStyle = background;
      layer.ctx.fillRect(0, 0, w, h);
    }
    this.doc.layers.push(layer);
    this.selection = null;
    this.projectName = null;
    History.clear();
    this.fitView();
    UI.refreshAll();
  },

  fromImage(img, name) {
    this.newDocument(img.naturalWidth || img.width, img.naturalHeight || img.height, "transparent");
    const layer = this.doc.layers[0];
    layer.name = name || "Background";
    layer.ctx.drawImage(img, 0, 0);
    this.render();
    UI.refreshAll();
  },

  addImageAsLayer(img, name) {
    if (!this.doc) { this.fromImage(img, name); return; }
    History.record("Place image");
    const layer = this.createLayer(name || "Image");
    const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
    const scale = Math.min(1, this.doc.width / iw, this.doc.height / ih);
    const w = iw * scale, h = ih * scale;
    layer.ctx.drawImage(img, (this.doc.width - w) / 2, (this.doc.height - h) / 2, w, h);
    this.doc.layers.splice(this.doc.active + 1, 0, layer);
    this.doc.active++;
    this.render();
    UI.refreshAll();
  },

  createLayer(name, w, h) {
    w = w || this.doc.width;
    h = h || this.doc.height;
    const canvas = Utils.createCanvas(w, h);
    return {
      id: Utils.uid(),
      name,
      canvas,
      ctx: canvas.getContext("2d", { willReadFrequently: true }),
      x: 0, y: 0,
      visible: true,
      opacity: 1,
      blend: "source-over",
    };
  },

  activeLayer() {
    return this.doc ? this.doc.layers[this.doc.active] : null;
  },

  // ---- layer operations ---------------------------------------------------

  addLayer() {
    if (!this.doc) return;
    History.record("New layer");
    const layer = this.createLayer("Layer " + (this.doc.layers.length + 1));
    this.doc.layers.splice(this.doc.active + 1, 0, layer);
    this.doc.active++;
    this.render();
    UI.refreshAll();
  },

  duplicateLayer() {
    const src = this.activeLayer();
    if (!src) return;
    History.record("Duplicate layer");
    const copy = {
      ...src,
      id: Utils.uid(),
      name: src.name + " copy",
      canvas: Utils.cloneCanvas(src.canvas),
    };
    copy.ctx = copy.canvas.getContext("2d", { willReadFrequently: true });
    this.doc.layers.splice(this.doc.active + 1, 0, copy);
    this.doc.active++;
    this.render();
    UI.refreshAll();
  },

  deleteLayer() {
    if (!this.doc || this.doc.layers.length <= 1) return;
    History.record("Delete layer");
    this.doc.layers.splice(this.doc.active, 1);
    this.doc.active = Math.max(0, this.doc.active - 1);
    this.render();
    UI.refreshAll();
  },

  mergeDown() {
    if (!this.doc || this.doc.active === 0) return;
    History.record("Merge down");
    const top = this.doc.layers[this.doc.active];
    const bottom = this.doc.layers[this.doc.active - 1];
    bottom.ctx.save();
    bottom.ctx.globalAlpha = top.opacity;
    bottom.ctx.globalCompositeOperation = top.blend;
    bottom.ctx.drawImage(top.canvas, top.x - bottom.x, top.y - bottom.y);
    bottom.ctx.restore();
    this.doc.layers.splice(this.doc.active, 1);
    this.doc.active--;
    this.render();
    UI.refreshAll();
  },

  flattenImage() {
    if (!this.doc || this.doc.layers.length <= 1) return;
    History.record("Flatten");
    const flat = this.createLayer("Background");
    flat.ctx.drawImage(this.flattenToCanvas(), 0, 0);
    this.doc.layers = [flat];
    this.doc.active = 0;
    this.render();
    UI.refreshAll();
  },

  moveLayer(dir) {
    if (!this.doc) return;
    const i = this.doc.active, j = i + dir;
    if (j < 0 || j >= this.doc.layers.length) return;
    History.record("Reorder layer");
    const arr = this.doc.layers;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    this.doc.active = j;
    this.render();
    UI.refreshAll();
  },

  setActive(i) {
    if (!this.doc || i < 0 || i >= this.doc.layers.length) return;
    this.doc.active = i;
    UI.refreshLayers();
  },

  // Composite all visible layers into one document-sized canvas.
  flattenToCanvas() {
    const c = Utils.createCanvas(this.doc.width, this.doc.height);
    const ctx = c.getContext("2d");
    for (const l of this.doc.layers) {
      if (!l.visible) continue;
      ctx.globalAlpha = l.opacity;
      ctx.globalCompositeOperation = l.blend;
      ctx.drawImage(l.canvas, l.x, l.y);
    }
    return c;
  },

  // ---- text -----------------------------------------------------------------

  addTextLayer(point, opts) {
    if (!this.doc) return;
    History.record("Add text");
    const layer = this.createLayer(opts.text.split("\n")[0].slice(0, 16) || "Text");
    const ctx = layer.ctx;
    ctx.font = `${opts.italic ? "italic " : ""}${opts.bold ? "bold " : ""}${opts.size}px "${opts.family}"`;
    ctx.fillStyle = opts.color;
    ctx.textBaseline = "alphabetic";
    const lines = opts.text.split("\n");
    const lineHeight = opts.size * 1.25;
    lines.forEach((line, i) => ctx.fillText(line, point.x, point.y + i * lineHeight));
    this.doc.layers.splice(this.doc.active + 1, 0, layer);
    this.doc.active++;
    this.render();
    UI.refreshAll();
  },

  // ---- selection --------------------------------------------------------------

  selectAll() {
    if (!this.doc) return;
    this.selection = { x: 0, y: 0, w: this.doc.width, h: this.doc.height };
    this.render();
  },

  deselect() {
    this.selection = null;
    this.render();
  },

  deleteSelectionContents() {
    const layer = this.activeLayer();
    if (!layer || !this.selection) return;
    History.record("Delete selection");
    const s = Utils.roundRect(this.selection);
    layer.ctx.clearRect(s.x - layer.x, s.y - layer.y, s.w, s.h);
    this.render();
    UI.refreshLayers();
  },

  // ---- document transforms ------------------------------------------------------

  // Bake a layer's x/y offset into a document-sized bitmap (content hanging
  // outside the document is discarded). Needed before whole-doc transforms.
  bakeLayer(layer) {
    if (layer.x === 0 && layer.y === 0 &&
        layer.canvas.width === this.doc.width && layer.canvas.height === this.doc.height) return;
    const c = Utils.createCanvas(this.doc.width, this.doc.height);
    c.getContext("2d").drawImage(layer.canvas, layer.x, layer.y);
    layer.canvas = c;
    layer.ctx = c.getContext("2d", { willReadFrequently: true });
    layer.x = 0; layer.y = 0;
  },

  cropTo(rect) {
    if (!this.doc) return;
    const r = Utils.intersectRect(Utils.roundRect(rect), { x: 0, y: 0, w: this.doc.width, h: this.doc.height });
    if (!r || r.w < 1 || r.h < 1) return;
    History.record("Crop");
    for (const layer of this.doc.layers) {
      const c = Utils.createCanvas(r.w, r.h);
      c.getContext("2d").drawImage(layer.canvas, layer.x - r.x, layer.y - r.y);
      layer.canvas = c;
      layer.ctx = c.getContext("2d", { willReadFrequently: true });
      layer.x = 0; layer.y = 0;
    }
    this.doc.width = r.w;
    this.doc.height = r.h;
    this.selection = null;
    this.fitView();
    UI.refreshAll();
  },

  resizeImage(nw, nh) {
    if (!this.doc) return;
    History.record("Image size");
    for (const layer of this.doc.layers) {
      this.bakeLayer(layer);
      const c = Utils.createCanvas(nw, nh);
      const ctx = c.getContext("2d");
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(layer.canvas, 0, 0, nw, nh);
      layer.canvas = c;
      layer.ctx = c.getContext("2d", { willReadFrequently: true });
    }
    this.doc.width = nw;
    this.doc.height = nh;
    this.selection = null;
    this.fitView();
    UI.refreshAll();
  },

  resizeCanvas(nw, nh) {
    if (!this.doc) return;
    History.record("Canvas size");
    const dx = Math.round((nw - this.doc.width) / 2);
    const dy = Math.round((nh - this.doc.height) / 2);
    for (const layer of this.doc.layers) {
      this.bakeLayer(layer);
      const c = Utils.createCanvas(nw, nh);
      c.getContext("2d").drawImage(layer.canvas, dx, dy);
      layer.canvas = c;
      layer.ctx = c.getContext("2d", { willReadFrequently: true });
    }
    this.doc.width = nw;
    this.doc.height = nh;
    this.selection = null;
    this.fitView();
    UI.refreshAll();
  },

  rotate(deg) {
    if (!this.doc) return;
    History.record("Rotate");
    const w = this.doc.width, h = this.doc.height;
    const swap = deg === 90 || deg === -90;
    const nw = swap ? h : w, nh = swap ? w : h;
    for (const layer of this.doc.layers) {
      this.bakeLayer(layer);
      const c = Utils.createCanvas(nw, nh);
      const ctx = c.getContext("2d");
      ctx.translate(nw / 2, nh / 2);
      ctx.rotate(deg * Math.PI / 180);
      ctx.drawImage(layer.canvas, -w / 2, -h / 2);
      ctx.setTransform(1, 0, 0, 1, 0, 0); // the context persists on the layer — leave no transform behind
      layer.canvas = c;
      layer.ctx = c.getContext("2d", { willReadFrequently: true });
    }
    this.doc.width = nw;
    this.doc.height = nh;
    this.selection = null;
    this.fitView();
    UI.refreshAll();
  },

  flip(axis) {
    if (!this.doc) return;
    History.record("Flip");
    const w = this.doc.width, h = this.doc.height;
    for (const layer of this.doc.layers) {
      this.bakeLayer(layer);
      const c = Utils.createCanvas(w, h);
      const ctx = c.getContext("2d");
      if (axis === "h") { ctx.translate(w, 0); ctx.scale(-1, 1); }
      else { ctx.translate(0, h); ctx.scale(1, -1); }
      ctx.drawImage(layer.canvas, 0, 0);
      ctx.setTransform(1, 0, 0, 1, 0, 0); // the context persists on the layer — leave no transform behind
      layer.canvas = c;
      layer.ctx = c.getContext("2d", { willReadFrequently: true });
    }
    this.selection = null;
    this.render();
    UI.refreshAll();
  },

  // ---- view / coordinates --------------------------------------------------------

  fitView() {
    if (!this.doc) return;
    const cw = this.canvas.width, ch = this.canvas.height;
    const zoom = Math.min(1, (cw * 0.92) / this.doc.width, (ch * 0.92) / this.doc.height);
    this.view.zoom = zoom;
    this.view.panX = (cw - this.doc.width * zoom) / 2;
    this.view.panY = (ch - this.doc.height * zoom) / 2;
    this.render();
    UI.updateStatus();
  },

  setZoom(zoom, centerScreenX, centerScreenY) {
    zoom = Utils.clamp(zoom, 0.02, 32);
    const cx = centerScreenX !== undefined ? centerScreenX : this.canvas.width / 2;
    const cy = centerScreenY !== undefined ? centerScreenY : this.canvas.height / 2;
    const factor = zoom / this.view.zoom;
    this.view.panX = cx - (cx - this.view.panX) * factor;
    this.view.panY = cy - (cy - this.view.panY) * factor;
    this.view.zoom = zoom;
    this.render();
    UI.updateStatus();
  },

  // Client (CSS) coords -> canvas-pixel screen coords.
  clientToScreen(clientX, clientY) {
    const r = this.canvas.getBoundingClientRect();
    return { x: (clientX - r.left) * this.dpr, y: (clientY - r.top) * this.dpr };
  },

  screenToDoc(sx, sy) {
    return {
      x: (sx - this.view.panX) / this.view.zoom,
      y: (sy - this.view.panY) / this.view.zoom,
    };
  },

  docToScreen(dx, dy) {
    return {
      x: dx * this.view.zoom + this.view.panX,
      y: dy * this.view.zoom + this.view.panY,
    };
  },

  docToScreenRect(r) {
    const p = this.docToScreen(r.x, r.y);
    return { x: p.x, y: p.y, w: r.w * this.view.zoom, h: r.h * this.view.zoom };
  },

  // ---- rendering ------------------------------------------------------------------

  render() {
    const ctx = this.ctx, canvas = this.canvas;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#17171c";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (!this.doc) return;

    const v = this.view;
    const sx = v.panX, sy = v.panY;
    const sw = this.doc.width * v.zoom, sh = this.doc.height * v.zoom;

    // transparency checkerboard behind the document (constant checker size)
    ctx.fillStyle = this.checker;
    ctx.fillRect(sx, sy, sw, sh);

    ctx.save();
    ctx.beginPath();
    ctx.rect(sx, sy, sw, sh);
    ctx.clip();
    ctx.imageSmoothingEnabled = v.zoom < 1;
    ctx.setTransform(v.zoom, 0, 0, v.zoom, v.panX, v.panY);
    for (const layer of this.doc.layers) {
      if (!layer.visible) continue;
      ctx.globalAlpha = layer.opacity;
      ctx.globalCompositeOperation = layer.blend;
      ctx.drawImage(layer.canvas, layer.x, layer.y);
    }
    ctx.restore();

    // document border
    ctx.strokeStyle = "#4a4a55";
    ctx.lineWidth = 1;
    ctx.strokeRect(sx - 0.5, sy - 0.5, sw + 1, sh + 1);

    this.drawOverlays();
  },

  drawOverlays() {
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (this.selection) this.drawMarquee(this.selection);
    if (typeof Tools !== "undefined" && Tools.drawOverlay) Tools.drawOverlay(ctx);
  },

  drawMarquee(rectDoc) {
    const ctx = this.ctx;
    const r = this.docToScreenRect(rectDoc);
    ctx.lineWidth = 1;
    ctx.setLineDash([]);
    ctx.strokeStyle = "rgba(0,0,0,.8)";
    ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w, r.h);
    ctx.setLineDash([5, 5]);
    ctx.strokeStyle = "#fff";
    ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w, r.h);
    ctx.setLineDash([]);
  },
};
