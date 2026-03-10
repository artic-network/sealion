// renderers/OverviewRenderer.js
//
// Renders the overview (minimap) canvas.
// - scrollAxes: 'observe' for both H and V — reads scroll position to draw the
//   viewport rectangle but has no scroll container of its own.
// - selectionAxes: none — clicking the overview scrolls the viewer rather than
//   selecting sequences or sites (handled via viewer.scrollToCol/scrollToRow).
// - Caches the static portion (bars, CDS features, bookmarks) and only redraws
//   the viewport indicator rectangle on every scroll frame.

import { CanvasRenderer } from './CanvasRenderer.js';

export class OverviewRenderer extends CanvasRenderer {
  static scrollAxes = { h: 'observe', v: 'observe' };
  static selectionAxes = [];

  constructor(canvas, viewer) {
    super(canvas, viewer);
    // Off-screen cache for static content (bars, CDS, bookmarks)
    this._cache = null;
    this._cacheParams = null;
    this._cacheInvalid = true;
    // CDS hit regions for tooltip support (built during cache render)
    this._cdsHitRegions = [];
  }

  // Invalidate the static cache (call when alignment, bookmarks, or mask changes)
  invalidateCache() {
    this._cacheInvalid = true;
    this.invalidate();
  }

  render(vis) {
    const v = this.viewer;
    if (!this.canvas) return;
    const ctx = this.ensureBacking();
    if (!ctx) return;

    const pr = v.pr || window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    const cssW = Math.max(1, rect.width || Math.max(1, this.canvas.width / pr));
    const cssH = Math.max(1, rect.height || Math.max(1, this.canvas.height / pr));

    const colOffsets       = v.colOffsets || [];
    const maxSeqLen        = colOffsets.length > 0 ? colOffsets.length - 1 : 0;
    const charWidth        = v.charWidth || 8;
    const expandedRightPad = v.EXPANDED_RIGHT_PAD != null ? v.EXPANDED_RIGHT_PAD : 2;
    const overviewTopPad   = v.OVERVIEW_TOP_PAD != null ? v.OVERVIEW_TOP_PAD : 4;
    const overviewBottomPad= v.OVERVIEW_BOTTOM_PAD != null ? v.OVERVIEW_BOTTOM_PAD : 4;
    const maskStr          = v.maskStr || (window && window.maskStr) || '';
    const maskEnabled      = !!v.maskEnabled;
    const rows             = (v.alignment && v.alignment.length != null) ? v.alignment : [];
    const refModeEnabled   = !!v.refModeEnabled;
    const refStr           = (window && window.refreshRefStr) ? (() => { try { return window.refreshRefStr().refStr; } catch (_) { return null; } })() : null;
    const siteBookmarks    = v.siteBookmarks;

    // Resolve CDS from the viewer's last-known reference genome
    let refGenomeCDS = null;
    try {
      const acc = window && window.displayedReferenceAccession;
      if (acc && v.alignment && v.alignment.getReferenceGenome) {
        const rg = v.alignment.getReferenceGenome(acc);
        if (rg && Array.isArray(rg.cds)) refGenomeCDS = rg.cds;
      }
      if (!refGenomeCDS && v._lastRefGenomeCDS) refGenomeCDS = v._lastRefGenomeCDS;
    } catch (_) { refGenomeCDS = null; }

    // Check if static-content cache needs rebuilding
    const cacheKey = {
      maxSeqLen,
      maskStr,
      maskEnabled,
      refStr,
      refModeEnabled,
      rowCount: rows.length,
      bookmarkCount: siteBookmarks ? siteBookmarks.size : 0,
      cdsCount: refGenomeCDS ? refGenomeCDS.length : 0,
    };
    const needsRebuild = this._cacheInvalid
      || !this._cache
      || this._cache.width  !== this.canvas.width
      || this._cache.height !== this.canvas.height
      || !this._cacheParams
      || Object.keys(cacheKey).some(k => this._cacheParams[k] !== cacheKey[k]);

    if (needsRebuild) {
      this._rebuildCache(cssW, cssH, pr, colOffsets, maxSeqLen, charWidth,
        expandedRightPad, overviewTopPad, overviewBottomPad,
        maskStr, maskEnabled, rows, refModeEnabled, refStr,
        refGenomeCDS, siteBookmarks);
      this._cacheParams  = cacheKey;
      this._cacheInvalid = false;
    }

    // Blit static cache
    ctx.clearRect(0, 0, cssW, cssH);
    ctx.drawImage(this._cache, 0, 0, cssW, cssH);

    // Draw viewport rectangle (changes every scroll frame)
    const rawTotal  = colOffsets[maxSeqLen] || (maxSeqLen * (charWidth + expandedRightPad));
    const totalWidth = Math.max(1, rawTotal);
    const scale      = cssW / totalWidth;
    try {
      const viewX = Math.round((vis && vis.scrollLeft ? vis.scrollLeft : 0) * scale);
      const viewW = Math.max(2, Math.round((vis && vis.viewW ? vis.viewW : cssW) * scale));
      ctx.save();
      ctx.strokeStyle = v.OVERVIEW_VIEWPORT;
      ctx.lineWidth   = 2;
      ctx.globalAlpha = 0.6;
      ctx.strokeRect(viewX + 0.5, 2.5, viewW - 1, cssH - 4);
      ctx.restore();
    } catch (_) { /* ignore */ }
  }

  attachEvents() {
    if (!this.canvas) return;
    // Click on overview scrolls the alignment to that position
    this.canvas.addEventListener('click', (e) => {
      const v = this.viewer;
      const colOffsets   = v.colOffsets || [];
      const maxSeqLen    = colOffsets.length > 0 ? colOffsets.length - 1 : 0;
      const charWidth    = v.charWidth || 8;
      const expandedRightPad = v.EXPANDED_RIGHT_PAD != null ? v.EXPANDED_RIGHT_PAD : 2;
      const rawTotal     = colOffsets[maxSeqLen] || (maxSeqLen * (charWidth + expandedRightPad));
      const cssW         = this.canvas.getBoundingClientRect().width || 1;
      const scale        = cssW / Math.max(1, rawTotal);
      const rect         = this.canvas.getBoundingClientRect();
      const clickX       = e.clientX - rect.left;
      const targetScrollLeft = clickX / scale;
      const scroller = v.scroller;
      if (scroller) {
        scroller.scrollLeft = Math.max(0, targetScrollLeft - (scroller.clientWidth / 2));
      }
    });

    // Tooltip on hover (CDS hit regions)
    this.canvas.addEventListener('mousemove', (e) => {
      if (!this._cdsHitRegions || this._cdsHitRegions.length === 0) return;
      const rect = this.canvas.getBoundingClientRect();
      const pr   = this.viewer.pr || window.devicePixelRatio || 1;
      const cssW = Math.max(1, rect.width);
      const cssH = Math.max(1, rect.height);
      const mouseX = (e.clientX - rect.left);
      const mouseY = (e.clientY - rect.top);
      let hit = null;
      for (const region of this._cdsHitRegions) {
        if (mouseX >= region.x && mouseX <= region.x + region.width
            && mouseY >= region.y && mouseY <= region.y + region.height) {
          hit = region;
          break;
        }
      }
      if (hit) {
        const parts = [];
        if (hit.gene) parts.push(hit.gene);
        if (hit.product) parts.push(hit.product);
        if (hit.coordinates) parts.push(hit.coordinates);
        this.canvas.title = parts.join(' | ');
      } else {
        this.canvas.title = '';
      }
    });
  }

  // ── Private ──────────────────────────────────────────────────────────────────

  _rebuildCache(cssW, cssH, pr, colOffsets, maxSeqLen, charWidth, expandedRightPad,
                overviewTopPad, overviewBottomPad, maskStr, maskEnabled,
                rows, refModeEnabled, refStr, refGenomeCDS, siteBookmarks) {
    const v = this.viewer;

    if (!this._cache) this._cache = document.createElement('canvas');
    this._cache.width  = this.canvas.width;
    this._cache.height = this.canvas.height;

    const cacheCtx = this._cache.getContext('2d');
    cacheCtx.setTransform(pr, 0, 0, pr, 0, 0);
    cacheCtx.clearRect(0, 0, cssW, cssH);
    cacheCtx.fillStyle = v.OVERVIEW_BG;
    cacheCtx.fillRect(0, 0, cssW, cssH);

    const rawTotal   = colOffsets[maxSeqLen] || (maxSeqLen * (charWidth + expandedRightPad));
    const totalWidth = Math.max(1, rawTotal);
    const scale      = cssW / totalWidth;
    const barH       = Math.max(4, cssH - (overviewTopPad + overviewBottomPad));
    const barY       = overviewTopPad;

    // Compressed / expanded column bars
    for (let c = 0; c < maxSeqLen; c++) {
      const left  = colOffsets[c]     != null ? colOffsets[c]     : (c       * (charWidth + expandedRightPad));
      const right = colOffsets[c + 1] != null ? colOffsets[c + 1] : (left + charWidth + expandedRightPad);
      const x  = Math.round(left  * scale);
      const x2 = Math.round(right * scale);
      const w  = Math.max(1, x2 - x);
      const isCompressed = maskEnabled && maskStr && maskStr.charAt(c) === '0';
      cacheCtx.fillStyle = isCompressed ? v.OVERVIEW_COLLAPSED_COL : v.OVERVIEW_EXPANDED_COL;
      cacheCtx.fillRect(x, barY, w, barH);
    }

    // Difference sites when ref mode is active
    if (refModeEnabled && refStr && rows.length > 0) {
      cacheCtx.save();
      cacheCtx.fillStyle = v.OVERVIEW_DIFF_COL;
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
        cacheCtx.fillRect(Math.round(left * scale), barY, Math.max(1, Math.round(right * scale) - Math.round(left * scale)), barH);
      }
      cacheCtx.restore();
    }

    // CDS features
    this._cdsHitRegions = [];
    if (refGenomeCDS && refGenomeCDS.length > 0) {
      cacheCtx.save();
      const frameColors = v.CDS_FRAME_COLORS || (v.constructor.DEFAULTS && v.constructor.DEFAULTS.CDS_FRAME_COLORS);
      const rowHeight   = Math.max(2, barH / 3);
      const fillAlpha   = v.CDS_FILL_ALPHA   != null ? v.CDS_FILL_ALPHA   : (v.constructor.DEFAULTS && v.constructor.DEFAULTS.CDS_FILL_ALPHA);
      const borderAlpha = v.CDS_BORDER_ALPHA != null ? v.CDS_BORDER_ALPHA : (v.constructor.DEFAULTS && v.constructor.DEFAULTS.CDS_BORDER_ALPHA);

      for (const cds of refGenomeCDS) {
        if (!cds.coordinates) continue;
        const segments = v.parseCDSCoordinates(cds.coordinates);
        for (const seg of segments) {
          const startPos = seg.start - 1;
          const endPos   = seg.end   - 1;
          const rowIndex = seg.frame - 1;
          const cdsY     = barY + rowIndex * rowHeight;

          const leftPixel  = colOffsets[startPos] != null ? colOffsets[startPos] : (startPos * (charWidth + expandedRightPad));
          const rightPixel = colOffsets[endPos]   != null ? colOffsets[endPos] + charWidth : ((endPos + 1) * (charWidth + expandedRightPad));
          const x   = Math.round(leftPixel  * scale);
          const x2  = Math.round(rightPixel * scale);
          const w   = Math.max(1, x2 - x);
          const col = frameColors ? frameColors[rowIndex] : '#888';

          cacheCtx.globalAlpha = fillAlpha || 0.7;
          cacheCtx.fillStyle   = col;
          cacheCtx.fillRect(x, cdsY, w, rowHeight);

          cacheCtx.globalAlpha = borderAlpha || 1.0;
          cacheCtx.strokeStyle = col;
          cacheCtx.lineWidth   = 0.5;
          cacheCtx.strokeRect(x, cdsY, w, rowHeight);

          this._cdsHitRegions.push({ x, y: cdsY, width: w, height: rowHeight,
            gene: cds.gene || '', product: cds.product || '',
            coordinates: cds.coordinates, function: cds.function || '' });

          if (w >= 30 && cds.gene) {
            cacheCtx.globalAlpha = 1.0;
            cacheCtx.fillStyle   = '#ffffff';
            cacheCtx.font        = 'bold 10px sans-serif';
            cacheCtx.textAlign   = 'center';
            cacheCtx.textBaseline = 'middle';
            cacheCtx.shadowColor = 'rgba(0,0,0,0.5)';
            cacheCtx.shadowBlur  = 2;
            cacheCtx.fillText(cds.gene, x + w / 2, cdsY + rowHeight / 2);
            cacheCtx.shadowColor = 'transparent';
            cacheCtx.shadowBlur  = 0;
          }
        }
      }
      cacheCtx.restore();
    }

    // Bookmarks (drawn on top)
    if (siteBookmarks && siteBookmarks.size > 0) {
      cacheCtx.save();
      const bookmarkColors = v.BOOKMARK_COLORS || [];
      for (const [c, bookmarkIdx] of siteBookmarks.entries()) {
        if (c < 0 || c >= maxSeqLen) continue;
        const color = (bookmarkIdx >= 0 && bookmarkIdx < bookmarkColors.length) ? bookmarkColors[bookmarkIdx] : null;
        if (!color) continue;
        const left  = colOffsets[c]     != null ? colOffsets[c]     : (c * (charWidth + expandedRightPad));
        const right = colOffsets[c + 1] != null ? colOffsets[c + 1] : (left + charWidth + expandedRightPad);
        const x  = Math.round(left  * scale);
        const x2 = Math.round(right * scale);
        const r = parseInt(color.slice(1, 3), 16);
        const g = parseInt(color.slice(3, 5), 16);
        const b = parseInt(color.slice(5, 7), 16);
        cacheCtx.fillStyle = `rgba(${r},${g},${b},0.5)`;
        cacheCtx.fillRect(x, 0, Math.max(1, x2 - x), cssH);
      }
      cacheCtx.restore();
    }
  }
}
