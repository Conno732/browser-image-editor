"use strict";

const UI = {

  // ---- toolbar icon set (inline SVG) ------------------------------------

  icons: {
    move: '<path d="M12 3v18M3 12h18M12 3l-2.5 2.5M12 3l2.5 2.5M12 21l-2.5-2.5M12 21l2.5-2.5M3 12l2.5-2.5M3 12l2.5 2.5M21 12l-2.5-2.5M21 12l-2.5 2.5"/>',
    select: '<rect x="4" y="5" width="16" height="14" stroke-dasharray="3 3"/>',
    crop: '<path d="M7 3v14h14M3 7h14v14"/>',
    brush: '<path d="M15 4l5 5-8 8c-1.5 1.5-4.5 2-8 3 1-3.5 1.5-6.5 3-8z"/>',
    eraser: '<path d="M15 5l5 5-9 9H7l-3-3 11-11zM4 20h16"/>',
    fill: '<path d="M12 4L5 11l7 7 7-7zM12 4V2"/><path d="M20 14c1 1.5 1.6 2.6 1.6 3.5a1.6 1.6 0 11-3.2 0c0-.9.6-2 1.6-3.5z"/>',
    eyedropper: '<path d="M4 20l1-4 8-8 3 3-8 8zM13 6l2-2a2.1 2.1 0 013 3l-2 2z"/>',
    text: '<path d="M5 6V4h14v2M12 4v16M9 20h6"/>',
    shape: '<rect x="3" y="3" width="10" height="10"/><circle cx="15.5" cy="15.5" r="5.5"/>',
    clone: '<rect x="5" y="11" width="14" height="8" rx="1"/><path d="M8 11V8a4 4 0 018 0v3"/>',
    smudge: '<path d="M4 18c3 0 4-2 5-5s2-6 6-6c3 0 5 2 5 5"/><circle cx="5" cy="18" r="2"/>',
    blur: '<path d="M12 3c3.5 4.5 6 7.8 6 10.5a6 6 0 11-12 0C6 10.8 8.5 7.5 12 3z"/>',
    dodge: '<circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9L17 7M7 17l-2.1 2.1"/>',
    hand: '<path d="M8 12V6a1.5 1.5 0 013 0v5V4.5a1.5 1.5 0 013 0V11V7a1.5 1.5 0 013 0v6.5l1.5-1.5a1.5 1.5 0 012 2L17 18c-1 1.7-2.5 2.5-4.5 2.5S8.5 19 8 17z"/>',
  },

  toolOrder: ["move", "select", "crop", "brush", "eraser", "fill", "smudge", "blur", "dodge", "eyedropper", "text", "shape", "clone", "hand"],
  toolNames: {
    move: "Move (V)", select: "Select (M)", crop: "Crop (C)", brush: "Brush (B)",
    eraser: "Eraser (E)", fill: "Fill (G)", eyedropper: "Eyedropper (I)",
    text: "Text (T)", shape: "Shape (U)", clone: "Clone Stamp (S)", hand: "Hand (H)",
    smudge: "Smudge (K)", blur: "Blur (R)", dodge: "Dodge / Burn / Sponge (O)",
  },

  init() {
    this.buildMenus();
    this.buildToolbar();
    this.wireLayerPanel();
    this.wireDialogs();
    this.wireZoomControls();
    this.renderToolOptions();
    this.refreshAll();
  },

  // ---- menus ----------------------------------------------------------------

  menuConfig() {
    return [
      { label: "File", items: [
        { label: "New…", shortcut: "Ctrl+N", action: () => UI.show("dlg-new") },
        { label: "Open Image…", shortcut: "Ctrl+O", action: () => document.getElementById("file-input").click() },
        { sep: true },
        { label: "Save Project", shortcut: "Ctrl+S", action: () => UI.saveProject() },
        { label: "Save Project As…", action: () => UI.show("dlg-save") },
        { label: "Projects…", action: () => UI.openProjectsDialog() },
        { sep: true },
        { label: "Export…", shortcut: "Ctrl+E", action: () => UI.openExportDialog() },
      ]},
      { label: "Edit", items: [
        { label: "Undo", shortcut: "Ctrl+Z", action: () => History.undo() },
        { label: "Redo", shortcut: "Ctrl+Shift+Z", action: () => History.redo() },
        { sep: true },
        { label: "Select All", shortcut: "Ctrl+A", action: () => Editor.selectAll() },
        { label: "Deselect", shortcut: "Ctrl+D", action: () => Editor.deselect() },
        { label: "Delete Selection", shortcut: "Del", action: () => Editor.deleteSelectionContents() },
      ]},
      { label: "Image", items: [
        { label: "Image Size…", action: () => UI.openResizeDialog() },
        { label: "Canvas Size…", action: () => UI.openCanvasDialog() },
        { label: "Crop to Selection", action: () => Editor.selection && Editor.cropTo(Editor.selection) },
        { sep: true },
        { label: "Rotate 90° CW", action: () => Editor.rotate(90) },
        { label: "Rotate 90° CCW", action: () => Editor.rotate(-90) },
        { label: "Rotate 180°", action: () => Editor.rotate(180) },
        { label: "Flip Horizontal", action: () => Editor.flip("h") },
        { label: "Flip Vertical", action: () => Editor.flip("v") },
      ]},
      { label: "Layer", items: [
        { label: "New Layer", action: () => Editor.addLayer() },
        { label: "Duplicate Layer", shortcut: "Ctrl+J", action: () => Editor.duplicateLayer() },
        { label: "Delete Layer", action: () => Editor.deleteLayer() },
        { sep: true },
        { label: "Merge Down", action: () => Editor.mergeDown() },
        { label: "Flatten Image", action: () => Editor.flattenImage() },
        { sep: true },
        { label: "Move Up", action: () => Editor.moveLayer(1) },
        { label: "Move Down", action: () => Editor.moveLayer(-1) },
      ]},
      { label: "Adjust", items: [
        { label: "Brightness / Contrast…", action: () => UI.openFilterDialog("brightness-contrast") },
        { label: "Levels…", action: () => UI.openFilterDialog("levels") },
        { label: "Hue / Saturation…", action: () => UI.openFilterDialog("hue-saturation") },
        { label: "Temperature / Tint…", action: () => UI.openFilterDialog("temperature") },
        { label: "Exposure / Gamma…", action: () => UI.openFilterDialog("exposure") },
        { label: "Vibrance…", action: () => UI.openFilterDialog("vibrance") },
        { label: "Auto Contrast", action: () => Filters.applyDirect("auto-contrast") },
        { sep: true },
        { label: "Invert", shortcut: "Ctrl+I", action: () => Filters.applyDirect("invert") },
        { label: "Grayscale", action: () => Filters.applyDirect("grayscale") },
        { label: "Sepia", action: () => Filters.applyDirect("sepia") },
        { label: "Solarize", action: () => Filters.applyDirect("solarize") },
        { label: "Gradient Map…", action: () => UI.openFilterDialog("gradient-map") },
        { sep: true },
        { label: "Posterize…", action: () => UI.openFilterDialog("posterize") },
        { label: "Threshold…", action: () => UI.openFilterDialog("threshold") },
      ]},
      { label: "Filter", items: [
        { label: "Gaussian Blur…", action: () => UI.openFilterDialog("blur") },
        { label: "Motion Blur…", action: () => UI.openFilterDialog("motion-blur") },
        { label: "Sharpen…", action: () => UI.openFilterDialog("sharpen") },
        { label: "Glow…", action: () => UI.openFilterDialog("glow") },
        { sep: true },
        { label: "Pixelate…", action: () => UI.openFilterDialog("pixelate") },
        { label: "Noise…", action: () => UI.openFilterDialog("noise") },
        { label: "Vignette…", action: () => UI.openFilterDialog("vignette") },
        { label: "Twirl…", action: () => UI.openFilterDialog("twirl") },
        { sep: true },
        { label: "Emboss", action: () => Filters.applyDirect("emboss") },
        { label: "Edge Detect", action: () => Filters.applyDirect("edge") },
      ]},
      { label: "Help", items: [
        { label: "About & Shortcuts", action: () => UI.show("dlg-about") },
      ]},
    ];
  },

  buildMenus() {
    const nav = document.getElementById("menus");
    for (const menu of this.menuConfig()) {
      const wrap = document.createElement("div");
      wrap.className = "menu";
      const btn = document.createElement("button");
      btn.textContent = menu.label;
      const drop = document.createElement("div");
      drop.className = "menu-drop";
      for (const item of menu.items) {
        if (item.sep) {
          const sep = document.createElement("div");
          sep.className = "menu-sep";
          drop.appendChild(sep);
          continue;
        }
        const el = document.createElement("button");
        el.className = "menu-item";
        el.innerHTML = `<span>${item.label}</span>` +
          (item.shortcut ? `<span class="shortcut">${item.shortcut}</span>` : "");
        el.addEventListener("click", () => { UI.closeMenus(); item.action(); });
        drop.appendChild(el);
      }
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const wasOpen = wrap.classList.contains("open");
        UI.closeMenus();
        if (!wasOpen) wrap.classList.add("open");
      });
      btn.addEventListener("mouseenter", () => {
        if (document.querySelector(".menu.open")) {
          UI.closeMenus();
          wrap.classList.add("open");
        }
      });
      wrap.appendChild(btn);
      wrap.appendChild(drop);
      nav.appendChild(wrap);
    }
    document.addEventListener("click", () => UI.closeMenus());
  },

  closeMenus() {
    document.querySelectorAll(".menu.open").forEach(m => m.classList.remove("open"));
    this.closeContextMenu();
  },

  // ---- right-click context menu ------------------------------------------

  openContextMenu(clientX, clientY) {
    this.closeContextMenu();
    if (!Editor.doc) return;
    const menu = document.createElement("div");
    menu.className = "menu-drop context-menu";

    const add = (label, action) => {
      const el = document.createElement("button");
      el.className = "menu-item";
      el.innerHTML = `<span>${label}</span>`;
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        UI.closeContextMenu();
        action();
      });
      menu.appendChild(el);
    };
    const sep = () => {
      const el = document.createElement("div");
      el.className = "menu-sep";
      menu.appendChild(el);
    };

    if (Editor.selection) {
      add("Deselect", () => Editor.deselect());
      add("Fill Selection", () => UI.fillSelection());
      add("Delete Selection", () => Editor.deleteSelectionContents());
      add("Crop to Selection", () => Editor.cropTo(Editor.selection));
    } else {
      add("Select All", () => Editor.selectAll());
    }
    sep();
    add("New Layer", () => Editor.addLayer());
    add("Duplicate Layer", () => Editor.duplicateLayer());
    add("Delete Layer", () => Editor.deleteLayer());
    add("Merge Down", () => Editor.mergeDown());
    sep();
    add("Undo", () => History.undo());
    add("Redo", () => History.redo());
    sep();
    add("Fit View", () => Editor.fitView());
    add("Zoom 100%", () => Editor.setZoom(1));

    document.body.appendChild(menu);
    const x = Math.min(clientX, window.innerWidth - menu.offsetWidth - 6);
    const y = Math.min(clientY, window.innerHeight - menu.offsetHeight - 6);
    menu.style.left = Math.max(0, x) + "px";
    menu.style.top = Math.max(0, y) + "px";
  },

  closeContextMenu() {
    document.querySelectorAll(".context-menu").forEach(m => m.remove());
  },

  fillSelection() {
    const layer = Editor.activeLayer();
    if (!layer || !Editor.selection) return;
    History.record("Fill selection");
    const s = Utils.roundRect(Editor.selection);
    layer.ctx.fillStyle = Tools.color;
    layer.ctx.fillRect(s.x - layer.x, s.y - layer.y, s.w, s.h);
    Editor.render();
    UI.refreshLayers();
  },

  // ---- toolbar ---------------------------------------------------------------

  buildToolbar() {
    const bar = document.getElementById("toolbar");
    for (const name of this.toolOrder) {
      const btn = document.createElement("button");
      btn.className = "tool-btn";
      btn.dataset.tool = name;
      btn.title = this.toolNames[name];
      btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${this.icons[name]}</svg>`;
      btn.addEventListener("click", () => Tools.set(name));
      bar.appendChild(btn);
    }
    this.updateToolbar();
  },

  updateToolbar() {
    document.querySelectorAll(".tool-btn").forEach(b =>
      b.classList.toggle("active", b.dataset.tool === Tools.current));
    Editor.canvas.style.cursor = Tools.cursorFor();
  },

  // ---- tool options bar --------------------------------------------------------

  renderToolOptions() {
    const bar = document.getElementById("tool-options");
    bar.innerHTML = "";
    const t = Tools.current;

    const addColor = () => {
      const label = document.createElement("label");
      label.innerHTML = `Color <input type="color" value="${Tools.color}">`;
      label.querySelector("input").addEventListener("input", e => { Tools.color = e.target.value; });
      bar.appendChild(label);
    };
    const addSlider = (text, key, min, max) => {
      const label = document.createElement("label");
      label.innerHTML = `${text} <input type="range" min="${min}" max="${max}" value="${Tools.opts[key]}"><span class="val">${Tools.opts[key]}</span>`;
      const input = label.querySelector("input");
      const val = label.querySelector(".val");
      input.addEventListener("input", e => {
        Tools.opts[key] = +e.target.value;
        val.textContent = e.target.value;
        Editor.render();
      });
      bar.appendChild(label);
    };
    const addSelect = (text, key, options) => {
      const label = document.createElement("label");
      label.innerHTML = `${text} <select>${options.map(o => `<option value="${o[0]}"${Tools.opts[key] === o[0] ? " selected" : ""}>${o[1]}</option>`).join("")}</select>`;
      label.querySelector("select").addEventListener("change", e => { Tools.opts[key] = e.target.value; });
      bar.appendChild(label);
    };
    const addHint = (text) => {
      const span = document.createElement("span");
      span.className = "hint";
      span.textContent = text;
      bar.appendChild(span);
    };
    const addButton = (text, fn, primary) => {
      const btn = document.createElement("button");
      if (primary) btn.className = "primary";
      btn.textContent = text;
      btn.addEventListener("click", fn);
      bar.appendChild(btn);
      return btn;
    };

    if (t === "brush") {
      addColor();
      addSlider("Size", "size", 1, 300);
      addSlider("Opacity", "opacity", 1, 100);
      addSlider("Softness", "softness", 0, 100);
    } else if (t === "eraser") {
      addSlider("Size", "size", 1, 300);
      addSlider("Opacity", "opacity", 1, 100);
      addSlider("Softness", "softness", 0, 100);
    } else if (t === "fill") {
      addColor();
      addSlider("Tolerance", "tolerance", 0, 255);
    } else if (t === "shape") {
      addColor();
      addSelect("Shape", "shape", [["rectangle", "Rectangle"], ["ellipse", "Ellipse"], ["line", "Line"]]);
      addSelect("Mode", "shapeMode", [["fill", "Fill"], ["outline", "Outline"]]);
      addSlider("Stroke", "strokeWidth", 1, 100);
      addSlider("Opacity", "opacity", 1, 100);
    } else if (t === "clone") {
      addSlider("Size", "size", 1, 300);
      addSlider("Opacity", "opacity", 1, 100);
      addHint("Alt+click sets the source point");
    } else if (t === "smudge") {
      addSlider("Size", "size", 1, 300);
      addSlider("Strength", "strength", 1, 100);
    } else if (t === "blur") {
      addSlider("Size", "size", 1, 300);
      addSlider("Strength", "strength", 1, 100);
    } else if (t === "dodge") {
      addSelect("Mode", "dodgeMode", [["dodge", "Dodge (lighten)"], ["burn", "Burn (darken)"], ["sponge", "Sponge (desaturate)"]]);
      addSlider("Size", "size", 1, 300);
      addSlider("Exposure", "exposure", 1, 100);
    } else if (t === "crop") {
      const apply = addButton("Apply Crop", () => Tools.applyCrop(), true);
      apply.disabled = !Tools.cropRect;
      addButton("Cancel", () => Tools.cancelCrop());
      if (Tools.cropRect) addHint(`${Math.round(Tools.cropRect.w)} × ${Math.round(Tools.cropRect.h)} px — Enter to apply`);
      else addHint("Drag on the canvas to frame the crop");
    } else if (t === "text") {
      addHint("Click on the canvas to place text");
    } else if (t === "select") {
      addButton("Deselect", () => Editor.deselect());
      addButton("Select All", () => Editor.selectAll());
      addHint("Drag to select — filters and fills respect the selection");
    } else if (t === "eyedropper") {
      addColor();
    } else if (t === "move") {
      addHint("Drag to move the active layer");
    } else if (t === "hand") {
      addHint("Drag to pan");
    }
  },

  // ---- layers panel ---------------------------------------------------------------

  wireLayerPanel() {
    document.getElementById("lb-add").addEventListener("click", () => Editor.addLayer());
    document.getElementById("lb-dup").addEventListener("click", () => Editor.duplicateLayer());
    document.getElementById("lb-del").addEventListener("click", () => Editor.deleteLayer());
    document.getElementById("lb-merge").addEventListener("click", () => Editor.mergeDown());
    document.getElementById("lb-up").addEventListener("click", () => Editor.moveLayer(1));
    document.getElementById("lb-down").addEventListener("click", () => Editor.moveLayer(-1));

    const blend = document.getElementById("blend-mode");
    blend.addEventListener("change", () => {
      const layer = Editor.activeLayer();
      if (!layer) return;
      History.record("Blend mode");
      layer.blend = blend.value;
      Editor.render();
    });

    const opacity = document.getElementById("layer-opacity");
    let opacityGestureRecorded = false;
    opacity.addEventListener("input", () => {
      const layer = Editor.activeLayer();
      if (!layer) return;
      if (!opacityGestureRecorded) { History.record("Layer opacity"); opacityGestureRecorded = true; }
      layer.opacity = opacity.value / 100;
      document.getElementById("layer-opacity-val").textContent = opacity.value + "%";
      Editor.render();
    });
    opacity.addEventListener("change", () => { opacityGestureRecorded = false; });
  },

  refreshLayers() {
    const list = document.getElementById("layers");
    list.innerHTML = "";
    if (!Editor.doc) return;
    const layers = Editor.doc.layers;
    for (let i = layers.length - 1; i >= 0; i--) {
      const layer = layers[i];
      const row = document.createElement("div");
      row.className = "layer-row" + (i === Editor.doc.active ? " active" : "");

      const eye = document.createElement("button");
      eye.className = "eye" + (layer.visible ? "" : " off");
      eye.textContent = "👁";
      eye.title = "Toggle visibility";
      eye.addEventListener("click", (e) => {
        e.stopPropagation();
        layer.visible = !layer.visible;
        Editor.render();
        UI.refreshLayers();
      });

      const thumb = document.createElement("canvas");
      thumb.className = "layer-thumb";
      thumb.width = 44; thumb.height = 34;
      const tctx = thumb.getContext("2d");
      const scale = Math.min(44 / layer.canvas.width, 34 / layer.canvas.height);
      const tw = layer.canvas.width * scale, th = layer.canvas.height * scale;
      tctx.drawImage(layer.canvas, (44 - tw) / 2, (34 - th) / 2, tw, th);

      const name = document.createElement("span");
      name.className = "layer-name";
      name.textContent = layer.name;
      name.title = "Double-click to rename";
      name.addEventListener("dblclick", () => {
        const newName = prompt("Layer name:", layer.name);
        if (newName) { layer.name = newName.trim(); UI.refreshLayers(); }
      });

      row.appendChild(eye);
      row.appendChild(thumb);
      row.appendChild(name);
      row.addEventListener("click", () => Editor.setActive(i));
      list.appendChild(row);
    }

    const active = Editor.activeLayer();
    if (active) {
      document.getElementById("blend-mode").value = active.blend;
      const op = Math.round(active.opacity * 100);
      document.getElementById("layer-opacity").value = op;
      document.getElementById("layer-opacity-val").textContent = op + "%";
    }
  },

  // ---- status bar / title ------------------------------------------------------------

  updateStatus() {
    const doc = Editor.doc;
    document.getElementById("status-doc").textContent = doc ? `${doc.width} × ${doc.height} px` : "";
    document.getElementById("zoom-level").textContent = Math.round(Editor.view.zoom * 100) + "%";
  },

  updatePos() {
    const p = Editor.pointer;
    document.getElementById("status-pos").textContent =
      p.over ? `${Math.floor(p.x)}, ${Math.floor(p.y)}` : "";
  },

  setHint(text) {
    document.getElementById("status-hint").textContent = text;
  },

  updateTitle() {
    document.getElementById("doc-title").textContent =
      (Editor.projectName || "Untitled") + (Editor.doc ? ` — ${Editor.doc.width}×${Editor.doc.height}` : "");
  },

  refreshAll() {
    this.refreshLayers();
    this.updateStatus();
    this.updateTitle();
    Editor.render();
  },

  // ---- zoom controls -------------------------------------------------------------------

  wireZoomControls() {
    document.getElementById("zoom-in").addEventListener("click", () => Editor.setZoom(Editor.view.zoom * 1.25));
    document.getElementById("zoom-out").addEventListener("click", () => Editor.setZoom(Editor.view.zoom / 1.25));
    document.getElementById("zoom-level").addEventListener("click", () => Editor.setZoom(1));
    document.getElementById("zoom-fit").addEventListener("click", () => Editor.fitView());
  },

  // ---- dialogs ---------------------------------------------------------------------------

  show(id) { document.getElementById(id).showModal(); },

  wireDialogs() {
    document.querySelectorAll("dialog .dlg-cancel").forEach(btn =>
      btn.addEventListener("click", () => btn.closest("dialog").close()));

    // New
    document.getElementById("new-ok").addEventListener("click", () => {
      const w = Utils.clamp(+document.getElementById("new-width").value || 1280, 1, 8000);
      const h = Utils.clamp(+document.getElementById("new-height").value || 800, 1, 8000);
      Editor.newDocument(w, h, document.getElementById("new-bg").value);
      document.getElementById("dlg-new").close();
    });
    document.getElementById("new-open-image").addEventListener("click", () => {
      document.getElementById("dlg-new").close();
      document.getElementById("file-input").click();
    });

    // Image size (aspect-linked)
    const rsW = document.getElementById("rs-width");
    const rsH = document.getElementById("rs-height");
    rsW.addEventListener("input", () => {
      if (document.getElementById("rs-aspect").checked && Editor.doc) {
        rsH.value = Math.max(1, Math.round(rsW.value * Editor.doc.height / Editor.doc.width));
      }
    });
    rsH.addEventListener("input", () => {
      if (document.getElementById("rs-aspect").checked && Editor.doc) {
        rsW.value = Math.max(1, Math.round(rsH.value * Editor.doc.width / Editor.doc.height));
      }
    });
    document.getElementById("rs-ok").addEventListener("click", () => {
      const w = Utils.clamp(+rsW.value || 1, 1, 8000);
      const h = Utils.clamp(+rsH.value || 1, 1, 8000);
      Editor.resizeImage(w, h);
      document.getElementById("dlg-resize").close();
    });

    // Canvas size
    document.getElementById("cs-ok").addEventListener("click", () => {
      const w = Utils.clamp(+document.getElementById("cs-width").value || 1, 1, 8000);
      const h = Utils.clamp(+document.getElementById("cs-height").value || 1, 1, 8000);
      Editor.resizeCanvas(w, h);
      document.getElementById("dlg-canvas").close();
    });

    // Text
    document.getElementById("text-ok").addEventListener("click", () => {
      const text = document.getElementById("text-input").value;
      if (text.trim() && this._textPoint) {
        Editor.addTextLayer(this._textPoint, {
          text,
          size: Utils.clamp(+document.getElementById("text-size").value || 48, 6, 500),
          family: document.getElementById("text-font").value,
          color: document.getElementById("text-color").value,
          bold: document.getElementById("text-bold").checked,
          italic: document.getElementById("text-italic").checked,
        });
      }
      document.getElementById("dlg-text").close();
    });

    // Export
    const fmt = document.getElementById("export-format");
    const qRow = document.getElementById("export-quality-row");
    const q = document.getElementById("export-quality");
    fmt.addEventListener("change", () => { qRow.style.display = fmt.value === "image/png" ? "none" : "flex"; });
    q.addEventListener("input", () => { document.getElementById("export-quality-val").textContent = q.value; });
    document.getElementById("export-ok").addEventListener("click", () => {
      if (!Editor.doc) return;
      const mime = fmt.value;
      const flat = Editor.flattenToCanvas();
      let out = flat;
      if (mime === "image/jpeg") {
        out = Utils.createCanvas(flat.width, flat.height);
        const ctx = out.getContext("2d");
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, out.width, out.height);
        ctx.drawImage(flat, 0, 0);
      }
      const ext = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" }[mime];
      const name = (document.getElementById("export-name").value.trim() || "image") + "." + ext;
      Utils.downloadDataURL(out.toDataURL(mime, q.value / 100), name);
      document.getElementById("dlg-export").close();
    });

    // Save project
    document.getElementById("save-ok").addEventListener("click", async () => {
      const name = document.getElementById("save-name").value.trim();
      if (!name) return;
      try {
        await Storage.save(name);
        Editor.projectName = name;
        UI.updateTitle();
        UI.setHint(`Saved "${name}"`);
      } catch (err) {
        UI.setHint("Save failed: " + err.message);
      }
      document.getElementById("dlg-save").close();
    });
  },

  openTextDialog(point) {
    this._textPoint = point;
    document.getElementById("text-input").value = "";
    this.show("dlg-text");
    document.getElementById("text-input").focus();
  },

  openResizeDialog() {
    if (!Editor.doc) return;
    document.getElementById("rs-width").value = Editor.doc.width;
    document.getElementById("rs-height").value = Editor.doc.height;
    this.show("dlg-resize");
  },

  openCanvasDialog() {
    if (!Editor.doc) return;
    document.getElementById("cs-width").value = Editor.doc.width;
    document.getElementById("cs-height").value = Editor.doc.height;
    this.show("dlg-canvas");
  },

  openExportDialog() {
    if (!Editor.doc) return;
    document.getElementById("export-name").value = Editor.projectName || "image";
    document.getElementById("export-quality-row").style.display =
      document.getElementById("export-format").value === "image/png" ? "none" : "flex";
    this.show("dlg-export");
  },

  saveProject() {
    if (!Editor.doc) return;
    if (Editor.projectName) {
      Storage.save(Editor.projectName)
        .then(() => UI.setHint(`Saved "${Editor.projectName}"`))
        .catch(err => UI.setHint("Save failed: " + err.message));
    } else {
      this.show("dlg-save");
    }
  },

  async openProjectsDialog() {
    const list = document.getElementById("projects-list");
    list.innerHTML = "<p class='note'>Loading…</p>";
    this.show("dlg-projects");
    let projects = [];
    try {
      projects = await Storage.list();
    } catch (err) {
      list.innerHTML = `<p class='note'>Could not read projects: ${err.message}</p>`;
      return;
    }
    if (!projects.length) {
      list.innerHTML = "<p class='note'>No saved projects yet. Use File → Save Project.</p>";
      return;
    }
    list.innerHTML = "";
    for (const p of projects) {
      const row = document.createElement("div");
      row.className = "project-row";
      row.innerHTML = `<span class="pname">${p.name}</span>
        <span class="pmeta">${p.width}×${p.height} • ${p.layerCount} layer${p.layerCount === 1 ? "" : "s"} • ${Utils.formatDate(p.updated)}</span>`;
      const loadBtn = document.createElement("button");
      loadBtn.textContent = "Load";
      loadBtn.addEventListener("click", async () => {
        try {
          await Storage.load(p.name);
          document.getElementById("dlg-projects").close();
        } catch (err) {
          UI.setHint("Load failed: " + err.message);
        }
      });
      const delBtn = document.createElement("button");
      delBtn.className = "danger";
      delBtn.textContent = "Delete";
      delBtn.addEventListener("click", async () => {
        if (!confirm(`Delete project "${p.name}"?`)) return;
        await Storage.remove(p.name);
        UI.openProjectsDialog();
      });
      row.appendChild(loadBtn);
      row.appendChild(delBtn);
      list.appendChild(row);
    }
  },

  // ---- parametric filter dialog with live preview -------------------------------------------

  openFilterDialog(key) {
    const def = Filters.defs[key];
    const layer = Editor.activeLayer();
    if (!def || !layer) return;
    const region = Filters.layerRegion(layer, Editor.selection);
    if (!region) { UI.setHint("Selection does not overlap the active layer."); return; }

    const original = layer.ctx.getImageData(region.x, region.y, region.w, region.h);
    const values = {};
    def.params.forEach(p => { values[p.k] = p.v; });

    document.getElementById("filter-title").textContent = def.title;
    const paramsEl = document.getElementById("filter-params");
    paramsEl.innerHTML = "";

    let raf = 0;
    const preview = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const copy = new ImageData(new Uint8ClampedArray(original.data), original.width, original.height);
        const out = def.fn(copy, values) || copy;
        layer.ctx.putImageData(out, region.x, region.y);
        Editor.render();
      });
    };

    for (const p of def.params) {
      const row = document.createElement("div");
      row.className = "filter-param";
      if (p.type === "color") {
        row.innerHTML = `<span class="lbl">${p.label}</span><input type="color" value="${p.v}">`;
        row.querySelector("input").addEventListener("input", (e) => {
          values[p.k] = e.target.value;
          preview();
        });
      } else {
        row.innerHTML = `<span class="lbl">${p.label}</span>
          <input type="range" min="${p.min}" max="${p.max}" step="${p.step}" value="${p.v}">
          <span class="val">${p.v}</span>`;
        const input = row.querySelector("input");
        const val = row.querySelector(".val");
        input.addEventListener("input", () => {
          values[p.k] = +input.value;
          val.textContent = input.value;
          preview();
        });
      }
      paramsEl.appendChild(row);
    }

    const dlg = document.getElementById("dlg-filter");
    const okBtn = document.getElementById("filter-ok");
    const cancelBtn = document.getElementById("filter-cancel");

    const cleanup = () => {
      okBtn.onclick = null;
      cancelBtn.onclick = null;
      dlg.oncancel = null;
    };
    const restoreOriginal = () => {
      layer.ctx.putImageData(original, region.x, region.y);
      Editor.render();
    };

    okBtn.onclick = () => {
      cancelAnimationFrame(raf);
      restoreOriginal();                 // put back pristine pixels…
      History.record(def.title);         // …record them…
      const copy = new ImageData(new Uint8ClampedArray(original.data), original.width, original.height);
      const out = def.fn(copy, values) || copy;
      layer.ctx.putImageData(out, region.x, region.y);   // …then apply for real
      Editor.render();
      UI.refreshLayers();
      cleanup();
      dlg.close();
    };
    cancelBtn.onclick = () => {
      cancelAnimationFrame(raf);
      restoreOriginal();
      cleanup();
      dlg.close();
    };
    dlg.oncancel = () => {               // Esc key
      cancelAnimationFrame(raf);
      restoreOriginal();
      cleanup();
    };

    preview();
    dlg.showModal();
  },
};
