# Pixel — Browser Image Editor

A Pixlr-style photo editor that runs entirely in your browser. No build step, no
dependencies, no cloud, no accounts — plain HTML/CSS/JS and browser APIs only.
Projects are saved locally via IndexedDB.

## Run it

Any static file server works:

```
python -m http.server 8000
# or
npx serve .
```

Then open http://localhost:8000. Opening `index.html` directly (file://) also
works in most browsers.

## Features

**Tools** — Move, rectangular Select, Crop (rule-of-thirds overlay), Brush
(size / opacity / softness), Eraser, Flood Fill (tolerance), Eyedropper, Text,
Shapes (rectangle / ellipse / line), Clone Stamp (Alt+click source), Hand/pan.

**Layers** — add, duplicate, delete, reorder, merge down, flatten, visibility,
opacity, 16 blend modes, rename (double-click), thumbnails.

**Adjustments** — Brightness/Contrast, Hue/Saturation/Lightness,
Temperature/Tint, Exposure/Gamma, Vibrance, Invert, Grayscale, Sepia,
Posterize, Threshold — all with live preview, all selection-aware.

**Filters** — Gaussian Blur, Sharpen, Pixelate, Noise, Vignette, Emboss,
Edge Detect.

**Image** — resize (resample), canvas size, crop to selection, rotate
90/180, flip.

**Workflow** — 20-step undo/redo, zoom to cursor, space-drag pan, drag & drop
or paste images, keyboard shortcuts (see Help → About & Shortcuts), export to
PNG / JPEG / WebP, save/load/delete projects in the browser (IndexedDB).

## Structure

```
index.html      layout + dialogs
css/style.css   dark UI theme
js/utils.js     canvas/color/rect helpers
js/history.js   snapshot-based undo/redo
js/filters.js   adjustments, convolutions, blur, flood fill
js/editor.js    document/layer model, rendering, view transform
js/storage.js   IndexedDB project persistence
js/tools.js     all pointer tools
js/ui.js        menus, panels, dialogs, live filter preview
js/main.js      event wiring + bootstrap
```
