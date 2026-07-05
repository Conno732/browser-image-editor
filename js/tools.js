"use strict";

const Tools = {
  current: "brush",
  color: "#e04f4f",
  opts: {
    size: 24,
    opacity: 100,
    softness: 0,
    tolerance: 30,
    shape: "rectangle",   // rectangle | ellipse | line
    shapeMode: "fill",    // fill | outline
    strokeWidth: 4,
  },
  cloneSource: null,      // doc coords
  cropRect: null,         // doc coords, pending crop
  state: {},              // per-gesture scratch

  set(name) {
    if (!this.defs[name]) return;
    if (this.current === "crop" && name !== "crop") this.cropRect = null;
    this.current = name;
    this.state = {};
    UI.renderToolOptions();
    UI.updateToolbar();
    UI.setHint(this.defs[name].hint || "");
    Editor.render();
  },

  down(p, e) {
    const def = this.defs[this.current];
    if (def && def.down) def.down(p, e);
  },
  move(p, e) {
    const def = this.defs[this.current];
    if (def && def.move) def.move(p, e);
  },
  up(p, e) {
    const def = this.defs[this.current];
    if (def && def.up) def.up(p, e);
  },

  cursorFor() {
    const map = {
      move: "move", hand: "grab", text: "text",
      brush: "none", eraser: "none", clone: "none",
      eyedropper: "crosshair", fill: "crosshair",
      select: "crosshair", crop: "crosshair", shape: "crosshair",
    };
    return map[this.current] || "default";
  },

  // ---- shared paint helpers ------------------------------------------------

  _local(p, layer) {
    return { x: p.x - layer.x, y: p.y - layer.y };
  },

  _clipSelection(ctx, layer) {
    if (!Editor.selection) return;
    const s = Utils.roundRect(Editor.selection);
    ctx.beginPath();
    ctx.rect(s.x - layer.x, s.y - layer.y, s.w, s.h);
    ctx.clip();
  },

  // Redraw the whole stroke each move over a snapshot so opacity stays
  // uniform (no darkening where segments overlap).
  _redrawStroke(erase) {
    const s = this.state;
    const layer = s.layer;
    const ctx = layer.ctx;
    ctx.save();
    ctx.clearRect(0, 0, layer.canvas.width, layer.canvas.height);
    ctx.drawImage(s.snapshot, 0, 0);
    this._clipSelection(ctx, layer);
    ctx.globalAlpha = this.opts.opacity / 100;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = this.opts.size;
    if (this.opts.softness > 0) {
      ctx.filter = `blur(${(this.opts.size * this.opts.softness / 200).toFixed(1)}px)`;
    }
    if (erase) {
      ctx.globalCompositeOperation = "destination-out";
      ctx.strokeStyle = "#000";
    } else {
      ctx.strokeStyle = this.color;
    }
    const pts = s.points;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    if (pts.length === 1) ctx.lineTo(pts[0].x + 0.01, pts[0].y);
    else for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.stroke();
    ctx.restore();
    Editor.render();
  },

  _startStroke(p, label) {
    const layer = Editor.activeLayer();
    if (!layer || !layer.visible) return false;
    History.record(label);
    this.state = {
      layer,
      snapshot: Utils.cloneCanvas(layer.canvas),
      points: [this._local(p, layer)],
      painting: true,
    };
    return true;
  },

  // ---- tool definitions -------------------------------------------------------

  defs: {
    move: {
      hint: "Drag to move the active layer. Arrow keys nudge.",
      down(p) {
        const layer = Editor.activeLayer();
        if (!layer) return;
        History.record("Move layer");
        Tools.state = { layer, startX: layer.x, startY: layer.y, ox: p.x, oy: p.y, moving: true };
      },
      move(p) {
        const s = Tools.state;
        if (!s.moving) return;
        s.layer.x = Math.round(s.startX + p.x - s.ox);
        s.layer.y = Math.round(s.startY + p.y - s.oy);
        Editor.render();
      },
      up() { Tools.state = {}; },
    },

    select: {
      hint: "Drag to select. Ctrl+D deselects, Del clears contents.",
      down(p) {
        Tools.state = { start: p, selecting: true };
        Editor.selection = null;
        Editor.render();
      },
      move(p) {
        const s = Tools.state;
        if (!s.selecting) return;
        const r = Utils.normalizeRect(s.start.x, s.start.y, p.x, p.y);
        Editor.selection = Utils.intersectRect(r, { x: 0, y: 0, w: Editor.doc.width, h: Editor.doc.height });
        Editor.render();
      },
      up() {
        const s = Editor.selection;
        if (s && (s.w < 2 || s.h < 2)) Editor.selection = null;
        Tools.state = {};
        Editor.render();
      },
    },

    crop: {
      hint: "Drag to frame the crop, then press Enter or Apply.",
      down(p) {
        Tools.state = { start: p, cropping: true };
        Tools.cropRect = null;
        Editor.render();
      },
      move(p) {
        const s = Tools.state;
        if (!s.cropping) return;
        const r = Utils.normalizeRect(s.start.x, s.start.y, p.x, p.y);
        Tools.cropRect = Utils.intersectRect(r, { x: 0, y: 0, w: Editor.doc.width, h: Editor.doc.height });
        Editor.render();
      },
      up() {
        Tools.state = {};
        if (Tools.cropRect && (Tools.cropRect.w < 2 || Tools.cropRect.h < 2)) Tools.cropRect = null;
        UI.renderToolOptions();
        Editor.render();
      },
    },

    brush: {
      hint: "Paint on the active layer. [ and ] change size.",
      down(p) {
        if (!Tools._startStroke(p, "Brush")) return;
        Tools._redrawStroke(false);
      },
      move(p) {
        const s = Tools.state;
        if (!s.painting) return;
        s.points.push(Tools._local(p, s.layer));
        Tools._redrawStroke(false);
      },
      up() {
        if (Tools.state.painting) UI.refreshLayers();
        Tools.state = {};
      },
    },

    eraser: {
      hint: "Erase on the active layer.",
      down(p) {
        if (!Tools._startStroke(p, "Eraser")) return;
        Tools._redrawStroke(true);
      },
      move(p) {
        const s = Tools.state;
        if (!s.painting) return;
        s.points.push(Tools._local(p, s.layer));
        Tools._redrawStroke(true);
      },
      up() {
        if (Tools.state.painting) UI.refreshLayers();
        Tools.state = {};
      },
    },

    fill: {
      hint: "Click to flood-fill with the current color.",
      down(p) {
        const layer = Editor.activeLayer();
        if (!layer) return;
        const local = Tools._local(p, layer);
        let clip = null;
        if (Editor.selection) {
          const s = Utils.roundRect(Editor.selection);
          clip = { x: s.x - layer.x, y: s.y - layer.y, w: s.w, h: s.h };
        }
        History.record("Fill");
        const changed = Filters.floodFill(layer, local.x, local.y, Tools.color, Tools.opts.tolerance, clip);
        if (!changed) History.undoStack.pop();
        Editor.render();
        UI.refreshLayers();
      },
    },

    eyedropper: {
      hint: "Click to sample a color from the image.",
      down(p) {
        if (!Editor.doc) return;
        const x = Math.floor(p.x), y = Math.floor(p.y);
        if (x < 0 || y < 0 || x >= Editor.doc.width || y >= Editor.doc.height) return;
        const flat = Editor.flattenToCanvas();
        const d = flat.getContext("2d").getImageData(x, y, 1, 1).data;
        if (d[3] === 0) return;
        Tools.color = Utils.rgbToHex(d[0], d[1], d[2]);
        UI.renderToolOptions();
      },
    },

    text: {
      hint: "Click where the text should start.",
      down(p) {
        if (!Editor.doc) return;
        UI.openTextDialog(p);
      },
    },

    shape: {
      hint: "Drag to draw a shape on the active layer. Shift keeps it square.",
      down(p) {
        if (!Tools._startStroke(p, "Shape")) return;
        Tools.state.origin = Tools.state.points[0];
      },
      move(p, e) {
        const s = Tools.state;
        if (!s.painting) return;
        const layer = s.layer;
        let cur = Tools._local(p, layer);
        if (e && e.shiftKey && Tools.opts.shape !== "line") {
          const dx = cur.x - s.origin.x, dy = cur.y - s.origin.y;
          const m = Math.max(Math.abs(dx), Math.abs(dy));
          cur = { x: s.origin.x + Math.sign(dx || 1) * m, y: s.origin.y + Math.sign(dy || 1) * m };
        }
        const ctx = layer.ctx;
        ctx.save();
        ctx.clearRect(0, 0, layer.canvas.width, layer.canvas.height);
        ctx.drawImage(s.snapshot, 0, 0);
        Tools._clipSelection(ctx, layer);
        ctx.globalAlpha = Tools.opts.opacity / 100;
        ctx.fillStyle = Tools.color;
        ctx.strokeStyle = Tools.color;
        ctx.lineWidth = Tools.opts.strokeWidth;
        const o = s.origin;
        const kind = Tools.opts.shape;
        const outline = Tools.opts.shapeMode === "outline";
        ctx.beginPath();
        if (kind === "rectangle") {
          const r = Utils.normalizeRect(o.x, o.y, cur.x, cur.y);
          ctx.rect(r.x, r.y, r.w, r.h);
        } else if (kind === "ellipse") {
          const r = Utils.normalizeRect(o.x, o.y, cur.x, cur.y);
          ctx.ellipse(r.x + r.w / 2, r.y + r.h / 2, r.w / 2, r.h / 2, 0, 0, Math.PI * 2);
        } else {
          ctx.moveTo(o.x, o.y);
          ctx.lineTo(cur.x, cur.y);
        }
        if (kind === "line" || outline) ctx.stroke();
        else ctx.fill();
        ctx.restore();
        Editor.render();
      },
      up() {
        if (Tools.state.painting) UI.refreshLayers();
        Tools.state = {};
      },
    },

    clone: {
      hint: "Alt+click to set the source, then paint to clone.",
      down(p, e) {
        if (e.altKey) {
          Tools.cloneSource = { x: p.x, y: p.y };
          UI.setHint("Clone source set. Paint to clone.");
          Editor.render();
          return;
        }
        if (!Tools.cloneSource) {
          UI.setHint("Set a clone source first: Alt+click.");
          return;
        }
        const layer = Editor.activeLayer();
        if (!layer) return;
        History.record("Clone");
        const start = Tools._local(p, layer);
        const src = Tools._local(Tools.cloneSource, layer);
        Tools.state = {
          layer,
          snapshot: Utils.cloneCanvas(layer.canvas),
          delta: { x: src.x - start.x, y: src.y - start.y },
          last: start,
          painting: true,
        };
        Tools.defs.clone._stamp(start);
      },
      move(p) {
        const s = Tools.state;
        if (!s.painting) return;
        const cur = Tools._local(p, s.layer);
        // interpolate stamps for a continuous stroke
        const dx = cur.x - s.last.x, dy = cur.y - s.last.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const step = Math.max(1, Tools.opts.size / 4);
        for (let t = step; t <= dist; t += step) {
          Tools.defs.clone._stamp({ x: s.last.x + dx * t / dist, y: s.last.y + dy * t / dist });
        }
        Tools.defs.clone._stamp(cur);
        s.last = cur;
        Editor.render();
      },
      _stamp(pt) {
        const s = Tools.state;
        const ctx = s.layer.ctx;
        ctx.save();
        Tools._clipSelection(ctx, s.layer);
        ctx.globalAlpha = Tools.opts.opacity / 100;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, Tools.opts.size / 2, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(s.snapshot, s.delta.x, s.delta.y);
        ctx.restore();
      },
      up() {
        if (Tools.state.painting) { UI.refreshLayers(); Editor.render(); }
        Tools.state = {};
      },
    },

    hand: {
      hint: "Drag to pan. Mouse wheel zooms.",
      down(p, e) {
        Tools.state = { panning: true, sx: e.clientX, sy: e.clientY, panX: Editor.view.panX, panY: Editor.view.panY };
      },
      move(p, e) {
        const s = Tools.state;
        if (!s.panning) return;
        Editor.view.panX = s.panX + (e.clientX - s.sx) * Editor.dpr;
        Editor.view.panY = s.panY + (e.clientY - s.sy) * Editor.dpr;
        Editor.render();
      },
      up() { Tools.state = {}; },
    },
  },

  applyCrop() {
    if (this.cropRect) {
      Editor.cropTo(this.cropRect);
      this.cropRect = null;
      UI.renderToolOptions();
    }
  },

  cancelCrop() {
    this.cropRect = null;
    UI.renderToolOptions();
    Editor.render();
  },

  // ---- overlays (screen space) ----------------------------------------------

  drawOverlay(ctx) {
    // pending crop: dim outside, rule-of-thirds grid inside
    if (this.current === "crop" && this.cropRect) {
      const r = Editor.docToScreenRect(this.cropRect);
      const c = Editor.canvas;
      ctx.fillStyle = "rgba(0,0,0,.55)";
      ctx.fillRect(0, 0, c.width, r.y);
      ctx.fillRect(0, r.y, r.x, r.h);
      ctx.fillRect(r.x + r.w, r.y, c.width - r.x - r.w, r.h);
      ctx.fillRect(0, r.y + r.h, c.width, c.height - r.y - r.h);
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 1;
      ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w, r.h);
      ctx.strokeStyle = "rgba(255,255,255,.35)";
      for (let i = 1; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(r.x + r.w * i / 3, r.y); ctx.lineTo(r.x + r.w * i / 3, r.y + r.h);
        ctx.moveTo(r.x, r.y + r.h * i / 3); ctx.lineTo(r.x + r.w, r.y + r.h * i / 3);
        ctx.stroke();
      }
    }

    // clone source marker
    if (this.current === "clone" && this.cloneSource) {
      const p = Editor.docToScreen(this.cloneSource.x, this.cloneSource.y);
      ctx.strokeStyle = "#4f8fe0";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(p.x - 6, p.y); ctx.lineTo(p.x + 6, p.y);
      ctx.moveTo(p.x, p.y - 6); ctx.lineTo(p.x, p.y + 6);
      ctx.stroke();
    }

    // brush size cursor
    if (["brush", "eraser", "clone"].includes(this.current) && Editor.pointer.over) {
      const radius = (this.opts.size / 2) * Editor.view.zoom;
      ctx.lineWidth = 1;
      ctx.strokeStyle = "rgba(0,0,0,.8)";
      ctx.beginPath();
      ctx.arc(Editor.pointer.sx, Editor.pointer.sy, Math.max(1, radius), 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = "rgba(255,255,255,.8)";
      ctx.beginPath();
      ctx.arc(Editor.pointer.sx, Editor.pointer.sy, Math.max(1, radius) + 1, 0, Math.PI * 2);
      ctx.stroke();
    }
  },
};
