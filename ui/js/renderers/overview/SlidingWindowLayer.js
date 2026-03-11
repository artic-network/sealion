// renderers/overview/SlidingWindowLayer.js
//
// Overview layer: draws the active plot's data as a continuous filled-line
// (area chart) spanning the full overview width.
//
// Data source: reads the active plot's per-column Float32Array cache via
//   viewer._plotRenderer._plot
// If unavailable (plot renderer hidden / no data) the layer draws nothing.
//
// The line is coloured using the same palette as the active plot (Fire for
// entropy, Ocean for differences).  Each point is coloured independently by
// its value so the line shifts colour across the genome.

import { getSequentialPalette, lerpSequential } from '../../palettes.js';

export class SlidingWindowLayer {
  constructor() {
    this.enabled = true;
    this.label   = 'Plot line';
  }

  /**
   * Render the sliding-window line into an off-screen cache context.
   * @param {CanvasRenderingContext2D} ctx
   * @param {object} p  — shared params built by OverviewRenderer._buildParams()
   */
  render(ctx, p) {
    if (!this.enabled) return;

    const { cssW, cssH, scale, barY, barH, totalWidth,
            colOffsets, maxSeqLen, charWidth, expandedRightPad } = p;
    const v = p.viewer;

    // ── Obtain per-column data from the active plot strategy ────────────
    const plotRenderer = v._plotRenderer;
    if (!plotRenderer) return;
    const plot = plotRenderer._plot;
    if (!plot) return;

    // Trigger the plot cache calculation if not yet done (works because the
    // EntropyPlot / DifferencesPlot caches are computed lazily and keyed on
    // alignment + viewer state, which is already consistent at this point).
    let values = null;
    try {
      if (typeof plot._getEntropy === 'function') {
        values = plot._getEntropy(v, maxSeqLen);
      } else if (typeof plot._getDiffs === 'function') {
        values = plot._getDiffs(v, maxSeqLen);
      } else if (plot._cache instanceof Float32Array) {
        values = plot._cache;
      }
    } catch (_) { return; }

    if (!values || values.length === 0) return;

    // ── Resolve the palette (same as the active plot) ───────────────────
    const defaultPalette = typeof plot._getEntropy === 'function' ? 'Fire' : 'Ocean';
    const palette = getSequentialPalette(v.PLOT_PALETTE || defaultPalette);

    // ── Map columns → pixel-width buckets and compute average value ──────
    // We render one segment per CSS pixel column.
    const points = new Float32Array(Math.ceil(cssW));
    const counts = new Uint16Array (Math.ceil(cssW));

    for (let c = 0; c < maxSeqLen; c++) {
      const left  = colOffsets[c]     != null ? colOffsets[c]     : (c * (charWidth + expandedRightPad));
      const right = colOffsets[c + 1] != null ? colOffsets[c + 1] : (left + charWidth + expandedRightPad);
      const x0 = Math.round(left  * scale);
      const x1 = Math.round(right * scale);
      const val = values[c] != null ? values[c] : 0;
      for (let x = x0; x < x1 && x < points.length; x++) {
        points[x] += val;
        counts[x] += 1;
      }
    }

    // Normalise buckets
    for (let x = 0; x < points.length; x++) {
      if (counts[x] > 0) points[x] /= counts[x];
    }

    // ── Draw as a filled area chart ──────────────────────────────────────
    const baseline = barY + barH;
    const areaH    = barH;

    // Draw one thin rect per pixel column, coloured by value and alpha 0.75.
    ctx.save();
    ctx.globalAlpha = 0.75;

    for (let x = 0; x < points.length; x++) {
      const val = points[x];
      if (val <= 0) continue;
      const h   = Math.round(val * areaH);
      if (h <= 0) continue;
      ctx.fillStyle = lerpSequential(val, palette);
      ctx.fillRect(x, baseline - h, 1, h);
    }

    // Overlay a 1px contrasted line at the top edge of each bar
    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth   = 1;
    ctx.beginPath();
    let inPath = false;
    for (let x = 0; x < points.length; x++) {
      const val = points[x];
      const y   = val > 0 ? baseline - Math.round(val * areaH) : baseline;
      if (!inPath) { ctx.moveTo(x + 0.5, y); inPath = true; }
      else          { ctx.lineTo(x + 0.5, y); }
    }
    ctx.stroke();

    ctx.restore();
  }

  cacheKey(p) {
    const v = p.viewer;
    const plot = v._plotRenderer && v._plotRenderer._plot;
    if (!plot) return 'sw:none';
    // Key on whatever the plot strategy uses — row count, seq len, refStr
    const cacheKey = plot._cacheKey || '';
    return `sw:${p.maxSeqLen}:${cacheKey}`;
  }
}
