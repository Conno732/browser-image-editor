"use strict";

(function () {
  const canvas = document.getElementById("view");
  Editor.init(canvas);
  UI.init();
  Tools.set("brush");
  Editor.newDocument(1280, 800, "#ffffff");

  let spaceHeld = false;
  let panDrag = null;   // {sx, sy, panX, panY}
  let pointerDown = false;

  // ---- pointer -----------------------------------------------------------

  canvas.addEventListener("pointerdown", (e) => {
    if (document.querySelector(".context-menu")) {
      UI.closeContextMenu();
      return; // the click that dismisses the menu shouldn't also paint
    }
    if (e.button !== 0 && e.button !== 1) return;
    canvas.setPointerCapture(e.pointerId);
    const s = Editor.clientToScreen(e.clientX, e.clientY);
    if (spaceHeld || e.button === 1) {
      panDrag = { sx: e.clientX, sy: e.clientY, panX: Editor.view.panX, panY: Editor.view.panY };
      canvas.style.cursor = "grabbing";
      e.preventDefault();
      return;
    }
    if (!Editor.doc) return;
    pointerDown = true;
    Tools.down(Editor.screenToDoc(s.x, s.y), e);
  });

  canvas.addEventListener("pointermove", (e) => {
    const s = Editor.clientToScreen(e.clientX, e.clientY);
    const p = Editor.screenToDoc(s.x, s.y);
    Editor.pointer = { x: p.x, y: p.y, sx: s.x, sy: s.y, over: true };
    UI.updatePos();

    if (panDrag) {
      Editor.view.panX = panDrag.panX + (e.clientX - panDrag.sx) * Editor.dpr;
      Editor.view.panY = panDrag.panY + (e.clientY - panDrag.sy) * Editor.dpr;
      Editor.render();
      return;
    }
    if (pointerDown && Editor.doc) {
      Tools.move(p, e);
    } else if (Tools.brushLike.includes(Tools.current)) {
      Editor.render(); // keep brush cursor circle tracking
    }
  });

  canvas.addEventListener("pointerup", (e) => {
    if (panDrag) {
      panDrag = null;
      canvas.style.cursor = spaceHeld ? "grab" : Tools.cursorFor();
      return;
    }
    if (!pointerDown) return;
    pointerDown = false;
    const s = Editor.clientToScreen(e.clientX, e.clientY);
    Tools.up(Editor.screenToDoc(s.x, s.y), e);
  });

  canvas.addEventListener("pointerleave", () => {
    Editor.pointer.over = false;
    UI.updatePos();
    Editor.render();
  });

  canvas.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    UI.openContextMenu(e.clientX, e.clientY);
  });

  // ---- wheel zoom -----------------------------------------------------------

  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    if (!Editor.doc) return;
    const s = Editor.clientToScreen(e.clientX, e.clientY);
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    Editor.setZoom(Editor.view.zoom * factor, s.x, s.y);
  }, { passive: false });

  // ---- resize ------------------------------------------------------------------

  new ResizeObserver(() => Editor.resizeView()).observe(canvas.parentElement);

  // ---- file open ------------------------------------------------------------------

  async function openFiles(files) {
    for (const file of files) {
      if (!file.type.startsWith("image/")) continue;
      try {
        const img = await Utils.loadImageFromFile(file);
        const name = file.name.replace(/\.[^.]+$/, "");
        Editor.addImageAsLayer(img, name);
      } catch (err) {
        UI.setHint("Could not open " + file.name);
      }
    }
  }

  document.getElementById("file-input").addEventListener("change", (e) => {
    openFiles([...e.target.files]);
    e.target.value = "";
  });

  window.addEventListener("dragover", (e) => e.preventDefault());
  window.addEventListener("drop", (e) => {
    e.preventDefault();
    if (e.dataTransfer.files.length) openFiles([...e.dataTransfer.files]);
  });

  document.addEventListener("paste", (e) => {
    const items = [...(e.clipboardData?.items || [])];
    const imageItem = items.find(i => i.type.startsWith("image/"));
    if (imageItem) {
      e.preventDefault();
      openFiles([imageItem.getAsFile()]);
    }
  });

  // ---- keyboard ---------------------------------------------------------------------

  function inTextField() {
    const el = document.activeElement;
    return el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" ||
                  document.querySelector("dialog[open]"));
  }

  window.addEventListener("keydown", (e) => {
    if (e.code === "Space" && !inTextField()) {
      if (!spaceHeld) {
        spaceHeld = true;
        if (!panDrag) canvas.style.cursor = "grab";
      }
      e.preventDefault();
      return;
    }
    if (inTextField()) return;

    const ctrl = e.ctrlKey || e.metaKey;
    const key = e.key.toLowerCase();

    if (ctrl) {
      const handled = {
        "z": () => e.shiftKey ? History.redo() : History.undo(),
        "y": () => History.redo(),
        "n": () => UI.show("dlg-new"),
        "o": () => document.getElementById("file-input").click(),
        "s": () => UI.saveProject(),
        "e": () => UI.openExportDialog(),
        "a": () => Editor.selectAll(),
        "d": () => Editor.deselect(),
        "i": () => Filters.applyDirect("invert"),
        "j": () => Editor.duplicateLayer(),
      }[key];
      if (handled) { e.preventDefault(); handled(); }
      return;
    }

    const toolKeys = {
      v: "move", m: "select", c: "crop", b: "brush", e: "eraser",
      g: "fill", i: "eyedropper", t: "text", u: "shape", s: "clone", h: "hand",
      k: "smudge", r: "blur", o: "dodge",
    };
    if (toolKeys[key]) { Tools.set(toolKeys[key]); return; }

    switch (e.key) {
      case "Delete":
      case "Backspace":
        Editor.deleteSelectionContents();
        break;
      case "Escape":
        if (document.querySelector(".context-menu")) UI.closeContextMenu();
        else if (Tools.current === "crop" && Tools.cropRect) Tools.cancelCrop();
        else Editor.deselect();
        break;
      case "Enter":
        if (Tools.current === "crop" && Tools.cropRect) Tools.applyCrop();
        break;
      case "[":
        Tools.opts.size = Math.max(1, Tools.opts.size - Math.max(1, Math.round(Tools.opts.size * 0.15)));
        UI.renderToolOptions(); Editor.render();
        break;
      case "]":
        Tools.opts.size = Math.min(300, Tools.opts.size + Math.max(1, Math.round(Tools.opts.size * 0.15)));
        UI.renderToolOptions(); Editor.render();
        break;
      case "+":
      case "=":
        Editor.setZoom(Editor.view.zoom * 1.25);
        break;
      case "-":
        Editor.setZoom(Editor.view.zoom / 1.25);
        break;
      case "0":
        Editor.fitView();
        break;
      case "1":
        Editor.setZoom(1);
        break;
      case "ArrowLeft": case "ArrowRight": case "ArrowUp": case "ArrowDown": {
        if (Tools.current !== "move") break;
        const layer = Editor.activeLayer();
        if (!layer) break;
        const step = e.shiftKey ? 10 : 1;
        History.record("Nudge");
        if (e.key === "ArrowLeft") layer.x -= step;
        if (e.key === "ArrowRight") layer.x += step;
        if (e.key === "ArrowUp") layer.y -= step;
        if (e.key === "ArrowDown") layer.y += step;
        Editor.render();
        e.preventDefault();
        break;
      }
    }
  });

  window.addEventListener("keyup", (e) => {
    if (e.code === "Space") {
      spaceHeld = false;
      if (!panDrag) canvas.style.cursor = Tools.cursorFor();
    }
  });

  UI.setHint("Drop an image anywhere, paste from clipboard, or just start painting.");
})();
