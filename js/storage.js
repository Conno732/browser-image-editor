"use strict";

// Local persistence via IndexedDB. Layer bitmaps are stored as PNG data URLs.
// Nothing ever leaves the browser.
const Storage = {
  DB_NAME: "pixel-editor",
  STORE: "projects",
  _db: null,

  open() {
    if (this._db) return Promise.resolve(this._db);
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(this.DB_NAME, 1);
      req.onupgradeneeded = () => {
        req.result.createObjectStore(this.STORE, { keyPath: "name" });
      };
      req.onsuccess = () => { this._db = req.result; resolve(this._db); };
      req.onerror = () => reject(req.error);
    });
  },

  _tx(mode) {
    return this._db.transaction(this.STORE, mode).objectStore(this.STORE);
  },

  async save(name) {
    if (!Editor.doc) return;
    await this.open();
    const doc = Editor.doc;
    const record = {
      name,
      width: doc.width,
      height: doc.height,
      active: doc.active,
      updated: Date.now(),
      layers: doc.layers.map(l => ({
        name: l.name,
        x: l.x, y: l.y,
        visible: l.visible,
        opacity: l.opacity,
        blend: l.blend,
        data: l.canvas.toDataURL("image/png"),
      })),
    };
    return new Promise((resolve, reject) => {
      const req = this._tx("readwrite").put(record);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  },

  async list() {
    await this.open();
    return new Promise((resolve, reject) => {
      const req = this._tx("readonly").getAll();
      req.onsuccess = () => {
        const rows = req.result.map(r => ({
          name: r.name, width: r.width, height: r.height,
          layerCount: r.layers.length, updated: r.updated,
        }));
        rows.sort((a, b) => b.updated - a.updated);
        resolve(rows);
      };
      req.onerror = () => reject(req.error);
    });
  },

  async load(name) {
    await this.open();
    const record = await new Promise((resolve, reject) => {
      const req = this._tx("readonly").get(name);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    if (!record) throw new Error("Project not found: " + name);

    const layers = [];
    for (const meta of record.layers) {
      const img = await Utils.loadImageFromDataURL(meta.data);
      const canvas = Utils.createCanvas(img.width, img.height);
      canvas.getContext("2d").drawImage(img, 0, 0);
      layers.push({
        id: Utils.uid(),
        name: meta.name,
        canvas,
        ctx: canvas.getContext("2d", { willReadFrequently: true }),
        x: meta.x, y: meta.y,
        visible: meta.visible,
        opacity: meta.opacity,
        blend: meta.blend,
      });
    }
    Editor.doc = {
      width: record.width,
      height: record.height,
      active: Math.min(record.active, layers.length - 1),
      layers,
    };
    Editor.selection = null;
    Editor.projectName = name;
    History.clear();
    Editor.fitView();
    UI.refreshAll();
  },

  async remove(name) {
    await this.open();
    return new Promise((resolve, reject) => {
      const req = this._tx("readwrite").delete(name);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  },
};
