"use strict";

// Snapshot-based undo/redo. Each snapshot clones every layer bitmap;
// capped so memory stays bounded.
const History = {
  undoStack: [],
  redoStack: [],
  max: 20,

  snapshot() {
    const doc = Editor.doc;
    return {
      width: doc.width,
      height: doc.height,
      active: doc.active,
      selection: Editor.selection ? { ...Editor.selection } : null,
      layers: doc.layers.map(l => ({
        id: l.id,
        name: l.name,
        x: l.x,
        y: l.y,
        visible: l.visible,
        opacity: l.opacity,
        blend: l.blend,
        canvas: Utils.cloneCanvas(l.canvas),
      })),
    };
  },

  restore(snap) {
    const layers = snap.layers.map(meta => {
      const canvas = Utils.cloneCanvas(meta.canvas); // clone so the stored snapshot stays pristine
      return {
        id: meta.id,
        name: meta.name,
        x: meta.x,
        y: meta.y,
        visible: meta.visible,
        opacity: meta.opacity,
        blend: meta.blend,
        canvas,
        ctx: canvas.getContext("2d", { willReadFrequently: true }),
      };
    });
    Editor.doc = {
      width: snap.width,
      height: snap.height,
      active: Math.min(snap.active, layers.length - 1),
      layers,
    };
    Editor.selection = snap.selection ? { ...snap.selection } : null;
    UI.refreshAll();
  },

  // Call BEFORE mutating the document.
  record(label) {
    if (!Editor.doc) return;
    this.undoStack.push(this.snapshot());
    if (this.undoStack.length > this.max) this.undoStack.shift();
    this.redoStack.length = 0;
  },

  undo() {
    if (!this.undoStack.length || !Editor.doc) return;
    this.redoStack.push(this.snapshot());
    this.restore(this.undoStack.pop());
  },

  redo() {
    if (!this.redoStack.length || !Editor.doc) return;
    this.undoStack.push(this.snapshot());
    this.restore(this.redoStack.pop());
  },

  clear() {
    this.undoStack.length = 0;
    this.redoStack.length = 0;
  },
};
