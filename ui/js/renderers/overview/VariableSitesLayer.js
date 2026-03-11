// renderers/overview/VariableSitesLayer.js
//
// Overview layer: compressed/expanded column bars + difference overlay when
// ref mode is active.  Each column is drawn as a thin vertical bar:
//   • expanded   → OVERVIEW_EXPANDED_COL
//   • collapsed  → OVERVIEW_COLLAPSED_COL
//   • differs from reference → OVERVIEW_DIFF_COL (overlaid on top)

export class VariableSitesLayer {
  constructor() {
    this.enabled = true;
    this.label   = 'Variable sites';
  }

  /**
   * Render into an off-screen cache context.
   * @param {CanvasRenderingContext2D} ctx
   * @param {object} p   — shared params built by OverviewRenderer._buildParams()
   */
  render(ctx, p) {
    if (!this.enabled) return;
    const v = p.viewer;

    const { cssW, cssH, scale, barY, barH,
            colOffsets, maxSeqLen, charWidth, expandedRightPad,
            maskStr, maskEnabled } = p;

    // ── Column bars (compressed / expanded) ─────────────────────────────
    for (let c = 0; c < maxSeqLen; c++) {
      const left  = colOffsets[c]     != null ? colOffsets[c]     : (c * (charWidth + expandedRightPad));
      const right = colOffsets[c + 1] != null ? colOffsets[c + 1] : (left + charWidth + expandedRightPad);
      const x  = Math.round(left  * scale);
      const x2 = Math.round(right * scale);
      const w  = Math.max(1, x2 - x);
      const isCompressed = maskEnabled && maskStr && maskStr.charAt(c) === '0';
      ctx.fillStyle = isCompressed ? v.OVERVIEW_COLLAPSED_COL : v.OVERVIEW_EXPANDED_COL;
      ctx.fillRect(x, barY, w, barH);
    }

    // ── Difference overlay ───────────────────────────────────────────────
    const { refModeEnabled, refStr, rows } = p;
    if (refModeEnabled && refStr && rows.length > 0) {
      ctx.save();
      ctx.fillStyle = v.OVERVIEW_DIFF_COL;
      for (let c = 0; c < maxSeqLen; c++) {
        const refChar = refStr.charAt(c).toUpperCase();
        if (!refChar || refChar === '-' || refChar === 'N') continue;
        let hasDiff = false;
        for (let r = 0; r < rows.length; r++) {
          const base = (rows[r].sequence || '').charAt(c).toUpperCase();
          if (base && base !== refChar && base !== '-' && base !== 'N') { hasDiff = true; break; }
        }
        if (!hasDiff) continue;
        const left  = colOffsets[c]     != null ? colOffsets[c]     : (c * (charWidth + expandedRightPad));
        const right = colOffsets[c + 1] != null ? colOffsets[c + 1] : (left + charWidth + expandedRightPad);
        ctx.fillRect(
          Math.round(left * scale), barY,
          Math.max(1, Math.round(right * scale) - Math.round(left * scale)), barH
        );
      }
      ctx.restore();
    }
  }

  // Cache key contribution — rebuilds when these change
  cacheKey(p) {
    return `vs:${p.maxSeqLen}:${p.maskStr}:${p.maskEnabled}:${p.refModeEnabled}:${p.refStr ? p.refStr.slice(0, 32) : ''}:${p.rows.length}`;
  }
}
