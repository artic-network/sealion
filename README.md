# sealion — Virtualized alignment viewer (vanilla JS + Canvas)

A small, high-performance, DPR-aware, virtualized two-pane alignment viewer written in plain HTML/CSS/vanilla JavaScript. It renders large alignments using multiple layered canvases (labels, header, sequence viewport, overview, consensus) with integer-backed canvases and devicePixelRatio scaling for crisp rendering.

This repository contains a lightweight single-page viewer intended for exploring sequence alignments in the browser without heavy dependencies.

## Features

- Virtualized rendering of very long alignments (viewport-backed canvases + spacer element)
- DevicePixelRatio-aware backing canvases for crisp text and lines
- Column compression (mask) support with animation
- Multiple selection modes: row selection, column selection, rectangular selection
- Overview canvas showing the whole alignment and current viewport
- Reference-mode: highlight differences from a reference sequence
- Compute and display consensus sequence under the header
- Developer instrumentation available via `window.*` globals for debugging

## Files of interest

- `index.html` — Single-page layout and controls
- `style.css` — Layout and canvas sizing rules
- `script.js` — Main rendering and interaction logic
- `alignment.js` — (data) expected to provide `alignment` variable: an array of objects with `{ label, sequence }`

## Quick start (local)

1. Open a terminal in this project root.
2. Start a simple static server (Python 3 example):

```bash
python3 -m http.server 8000
```

3. Visit http://localhost:8000 in your browser.
4. Ensure `alignment.js` is present and defines an `alignment` array. Example dataset may be provided separately.

Notes:
- The app is intended to run from a static server (some browsers restrict canvas/wasm/file access via file://).
- On macOS the vertical scrollbar may be overlayed and invisible; CSS attempts to reserve gutter space but your platform may still occlude it.

## Controls and interactions

- Mouse wheel or touchpad: scroll horizontally/vertically in the alignment area.
- Labels column:
  - Click to select row(s).
  - Shift/Meta modifiers supported for extend/toggle behaviour.
- Header / Consensus row:
  - Click and drag to select columns.
  - Shift/Meta modifiers act as in typical selection behaviour.
- Sequence canvas:
  - Click-drag (with Cmd/Space depending on config) to pan; drag to make rectangular selections.
- Buttons in the top control bar:
  - `Apply constant mask` / `Apply constant (allow N)` / `Apply constant (allow N & -)`: compute and apply masks that compress constant columns.
  - `Set selected as reference`: set the currently selected sequence as the reference used for de-emphasis.
  - `Difference from consensus`: set the consensus sequence as the reference (clears selected row).
  - `Snap to char` toggle: when enabled, horizontal scroll snaps to column boundaries.
  

## Developer notes

- The viewer uses `colOffsets` (an array of length `maxSeqLen + 1`) that stores column left boundaries in CSS pixels. All drawing code uses `colOffsets` and treats values as CSS pixels — canvases are backed by `CSS * devicePixelRatio` pixels and use `ctx.setTransform(pr,0,0,pr,0,0)` so drawing commands operate in CSS pixels.

- Mask compression: `mask` (global) or the internal `maskStr` string indicates which columns are compressed (`'0'`) vs expanded (`'1'`). When mask changes, `startMaskTransition()` animates `colOffsets` between states.

- Consensus: computed by `computeConsensusSequence()` and rendered in `#consensus-canvas` (drawn under the header). The `Difference from consensus` button sets the consensus as the reference.

- Handy runtime globals exposed for debugging:
  - `window.colOffsets` — array of column offsets (CSS px)
  - `window.__maskStr` — normalized mask string
  - `window.__refStr`, `window.__refIndex` — reference string and index (if any)
  - `window.consensusSequence` — computed consensus
  - `window.__lastDrawExtents` — last draw extents recorded by renderer

## Extending / hacking

- To change fonts or row height, edit `FONT` / `ROW_PADDING` in `script.js`. The renderer measures font metrics at startup.
- To add visual layers (e.g., quality bars per column), add a new canvas in `index.html` and wire it in `setCanvasCSSSizes()` / `resizeBackings()` similar to the `consensusCanvas`/`overviewCanvas` treatment.
- If you add heavy computation (per-column statistics) consider moving it off the main thread (WebWorker) to keep UI responsive.

## Troubleshooting

- If columns draw misaligned between header/seq/overview, ensure `colOffsets` are consistently maintained as CSS pixels and `ctx.setTransform(pr,0,0,pr,0,0)` is applied to canvas contexts.
- If performance drops with very long alignments, increase virtualization buffer sizes or implement per-row batching in draw passes.
- If the consensus or mask buttons appear to do nothing, check the console for warnings and confirm `alignment` data is present and `maxSeqLen` > 0.

## License

This project is provided under the MIT license. See `LICENSE` for details (add one if needed).

## Contact

For questions or contribution suggestions, open an issue or submit a pull request in the repository.
d3js: Create an HTML table using d3.js