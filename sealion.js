// sealion.js
// Staged refactor: first-pass SealionViewer class (safe, non-breaking).
// This file creates window.SealionViewer so existing code keeps working.

(function () {
  'use strict';

  // Minimal, self-contained SealionViewer class.
  // Purpose: provide a clean place to migrate rendering, geometry and interaction
  // code in stages (Option B). This initial version implements a small
  // subset of utilities used throughout the app: DPR-aware canvas backing,
  // char-width measurement in CSS pixels, and colOffsets builder. It does NOT
  // change any behaviour in `script.js` yet. Later stages will move actual
  // draw/handler implementations into this class.

  class SealionViewer {
    constructor(containerOrSelector, alignment, options) {
      // Accept either a DOM element or a selector string (e.g. '#app' or 'app')
      if (typeof containerOrSelector === 'string') {
        const sel = containerOrSelector.startsWith('#') || containerOrSelector.startsWith('.')
          ? containerOrSelector
          : `#${containerOrSelector}`;
        this.container = document.querySelector(sel);
      } else {
        this.container = containerOrSelector;
      }

      if (!this.container) {
        throw new Error('SealionViewer: container not found');
      }
      // Ensure the viewer has its expected internal DOM structure. If the
      // consumer passed a container that already contains the elements (for
      // staged migration), reuse them. Otherwise, create the inner layout
      // (canvases, spacers and wrappers) inside the container so the viewer
      // owns its markup and callers may interact only via the class API.
      try {
        const q = (sel) => this.container.querySelector(sel);
        // Left label column with three label canvases and divider
        let labels = q('#labels');
        if (!labels) { labels = document.createElement('div'); labels.id = 'labels'; this.container.appendChild(labels); }

        // Label canvas for outline (overview)
        let labelsOutlineCanvas = q('#labels-outline-canvas');
        if (!labelsOutlineCanvas) { labelsOutlineCanvas = document.createElement('canvas'); labelsOutlineCanvas.id = 'labels-outline-canvas'; labelsOutlineCanvas.className = 'labels-outline-canvas'; labels.appendChild(labelsOutlineCanvas); }

        // Label canvas for header
        let labelsHeaderCanvas = q('#labels-header-canvas');
        if (!labelsHeaderCanvas) { labelsHeaderCanvas = document.createElement('canvas'); labelsHeaderCanvas.id = 'labels-header-canvas'; labelsHeaderCanvas.className = 'labels-header-canvas'; labels.appendChild(labelsHeaderCanvas); }

        // Label canvas for consensus
        let labelsConsensusCanvas = q('#labels-consensus-canvas');
        if (!labelsConsensusCanvas) { labelsConsensusCanvas = document.createElement('canvas'); labelsConsensusCanvas.id = 'labels-consensus-canvas'; labelsConsensusCanvas.className = 'labels-consensus-canvas'; labels.appendChild(labelsConsensusCanvas); }

        // Inner container for main labels canvas
        let leftInner = q('#left-inner');
        if (!leftInner) { leftInner = document.createElement('div'); leftInner.id = 'left-inner'; labels.appendChild(leftInner); }
        let labelsCanvas = q('#labels-canvas');
        if (!labelsCanvas) { labelsCanvas = document.createElement('canvas'); labelsCanvas.id = 'labels-canvas'; labelsCanvas.className = 'labels-canvas'; leftInner.appendChild(labelsCanvas); }

        // Divider for resizing labels column (now extends full height)
        let labelDivider = q('#label-divider');
        if (!labelDivider) { labelDivider = document.createElement('div'); labelDivider.id = 'label-divider'; labelDivider.title = 'Drag to resize labels'; labels.appendChild(labelDivider); }

        // optional left spacer to mirror right spacer height for some layouts
        let leftSpacer = q('#left-spacer');
        if (!leftSpacer) { leftSpacer = document.createElement('div'); leftSpacer.id = 'left-spacer'; leftSpacer.style.display = 'none'; labels.appendChild(leftSpacer); }

        // Header area: overview, header ruler, consensus
        let header = q('#header');
        if (!header) { header = document.createElement('div'); header.id = 'header'; this.container.appendChild(header); }
        let overviewCanvas = q('#overview-canvas');
        if (!overviewCanvas) { overviewCanvas = document.createElement('canvas'); overviewCanvas.id = 'overview-canvas'; overviewCanvas.className = 'overview-canvas'; header.appendChild(overviewCanvas); }
        let headerCanvas = q('#header-canvas');
        if (!headerCanvas) { headerCanvas = document.createElement('canvas'); headerCanvas.id = 'header-canvas'; headerCanvas.className = 'header-canvas'; header.appendChild(headerCanvas); }
        let consensusCanvas = q('#consensus-canvas');
        if (!consensusCanvas) { consensusCanvas = document.createElement('canvas'); consensusCanvas.id = 'consensus-canvas'; consensusCanvas.className = 'consensus-canvas'; header.appendChild(consensusCanvas); }

        // Alignment viewport: seq canvas and scrollable spacer
        let alignmentDiv = q('#alignment');
        if (!alignmentDiv) { alignmentDiv = document.createElement('div'); alignmentDiv.id = 'alignment'; this.container.appendChild(alignmentDiv); }
        let seqCanvas = q('#seq-canvas');
        if (!seqCanvas) { seqCanvas = document.createElement('canvas'); seqCanvas.id = 'seq-canvas'; seqCanvas.className = 'seq-canvas'; alignmentDiv.appendChild(seqCanvas); }
        let scroller = q('#alignment-scroll');
        if (!scroller) { scroller = document.createElement('div'); scroller.id = 'alignment-scroll'; alignmentDiv.appendChild(scroller); }
        let seqInner = scroller.querySelector('#seq-inner');
        if (!seqInner) { seqInner = document.createElement('div'); seqInner.id = 'seq-inner'; scroller.appendChild(seqInner); }
        let seqSpacer = seqInner.querySelector('#seq-spacer');
        if (!seqSpacer) { seqSpacer = document.createElement('div'); seqSpacer.id = 'seq-spacer'; seqInner.appendChild(seqSpacer); }

        // persist references onto the instance for later helpers
        this.labelsOutlineCanvas = labelsOutlineCanvas;
        this.labelsHeaderCanvas = labelsHeaderCanvas;
        this.labelsConsensusCanvas = labelsConsensusCanvas;
        this.overviewCanvas = overviewCanvas;
        this.headerCanvas = headerCanvas;
        this.consensusCanvas = consensusCanvas;
        this.alignmentDiv = alignmentDiv;
        this.labelCanvas = labelsCanvas;
        this.labelDivider = labelDivider;
        this.leftSpacer = leftSpacer;
        this.seqCanvas = seqCanvas;
        this.scroller = scroller;
        this.seqInner = seqInner;
        this.seqSpacer = seqSpacer;
      } catch (e) { console.warn('SealionViewer: failed to ensure DOM structure', e); }
      // initialize devicePixelRatio and measurement context so drawing
      // helpers (ensureCanvasBacking, measureCharWidthFromReal) work
      // immediately after instantiation.
      this.pr = window.devicePixelRatio || 1;
      try {
        this._measureCanvas = document.createElement('canvas');
        this._measureCtx = this._measureCanvas.getContext('2d');
      } catch (_) { this._measureCtx = null; }
      this.charWidth = 8; // safe default until measured
      if (alignment) this.alignment = alignment;
      // default mask-enabled flag (matches legacy script.js initial state)
      this.maskEnabled = true;
      // hide mode: when enabled, collapsed regions are reduced to near-zero width with center markers
      this.hideMode = false;
      // Search state
      this.searchMatches = [];
      this.currentMatchIndex = -1;

      // Merge provided options with class defaults and set instance-level
      // visual constants. This centralizes fonts, sizes, colours and other
      // appearance-related settings so they can be passed from the app
      // (script.js) when constructing the viewer.
      try {
        const cfg = Object.assign({}, SealionViewer.DEFAULTS || {}, (options || {}));
        // fonts & sizes
        this.FONT = cfg.FONT;
        this.HEADER_FONT = cfg.HEADER_FONT;
        this.FONT_SIZE = cfg.FONT_SIZE;
        this.fontSize = cfg.FONT_SIZE; // Current sequence font size
        this.labelFontSize = cfg.FONT_SIZE; // Current label font size
        this.initialLabelFontSize = cfg.FONT_SIZE; // Track initial label font size for scaling logic
        this.labelFont = cfg.FONT; // Label font string
        this.LABEL_WIDTH = cfg.LABEL_WIDTH;
        this.ROW_HEIGHT = cfg.ROW_HEIGHT;
        this.ROW_PADDING = cfg.ROW_PADDING;
        this.HEADER_HEIGHT = cfg.HEADER_HEIGHT;
        this.OVERVIEW_HEIGHT = cfg.OVERVIEW_HEIGHT;
        this.CONSENSUS_HEIGHT = cfg.CONSENSUS_HEIGHT;
        this.CONSENSUS_TOP_PAD = cfg.CONSENSUS_TOP_PAD;
        this.CONSENSUS_BOTTOM_PAD = cfg.CONSENSUS_BOTTOM_PAD;
        // layout/padding
        this.EXPANDED_RIGHT_PAD = cfg.EXPANDED_RIGHT_PAD;
        this.REDUCED_COL_WIDTH = cfg.REDUCED_COL_WIDTH;
        this.HIDDEN_MARKER_WIDTH = cfg.HIDDEN_MARKER_WIDTH;
        this.HIDDEN_MARKER_COLOR = cfg.HIDDEN_MARKER_COLOR;
        this.COMPRESSED_CELL_VPAD = cfg.COMPRESSED_CELL_VPAD;
        // rendering/behaviour
        this.BUFFER_ROWS = cfg.BUFFER_ROWS;
        this.BUFFER_COLS = cfg.BUFFER_COLS;
        this.MASK_ANIM_MS = cfg.MASK_ANIM_MS;
        // colours
        this.BASE_COLORS = cfg.BASE_COLORS;
        this.DEFAULT_BASE_COLOR = cfg.DEFAULT_BASE_COLOR;
        this.PALE_REF_COLOR = cfg.PALE_REF_COLOR;
        this.REF_ACCENT = cfg.REF_ACCENT;
        // canvas colors
        this.OVERVIEW_BG = cfg.OVERVIEW_BG;
        this.OVERVIEW_EXPANDED_COL = cfg.OVERVIEW_EXPANDED_COL;
        this.OVERVIEW_COLLAPSED_COL = cfg.OVERVIEW_COLLAPSED_COL;
        this.OVERVIEW_VIEWPORT = cfg.OVERVIEW_VIEWPORT;
        this.HEADER_BG = cfg.HEADER_BG;
        this.HEADER_TEXT = cfg.HEADER_TEXT;
        this.HEADER_STROKE = cfg.HEADER_STROKE;
        this.HEADER_SELECTION = cfg.HEADER_SELECTION;
        this.CONSENSUS_BG = cfg.CONSENSUS_BG;
        this.CONSENSUS_SEPARATOR = cfg.CONSENSUS_SEPARATOR;
        this.LABELS_BG = cfg.LABELS_BG;
        this.LABELS_TEXT = cfg.LABELS_TEXT;
        this.LABELS_HEADER_TEXT = cfg.LABELS_HEADER_TEXT;
        // index styling
        this.INDEX_FONT_STYLE = cfg.INDEX_FONT_STYLE;
        this.INDEX_COLOR = cfg.INDEX_COLOR;
        this.INDEX_RIGHT_ALIGN_POS = cfg.INDEX_RIGHT_ALIGN_POS;
        this.LABEL_START_POS = cfg.LABEL_START_POS;
        this.SEQ_SELECTED_ROW = cfg.SEQ_SELECTED_ROW;
        this.SEQ_EVEN_ROW = cfg.SEQ_EVEN_ROW;
        this.SEQ_ODD_ROW = cfg.SEQ_ODD_ROW;
        this.SEQ_COL_SELECTION = cfg.SEQ_COL_SELECTION;
        this.SEQ_RECT_SELECTION_START = cfg.SEQ_RECT_SELECTION_START;
        this.SEQ_RECT_SELECTION_END = cfg.SEQ_RECT_SELECTION_END;
        // initial mask preference
        this.maskEnabled = (typeof cfg.maskEnabled === 'boolean') ? cfg.maskEnabled : this.maskEnabled;
        // snap-to-character scrolling preference
        this.snapEnabled = (typeof cfg.snapEnabled === 'boolean') ? cfg.snapEnabled : true;
      } catch (_) { }

      // Keep canvases sized when the container or scroller change size.
      try {
        const doResize = () => {
          try {
            this.setCanvasCSSSizes();
            this.resizeBackings();
            // Draw immediately after backing resize to avoid blank frames
            if (typeof this.drawAll === 'function') this.drawAll();
          } catch (e) { console.warn('doResize failed', e); }
        };
        if (typeof ResizeObserver !== 'undefined') {
          try {
            this._resizeObserver = new ResizeObserver(doResize);
            this._resizeObserver.observe(this.container);
            if (this.scroller) this._resizeObserver.observe(this.scroller);
          } catch (_) { window.addEventListener('resize', doResize); }
        } else {
          window.addEventListener('resize', doResize);
        }
        // run once to initialize sizes immediately
        try { doResize(); } catch (_) { }
      } catch (_) { }

    }

    // Set or update the alignment data for this viewer instance. This method
    // allows changing the alignment after construction. It rebuilds column
    // offsets, updates sizing, and schedules a render.
    setData(alignment, opts) {
      try {
        if (!alignment) {
          console.warn('SealionViewer.setData: no alignment provided');
          return;
        }
        
        this.alignment = alignment;
        
        // Rebuild column offsets for the new alignment
        if (typeof this.buildColOffsetsFor === 'function') {
          const maxSeqLen = Math.max(...alignment.map(row => row.sequence ? row.sequence.length : 0));
          this.colOffsets = this.buildColOffsetsFor(this.maskEnabled, {
            maxSeqLen: maxSeqLen,
            CHAR_WIDTH: this.charWidth,
            EXPANDED_RIGHT_PAD: this.EXPANDED_RIGHT_PAD || 2,
            REDUCED_COL_WIDTH: this.REDUCED_COL_WIDTH || 1,
            HIDDEN_MARKER_WIDTH: this.HIDDEN_MARKER_WIDTH || 4,
            hideMode: this.hideMode || false,
            maskStr: (opts && opts.maskStr) || (window && window.maskStr) || (window && window.mask) || null
          });
        }
        
        // Update canvas sizes and backings
        if (typeof this.setCanvasCSSSizes === 'function') {
          this.setCanvasCSSSizes(opts);
        }
        if (typeof this.resizeBackings === 'function') {
          this.resizeBackings(opts);
        }
        
        // Schedule a render to display the new data
        if (typeof this.scheduleRender === 'function') {
          this.scheduleRender();
        }
        
        console.info('SealionViewer.setData: alignment updated with', alignment.length, 'sequences');
      } catch (e) {
        console.warn('SealionViewer.setData failed', e);
      }
    }

    // Schedule a backing resize on the next animation frame. This debounces
    // frequent calls (e.g. during drag or window resize) so we don't repeatedly
    // set canvas.width/height which clears the canvas and causes flicker.
    scheduleBackingResize() {
      if (this._backingResizeScheduled) return;
      this._backingResizeScheduled = true;
      const that = this;
      requestAnimationFrame(() => {
        try {
          that._backingResizeScheduled = false;
          that.resizeBackings();
          // Ensure a draw follows the backing resize so canvases show content
          try { if (typeof that.scheduleRender === 'function') that.scheduleRender(); } catch (_) { }
        } catch (_) { that._backingResizeScheduled = false; }
      });
    }

    // Attach default interaction handlers for canvases and scroller.
    // This method now keeps selection state inside the viewer instance so
    // the legacy `script.js` only manages controls/data. Call with the
    // canvas elements and scroller. Callbacks are optional; the viewer will
    // schedule its own renders via this.scheduleRender(), but will also call
    // user-provided callbacks when present.
    // Options expected:
    // { headerCanvas, seqCanvas, labelCanvas, consensusCanvas, overviewCanvas, scroller, callbacks }
    attachInteractionHandlers(opts) {
      if (!opts) opts = {};
      const headerCanvas = opts.headerCanvas || null;
      const seqCanvas = opts.seqCanvas || null;
      const labelCanvas = opts.labelCanvas || null;
      const consensusCanvas = opts.consensusCanvas || null;
      const overviewCanvas = opts.overviewCanvas || null;
      const scroller = opts.scroller || (document.getElementById ? document.getElementById('alignment-scroll') : null);
      const cb = opts.callbacks || {};

      // Persist scroller onto the instance so other methods can reference it
      // without relying on closure variables. This also makes debugging
      // and inspection from the console easier (window.viewer.scroller).
      try { this.scroller = scroller; } catch (_) { }
      // store canvases and spacers for sizing/resizing helpers
      try { this.headerCanvas = headerCanvas; } catch (_) { }
      try { this.seqCanvas = seqCanvas; } catch (_) { }
      try { this.labelCanvas = labelCanvas; } catch (_) { }
      try { this.consensusCanvas = consensusCanvas; } catch (_) { }
      try { this.overviewCanvas = overviewCanvas; } catch (_) { }
      try { this.labelsHeaderCanvas = (opts && opts.labelsHeaderCanvas) ? opts.labelsHeaderCanvas : null; } catch (_) { }
      try { this.seqSpacer = (opts && opts.seqSpacer) ? opts.seqSpacer : null; } catch (_) { }
      try { this.leftSpacer = (opts && opts.leftSpacer) ? opts.leftSpacer : null; } catch (_) { }
      try { this.leftScroll = (opts && opts.leftScroll) ? opts.leftScroll : null; } catch (_) { }

      // Label divider drag-to-resize: allow the application to pass a labelDivider
      // element via opts.labelDivider; otherwise use any divider the viewer
      // created during construction (`this.labelDivider`). Resizing updates the
      // viewer's LABEL_WIDTH, the CSS var --label-width, and triggers a sizing
      // pass (CSS sizes + backing resize) followed by a scheduled render.
      try {
        const labelDividerEl = (opts && opts.labelDivider) ? opts.labelDivider : (this.labelDivider || (document.getElementById ? document.getElementById('label-divider') : null));
        if (labelDividerEl) {
          let isLabelDragging = false;
          let labelDragStartX = 0;
          let labelDragStartWidth = (typeof this.LABEL_WIDTH === 'number') ? this.LABEL_WIDTH : ((window && typeof window.LABEL_WIDTH === 'number') ? window.LABEL_WIDTH : 260);
          const MIN_LABEL_WIDTH = 80;
          const MAX_LABEL_WIDTH = 1200;
          labelDividerEl.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return;
            isLabelDragging = true;
            labelDragStartX = e.clientX;
            labelDragStartWidth = (typeof this.LABEL_WIDTH === 'number') ? this.LABEL_WIDTH : (document.documentElement ? parseInt(getComputedStyle(document.documentElement).getPropertyValue('--label-width') || '260', 10) : 260);
            try { document.body.style.userSelect = 'none'; } catch (_) { }
            e.preventDefault();
          });
          window.addEventListener('mousemove', (e) => {
            if (!isLabelDragging) return;
            const dx = e.clientX - labelDragStartX;
            let nw = Math.max(MIN_LABEL_WIDTH, Math.min(MAX_LABEL_WIDTH, Math.round(labelDragStartWidth + dx)));
            if (nw === this.LABEL_WIDTH) return;
            try { this.LABEL_WIDTH = nw; } catch (_) { }
            try { document.documentElement.style.setProperty('--label-width', this.LABEL_WIDTH + 'px'); } catch (_) { }
            // Update CSS sizes and backing immediately during drag for responsive feedback
            try { this.setCanvasCSSSizes(); } catch (_) { }
            try { this.resizeBackings(); } catch (_) { }
            try { if (typeof this.scheduleRender === 'function') this.scheduleRender(); } catch (_) { }
          });
          window.addEventListener('mouseup', (e) => {
            if (!isLabelDragging) return;
            isLabelDragging = false;
            try { document.body.style.userSelect = ''; } catch (_) { }
            try { document.documentElement.style.setProperty('--label-width', this.LABEL_WIDTH + 'px'); } catch (_) { }
            try { localStorage.setItem('sealion_label_width', String(this.LABEL_WIDTH)); } catch (_) { }
            // Final layout pass and render
            try { this.setCanvasCSSSizes(); } catch (_) { }
            try { this.resizeBackings(); } catch (_) { }
            try { if (typeof this.scheduleRender === 'function') this.scheduleRender(); } catch (_) { }
          });
          // restore persisted width if present
          try {
            const saved = localStorage.getItem('sealion_label_width');
            if (saved) { const v = parseInt(saved, 10); if (Number.isFinite(v) && v > 0) { this.LABEL_WIDTH = v; document.documentElement.style.setProperty('--label-width', this.LABEL_WIDTH + 'px'); } }
          } catch (_) { }
        }
      } catch (_) { }

      // If the application provided a scheduleRender callback, delegate
      // scheduling to it so app-level rendering (in script.js) runs.
      // Otherwise fall back to this.scheduleRender (which triggers drawAll()).
      try {
        const protoSchedule = this.scheduleRender ? this.scheduleRender.bind(this) : null;
        this.scheduleRender = () => {
          try {
            if (cb && typeof cb.scheduleRender === 'function') return cb.scheduleRender();
          } catch (_) { }
          try { if (protoSchedule) return protoSchedule(); } catch (_) { }
        };
      } catch (_) { }

      // Internal selection state now belongs to the viewer instance
      this.selectedRows = this.selectedRows || new Set();
      this.selectedCols = this.selectedCols || new Set();
      this.anchorRow = (typeof this.anchorRow !== 'undefined') ? this.anchorRow : null;
      this.anchorCol = (typeof this.anchorCol !== 'undefined') ? this.anchorCol : null;
      this.isSelecting = false;
      this.selectionStartRow = null;
      this.selectionMode = 'replace';
      this.isRectSelecting = false;
      this.rectStartRow = null; this.rectStartCol = null; this.rectEndRow = null; this.rectEndCol = null; this.rectOriginal = null;
      this.isColSelecting = false; this.selectionStartCol = null;

      // keyboard/space panning state
      this.isSpaceDown = false;
      this.isCmdDrag = false;
      this.dragStartX = 0; this.dragStartY = 0; this.dragStartScrollLeft = 0; this.dragStartScrollTop = 0;

      // snapping state
      this._snapTimeout = null;
      this._snapStartLeft = 0;

      // helper mutation methods exposed on the instance
      this.clearSelectionSets = () => { try { this.selectedRows.clear(); this.selectedCols.clear(); } catch (_) { } };
      this.setSelectionToRange = (a, b) => {
        const lo = Math.max(0, Math.min(a, b));
        const hi = Math.min((this.alignment && this.alignment.length) ? this.alignment.length - 1 : 0, Math.max(a, b));
        this.selectedRows.clear();
        for (let r = lo; r <= hi; r++) this.selectedRows.add(r);
      };
      this.addRangeToSelection = (a, b) => {
        const lo = Math.max(0, Math.min(a, b));
        const hi = Math.min((this.alignment && this.alignment.length) ? this.alignment.length - 1 : 0, Math.max(a, b));
        for (let r = lo; r <= hi; r++) this.selectedRows.add(r);
      };
      this.expandSelectionToInclude = (newPos) => {
        // Expand row selection to include newPos
        if (this.selectedRows.size === 0) {
          this.selectedRows.add(newPos);
          return;
        }
        const currentMin = Math.min(...Array.from(this.selectedRows));
        const currentMax = Math.max(...Array.from(this.selectedRows));
        const lo = Math.max(0, Math.min(currentMin, newPos));
        const hi = Math.min((this.alignment && this.alignment.length) ? this.alignment.length - 1 : 0, Math.max(currentMax, newPos));
        this.selectedRows.clear();
        for (let r = lo; r <= hi; r++) this.selectedRows.add(r);
      };
      this.setColSelectionToRange = (a, b) => {
        const lo = Math.max(0, Math.min(a, b));
        const hi = Math.min((this.colOffsets && this.colOffsets.length > 0) ? this.colOffsets.length - 2 : Math.max(0, (a + b)), Math.max(a, b));
        this.selectedCols.clear();
        for (let c = lo; c <= hi; c++) this.selectedCols.add(c);
      };
      this.addRangeToColSelection = (a, b) => {
        const lo = Math.max(0, Math.min(a, b));
        const hi = Math.min((this.colOffsets && this.colOffsets.length > 0) ? this.colOffsets.length - 2 : Math.max(0, (a + b)), Math.max(a, b));
        for (let c = lo; c <= hi; c++) this.selectedCols.add(c);
      };
      this.expandColSelectionToInclude = (newPos) => {
        // Expand column selection to include newPos
        if (this.selectedCols.size === 0) {
          this.selectedCols.add(newPos);
          return;
        }
        const currentMin = Math.min(...Array.from(this.selectedCols));
        const currentMax = Math.max(...Array.from(this.selectedCols));
        const lo = Math.max(0, Math.min(currentMin, newPos));
        const hi = Math.min((this.colOffsets && this.colOffsets.length > 0) ? this.colOffsets.length - 2 : Math.max(0, currentMax), Math.max(currentMax, newPos));
        this.selectedCols.clear();
        for (let c = lo; c <= hi; c++) this.selectedCols.add(c);
      };
      this.clearRectSelection = () => { this.isRectSelecting = false; this.rectStartRow = this.rectStartCol = this.rectEndRow = this.rectEndCol = null; };
      this.updateRectSelection = (r0, r1, c0, c1, orig) => {
        try {
          let rlo = Math.max(0, Math.min(r0, r1));
          let rhi = Math.min((this.alignment && this.alignment.length) ? this.alignment.length - 1 : 0, Math.max(r0, r1));
          let clo = Math.max(0, Math.min(c0, c1));
          let chi = Math.min((this.colOffsets && this.colOffsets.length > 0) ? this.colOffsets.length - 2 : Math.max(c0, c1), Math.max(c0, c1));
          if (orig) { rlo = Math.min(rlo, orig.rlo); rhi = Math.max(rhi, orig.rhi); clo = Math.min(clo, orig.clo); chi = Math.max(chi, orig.chi); }
          this.selectedRows.clear(); this.selectedCols.clear();
          for (let r = rlo; r <= rhi; r++) this.selectedRows.add(r);
          for (let c = clo; c <= chi; c++) this.selectedCols.add(c);
        } catch (_) { }
      };
      this.finalizeRectSelection = (r0, r1, c0, c1, orig) => {
        try {
          let rlo = Math.max(0, Math.min(r0, r1));
          let rhi = Math.min((this.alignment && this.alignment.length) ? this.alignment.length - 1 : 0, Math.max(r0, r1));
          let clo = Math.max(0, Math.min(c0, c1));
          let chi = Math.min((this.colOffsets && this.colOffsets.length > 0) ? this.colOffsets.length - 2 : Math.max(c0, c1), Math.max(c0, c1));
          if (orig) { rlo = Math.min(rlo, orig.rlo); rhi = Math.max(rhi, orig.rhi); clo = Math.min(clo, orig.clo); chi = Math.max(chi, orig.chi); }
          this.selectedRows.clear(); this.selectedCols.clear();
          for (let r = rlo; r <= rhi; r++) this.selectedRows.add(r);
          for (let c = clo; c <= chi; c++) this.selectedCols.add(c);
          this.anchorRow = rhi; this.anchorCol = chi;
        } catch (_) { }
      };

      // small helper to compute row/col from client coords using provided canvases
      const _rowFromClientY = (clientY) => {
        try { return this.rowFromClientY(clientY, { labelCanvas: labelCanvas, scroller: scroller, ROW_HEIGHT: (window && window.ROW_HEIGHT) ? window.ROW_HEIGHT : 20, rowCount: (this.alignment && this.alignment.length) ? this.alignment.length : 0 }); } catch (_) { return 0; }
      };
      const _colFromClientXLocal = (clientX, canvas) => {
        try {
          const rect = (canvas && canvas.getBoundingClientRect) ? canvas.getBoundingClientRect() : (seqCanvas ? seqCanvas.getBoundingClientRect() : { left: 0 });
          const x = clientX - rect.left; const scrollLeft = scroller ? scroller.scrollLeft : 0; const absX = scrollLeft + x;
          return this.colIndexFromCssOffset(absX);
        } catch (_) { return 0; }
      };

      // Header: click/drag to select columns
      if (headerCanvas) {
        headerCanvas.addEventListener('mousedown', (e) => {
          if (e.button !== 0) return;
          try { this.clearRectSelection(); } catch (_) { }
          try { this.selectedRows.clear(); } catch (_) { }
          const col = (cb.colFromClientX ? cb.colFromClientX(e.clientX) : (cb.colFromClientXLocal ? cb.colFromClientXLocal(e.clientX) : null)) || _colFromClientXLocal(e.clientX, headerCanvas);
          
          if (e.shiftKey && this.selectedCols.size > 0) {
            // Shift-click: expand selection to include this column
            this.expandColSelectionToInclude(col);
            // Determine which end we're extending from
            const currentMin = Math.min(...Array.from(this.selectedCols));
            const currentMax = Math.max(...Array.from(this.selectedCols));
            this.selectionStartCol = (col < currentMin) ? currentMax : currentMin;
          } else {
            this.selectionStartCol = col;
          }
          
          this.selectionMode = e.metaKey ? 'add' : 'replace';
          
          if (e.shiftKey && this.selectedCols.size > 0) {
            // Already handled above
          } else if (e.metaKey) { 
            try { if (this.selectedCols.has(col)) this.selectedCols.delete(col); else this.selectedCols.add(col); } catch (_) { } 
            this.anchorCol = col; 
          } else { 
            try { this.selectedCols.clear(); this.selectedCols.add(col); } catch (_) { } 
            this.anchorCol = col; 
          }
          this.isColSelecting = true; 
          this.scheduleRender();
          e.preventDefault();
        });

        window.addEventListener('mousemove', (e) => {
          if (!this.isColSelecting) return;
          const col = (cb.colFromClientX ? cb.colFromClientX(e.clientX) : (cb.colFromClientXLocal ? cb.colFromClientXLocal(e.clientX) : null)) || _colFromClientXLocal(e.clientX, headerCanvas);
          if (e.metaKey) { 
            try { this.addRangeToColSelection(this.selectionStartCol, col); } catch (_) { } 
          } else { 
            try { this.setColSelectionToRange(this.selectionStartCol, col); } catch (_) { } 
          }
          this.scheduleRender();
        });

        window.addEventListener('mouseup', (e) => {
          if (!this.isColSelecting) return;
          this.isColSelecting = false;
          const col = (cb.colFromClientX ? cb.colFromClientX(e.clientX) : (cb.colFromClientXLocal ? cb.colFromClientXLocal(e.clientX) : null)) || _colFromClientXLocal(e.clientX, headerCanvas);
          this.anchorCol = col; this.scheduleRender();
        });
      }

      // Consensus behaves like header for column selection
      if (consensusCanvas) {
        consensusCanvas.addEventListener('mousedown', (e) => {
          if (e.button !== 0) return;
          try { this.clearRectSelection(); } catch (_) { }
          try { this.selectedRows.clear(); } catch (_) { }
          const col = (cb.colFromClientX ? cb.colFromClientX(e.clientX) : (cb.colFromClientXLocal ? cb.colFromClientXLocal(e.clientX) : null)) || _colFromClientXLocal(e.clientX, consensusCanvas);
          
          if (e.shiftKey && this.selectedCols.size > 0) {
            // Shift-click: expand selection to include this column
            this.expandColSelectionToInclude(col);
            // Determine which end we're extending from
            const currentMin = Math.min(...Array.from(this.selectedCols));
            const currentMax = Math.max(...Array.from(this.selectedCols));
            this.selectionStartCol = (col < currentMin) ? currentMax : currentMin;
          } else {
            this.selectionStartCol = col;
          }
          
          this.selectionMode = e.metaKey ? 'add' : 'replace';
          
          if (e.shiftKey && this.selectedCols.size > 0) {
            // Already handled above
          } else if (e.metaKey) { 
            try { if (this.selectedCols.has(col)) this.selectedCols.delete(col); else this.selectedCols.add(col); } catch (_) { } 
            this.anchorCol = col; 
          } else { 
            try { this.selectedCols.clear(); this.selectedCols.add(col); } catch (_) { } 
            this.anchorCol = col; 
          }
          this.isColSelecting = true; 
          this.scheduleRender();
          e.preventDefault();
        });
      }

      // Overview: click to jump, drag to pan
      if (overviewCanvas) {
        let isOverviewDragging = false;
        overviewCanvas.addEventListener('mousedown', (e) => {
          if (e.button !== 0) return;
          isOverviewDragging = true;
          const rect = overviewCanvas.getBoundingClientRect();
          const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
          const rawTotal = (this.colOffsets && this.colOffsets.length > 0) ? this.colOffsets[this.colOffsets.length - 1] : ((opts && opts.estimatedTotal) ? opts.estimatedTotal : 0);
          const cssW = rect.width || Math.max(1, overviewCanvas.width / (this.pr || 1));
          const scale = cssW / Math.max(1, rawTotal);
          const target = Math.round(x / scale - (scroller ? scroller.clientWidth / 2 : 0));
          this.animateScrollTo(Math.max(0, target), scroller ? scroller.scrollTop : 0, scroller, 320);
          this.scheduleRender();
          e.preventDefault();
        });
        window.addEventListener('mousemove', (e) => {
          if (!isOverviewDragging) return;
          const rect = overviewCanvas.getBoundingClientRect();
          const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
          const rawTotal = (this.colOffsets && this.colOffsets.length > 0) ? this.colOffsets[this.colOffsets.length - 1] : ((opts && opts.estimatedTotal) ? opts.estimatedTotal : 0);
          const cssW = rect.width || Math.max(1, overviewCanvas.width / (this.pr || 1));
          const scale = cssW / Math.max(1, rawTotal);
          const target = Math.round(x / scale - (scroller ? scroller.clientWidth / 2 : 0));
          if (scroller) scroller.scrollLeft = Math.max(0, target);
          this.scheduleRender();
        });
        window.addEventListener('mouseup', () => { isOverviewDragging = false; });
      }

      // Sequence canvas interactions (select columns, rows, rect selection)
      if (seqCanvas) {
        seqCanvas.addEventListener('wheel', (e) => {
          if (!scroller) return;
          scroller.scrollTop += e.deltaY;
          scroller.scrollLeft += e.deltaX;
          this.scheduleRender();
          e.preventDefault();
        }, { passive: false });

        seqCanvas.addEventListener('mousedown', (e) => {
          if (e.button !== 0) return;
          // Command-drag panning begins here as well
          if (this.isSpaceDown) {
            this.isCmdDrag = true;
            this.dragStartX = e.clientX; this.dragStartY = e.clientY;
            this.dragStartScrollLeft = scroller ? scroller.scrollLeft : 0;
            this.dragStartScrollTop = scroller ? scroller.scrollTop : 0;
            try { if (seqCanvas) seqCanvas.style.cursor = 'grabbing'; document.body.style.userSelect = 'none'; } catch (_) { }
            e.preventDefault();
            return;
          }

          const alt = !!e.altKey;
          const meta = !!e.metaKey;

          if (alt && meta) {
            // Rectangle selection
            try { this.clearRectSelection(); } catch (_) { }
            const row = (cb.rowFromClientY ? cb.rowFromClientY(e.clientY) : null) || _rowFromClientY(e.clientY);
            const col = (cb.colFromClientXLocal ? cb.colFromClientXLocal(e.clientX) : null) || _colFromClientXLocal(e.clientX, seqCanvas);
            if (e.shiftKey) {
              if (this.rectStartRow !== null && this.rectEndRow !== null && this.rectStartCol !== null && this.rectEndCol !== null) {
                this.rectOriginal = { rlo: Math.max(0, Math.min(this.rectStartRow, this.rectEndRow)), rhi: Math.min((this.alignment && this.alignment.length) ? this.alignment.length - 1 : 0, Math.max(this.rectStartRow, this.rectEndRow)), clo: Math.max(0, Math.min(this.rectStartCol, this.rectEndCol)), chi: Math.min((this.colOffsets && this.colOffsets.length > 0) ? this.colOffsets.length - 2 : Math.max(this.rectStartCol, this.rectEndCol), Math.max(this.rectStartCol, this.rectEndCol)) };
              } else {
                this.rectOriginal = { rlo: row, rhi: row, clo: col, chi: col };
              }
              this.rectStartRow = this.rectOriginal.rlo; this.rectStartCol = this.rectOriginal.clo;
              this.rectEndRow = row; this.rectEndCol = col;
            } else {
              this.rectOriginal = null;
              this.rectStartRow = row; this.rectEndRow = row; this.rectStartCol = col; this.rectEndCol = col;
            }
            this.isRectSelecting = true;
            this.anchorRow = this.rectStartRow; this.anchorCol = this.rectStartCol;
            // compute live selected sets
            this.selectedRows.clear(); this.selectedCols.clear();
            const rlo0 = Math.max(0, Math.min(this.rectStartRow, this.rectEndRow));
            const rhi0 = Math.min((this.alignment && this.alignment.length) ? this.alignment.length - 1 : 0, Math.max(this.rectStartRow, this.rectEndRow));
            const clo0 = Math.max(0, Math.min(this.rectStartCol, this.rectEndCol));
            const chi0 = Math.min((this.colOffsets && this.colOffsets.length > 0) ? this.colOffsets.length - 2 : Math.max(this.rectStartCol, this.rectEndCol), Math.max(this.rectStartCol, this.rectEndCol));
            for (let r = rlo0; r <= rhi0; r++) this.selectedRows.add(r);
            for (let c = clo0; c <= chi0; c++) this.selectedCols.add(c);
            this.scheduleRender();
            e.preventDefault();
            return;
          }

          if (alt && !meta) {
            // Alt alone: select rows
            try { this.clearRectSelection(); } catch (_) { }
            try { this.selectedCols.clear(); } catch (_) { }
            const row = (cb.rowFromClientY ? cb.rowFromClientY(e.clientY) : null) || _rowFromClientY(e.clientY);
            
            if (e.shiftKey && this.selectedRows.size > 0) {
              // Shift-click: expand selection to include this row
              this.expandSelectionToInclude(row);
              // Determine which end we're extending from
              const currentMin = Math.min(...Array.from(this.selectedRows));
              const currentMax = Math.max(...Array.from(this.selectedRows));
              this.selectionOrigin = (row < currentMin) ? currentMax : currentMin;
            } else {
              this.selectionOrigin = row;
            }
            
            this.selectionMode = e.metaKey ? 'add' : 'replace';
            
            if (e.shiftKey && this.selectedRows.size > 0) {
              // Already handled above
            } else if (e.metaKey) {
              try { if (this.selectedRows.has(row)) this.selectedRows.delete(row); else this.selectedRows.add(row); } catch (_) { }
              this.anchorRow = row;
            } else {
              try { this.selectedRows.clear(); this.selectedRows.add(row); } catch (_) { }
              this.anchorRow = row;
            }
            this.isSelecting = true;
            this.selectionStartRow = row;
            this.scheduleRender();
            e.preventDefault();
            return;
          }

          // Default: select columns
          try { this.clearRectSelection(); } catch (_) { }
          try { this.selectedRows.clear(); } catch (_) { }
          const col = (cb.colFromClientXLocal ? cb.colFromClientXLocal(e.clientX) : null) || _colFromClientXLocal(e.clientX, seqCanvas);
          
          if (e.shiftKey && this.selectedCols.size > 0) {
            // Shift-click: expand selection to include this column
            this.expandColSelectionToInclude(col);
            // Determine which end we're extending from
            const currentMin = Math.min(...Array.from(this.selectedCols));
            const currentMax = Math.max(...Array.from(this.selectedCols));
            this.selectionStartCol = (col < currentMin) ? currentMax : currentMin;
          } else {
            this.selectionStartCol = col;
          }
          
          this.selectionMode = e.metaKey ? 'add' : 'replace';
          
          if (e.shiftKey && this.selectedCols.size > 0) {
            // Already handled above
          } else if (e.metaKey) {
            try { if (this.selectedCols.has(col)) this.selectedCols.delete(col); else this.selectedCols.add(col); } catch (_) { }
            this.anchorCol = col;
          } else {
            try { this.selectedCols.clear(); this.selectedCols.add(col); } catch (_) { }
            this.anchorCol = col;
          }
          this.isColSelecting = true;
          this.scheduleRender();
          e.preventDefault();
        });

        window.addEventListener('mousemove', (e) => {
          if (this.isCmdDrag) {
            if (!e.buttons || !this.isSpaceDown) { this.isCmdDrag = false; return; }
            const dx = e.clientX - this.dragStartX;
            const dy = e.clientY - this.dragStartY;
            const targetLeft = Math.max(0, Math.round(this.dragStartScrollLeft - dx));
            const targetTop = Math.max(0, Math.round(this.dragStartScrollTop - dy));
            if (scroller) { scroller.scrollLeft = targetLeft; scroller.scrollTop = targetTop; }
            this.scheduleRender();
            return;
          }
          if (!this.isRectSelecting) return;
          this.rectEndRow = (cb.rowFromClientY ? cb.rowFromClientY(e.clientY) : null) || _rowFromClientY(e.clientY);
          this.rectEndCol = (cb.colFromClientXLocal ? cb.colFromClientXLocal(e.clientX) : null) || _colFromClientXLocal(e.clientX, seqCanvas);
          try { this.updateRectSelection(this.rectStartRow, this.rectEndRow, this.rectStartCol, this.rectEndCol, this.rectOriginal); } catch (_) { }
          this.scheduleRender();
        });

        window.addEventListener('mouseup', (e) => {
          if (this.isCmdDrag) { this.isCmdDrag = false; return; }
          if (!this.isRectSelecting) return;
          this.isRectSelecting = false;
          this.rectEndRow = (cb.rowFromClientY ? cb.rowFromClientY(e.clientY) : null) || _rowFromClientY(e.clientY);
          this.rectEndCol = (cb.colFromClientXLocal ? cb.colFromClientXLocal(e.clientX) : null) || _colFromClientXLocal(e.clientX, seqCanvas);
          try { this.finalizeRectSelection(this.rectStartRow, this.rectEndRow, this.rectStartCol, this.rectEndCol, this.rectOriginal); } catch (_) { }
          this.anchorRow = Math.max(this.rectStartRow, this.rectEndRow);
          this.anchorCol = Math.max(this.rectStartCol, this.rectEndCol);
          this.rectOriginal = null;
          this.scheduleRender();
        });
      }

      // Label canvas interactions: row selection
      if (labelCanvas) {
        labelCanvas.addEventListener('mousedown', (e) => {
          if (e.button !== 0) return;
          const row = (cb.rowFromClientY ? cb.rowFromClientY(e.clientY) : null) || _rowFromClientY(e.clientY);
          try { this.clearRectSelection(); } catch (_) { }
          try { this.selectedCols.clear(); } catch (_) { }
          
          if (e.shiftKey && this.selectedRows.size > 0) {
            // Shift-click: expand selection to include this row
            this.expandSelectionToInclude(row);
            // Determine which end we're extending from
            const currentMin = Math.min(...Array.from(this.selectedRows));
            const currentMax = Math.max(...Array.from(this.selectedRows));
            this.selectionOrigin = (row < currentMin) ? currentMax : currentMin;
          } else {
            this.selectionOrigin = row;
          }
          
          this.selectionMode = e.metaKey ? 'add' : 'replace';
          
          if (e.shiftKey && this.selectedRows.size > 0) {
            // Already handled above
          } else if (e.metaKey) {
            try { if (this.selectedRows.has(row)) this.selectedRows.delete(row); else this.selectedRows.add(row); } catch (_) { }
            this.anchorRow = row;
          } else {
            try { this.selectedRows.clear(); this.selectedRows.add(row); } catch (_) { }
            this.anchorRow = row;
          }
          this.isSelecting = true;
          this.selectionStartRow = row;
          this.scheduleRender();
          e.preventDefault();
        });

        window.addEventListener('mousemove', (e) => {
          if (!this.isSelecting) return;
          const row = (cb.rowFromClientY ? cb.rowFromClientY(e.clientY) : null) || _rowFromClientY(e.clientY);
          if (this.selectionMode === 'replace') { try { this.setSelectionToRange(this.selectionOrigin, row); } catch (_) { } }
          else if (this.selectionMode === 'add') { try { this.addRangeToSelection(this.selectionOrigin, row); } catch (_) { } }
          this.scheduleRender();
        });

        window.addEventListener('mouseup', (e) => {
          if (!this.isSelecting) return;
          this.isSelecting = false;
          const row = (cb.rowFromClientY ? cb.rowFromClientY(e.clientY) : null) || _rowFromClientY(e.clientY);
          this.anchorRow = row; this.scheduleRender();
        });

        labelCanvas.addEventListener('wheel', (e) => {
          if (!scroller) return;
          scroller.scrollTop += e.deltaY;
          scroller.scrollLeft += e.deltaX;
          this.scheduleRender();
          e.preventDefault();
        }, { passive: false });
      }

      // Keyboard handlers and scroller snapping/paging
      const onKeyDown = (ke) => {
        try {
          // Command-A: select all columns
          if (ke.metaKey && (ke.key === 'a' || ke.code === 'KeyA')) {
            try { ke.preventDefault(); ke.stopImmediatePropagation(); } catch (_) { }
            this.selectedRows.clear(); this.clearRectSelection(); this.selectedCols.clear();
            if (this.colOffsets && this.colOffsets.length > 0) { for (let c = 0; c < this.colOffsets.length - 1; c++) this.selectedCols.add(c); }
            this.anchorCol = Math.max(0, (this.colOffsets && this.colOffsets.length > 0) ? this.colOffsets.length - 2 : 0);
            this.scheduleRender();
            return;
          }
          // Arrow keys navigation
          if (ke.key === 'ArrowLeft' || ke.key === 'ArrowRight' || ke.key === 'ArrowUp' || ke.key === 'ArrowDown') {
            try { ke.preventDefault(); ke.stopImmediatePropagation(); } catch (_) { }
            // focus check: skip when an input is focused
            const ae = document.activeElement;
            const focusOk = (ae === document.body || ae === seqCanvas || ae === labelCanvas || ae === headerCanvas || ae === consensusCanvas || ae === overviewCanvas);
            if (!focusOk) return;
            const view = { scrollLeft: scroller ? scroller.scrollLeft : 0, scrollTop: scroller ? scroller.scrollTop : 0, viewW: scroller ? scroller.clientWidth : window.innerWidth, viewH: scroller ? scroller.clientHeight : window.innerHeight };
            const isAlt = !!ke.altKey;
            if (!isAlt) {
              if (ke.key === 'ArrowLeft') {
                const newCol = Math.max(0, this.colIndexFromCssOffset(view.scrollLeft) - 1);
                const targetLeft = (this.colOffsets && typeof this.colOffsets[newCol] !== 'undefined') ? this.colOffsets[newCol] : view.scrollLeft;
                if (scroller) scroller.scrollLeft = targetLeft;
                return;
              }
              if (ke.key === 'ArrowRight') {
                const newCol = Math.min((this.colOffsets && this.colOffsets.length > 0) ? this.colOffsets.length - 2 : 0, this.colIndexFromCssOffset(view.scrollLeft + view.viewW - 1) + 1);
                const rightBoundary = (this.colOffsets && typeof this.colOffsets[newCol + 1] !== 'undefined') ? this.colOffsets[newCol + 1] : (this.colOffsets && this.colOffsets.length > 0 ? this.colOffsets[this.colOffsets.length - 1] : 0);
                const totalWidth = (this.colOffsets && this.colOffsets.length > 0) ? this.colOffsets[this.colOffsets.length - 1] : 0;
                let targetLeft = Math.round(rightBoundary - view.viewW);
                targetLeft = Math.max(0, Math.min(totalWidth - view.viewW, targetLeft));
                if (scroller) scroller.scrollLeft = targetLeft;
                return;
              }
              if (ke.key === 'ArrowUp') {
                try {
                  const curTop = scroller ? scroller.scrollTop : 0;
                  const rowH = (window && window.ROW_HEIGHT) ? window.ROW_HEIGHT : 20;
                  const targetTop = Math.max(0, curTop - rowH);
                  // animate one-row scroll for visual feedback
                  this.animateScrollTo(scroller ? scroller.scrollLeft : 0, targetTop, scroller, 160);
                } catch (_) { }
                return;
              }
              if (ke.key === 'ArrowDown') {
                try {
                  const curTop = scroller ? scroller.scrollTop : 0;
                  const rowH = (window && window.ROW_HEIGHT) ? window.ROW_HEIGHT : 20;
                  const viewH = scroller ? scroller.clientHeight : window.innerHeight;
                  const maxTop = Math.max(0, (this.alignment && this.alignment.length ? this.alignment.length : 0) * rowH - viewH);
                  // non-alt ArrowDown moves one row; Alt+ArrowDown handles page scroll
                  const targetTop = Math.min(maxTop, curTop + rowH);
                  // animate one-row scroll for visual feedback
                  this.animateScrollTo(scroller ? scroller.scrollLeft : 0, targetTop, scroller, 160);
                } catch (_) { }
                return;
              }
            }
            // Alt pressed: page scroll with animation handled by the viewer
            if (isAlt) {
              if (ke.key === 'ArrowLeft') {
                const target = Math.max(0, (scroller ? scroller.scrollLeft : 0) - (scroller ? scroller.clientWidth : window.innerWidth));
                const col = this.colIndexFromCssOffset(target);
                const targetLeft = (this.colOffsets && typeof this.colOffsets[col] !== 'undefined') ? this.colOffsets[col] : (this.colOffsets && this.colOffsets.length > 0 ? this.colOffsets[0] : 0);
                this.animateScrollTo(targetLeft, scroller ? scroller.scrollTop : 0, scroller, 320); return;
              }
              if (ke.key === 'ArrowRight') {
                const target = Math.min((this.colOffsets && this.colOffsets.length > 0 ? this.colOffsets[this.colOffsets.length - 1] : 0), (scroller ? scroller.scrollLeft : 0) + (scroller ? scroller.clientWidth : window.innerWidth));
                const col = this.colIndexFromCssOffset(target);
                const targetLeft = (this.colOffsets && typeof this.colOffsets[col] !== 'undefined') ? this.colOffsets[col] : 0;
                this.animateScrollTo(targetLeft, scroller ? scroller.scrollTop : 0, scroller, 320); return;
              }
              if (ke.key === 'ArrowUp') {
                const targetTop = Math.max(0, (scroller ? scroller.scrollTop : 0) - (scroller ? scroller.clientHeight : window.innerHeight));
                this.animateScrollTo(scroller ? scroller.scrollLeft : 0, targetTop, scroller, 320); return;
              }
              if (ke.key === 'ArrowDown') {
                const maxTop = Math.max(0, (this.alignment && this.alignment.length ? this.alignment.length : 0) * (window && window.ROW_HEIGHT ? window.ROW_HEIGHT : 20) - (scroller ? scroller.clientHeight : window.innerHeight));
                const targetTop = Math.min(maxTop, (scroller ? scroller.scrollTop : 0) + (scroller ? scroller.clientHeight : window.innerHeight));
                this.animateScrollTo(scroller ? scroller.scrollLeft : 0, targetTop, scroller, 320); return;
              }
            }
          }
          // Font size shortcuts using Alt-Cmd-Plus/Minus
          const mod = ke.metaKey;
          const alt = ke.altKey;
          const isPlus = (ke.key === '+') || (ke.key === '=') || (ke.code === 'Equal') || ke.code === 'NumpadAdd';
          const isMinus = (ke.key === '-') || ke.code === 'Minus' || ke.code === 'NumpadSubtract';

          // Alt-Cmd-Plus: Increase font size
          if (mod && alt && isPlus) {
            try {
              const increaseBtn = document.getElementById('font-increase-btn');
              if (increaseBtn) increaseBtn.click();
            } catch (_) { }
            try { ke.preventDefault(); ke.stopImmediatePropagation(); } catch (_) { }
            return;
          }
          // Alt-Cmd-Minus: Decrease font size
          if (mod && alt && isMinus) {
            try {
              const decreaseBtn = document.getElementById('font-decrease-btn');
              if (decreaseBtn) decreaseBtn.click();
            } catch (_) { }
            try { ke.preventDefault(); ke.stopImmediatePropagation(); } catch (_) { }
            return;
          }

          // mask edit shortcuts using Cmd+Plus/Minus: prefer the viewer's own
          // mask-editing API, falling back to any provided callback.
          if (mod && isPlus) {
            try {
              if (typeof this.setMaskBitsForCols === 'function') {
                this.setMaskBitsForCols(this.selectedCols, '1');
              } else if (cb && typeof cb.setMaskBitsForCols === 'function') {
                cb.setMaskBitsForCols(this.selectedCols, '1');
              }
            } catch (_) { }
            try { ke.preventDefault(); ke.stopImmediatePropagation(); } catch (_) { }
            return;
          }
          if (mod && isMinus) {
            try {
              if (typeof this.setMaskBitsForCols === 'function') {
                this.setMaskBitsForCols(this.selectedCols, '0');
              } else if (cb && typeof cb.setMaskBitsForCols === 'function') {
                cb.setMaskBitsForCols(this.selectedCols, '0');
              }
            } catch (_) { }
            try { ke.preventDefault(); ke.stopImmediatePropagation(); } catch (_) { }
            return;
          }
          if (ke.code === 'Space' || ke.key === ' ') {
            const ae = document.activeElement;
            if (ae === document.body || ae === seqCanvas || ae === labelCanvas || ae === headerCanvas) { try { ke.preventDefault(); } catch (_) { } }
            this.isSpaceDown = true; this.updateSpaceCursor = this.updateSpaceCursor || (() => { try { const cur = (this.isSpaceDown && !this.isCmdDrag) ? 'grab' : ''; if (seqCanvas) seqCanvas.style.cursor = cur; } catch (_) { } }); this.updateSpaceCursor();
          }
        } catch (_) { }
      };
      const onKeyUp = (ke) => { if (ke.code === 'Space' || ke.key === ' ') { this.isSpaceDown = false; try { if (seqCanvas) seqCanvas.style.cursor = ''; } catch (_) { } } };
      const onBlur = () => { this.isSpaceDown = false; try { if (seqCanvas) seqCanvas.style.cursor = ''; } catch (_) { } };
      window.addEventListener('keydown', onKeyDown);
      window.addEventListener('keyup', onKeyUp);
      window.addEventListener('blur', onBlur);

      // Scroller: mirror vertical scroll if requested and handle snap debounce
      if (scroller) {
        scroller.addEventListener('scroll', () => {
          // schedule render for header/seq
          this.scheduleRender();
          // debounce snapping
          if (!this.snapEnabled) return;
          if (this._snapTimeout === null) this._snapStartLeft = scroller.scrollLeft;
          if (this._snapTimeout) clearTimeout(this._snapTimeout);
          this._snapTimeout = setTimeout(() => { this.snapScrollToChar(this._snapStartLeft, scroller); this._snapTimeout = null; }, 60);
        });
      }

      // expose a small public API for external callers
      this.getSelectedRows = () => new Set(this.selectedRows);
      this.getSelectedCols = () => new Set(this.selectedCols);
      this.setSelectedRows = (rows) => { try { this.selectedRows.clear(); for (const r of rows) this.selectedRows.add(r); this.scheduleRender(); } catch (_) { } };
      this.setSelectedCols = (cols) => { try { this.selectedCols.clear(); for (const c of cols) this.selectedCols.add(c); this.scheduleRender(); } catch (_) { } };
    }

    // Measure char width in CSS pixels using an offscreen canvas. The returned
    // value is stored in `this.charWidth` and is safe to use when computing
    // layout in CSS pixels. We avoid using backing-size values directly.
    measureCharWidthFromReal(font) {
      const ctx = this._measureCtx;
      // Reset any transform so measureText returns CSS pixel widths
      ctx.setTransform(1, 0, 0, 1, 0, 0);

      // Allow callers to provide a font string; otherwise derive a reasonable
      // monospace default. We don't query computed styles here to keep this
      // initial pass safe and dependency-free.
      ctx.font = font || '12px monospace';

      // Use the letter 'M' (commonly wide for monospace) as a stable probe
      const m = ctx.measureText('M').width || 7;
      const measured = Math.max(4, Math.round(m));
      this.charWidth = measured;
      return measured;
    }

    // Measure char width using a lightweight canvas context (may be faster
    // but less exact than measureCharWidthFromReal). Updates this.charWidth
    // and also writes window.CHAR_WIDTH for compatibility. If opts.apply is
    // true the method will also rebuild colOffsets and resize backings.
    measureCharWidth(font, opts) {
      try {
        const ctx = document.createElement('canvas').getContext('2d');
        ctx.font = font || (window && window.FONT) ? window.FONT : '12px monospace';
        const m = ctx.measureText('W');
        const w = m && m.width ? m.width : (this.charWidth || 8);
        const val = Math.max(1, Math.ceil(w));
        this.charWidth = val;
        try { if (window) window.CHAR_WIDTH = val; } catch (_) { }
        if (opts && opts.apply) {
          try { const colOffsets = this.buildColOffsetsFor((opts && typeof opts.maskEnabled === 'boolean') ? opts.maskEnabled : true, opts); this.colOffsets = colOffsets; } catch (_) { }
          try { this.setCanvasCSSSizes(opts); } catch (_) { }
          try { this.resizeBackings(opts); } catch (_) { }
          try { if (typeof this.scheduleRender === 'function') this.scheduleRender(); } catch (_) { }
        }
        return val;
      } catch (e) { return this.measureCharWidthFromReal(font); }
    }

    // Measure vertical text offsets (seq and label) to compute centering offsets
    // for glyph drawing. Updates this.seqTextVertOffset and this.labelTextVertOffset
    // and also writes window.seqTextVertOffset/labelTextVertOffset for compatibility.
    measureTextVerticalOffset(opts) {
      try {
        const seqCanvas = this.seqCanvas || (document.getElementById ? document.getElementById('seq-canvas') : null);
        const labelCanvas = this.labelCanvas || (document.getElementById ? document.getElementById('labels-canvas') : null);
        const FONT = (opts && opts.FONT) ? opts.FONT : ((window && window.FONT) ? window.FONT : '12px monospace');
        const LABEL_FONT = (opts && opts.LABEL_FONT) ? opts.LABEL_FONT : ((this.labelFont) ? this.labelFont : FONT);
        const ROW_HEIGHT = (opts && typeof opts.ROW_HEIGHT === 'number') ? opts.ROW_HEIGHT : ((window && typeof window.ROW_HEIGHT === 'number') ? window.ROW_HEIGHT : 20);
        try {
          if (seqCanvas) { const ctx = seqCanvas.getContext('2d'); ctx.font = FONT; const metrics = ctx.measureText('Mg'); if (metrics && typeof metrics.actualBoundingBoxAscent === 'number') { const ascent = metrics.actualBoundingBoxAscent; const descent = metrics.actualBoundingBoxDescent || 0; this.seqTextVertOffset = Math.round((ROW_HEIGHT - (ascent + descent)) / 2 + ascent); } else { this.seqTextVertOffset = Math.round(ROW_HEIGHT / 2); } }
        } catch (e) { this.seqTextVertOffset = Math.round(ROW_HEIGHT / 2); }
        try {
          if (labelCanvas) { const ctx2 = labelCanvas.getContext('2d'); ctx2.font = LABEL_FONT; const metrics2 = ctx2.measureText('Mg'); if (metrics2 && typeof metrics2.actualBoundingBoxAscent === 'number') { const ascent2 = metrics2.actualBoundingBoxAscent; const descent2 = metrics2.actualBoundingBoxDescent || 0; this.labelTextVertOffset = Math.round((ROW_HEIGHT - (ascent2 + descent2)) / 2 + ascent2); } else { this.labelTextVertOffset = Math.round(ROW_HEIGHT / 2); } }
        } catch (e) { this.labelTextVertOffset = Math.round(ROW_HEIGHT / 2); }
        try { if (window) window.seqTextVertOffset = this.seqTextVertOffset; } catch (_) { }
        try { if (window) window.labelTextVertOffset = this.labelTextVertOffset; } catch (_) { }
        return { seqTextVertOffset: this.seqTextVertOffset, labelTextVertOffset: this.labelTextVertOffset };
      } catch (e) { return null; }
    }

    // Measure font pixel heights for label and sequence and set ROW_HEIGHT on
    // the viewer and window for compatibility. If opts.apply is true, also
    // update CSS var and call setCanvasCSSSizes/resizeBackings and scheduleRender.
    measureRowHeightFromFonts(opts) {
      try {
        opts = opts || {};
        const seqCanvas = this.seqCanvas || (document.getElementById ? document.getElementById('seq-canvas') : null);
        const labelCanvas = this.labelCanvas || (document.getElementById ? document.getElementById('labels-canvas') : null);
        const FONT = (opts && opts.FONT) ? opts.FONT : ((window && window.FONT) ? window.FONT : '12px monospace');
        const LABEL_FONT = (opts && opts.LABEL_FONT) ? opts.LABEL_FONT : ((this.labelFont) ? this.labelFont : FONT);
        let seqHeight = 0, labHeight = 0;
        if (seqCanvas) { const ctx = seqCanvas.getContext('2d'); ctx.font = FONT; const seqMetrics = ctx.measureText('Mg'); if (seqMetrics && typeof seqMetrics.actualBoundingBoxAscent === 'number') { seqHeight = Math.ceil((seqMetrics.actualBoundingBoxAscent || 0) + (seqMetrics.actualBoundingBoxDescent || 0)); } else { const m = FONT.match(/(\d+)px/); const px = m ? parseInt(m[1], 10) : 14; seqHeight = Math.round(px * 1.2); } }
        if (labelCanvas) { const ctx2 = labelCanvas.getContext('2d'); ctx2.font = LABEL_FONT; const labMetrics = ctx2.measureText('Mg'); if (labMetrics && typeof labMetrics.actualBoundingBoxAscent === 'number') { labHeight = Math.ceil((labMetrics.actualBoundingBoxAscent || 0) + (labMetrics.actualBoundingBoxDescent || 0)); } else { const m2 = LABEL_FONT.match(/(\d+)px/); const px2 = m2 ? parseInt(m2[1], 10) : 14; labHeight = Math.round(px2 * 1.2); } }
        const newRow = Math.max(8, Math.ceil(Math.max(seqHeight || 0, labHeight || 0) + ((opts && typeof opts.ROW_PADDING === 'number') ? opts.ROW_PADDING : (window && typeof window.ROW_PADDING === 'number' ? window.ROW_PADDING : 6))));
        this.ROW_HEIGHT = newRow;
        try { if (window) window.ROW_HEIGHT = newRow; } catch (_) { }
        try { document.documentElement.style.setProperty('--row-height', newRow + 'px'); } catch (_) { }
        // Calculate consensus height based on sequence font
        const CONSENSUS_TOP_PAD = (opts && typeof opts.CONSENSUS_TOP_PAD !== 'undefined') ? opts.CONSENSUS_TOP_PAD : (this.CONSENSUS_TOP_PAD || 4);
        const CONSENSUS_BOTTOM_PAD = (opts && typeof opts.CONSENSUS_BOTTOM_PAD !== 'undefined') ? opts.CONSENSUS_BOTTOM_PAD : (this.CONSENSUS_BOTTOM_PAD || 8);
        const newConsensusHeight = Math.max(16, Math.ceil(seqHeight + CONSENSUS_TOP_PAD + CONSENSUS_BOTTOM_PAD));
        this.CONSENSUS_HEIGHT = newConsensusHeight;
        try { if (window) window.CONSENSUS_HEIGHT = newConsensusHeight; } catch (_) { }
        // Update vertical text offsets for the new row height and fonts
        try { this.measureTextVerticalOffset({ FONT: FONT, LABEL_FONT: LABEL_FONT, ROW_HEIGHT: newRow }); } catch (_) { }
        if (opts && opts.apply) {
          try { this.setCanvasCSSSizes(opts); } catch (_) { }
          try { this.resizeBackings(opts); } catch (_) { }
          try { if (typeof this.scheduleRender === 'function') this.scheduleRender(); } catch (_) { }
        }
        return newRow;
      } catch (e) { return (window && typeof window.ROW_HEIGHT === 'number') ? window.ROW_HEIGHT : 20; }
    }

    // Update font sizes by a delta amount (positive to increase, negative to decrease)
    updateFontSize(delta) {
      try {
        // Get current font sizes
        const currentSeqSize = this.fontSize || 14;
        const currentLabelSize = this.labelFontSize || 14;

        // Set initial label font size on first call
        if (this.initialLabelFontSize === null || this.initialLabelFontSize === undefined) {
          this.initialLabelFontSize = currentLabelSize;
        }

        // Calculate new sizes with bounds
        const newSeqSize = Math.max(8, Math.min(32, currentSeqSize + delta));
        let newLabelSize;

        if (delta > 0) {
          // Increasing: grow label up to initial size, then keep it capped there
          newLabelSize = Math.min(this.initialLabelFontSize, currentLabelSize + delta);
        } else {
          // Decreasing: only reduce label size once sequence size has reached label size
          if (newSeqSize >= currentLabelSize) {
            // Sequence is still larger than or equal to label - keep label size unchanged
            newLabelSize = currentLabelSize;
          } else {
            // Sequence has dropped below label - now reduce both together
            newLabelSize = Math.max(8, currentLabelSize + delta);
          }
        }

        const newSeqFont = newSeqSize + 'px monospace';
        const newLabelFont = newLabelSize + 'px monospace';

        // Update viewer's FONT properties
        this.FONT = newSeqFont;
        this.fontSize = newSeqSize;
        this.labelFont = newLabelFont;
        this.labelFontSize = newLabelSize;

        // Re-measure character width with the new sequence font
        if (typeof this.measureCharWidthFromReal === 'function') {
          this.measureCharWidthFromReal(newSeqFont);
        }

        // Re-measure row height based on both fonts
        if (typeof this.measureRowHeightFromFonts === 'function') {
          this.measureRowHeightFromFonts({
            FONT: newSeqFont,
            LABEL_FONT: newLabelFont,
            apply: true  // This will call setCanvasCSSSizes, resizeBackings, and scheduleRender
          });
        } else {
          // Fallback if measureRowHeightFromFonts doesn't exist
          if (typeof this.setCanvasCSSSizes === 'function') {
            this.setCanvasCSSSizes();
          }
          if (typeof this.resizeBackings === 'function') {
            this.resizeBackings();
          }
          if (typeof this.scheduleRender === 'function') {
            this.scheduleRender();
          }
        }

        // Rebuild column offsets with new character width
        if (typeof this.buildColOffsetsFor === 'function' && this.colOffsets) {
          const maxSeqLen = this.colOffsets.length - 1;
          this.colOffsets = this.buildColOffsetsFor(this.maskEnabled, {
            maxSeqLen: maxSeqLen,
            CHAR_WIDTH: this.charWidth,
            EXPANDED_RIGHT_PAD: this.EXPANDED_RIGHT_PAD || 2,
            REDUCED_COL_WIDTH: this.REDUCED_COL_WIDTH || 1,
            HIDDEN_MARKER_WIDTH: this.HIDDEN_MARKER_WIDTH || 4,
            hideMode: this.hideMode || false,
            maskStr: (window && window.maskStr) || (window && window.mask) || null
          });
        }

        // Update window properties for compatibility
        try { window.FONT_SIZE = newSeqSize; } catch (_) { }
        try { window.FONT = newSeqFont; } catch (_) { }
        try { window.LABEL_FONT_SIZE = newLabelSize; } catch (_) { }
        try { window.LABEL_FONT = newLabelFont; } catch (_) { }

        console.info('Font sizes set to - sequence:', newSeqSize, 'label:', newLabelSize);
      } catch (e) { console.warn('updateFontSize failed', e); }
    }

    // Reset font sizes to default values
    resetFontSize() {
      try {
        const defaultSeqSize = 14;
        const defaultLabelSize = 14;

        const defaultSeqFont = defaultSeqSize + 'px monospace';
        const defaultLabelFont = defaultLabelSize + 'px monospace';

        // Reset initial label font size tracker
        this.initialLabelFontSize = defaultLabelSize;

        // Update viewer's FONT properties
        this.FONT = defaultSeqFont;
        this.fontSize = defaultSeqSize;
        this.labelFont = defaultLabelFont;
        this.labelFontSize = defaultLabelSize;

        // Re-measure character width with the default font
        if (typeof this.measureCharWidthFromReal === 'function') {
          this.measureCharWidthFromReal(defaultSeqFont);
        }

        // Re-measure row height based on both fonts
        if (typeof this.measureRowHeightFromFonts === 'function') {
          this.measureRowHeightFromFonts({
            FONT: defaultSeqFont,
            LABEL_FONT: defaultLabelFont,
            apply: true
          });
        } else {
          // Fallback if measureRowHeightFromFonts doesn't exist
          if (typeof this.setCanvasCSSSizes === 'function') {
            this.setCanvasCSSSizes();
          }
          if (typeof this.resizeBackings === 'function') {
            this.resizeBackings();
          }
          if (typeof this.scheduleRender === 'function') {
            this.scheduleRender();
          }
        }

        // Rebuild column offsets with default character width
        if (typeof this.buildColOffsetsFor === 'function' && this.colOffsets) {
          const maxSeqLen = this.colOffsets.length - 1;
          this.colOffsets = this.buildColOffsetsFor(this.maskEnabled, {
            maxSeqLen: maxSeqLen,
            CHAR_WIDTH: this.charWidth,
            EXPANDED_RIGHT_PAD: this.EXPANDED_RIGHT_PAD || 2,
            REDUCED_COL_WIDTH: this.REDUCED_COL_WIDTH || 1,
            HIDDEN_MARKER_WIDTH: this.HIDDEN_MARKER_WIDTH || 4,
            hideMode: this.hideMode || false,
            maskStr: (window && window.maskStr) || (window && window.mask) || null
          });
        }

        // Update window properties
        try { window.FONT_SIZE = defaultSeqSize; } catch (_) { }
        try { window.FONT = defaultSeqFont; } catch (_) { }
        try { window.LABEL_FONT_SIZE = defaultLabelSize; } catch (_) { }
        try { window.LABEL_FONT = defaultLabelFont; } catch (_) { }

        console.info('Font sizes reset to defaults - sequence:', defaultSeqSize, 'label:', defaultLabelSize);
      } catch (e) { console.warn('resetFontSize failed', e); }
    }

    // Set CSS sizes for the canvases and spacer elements. Accepts optional
    // overrides in opts: { LABEL_WIDTH, ROW_HEIGHT }
    setCanvasCSSSizes(opts) {
      try {
        opts = opts || {};
        const labelCanvas = this.labelCanvas || (opts && opts.labelCanvas) || (document.getElementById ? document.getElementById('labels-canvas') : null);
        const seqCanvas = this.seqCanvas || (opts && opts.seqCanvas) || (document.getElementById ? document.getElementById('seq-canvas') : null);
        const headerCanvas = this.headerCanvas || (opts && opts.headerCanvas) || (document.getElementById ? document.getElementById('header-canvas') : null);
        const overviewCanvas = this.overviewCanvas || (opts && opts.overviewCanvas) || (document.getElementById ? document.getElementById('overview-canvas') : null);
        const consensusCanvas = this.consensusCanvas || (opts && opts.consensusCanvas) || (document.getElementById ? document.getElementById('consensus-canvas') : null);
        const labelsOutlineCanvas = this.labelsOutlineCanvas || (opts && opts.labelsOutlineCanvas) || (document.getElementById ? document.getElementById('labels-outline-canvas') : null);
        const labelsHeaderCanvas = this.labelsHeaderCanvas || (opts && opts.labelsHeaderCanvas) || (document.getElementById ? document.getElementById('labels-header-canvas') : null);
        const labelsConsensusCanvas = this.labelsConsensusCanvas || (opts && opts.labelsConsensusCanvas) || (document.getElementById ? document.getElementById('labels-consensus-canvas') : null);
        const seqSpacer = this.seqSpacer || (opts && opts.seqSpacer) || (document.getElementById ? document.getElementById('seq-spacer') : null);
        const leftSpacer = this.leftSpacer || (opts && opts.leftSpacer) || (document.getElementById ? document.getElementById('left-spacer') : null);
        const scroller = this.scroller || (opts && opts.scroller) || (document.getElementById ? document.getElementById('alignment-scroll') : null);

        // Resolve label width in this priority order:
        // 1. opts.LABEL_WIDTH (explicit call override)
        // 2. this.LABEL_WIDTH (viewer instance, e.g. dragged value)
        // 3. window.LABEL_WIDTH (legacy global)
        // 4. CSS variable --label-width (document-level stylesheet)
        // 5. fallback default 260
        let LABEL_WIDTH;
        if (typeof opts.LABEL_WIDTH === 'number') LABEL_WIDTH = opts.LABEL_WIDTH;
        else if (typeof this.LABEL_WIDTH === 'number') LABEL_WIDTH = this.LABEL_WIDTH;
        else if (window && typeof window.LABEL_WIDTH === 'number') LABEL_WIDTH = window.LABEL_WIDTH;
        else {
          try {
            const cssVal = getComputedStyle(document.documentElement).getPropertyValue('--label-width') || '';
            const parsed = parseInt(cssVal.replace('px', '').trim(), 10);
            LABEL_WIDTH = Number.isFinite(parsed) && parsed > 0 ? parsed : 260;
          } catch (_) { LABEL_WIDTH = 260; }
        }
        const ROW_HEIGHT = (typeof opts.ROW_HEIGHT === 'number') ? opts.ROW_HEIGHT : ((window && typeof window.ROW_HEIGHT === 'number') ? window.ROW_HEIGHT : 20);

        if (labelCanvas) labelCanvas.style.width = LABEL_WIDTH + 'px';
        try { if (labelCanvas) { labelCanvas.style.position = labelCanvas.style.position || 'absolute'; labelCanvas.style.left = '0px'; labelCanvas.style.top = '0px'; labelCanvas.style.zIndex = '1'; } } catch (_) { }

        const viewportHeight = Math.max(1, (scroller && scroller.clientHeight) ? scroller.clientHeight : window.innerHeight);
        const viewportWidth = Math.max(1, (scroller && scroller.clientWidth) ? scroller.clientWidth : window.innerWidth);
        const totalHeight = (this.alignment && this.alignment.length) ? this.alignment.length * ROW_HEIGHT : (window && typeof window.rowCount === 'number' ? window.rowCount * ROW_HEIGHT : 0);

        if (labelCanvas) labelCanvas.style.height = viewportHeight + 'px';
        // ensure spacer width is set from current colOffsets if available
        try { if (seqSpacer) { const totalWidth = (this.colOffsets && this.colOffsets.length) ? this.colOffsets[this.colOffsets.length - 1] : Math.max(1, (window && typeof window.maxSeqLen === 'number' ? window.maxSeqLen : 0) * ((this.charWidth || 8) + 2)); seqSpacer.style.width = totalWidth + 'px'; seqSpacer.style.display = 'block'; seqSpacer.style.height = totalHeight + 'px'; } } catch (_) { }
        if (leftSpacer) leftSpacer.style.height = totalHeight + 'px';

        if (seqCanvas) { seqCanvas.style.position = 'absolute'; seqCanvas.style.left = '0px'; seqCanvas.style.top = '0px'; seqCanvas.style.zIndex = '1'; seqCanvas.style.height = viewportHeight + 'px'; seqCanvas.style.width = viewportWidth + 'px'; }
        if (headerCanvas) { headerCanvas.style.width = viewportWidth + 'px'; headerCanvas.style.height = Math.round((window && window.HEADER_HEIGHT) ? window.HEADER_HEIGHT : 30) + 'px'; }
        if (overviewCanvas) { const parentW = (overviewCanvas.parentElement && overviewCanvas.parentElement.clientWidth) ? overviewCanvas.parentElement.clientWidth : viewportWidth; const scrollbarWidth = scroller ? Math.max(0, scroller.offsetWidth - scroller.clientWidth) : 0; const hdrW = Math.max(1, parentW - scrollbarWidth); overviewCanvas.style.width = hdrW + 'px'; overviewCanvas.style.height = Math.round((window && window.OVERVIEW_HEIGHT) ? window.OVERVIEW_HEIGHT : 48) + 'px'; }
        if (consensusCanvas) { const parentWc = (consensusCanvas.parentElement && consensusCanvas.parentElement.clientWidth) ? consensusCanvas.parentElement.clientWidth : viewportWidth; const scrollbarWidthc = scroller ? Math.max(0, scroller.offsetWidth - scroller.clientWidth) : 0; const cssWc = Math.max(1, parentWc - scrollbarWidthc); consensusCanvas.style.width = cssWc + 'px'; consensusCanvas.style.height = (window && window.CONSENSUS_HEIGHT) ? window.CONSENSUS_HEIGHT + 'px' : '20px'; }
        if (labelsOutlineCanvas) { labelsOutlineCanvas.style.width = LABEL_WIDTH + 'px'; labelsOutlineCanvas.style.height = Math.round((window && window.OVERVIEW_HEIGHT) ? window.OVERVIEW_HEIGHT : 48) + 'px'; }
        if (labelsHeaderCanvas) { labelsHeaderCanvas.style.width = LABEL_WIDTH + 'px'; labelsHeaderCanvas.style.height = Math.round((window && window.HEADER_HEIGHT) ? window.HEADER_HEIGHT : 30) + 'px'; }
        if (labelsConsensusCanvas) { labelsConsensusCanvas.style.width = LABEL_WIDTH + 'px'; labelsConsensusCanvas.style.height = (window && window.CONSENSUS_HEIGHT) ? window.CONSENSUS_HEIGHT + 'px' : '20px'; }

        // Update CSS custom properties for dynamic heights
        const overviewHeight = (window && window.OVERVIEW_HEIGHT) ? window.OVERVIEW_HEIGHT : 48;
        const headerHeight = (window && window.HEADER_HEIGHT) ? window.HEADER_HEIGHT : 30;
        const consensusHeight = (window && window.CONSENSUS_HEIGHT) ? window.CONSENSUS_HEIGHT : 20;
        try {
          const root = document.documentElement;
          if (root) {
            root.style.setProperty('--overview-height', overviewHeight + 'px');
            root.style.setProperty('--header-height', headerHeight + 'px');
            root.style.setProperty('--consensus-height', consensusHeight + 'px');
          } 
        } catch (_) { }

        // Update alignment div position to account for dynamic header heights
        const alignmentDiv = this.alignmentDiv || (document.getElementById ? document.getElementById('alignment') : null);
        if (alignmentDiv) {
          const totalHeaderHeight = overviewHeight + headerHeight + consensusHeight;
          alignmentDiv.style.marginTop = totalHeaderHeight + 'px';
          alignmentDiv.style.height = 'calc(100% - ' + totalHeaderHeight + 'px)';
        }
      } catch (e) { console.warn('SealionViewer.setCanvasCSSSizes failed', e); }
    }

    // Resize backing store pixels for canvases and apply DPR transform
    resizeBackings(opts) {
      try {
        opts = opts || {};
        const pr = window.devicePixelRatio || 1; // keep viewer.pr maybe stale
        const scroller = this.scroller || (opts && opts.scroller) || (document.getElementById ? document.getElementById('alignment-scroll') : null);
        const seqCanvas = this.seqCanvas || (opts && opts.seqCanvas) || (document.getElementById ? document.getElementById('seq-canvas') : null);
        const labelCanvas = this.labelCanvas || (opts && opts.labelCanvas) || (document.getElementById ? document.getElementById('labels-canvas') : null);
        const headerCanvas = this.headerCanvas || (opts && opts.headerCanvas) || (document.getElementById ? document.getElementById('header-canvas') : null);
        const overviewCanvas = this.overviewCanvas || (opts && opts.overviewCanvas) || (document.getElementById ? document.getElementById('overview-canvas') : null);
        const consensusCanvas = this.consensusCanvas || (opts && opts.consensusCanvas) || (document.getElementById ? document.getElementById('consensus-canvas') : null);
        const labelsOutlineCanvas = this.labelsOutlineCanvas || (opts && opts.labelsOutlineCanvas) || (document.getElementById ? document.getElementById('labels-outline-canvas') : null);
        const labelsHeaderCanvas = this.labelsHeaderCanvas || (opts && opts.labelsHeaderCanvas) || (document.getElementById ? document.getElementById('labels-header-canvas') : null);
        const labelsConsensusCanvas = this.labelsConsensusCanvas || (opts && opts.labelsConsensusCanvas) || (document.getElementById ? document.getElementById('labels-consensus-canvas') : null);

        const viewportHeight = Math.max(1, (scroller && scroller.clientHeight) ? scroller.clientHeight : window.innerHeight);
        const viewportWidth = Math.max(1, (scroller && scroller.clientWidth) ? scroller.clientWidth : window.innerWidth);

        // Resolve label width same as in setCanvasCSSSizes so backing follows CSS/instance value
        let backingLabelWidth;
        if (opts && typeof opts.LABEL_WIDTH === 'number') backingLabelWidth = opts.LABEL_WIDTH;
        else if (typeof this.LABEL_WIDTH === 'number') backingLabelWidth = this.LABEL_WIDTH;
        else if (window && typeof window.LABEL_WIDTH === 'number') backingLabelWidth = window.LABEL_WIDTH;
        else {
          try { const cssVal = getComputedStyle(document.documentElement).getPropertyValue('--label-width') || ''; const parsed = parseInt(cssVal.replace('px', '').trim(), 10); backingLabelWidth = Number.isFinite(parsed) && parsed > 0 ? parsed : 260; } catch (_) { backingLabelWidth = 260; }
        }
        if (labelCanvas) { labelCanvas.width = Math.max(1, Math.round(backingLabelWidth * pr)); labelCanvas.height = Math.max(1, Math.round(viewportHeight * pr)); try { labelCanvas.getContext('2d').setTransform(pr, 0, 0, pr, 0, 0); } catch (_) { } }
        if (seqCanvas) { seqCanvas.width = Math.max(1, Math.round(viewportWidth * pr)); seqCanvas.height = Math.max(1, Math.round(viewportHeight * pr)); try { seqCanvas.getContext('2d').setTransform(pr, 0, 0, pr, 0, 0); } catch (_) { } }
        if (headerCanvas) { headerCanvas.width = Math.max(1, Math.round(viewportWidth * pr)); headerCanvas.height = Math.max(1, Math.round(((window && typeof window.HEADER_HEIGHT === 'number') ? window.HEADER_HEIGHT : 30) * pr)); try { headerCanvas.getContext('2d').setTransform(pr, 0, 0, pr, 0, 0); } catch (_) { } }
        if (overviewCanvas) { const parentW = (overviewCanvas.parentElement && overviewCanvas.parentElement.clientWidth) ? overviewCanvas.parentElement.clientWidth : viewportWidth; const scrollbarWidth = scroller ? Math.max(0, scroller.offsetWidth - scroller.clientWidth) : 0; const hdrCssW = Math.max(1, parentW - scrollbarWidth); overviewCanvas.width = Math.max(1, Math.round(hdrCssW * pr)); overviewCanvas.height = Math.max(1, Math.round(((window && typeof window.OVERVIEW_HEIGHT === 'number') ? window.OVERVIEW_HEIGHT : 48) * pr)); try { overviewCanvas.getContext('2d').setTransform(pr, 0, 0, pr, 0, 0); } catch (_) { } }
        if (consensusCanvas) { const parentWc = (consensusCanvas.parentElement && consensusCanvas.parentElement.clientWidth) ? consensusCanvas.parentElement.clientWidth : viewportWidth; const scrollbarWidthc = scroller ? Math.max(0, scroller.offsetWidth - scroller.clientWidth) : 0; const hdrCssWc = Math.max(1, parentWc - scrollbarWidthc); consensusCanvas.width = Math.max(1, Math.round(hdrCssWc * pr)); consensusCanvas.height = Math.max(1, Math.round(((window && typeof window.CONSENSUS_HEIGHT === 'number') ? window.CONSENSUS_HEIGHT : 20) * pr)); try { consensusCanvas.getContext('2d').setTransform(pr, 0, 0, pr, 0, 0); } catch (_) { } }
        if (labelsOutlineCanvas) { labelsOutlineCanvas.width = Math.max(1, Math.round(backingLabelWidth * pr)); labelsOutlineCanvas.height = Math.max(1, Math.round(((window && typeof window.OVERVIEW_HEIGHT === 'number') ? window.OVERVIEW_HEIGHT : 48) * pr)); try { labelsOutlineCanvas.getContext('2d').setTransform(pr, 0, 0, pr, 0, 0); } catch (_) { } }
        if (labelsHeaderCanvas) { labelsHeaderCanvas.width = Math.max(1, Math.round(backingLabelWidth * pr)); labelsHeaderCanvas.height = Math.max(1, Math.round(((window && typeof window.HEADER_HEIGHT === 'number') ? window.HEADER_HEIGHT : 30) * pr)); try { labelsHeaderCanvas.getContext('2d').setTransform(pr, 0, 0, pr, 0, 0); } catch (_) { } }
        if (labelsConsensusCanvas) { labelsConsensusCanvas.width = Math.max(1, Math.round(backingLabelWidth * pr)); labelsConsensusCanvas.height = Math.max(1, Math.round(((window && typeof window.CONSENSUS_HEIGHT === 'number') ? window.CONSENSUS_HEIGHT : 20) * pr)); try { labelsConsensusCanvas.getContext('2d').setTransform(pr, 0, 0, pr, 0, 0); } catch (_) { } }

        // ensure integer geometry
        this.enforceIntegerGeometry();
      } catch (e) { console.warn('SealionViewer.resizeBackings failed', e); }
    }

    // Enforce integer CSS/backing geometry and reapply DPR transforms
    enforceIntegerGeometry() {
      try {
        const pr = window.devicePixelRatio || 1;
        const scroller = this.scroller || document.getElementById('alignment-scroll');
        const viewportHeight = Math.max(1, (scroller && scroller.clientHeight) ? scroller.clientHeight : window.innerHeight);
        const viewportWidth = Math.max(1, (scroller && scroller.clientWidth) ? scroller.clientWidth : window.innerWidth);
        const labelCanvas = this.labelCanvas || document.getElementById('labels-canvas');
        const seqCanvas = this.seqCanvas || document.getElementById('seq-canvas');
        const headerCanvas = this.headerCanvas || document.getElementById('header-canvas');
        const labelsHeaderCanvas = this.labelsHeaderCanvas || document.getElementById('labels-header-canvas');
        const seqSpacer = this.seqSpacer || document.getElementById('seq-spacer');
        const leftSpacer = this.leftSpacer || document.getElementById('left-spacer');

        if (labelCanvas) { labelCanvas.style.position = labelCanvas.style.position || 'absolute'; labelCanvas.style.left = '0px'; labelCanvas.style.top = '0px'; }
        if (seqCanvas) { seqCanvas.style.position = seqCanvas.style.position || 'absolute'; seqCanvas.style.left = '0px'; seqCanvas.style.top = '0px'; }
        if (labelCanvas) labelCanvas.style.height = viewportHeight + 'px';
        if (seqCanvas) seqCanvas.style.height = viewportHeight + 'px';
        if (seqCanvas) seqCanvas.style.width = viewportWidth + 'px';
        if (headerCanvas) headerCanvas.style.width = viewportWidth + 'px';
        if (labelsHeaderCanvas) labelsHeaderCanvas.style.height = Math.round(((window && typeof window.HEADER_HEIGHT === 'number') ? window.HEADER_HEIGHT : 30)) + 'px';
        if (seqSpacer) seqSpacer.style.height = ((this.alignment && this.alignment.length) ? this.alignment.length * ((window && typeof window.ROW_HEIGHT === 'number') ? window.ROW_HEIGHT : 20) : 0) + 'px';
        if (leftSpacer) leftSpacer.style.height = ((this.alignment && this.alignment.length) ? this.alignment.length * ((window && typeof window.ROW_HEIGHT === 'number') ? window.ROW_HEIGHT : 20) : 0) + 'px';

        // backing pixels
        // Resolve label width for backing exactly the same way as setCanvasCSSSizes
        let finalLabelWidth;
        if (typeof this.LABEL_WIDTH === 'number') finalLabelWidth = this.LABEL_WIDTH;
        else if (window && typeof window.LABEL_WIDTH === 'number') finalLabelWidth = window.LABEL_WIDTH;
        else {
          try { const cssVal = getComputedStyle(document.documentElement).getPropertyValue('--label-width') || ''; const parsed = parseInt(cssVal.replace('px', '').trim(), 10); finalLabelWidth = Number.isFinite(parsed) && parsed > 0 ? parsed : 260; } catch (_) { finalLabelWidth = 260; }
        }
        if (labelCanvas) labelCanvas.width = Math.max(1, Math.round(finalLabelWidth * pr));
        if (labelCanvas) labelCanvas.height = Math.max(1, Math.round(viewportHeight * pr));
        if (seqCanvas) seqCanvas.width = Math.max(1, Math.round(viewportWidth * pr));
        if (seqCanvas) seqCanvas.height = Math.max(1, Math.round(viewportHeight * pr));
        if (headerCanvas) headerCanvas.width = Math.max(1, Math.round(viewportWidth * pr));
        if (headerCanvas) headerCanvas.height = Math.max(1, Math.round(((window && typeof window.HEADER_HEIGHT === 'number') ? window.HEADER_HEIGHT : 30) * pr));
        if (labelsHeaderCanvas) labelsHeaderCanvas.width = Math.max(1, Math.round(((window && typeof window.LABEL_WIDTH === 'number') ? window.LABEL_WIDTH : 260) * pr));
        if (labelsHeaderCanvas) labelsHeaderCanvas.height = Math.max(1, Math.round(((window && typeof window.HEADER_HEIGHT === 'number') ? window.HEADER_HEIGHT : 30) * pr));

        try { if (labelCanvas) labelCanvas.getContext('2d').setTransform(pr, 0, 0, pr, 0, 0); } catch (_) { }
        try { if (seqCanvas) seqCanvas.getContext('2d').setTransform(pr, 0, 0, pr, 0, 0); } catch (_) { }
        try { if (headerCanvas) headerCanvas.getContext('2d').setTransform(pr, 0, 0, pr, 0, 0); } catch (_) { }
        try { if (labelsHeaderCanvas) labelsHeaderCanvas.getContext('2d').setTransform(pr, 0, 0, pr, 0, 0); } catch (_) { }

        // ensure scrollTop/clamp is maintained by the app
        try { if (typeof window.clampScrollPositions === 'function') window.clampScrollPositions(); } catch (_) { }
      } catch (e) { console.warn('SealionViewer.enforceIntegerGeometry failed', e); }
    }

    // layout diagnostics removed

    // Ensure a canvas has a DPR-correct backing and that its 2D context is
    // transformed so future drawing code may operate in CSS pixels.
    // Returns the 2D context ready for drawing in CSS pixels.
    ensureCanvasBacking(canvas) {
      if (!canvas) throw new Error('ensureCanvasBacking: canvas is required');
      const rect = canvas.getBoundingClientRect();
      const cssW = Math.max(0.5, rect.width || 0);
      const cssH = Math.max(0.5, rect.height || 0);

      const backingW = Math.max(1, Math.round(cssW * this.pr));
      const backingH = Math.max(1, Math.round(cssH * this.pr));

      if (canvas.width !== backingW || canvas.height !== backingH) {
        canvas.width = backingW;
        canvas.height = backingH;
        // Preserve CSS pixel sizing explicitly
        canvas.style.width = cssW + 'px';
        canvas.style.height = cssH + 'px';
      }

      const ctx = canvas.getContext('2d');
      // Map drawing to CSS pixels: apply devicePixelRatio transform once
      ctx.setTransform(this.pr, 0, 0, this.pr, 0, 0);
      return ctx;
    }

    // Draw overview (mini-map) into the provided canvas using CSS-pixel coordinates.
    // This method is parameterized so callers can pass current layout/state from
    // the existing app while we progressively migrate behaviour into the class.
    // Parameters:
    // - canvas: the overview canvas element
    // - visible: the visible object { scrollLeft, viewW, viewH, ... }
    // - opts: an object providing required state fallbacks (colOffsets, maxSeqLen,
    //         CHAR_WIDTH, EXPANDED_RIGHT_PAD, maskStr, maskEnabled)
    drawOverview(canvas, visible, opts) {
      if (!canvas) return;
      const ctx = this.ensureCanvasBacking(canvas);
      const pr = this.pr || (window.devicePixelRatio || 1);

      // layout rect -> CSS pixels
      const rect = canvas.getBoundingClientRect();
      let cssW = rect && rect.width ? rect.width : Math.max(1, canvas.width / pr);
      let cssH = rect && rect.height ? rect.height : Math.max(1, canvas.height / pr);
      cssW = Math.max(1, cssW); cssH = Math.max(1, cssH);

      // accept state from options (fall back to class-held values)
      const colOffsets = (opts && opts.colOffsets) ? opts.colOffsets : (this.colOffsets || []);
      const maxSeqLen = (opts && Number.isFinite(opts.maxSeqLen)) ? opts.maxSeqLen : Math.max(0, (colOffsets.length - 1));
      const CHAR_WIDTH = (opts && opts.CHAR_WIDTH) ? opts.CHAR_WIDTH : this.charWidth || 8;
      const EXPANDED_RIGHT_PAD = (opts && (typeof opts.EXPANDED_RIGHT_PAD !== 'undefined')) ? opts.EXPANDED_RIGHT_PAD : 2;
      const maskStr = (opts && opts.maskStr) ? opts.maskStr : '';
      const maskEnabled = (opts && typeof opts.maskEnabled === 'boolean') ? opts.maskEnabled : true;

      // clear and background
      ctx.clearRect(0, 0, cssW, cssH);
      ctx.fillStyle = this.OVERVIEW_BG;
      ctx.fillRect(0, 0, cssW, cssH);

      const rawTotal = (colOffsets && colOffsets[maxSeqLen]) ? colOffsets[maxSeqLen] : (maxSeqLen * (CHAR_WIDTH + EXPANDED_RIGHT_PAD));
      const totalWidth = Math.max(1, rawTotal);
      const scale = cssW / totalWidth;

      // draw compressed/uncompressed bars - fill most of the canvas vertically
      const barMargin = 4; // small margin at top and bottom
      const barH = Math.max(4, cssH - (barMargin * 2));
      const barY = barMargin;
      for (let c = 0; c < maxSeqLen; c++) {
        const left = (colOffsets && typeof colOffsets[c] !== 'undefined') ? colOffsets[c] : (c * (CHAR_WIDTH + EXPANDED_RIGHT_PAD));
        const right = (colOffsets && typeof colOffsets[c + 1] !== 'undefined') ? colOffsets[c + 1] : (left + CHAR_WIDTH + EXPANDED_RIGHT_PAD);
        const x = Math.round(left * scale);
        const nextX = Math.round(right * scale);
        const w = Math.max(1, nextX - x);
        const isCompressed = maskEnabled && maskStr && maskStr.charAt(c) === '0';
        ctx.fillStyle = isCompressed ? this.OVERVIEW_COLLAPSED_COL : this.OVERVIEW_EXPANDED_COL;
        ctx.fillRect(x, barY, w, barH);
      }

      // draw viewport rect (scaled) - extends slightly beyond the bars
      try {
        const viewX = Math.round((visible && visible.scrollLeft ? visible.scrollLeft : 0) * scale);
        const viewW = Math.max(2, Math.round((visible && visible.viewW ? visible.viewW : cssW) * scale));
        ctx.save();
        ctx.strokeStyle = this.OVERVIEW_VIEWPORT;
        ctx.lineWidth = 2;
        ctx.globalAlpha = 0.6;
        ctx.strokeRect(viewX + 0.5, 2 + 0.5, viewW - 1, cssH - 4);
        ctx.restore();
      } catch (e) { /* ignore viewport draw errors */ }
    }

    // Draw header (ruler/ticks) into provided canvas. Parameterized to accept
    // external state via opts so staged migration can pass globals from script.js.
    // opts expected keys: { colOffsets, maxSeqLen, CHAR_WIDTH, EXPANDED_RIGHT_PAD, HEADER_FONT, HEADER_HEIGHT, selectedCols }
    drawHeader(canvas, visible, opts) {
      if (!canvas) return;
      const ctx = this.ensureCanvasBacking(canvas);
      const pr = this.pr || (window.devicePixelRatio || 1);
      const rect = canvas.getBoundingClientRect();
      const cssW = rect && rect.width ? rect.width : Math.max(1, canvas.width / pr);
      const HEADER_FONT = (opts && opts.HEADER_FONT) ? opts.HEADER_FONT : ((window && window.HEADER_FONT) ? window.HEADER_FONT : '12px sans-serif');
      const HEADER_HEIGHT = (opts && typeof opts.HEADER_HEIGHT !== 'undefined') ? opts.HEADER_HEIGHT : ((window && typeof window.HEADER_HEIGHT !== 'undefined') ? window.HEADER_HEIGHT : 30);
      const colOffsets = (opts && opts.colOffsets) ? opts.colOffsets : (this.colOffsets || []);
      const maxSeqLen = (opts && Number.isFinite(opts.maxSeqLen)) ? opts.maxSeqLen : Math.max(0, (colOffsets.length - 1));
      const CHAR_WIDTH = (opts && opts.CHAR_WIDTH) ? opts.CHAR_WIDTH : this.charWidth || 8;
      const EXPANDED_RIGHT_PAD = (opts && (typeof opts.EXPANDED_RIGHT_PAD !== 'undefined')) ? opts.EXPANDED_RIGHT_PAD : 2;
      const selectedCols = (opts && opts.selectedCols) ? opts.selectedCols : (window && window.selectedCols) ? window.selectedCols : new Set();

      // clear header area
      ctx.clearRect(0, 0, cssW, HEADER_HEIGHT);
      ctx.font = HEADER_FONT;
      ctx.textBaseline = 'alphabetic';

      // background
      ctx.fillStyle = this.HEADER_BG;
      ctx.fillRect(0, 0, cssW, HEADER_HEIGHT);

      // draw column selection overlay under ticks if any
      if (selectedCols && selectedCols.size > 0) {
        try { this._drawHeaderColumnOverlay(ctx, visible, { HEADER_HEIGHT, colOffsets, CHAR_WIDTH, EXPANDED_RIGHT_PAD, selectedCols }); } catch (_) { }
      }

      // Determine visible column range (use rawFirst/rawLast for precise tick placement)
      const start = Math.max(0, (visible && typeof visible.rawFirstCol === 'number' ? visible.rawFirstCol : 0) - 1);
      const end = Math.min(maxSeqLen - 1, (visible && typeof visible.rawLastCol === 'number' ? visible.rawLastCol : Math.min(maxSeqLen - 1, start + 100)) + 1);

      // Adaptive tick step based on actual visual spacing
      const totalVisualWidth = (colOffsets && typeof colOffsets[maxSeqLen] !== 'undefined') ? colOffsets[maxSeqLen] : (maxSeqLen * (CHAR_WIDTH + EXPANDED_RIGHT_PAD));
      const avgBasePx = (maxSeqLen > 0) ? (totalVisualWidth / maxSeqLen) : CHAR_WIDTH;
      
      // Calculate actual visual spacing by sampling visible columns
      let actualAvgPx = avgBasePx;
      if (colOffsets && colOffsets.length > 1) {
        const sampleCount = Math.min(20, end - start);
        if (sampleCount > 1) {
          let totalSampleWidth = 0;
          for (let i = 0; i < sampleCount; i++) {
            const c = start + Math.floor(i * (end - start) / sampleCount);
            if (c >= 0 && c < colOffsets.length - 1) {
              const colWidth = (colOffsets[c + 1] || 0) - (colOffsets[c] || 0);
              totalSampleWidth += colWidth;
            }
          }
          actualAvgPx = totalSampleWidth / sampleCount;
        }
      }
      
      // Use higher minimum spacing for collapsed columns to prevent label overlap
      const MIN_TICK_PX = actualAvgPx < 5 ? 80 : 48;
      
      function chooseTickStep(avgPx) {
        if (avgPx <= 0) return 10;
        const candidates = [1, 2, 5];
        const raw = MIN_TICK_PX / avgPx;
        const pow = Math.max(0, Math.floor(Math.log10(raw)) - 1);
        for (let p = pow; p <= pow + 5; p++) {
          for (const c of candidates) {
            const step = c * Math.pow(10, p);
            if (step * avgPx >= MIN_TICK_PX) return step;
          }
        }
        return Math.max(10, Math.ceil(raw));
      }
      const step = chooseTickStep(actualAvgPx);
      const smallTickH = Math.max(2, Math.round(HEADER_HEIGHT * 0.28));
      const largeTickH = Math.max(3, Math.round(HEADER_HEIGHT * 0.6));
      const bottom = HEADER_HEIGHT;
      ctx.strokeStyle = this.HEADER_STROKE;
      ctx.lineWidth = 1;
      ctx.fillStyle = this.HEADER_TEXT;

      for (let c = start; c <= end; c++) {
        const colLeft = (colOffsets && typeof colOffsets[c] !== 'undefined') ? colOffsets[c] : (c * (CHAR_WIDTH + EXPANDED_RIGHT_PAD));
        const colRight = (colOffsets && typeof colOffsets[c + 1] !== 'undefined') ? colOffsets[c + 1] : (colLeft + CHAR_WIDTH + EXPANDED_RIGHT_PAD);
        const centerLocal = ((colLeft + colRight) / 2) - (visible && visible.scrollLeft ? visible.scrollLeft : 0);
        const x = Math.round(centerLocal) + 0.5;
        const posIndex = c + 1;
        const isMajor = (posIndex % step) === 0;
        const isMinor = !isMajor && (step >= 2) && ((posIndex % (step / 2)) === 0);
        const tickH = isMajor ? largeTickH : (isMinor ? Math.max(2, Math.round(HEADER_HEIGHT * 0.4)) : smallTickH);
        ctx.beginPath();
        ctx.moveTo(x, bottom - tickH);
        ctx.lineTo(x, bottom - 1);
        ctx.stroke();
        if (isMajor) {
          const label = String(posIndex);
          const labelX = Math.round(centerLocal) + 3;
          let labelY;
          try {
            const metrics = ctx.measureText(label);
            const descent = (metrics && typeof metrics.actualBoundingBoxDescent === 'number') ? metrics.actualBoundingBoxDescent : Math.max(2, Math.round(HEADER_HEIGHT * 0.18));
            const padding = 2;
            labelY = Math.round((bottom - tickH) - padding - descent);
          } catch (e) {
            labelY = Math.round(HEADER_HEIGHT / 2);
          }
          ctx.fillText(label, labelX, labelY);
        }
      }
    }

    // internal helper: draw header column selection overlay using an existing header context
    _drawHeaderColumnOverlay(headerCtx, visible, opts) {
      try {
        const HEADER_HEIGHT = (opts && typeof opts.HEADER_HEIGHT !== 'undefined') ? opts.HEADER_HEIGHT : 30;
        const colOffsets = (opts && opts.colOffsets) ? opts.colOffsets : (this.colOffsets || []);
        const CHAR_WIDTH = (opts && opts.CHAR_WIDTH) ? opts.CHAR_WIDTH : this.charWidth || 8;
        const EXPANDED_RIGHT_PAD = (opts && (typeof opts.EXPANDED_RIGHT_PAD !== 'undefined')) ? opts.EXPANDED_RIGHT_PAD : 2;
        const selectedCols = (opts && opts.selectedCols) ? opts.selectedCols : new Set();
        headerCtx.save();
        headerCtx.globalAlpha = 0.14;
        headerCtx.fillStyle = this.HEADER_SELECTION;
        const headerH = HEADER_HEIGHT;
        for (const c of selectedCols) {
          if (c < (visible && typeof visible.rawFirstCol === 'number' ? visible.rawFirstCol : 0) - 1 || c > (visible && typeof visible.rawLastCol === 'number' ? visible.rawLastCol : 0) + 1) continue;
          const x = ((colOffsets && typeof colOffsets[c] !== 'undefined') ? colOffsets[c] : (c * (CHAR_WIDTH + EXPANDED_RIGHT_PAD))) - (visible && visible.scrollLeft ? visible.scrollLeft : 0);
          const w = ((colOffsets && typeof colOffsets[c + 1] !== 'undefined') ? colOffsets[c + 1] : ((colOffsets && typeof colOffsets[c] !== 'undefined') ? colOffsets[c] + CHAR_WIDTH + EXPANDED_RIGHT_PAD : (c * (CHAR_WIDTH + EXPANDED_RIGHT_PAD) + CHAR_WIDTH + EXPANDED_RIGHT_PAD))) - ((colOffsets && typeof colOffsets[c] !== 'undefined') ? colOffsets[c] : (c * (CHAR_WIDTH + EXPANDED_RIGHT_PAD)));
          headerCtx.fillRect(x, 0, w, headerH);
        }
        headerCtx.restore();
      } catch (e) { /* ignore overlay errors */ }
    }

    // Draw the small labels header (left column title) into provided canvas.
    // opts may provide: { HEADER_FONT, HEADER_HEIGHT, labelTextVertOffset, ROW_HEIGHT, LABEL_FONT, CONSENSUS_TOP_PAD, CONSENSUS_BOTTOM_PAD, CONSENSUS_HEIGHT }
    drawLabelsHeader(canvas, visible, opts) {
      if (!canvas) return;
      const ctx = this.ensureCanvasBacking(canvas);
      const pr = this.pr || (window.devicePixelRatio || 1);
      const rect = canvas.getBoundingClientRect();
      const cssW = rect && rect.width ? rect.width : Math.max(1, canvas.width / pr);
      const HEADER_FONT = (opts && opts.HEADER_FONT) ? opts.HEADER_FONT : ((window && window.HEADER_FONT) ? window.HEADER_FONT : '12px sans-serif');
      const HEADER_HEIGHT = (opts && typeof opts.HEADER_HEIGHT !== 'undefined') ? opts.HEADER_HEIGHT : ((window && typeof window.HEADER_HEIGHT !== 'undefined') ? window.HEADER_HEIGHT : 30);
      const LABEL_FONT = (opts && opts.LABEL_FONT) ? opts.LABEL_FONT : (this.labelFont || (window && window.LABEL_FONT) ? window.LABEL_FONT : '12px monospace');
      const CONSENSUS_TOP_PAD = (opts && typeof opts.CONSENSUS_TOP_PAD !== 'undefined') ? opts.CONSENSUS_TOP_PAD : (this.CONSENSUS_TOP_PAD || (window && typeof window.CONSENSUS_TOP_PAD !== 'undefined') ? window.CONSENSUS_TOP_PAD : 4);
      const CONSENSUS_BOTTOM_PAD = (opts && typeof opts.CONSENSUS_BOTTOM_PAD !== 'undefined') ? opts.CONSENSUS_BOTTOM_PAD : (this.CONSENSUS_BOTTOM_PAD || (window && typeof window.CONSENSUS_BOTTOM_PAD !== 'undefined') ? window.CONSENSUS_BOTTOM_PAD : 8);
      const CONSENSUS_HEIGHT = (opts && typeof opts.CONSENSUS_HEIGHT !== 'undefined') ? opts.CONSENSUS_HEIGHT : (this.CONSENSUS_HEIGHT || (window && typeof window.CONSENSUS_HEIGHT !== 'undefined') ? window.CONSENSUS_HEIGHT : 20);

      ctx.clearRect(0, 0, cssW, HEADER_HEIGHT);
      ctx.fillStyle = this.LABELS_BG;
      ctx.fillRect(0, 0, cssW, HEADER_HEIGHT);

      // Use label font for "consensus" text
      ctx.font = LABEL_FONT;
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = this.LABELS_HEADER_TEXT;

      const title = 'ruler';

      // Calculate vertical centering like consensus row does
      const innerH = Math.max(1, CONSENSUS_HEIGHT - (CONSENSUS_TOP_PAD + CONSENSUS_BOTTOM_PAD));
      let ascent = 0, descent = 0;
      try {
        const m = ctx.measureText('Mg');
        if (m && typeof m.actualBoundingBoxAscent === 'number') {
          ascent = m.actualBoundingBoxAscent || 0;
          descent = m.actualBoundingBoxDescent || 0;
        }
      } catch (e) { }
      const baselineY = Math.round(CONSENSUS_TOP_PAD + (innerH - (ascent + descent)) / 2 + ascent);

      // Measure text width for right justification
      const textWidth = ctx.measureText(title).width;
      const x = cssW - textWidth - 6; // 6px padding from right edge

      ctx.fillText(title, x, baselineY);
    }

    // Draw the outline label (left column title for overview) into provided canvas.
    drawLabelsOutline(canvas, visible, opts) {
      if (!canvas) return;
      const ctx = this.ensureCanvasBacking(canvas);
      const pr = this.pr || (window.devicePixelRatio || 1);
      const rect = canvas.getBoundingClientRect();
      const cssW = rect && rect.width ? rect.width : Math.max(1, canvas.width / pr);
      const cssH = rect && rect.height ? rect.height : Math.max(1, canvas.height / pr);
      const LABEL_FONT = (opts && opts.LABEL_FONT) ? opts.LABEL_FONT : (this.labelFont || (window && window.LABEL_FONT) ? window.LABEL_FONT : '12px monospace');

      ctx.clearRect(0, 0, cssW, cssH);
      ctx.fillStyle = this.LABELS_BG;
      ctx.fillRect(0, 0, cssW, cssH);

      // Use label font for text
      ctx.font = LABEL_FONT;
      ctx.textBaseline = 'middle';
      ctx.fillStyle = this.LABELS_HEADER_TEXT;

      const title = 'outline';

      // Vertical center
      const y = cssH / 2;

      // Measure text width for right justification
      const textWidth = ctx.measureText(title).width;
      const x = cssW - textWidth - 6; // 6px padding from right edge

      ctx.fillText(title, x, y);
    }

    // Draw the consensus label (left column title for consensus) into provided canvas.
    drawLabelsConsensus(canvas, visible, opts) {
      if (!canvas) return;
      const ctx = this.ensureCanvasBacking(canvas);
      const pr = this.pr || (window.devicePixelRatio || 1);
      const rect = canvas.getBoundingClientRect();
      const cssW = rect && rect.width ? rect.width : Math.max(1, canvas.width / pr);
      const LABEL_FONT = (opts && opts.LABEL_FONT) ? opts.LABEL_FONT : (this.labelFont || (window && window.LABEL_FONT) ? window.LABEL_FONT : '12px monospace');
      const CONSENSUS_TOP_PAD = (opts && typeof opts.CONSENSUS_TOP_PAD !== 'undefined') ? opts.CONSENSUS_TOP_PAD : (this.CONSENSUS_TOP_PAD || (window && typeof window.CONSENSUS_TOP_PAD !== 'undefined') ? window.CONSENSUS_TOP_PAD : 4);
      const CONSENSUS_BOTTOM_PAD = (opts && typeof opts.CONSENSUS_BOTTOM_PAD !== 'undefined') ? opts.CONSENSUS_BOTTOM_PAD : (this.CONSENSUS_BOTTOM_PAD || (window && typeof window.CONSENSUS_BOTTOM_PAD !== 'undefined') ? window.CONSENSUS_BOTTOM_PAD : 8);
      const CONSENSUS_HEIGHT = (opts && typeof opts.CONSENSUS_HEIGHT !== 'undefined') ? opts.CONSENSUS_HEIGHT : (this.CONSENSUS_HEIGHT || (window && typeof window.CONSENSUS_HEIGHT !== 'undefined') ? window.CONSENSUS_HEIGHT : 20);

      ctx.clearRect(0, 0, cssW, CONSENSUS_HEIGHT);
      ctx.fillStyle = this.LABELS_BG;
      ctx.fillRect(0, 0, cssW, CONSENSUS_HEIGHT);

      // Use label font for "consensus" text
      ctx.font = LABEL_FONT;
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = this.LABELS_HEADER_TEXT;

      const title = 'consensus: ';

      // Calculate vertical centering like consensus row does
      const innerH = Math.max(1, CONSENSUS_HEIGHT - (CONSENSUS_TOP_PAD + CONSENSUS_BOTTOM_PAD));
      let ascent = 0, descent = 0;
      try {
        const m = ctx.measureText('Mg');
        if (m && typeof m.actualBoundingBoxAscent === 'number') {
          ascent = m.actualBoundingBoxAscent || 0;
          descent = m.actualBoundingBoxDescent || 0;
        }
      } catch (e) { }
      const baselineY = Math.round(CONSENSUS_TOP_PAD + (innerH - (ascent + descent)) / 2 + ascent);

      // Measure text width for right justification
      const textWidth = ctx.measureText(title).width;
      const x = cssW - textWidth - 6; // 6px padding from right edge

      ctx.fillText(title, x, baselineY);
    }

    // Draw visible labels into the label canvas backing (DPR-aware).
    // Parameters:
    // - canvas: the label canvas element
    // - visible: object with { firstRow, lastRow, scrollTop, viewW, viewH }
    // - opts: fallbacks for globals: { FONT, ROW_HEIGHT, LABEL_WIDTH, labelTextVertOffset, REF_ACCENT, selectedRows, rows }
    drawLabels(canvas, visible, opts) {
      if (!canvas) return;
      const ctx = this.ensureCanvasBacking(canvas);
      const pr = this.pr || (window.devicePixelRatio || 1);

      // derive CSS dims
      const rect = canvas.getBoundingClientRect();
      const cssW = rect && rect.width ? rect.width : Math.max(1, canvas.width / pr);
      const cssH = rect && rect.height ? rect.height : Math.max(1, canvas.height / pr);

      const FONT = (opts && opts.FONT) ? opts.FONT : ((window && window.FONT) ? window.FONT : '12px monospace');
      const ROW_HEIGHT = (opts && typeof opts.ROW_HEIGHT === 'number') ? opts.ROW_HEIGHT : ((window && typeof window.ROW_HEIGHT === 'number') ? window.ROW_HEIGHT : 20);
      const LABEL_WIDTH = (opts && typeof opts.LABEL_WIDTH === 'number') ? opts.LABEL_WIDTH : ((window && typeof window.LABEL_WIDTH === 'number') ? window.LABEL_WIDTH : 200);
      const labelTextVertOffset = (opts && typeof opts.labelTextVertOffset === 'number') ? opts.labelTextVertOffset : ((window && typeof window.labelTextVertOffset === 'number') ? window.labelTextVertOffset : Math.round(ROW_HEIGHT / 2));
      const selectedRows = (opts && opts.selectedRows) ? opts.selectedRows : (window && window.selectedRows) ? window.selectedRows : new Set();
      const rows = (opts && opts.rows) ? opts.rows : (window && window.rows) ? window.rows : [];
      const refIndex = (opts && typeof opts.refIndex === 'number') ? opts.refIndex : (window && typeof window.refIndex === 'number') ? window.refIndex : null;
      const REF_ACCENT = (opts && opts.REF_ACCENT) ? opts.REF_ACCENT : (window && window.REF_ACCENT) ? window.REF_ACCENT : '#ffcc00';

      // prepare context
      ctx.font = FONT;
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = this.LABELS_TEXT;

      // clear the viewport region
      ctx.clearRect(0, 0, cssW, cssH);

      // draw each visible row
      const first = (visible && typeof visible.firstRow === 'number') ? visible.firstRow : 0;
      const last = (visible && typeof visible.lastRow === 'number') ? visible.lastRow : Math.max(0, rows.length - 1);
      const scrollTop = (visible && typeof visible.scrollTop === 'number') ? visible.scrollTop : 0;

      for (let i = first; i <= last; i++) {
        const rawRowY = (i * ROW_HEIGHT) - scrollTop;
        const rowY = Math.round(rawRowY * pr) / pr;
        const rowH = Math.round(ROW_HEIGHT * pr) / pr;
        const label = (rows[i] && rows[i].label) ? rows[i].label : '';
        // background: selection takes precedence
        if (selectedRows.has(i)) {
          ctx.fillStyle = this.SEQ_SELECTED_ROW;
        } else if (i % 2 === 0) {
          ctx.fillStyle = this.SEQ_EVEN_ROW;
        } else {
          ctx.fillStyle = this.SEQ_ODD_ROW;
        }
        ctx.fillRect(0, rowY, LABEL_WIDTH, rowH);
        // reference accent
        if (typeof refIndex === 'number' && i === refIndex) {
          try { ctx.fillStyle = REF_ACCENT; ctx.fillRect(0, rowY, 4, rowH); } catch (_) { }
        }
        // draw original index number in italics (right-aligned), starting from 1
        const originalIndex = (rows[i] && typeof rows[i].originalIndex === 'number') ? rows[i].originalIndex + 1 : i + 1;
        const indexText = String(originalIndex);
        const indexFontStyle = this.INDEX_FONT_STYLE || 'italic';
        ctx.font = indexFontStyle + ' ' + FONT;
        ctx.textAlign = 'right';
        ctx.fillStyle = this.INDEX_COLOR || '#888888';
        const y = Math.round((rawRowY + labelTextVertOffset) * pr) / pr;
        const indexAlignPos = (typeof this.INDEX_RIGHT_ALIGN_POS === 'number') ? this.INDEX_RIGHT_ALIGN_POS : 50;
        ctx.fillText(indexText, indexAlignPos, y);

        // draw label text
        ctx.font = FONT; // restore normal font
        ctx.textAlign = 'left';
        ctx.fillStyle = this.LABELS_TEXT;
        const labelStartPos = (typeof this.LABEL_START_POS === 'number') ? this.LABEL_START_POS : 56;
        ctx.fillText(label, labelStartPos, y);
      }
    }

    // Draw sequences viewport into provided canvas (backing is viewport-sized).
    // Parameters:
    // - canvas: the seq canvas element
    // - visible: { firstRow,lastRow,rawFirstCol,rawLastCol,firstCol,lastCol,scrollLeft,viewW,viewH }
    // - opts: many fallbacks mirroring legacy globals (FONT, ROW_HEIGHT, CHAR_WIDTH, EXPANDED_RIGHT_PAD, rows, selectedRows, selectedCols, refStr, refIndex, refModeEnabled, maskStr, maskEnabled, BASE_COLORS, DEFAULT_BASE_COLOR, PALE_REF_COLOR, COMPRESSED_CELL_VPAD, seqTextVertOffset, rowCount, maxSeqLen, isRectSelecting, rectStartRow, rectEndRow, rectStartCol, rectEndCol)
    drawSequences(canvas, visible, opts) {
      if (!canvas) return;
      const ctx = this.ensureCanvasBacking(canvas);
      const pr = this.pr || (window.devicePixelRatio || 1);

      const rect = canvas.getBoundingClientRect();
      const cssW = rect && rect.width ? rect.width : Math.max(1, canvas.width / pr);
      const cssH = rect && rect.height ? rect.height : Math.max(1, canvas.height / pr);

      const FONT = (opts && opts.FONT) ? opts.FONT : ((window && window.FONT) ? window.FONT : '12px monospace');
      const ROW_HEIGHT = (opts && typeof opts.ROW_HEIGHT === 'number') ? opts.ROW_HEIGHT : ((window && typeof window.ROW_HEIGHT === 'number') ? window.ROW_HEIGHT : 20);
      const CHAR_WIDTH = (opts && typeof opts.CHAR_WIDTH === 'number') ? opts.CHAR_WIDTH : (this.charWidth || 8);
      const EXPANDED_RIGHT_PAD = (opts && typeof opts.EXPANDED_RIGHT_PAD === 'number') ? opts.EXPANDED_RIGHT_PAD : ((window && typeof window.EXPANDED_RIGHT_PAD === 'number') ? window.EXPANDED_RIGHT_PAD : 2);

      // Prefer column offsets passed via opts during migration, otherwise use
      // the instance value. If the instance is missing offsets (staged
      // migration), adopt the passed-in offsets onto the instance so other
      // class helpers can rely on this.colOffsets.
      const colOffsets = (opts && opts.colOffsets) ? opts.colOffsets : (this.colOffsets || []);
      if ((!this.colOffsets || this.colOffsets.length === 0) && colOffsets && colOffsets.length) {
        try { this.colOffsets = colOffsets; } catch (_) { }
      }
      const rows = (opts && opts.rows) ? opts.rows : (window && window.rows) ? window.rows : [];
      const selectedRows = (opts && opts.selectedRows) ? opts.selectedRows : (window && window.selectedRows) ? window.selectedRows : new Set();
      const selectedCols = (opts && opts.selectedCols) ? opts.selectedCols : (window && window.selectedCols) ? window.selectedCols : new Set();
      const refStr = (opts && opts.refStr) ? opts.refStr : (window && window.refStr) ? window.refStr : null;
      const refModeEnabled = (opts && typeof opts.refModeEnabled === 'boolean') ? opts.refModeEnabled : ((window && typeof window.refModeEnabled === 'boolean') ? window.refModeEnabled : false);
      const refIndex = (opts && typeof opts.refIndex === 'number') ? opts.refIndex : (window && typeof window.refIndex === 'number') ? window.refIndex : null;
      const maskStr = (opts && opts.maskStr) ? opts.maskStr : (window && window.maskStr) ? window.maskStr : '';
      const maskEnabled = (opts && typeof opts.maskEnabled === 'boolean') ? opts.maskEnabled : ((window && typeof window.maskEnabled === 'boolean') ? window.maskEnabled : false);
      const hideMode = (opts && typeof opts.hideMode === 'boolean') ? opts.hideMode : (this.hideMode || false);
      const HIDDEN_MARKER_COLOR = (opts && opts.HIDDEN_MARKER_COLOR) ? opts.HIDDEN_MARKER_COLOR : (this.HIDDEN_MARKER_COLOR || '#d0d0d0');
      const BASE_COLORS = (opts && opts.BASE_COLORS) ? opts.BASE_COLORS : (window && window.BASE_COLORS) ? window.BASE_COLORS : { 'A': '#2ca02c', 'C': '#1f77b4', 'G': '#d62728', 'T': '#ff7f0e' };
      const DEFAULT_BASE_COLOR = (opts && opts.DEFAULT_BASE_COLOR) ? opts.DEFAULT_BASE_COLOR : (window && window.DEFAULT_BASE_COLOR) ? window.DEFAULT_BASE_COLOR : '#666';
      const PALE_REF_COLOR = (opts && opts.PALE_REF_COLOR) ? opts.PALE_REF_COLOR : (window && window.PALE_REF_COLOR) ? window.PALE_REF_COLOR : '#bfc9d6';
      const COMPRESSED_CELL_VPAD = (opts && typeof opts.COMPRESSED_CELL_VPAD === 'number') ? opts.COMPRESSED_CELL_VPAD : ((window && typeof window.COMPRESSED_CELL_VPAD === 'number') ? window.COMPRESSED_CELL_VPAD : 2);
      const seqTextVertOffset = (opts && typeof opts.seqTextVertOffset === 'number') ? opts.seqTextVertOffset : ((window && typeof window.seqTextVertOffset === 'number') ? window.seqTextVertOffset : Math.round(ROW_HEIGHT / 2));
      const rowCount = (opts && typeof opts.rowCount === 'number') ? opts.rowCount : ((window && typeof window.rowCount === 'number') ? window.rowCount : rows.length);
      const maxSeqLen = (opts && typeof opts.maxSeqLen === 'number') ? opts.maxSeqLen : ((window && typeof window.maxSeqLen === 'number') ? window.maxSeqLen : Math.max(0, (colOffsets.length - 1)));
      const isRectSelecting = (opts && typeof opts.isRectSelecting === 'boolean') ? opts.isRectSelecting : ((window && typeof window.isRectSelecting === 'boolean') ? window.isRectSelecting : false);
      const rectStartRow = (opts && typeof opts.rectStartRow === 'number') ? opts.rectStartRow : (window && typeof window.rectStartRow === 'number') ? window.rectStartRow : null;
      const rectEndRow = (opts && typeof opts.rectEndRow === 'number') ? opts.rectEndRow : (window && typeof window.rectEndRow === 'number') ? window.rectEndRow : null;
      const rectStartCol = (opts && typeof opts.rectStartCol === 'number') ? opts.rectStartCol : (window && typeof window.rectStartCol === 'number') ? window.rectStartCol : null;
      const rectEndCol = (opts && typeof opts.rectEndCol === 'number') ? opts.rectEndCol : (window && typeof window.rectEndCol === 'number') ? window.rectEndCol : null;

      ctx.clearRect(0, 0, cssW, cssH);
      ctx.font = FONT;
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = '#000';

      // First pass: draw row backgrounds
      for (let r = visible.firstRow; r <= visible.lastRow; r++) {
        if (selectedRows.has(r)) {
          ctx.fillStyle = this.SEQ_SELECTED_ROW;
        } else if ((r % 2) === 0) {
          ctx.fillStyle = this.SEQ_EVEN_ROW;
        } else {
          ctx.fillStyle = this.SEQ_ODD_ROW;
        }
        const rawRowY = (r * ROW_HEIGHT) - visible.scrollTop;
        const rowY = Math.round(rawRowY * pr) / pr;
        const rowH = Math.round(ROW_HEIGHT * pr) / pr;
        ctx.fillRect(0, rowY, visible.viewW, rowH);
        // left accent for reference row
        if (typeof refIndex === 'number' && r === refIndex) {
          try { ctx.save(); ctx.fillStyle = (opts && opts.REF_ACCENT) ? opts.REF_ACCENT : (window && window.REF_ACCENT) ? window.REF_ACCENT : '#ffcc00'; ctx.globalAlpha = 0.9; ctx.fillRect(0, rowY, 4, rowH); ctx.restore(); } catch (_) { }
        }
      }

      // column selection overlay (delegated to the class helper)
      if (selectedCols && selectedCols.size > 0) {
        try {
          // prefer passing current offsets so the overlay can avoid reading
          // instance state during staged migration
          this.drawColumnSelectionOverlay(canvas, visible, { CHAR_WIDTH, EXPANDED_RIGHT_PAD, selectedCols, colOffsets });
        } catch (e) { }
      }

      // Second pass: draw glyphs
      for (let r = visible.firstRow; r <= visible.lastRow; r++) {
        const rawRowY = (r * ROW_HEIGHT) - visible.scrollTop;
        const y = Math.round((rawRowY + seqTextVertOffset) * pr) / pr;
        const seq = (rows[r] && rows[r].sequence) ? rows[r].sequence : '';
        ctx.fillStyle = '#000';
        for (let c = visible.firstCol; c <= visible.lastCol; c++) {
          const rawCh = seq[c] || ' ';
          const ch = String(rawCh);
          const colLeft = (colOffsets[c] !== undefined) ? colOffsets[c] : (c * (CHAR_WIDTH + EXPANDED_RIGHT_PAD));
          const colRight = (colOffsets[c + 1] !== undefined) ? colOffsets[c + 1] : (colLeft + CHAR_WIDTH + EXPANDED_RIGHT_PAD);
          const x = colLeft - visible.scrollLeft;
          const w = Math.max(1, colRight - colLeft);
          const base = ch ? ch.charAt(0).toUpperCase() : '';
          const refChar = (refStr && refStr.charAt(c)) ? refStr.charAt(c).toUpperCase() : null;
          const isSameRef = refModeEnabled && refStr && refChar === base;
          const isRefRow = (typeof refIndex === 'number' && refIndex === r);
          const color = isRefRow ? (BASE_COLORS[base] || DEFAULT_BASE_COLOR) : (isSameRef ? PALE_REF_COLOR : (BASE_COLORS[base] || DEFAULT_BASE_COLOR));
          
          if (maskEnabled && maskStr && maskStr.charAt(c) === '0') {
            // Collapsed column
            if (hideMode && w > 1) {
              // This is a marker position in hide mode - draw pale grey marker at full row height
              ctx.fillStyle = HIDDEN_MARKER_COLOR;
              const topQ = Math.round(rawRowY * pr) / pr;
              const hQ = Math.round(ROW_HEIGHT * pr) / pr;
              ctx.fillRect(x, topQ, w, hQ);
            } else if (!hideMode) {
              // Normal collapse mode - draw colored block
              ctx.fillStyle = color;
              const topCss = rawRowY + COMPRESSED_CELL_VPAD;
              const blockH = Math.max(1, ROW_HEIGHT - (COMPRESSED_CELL_VPAD * 2));
              const topQ = Math.round(topCss * pr) / pr;
              const hQ = Math.round(blockH * pr) / pr;
              ctx.fillRect(x, topQ, w, hQ);
            }
            // If hideMode and w <= 1, skip drawing (zero-width column)
          } else {
            ctx.fillStyle = color;
            // Center the text in the column
            const textOffset = Math.round((w - CHAR_WIDTH) / 2);
            ctx.fillText(ch, x + textOffset, y);
          }
        }
      }

      // rectangular selection border
      if (isRectSelecting || (rectStartRow !== null && rectEndRow !== null && rectStartCol !== null && rectEndCol !== null)) {
        try {
          const rlo = Math.max(0, Math.min(rectStartRow, rectEndRow));
          const rhi = Math.min(rowCount - 1, Math.max(rectStartRow, rectEndRow));
          const clo = Math.max(0, Math.min(rectStartCol, rectEndCol));
          const chi = Math.min(maxSeqLen - 1, Math.max(rectStartCol, rectEndCol));
          if (rhi >= visible.firstRow && rlo <= visible.lastRow && chi >= visible.rawFirstCol && clo <= visible.rawLastCol) {
            const topY = (rlo - visible.firstRow) * ROW_HEIGHT - (visible.scrollTop - visible.firstRow * ROW_HEIGHT);
            const bottomY = (rhi - visible.firstRow + 1) * ROW_HEIGHT - (visible.scrollTop - visible.firstRow * ROW_HEIGHT);
            const leftX = (colOffsets[clo] || 0) - visible.scrollLeft;
            const rightX = (colOffsets[chi + 1] || (colOffsets[chi] + CHAR_WIDTH + EXPANDED_RIGHT_PAD)) - visible.scrollLeft;
            const dpr = this.pr || (window.devicePixelRatio || 1);
            const t = Math.round(topY * dpr) / dpr;
            const b = Math.round(bottomY * dpr) / dpr;
            const l = Math.round(leftX * dpr) / dpr;
            const r = Math.round(rightX * dpr) / dpr;
            ctx.save();
            ctx.strokeStyle = this.SEQ_COL_SELECTION;
            ctx.lineWidth = 2;
            ctx.setLineDash([4, 2]);
            ctx.strokeRect(l + 0.5, t + 0.5, Math.max(1, r - l - 1), Math.max(1, b - t - 1));
            ctx.restore();
          }
        } catch (e) { }
      }

      // debug grid overlay
      if (window.__showGrid) {
        try {
          ctx.save();
          ctx.strokeStyle = this.SEQ_RECT_SELECTION_START;
          ctx.lineWidth = 1;
          const fullH = cssH;
          const startC = Math.max(0, visible.rawFirstCol - 1);
          const endC = Math.min(maxSeqLen - 1, visible.rawLastCol + 1);
          for (let c = startC; c <= endC + 1; c++) {
            const gx = (colOffsets[c] || 0) - visible.scrollLeft + 0.5;
            ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, fullH); ctx.stroke();
          }
          ctx.strokeStyle = this.SEQ_RECT_SELECTION_END;
          const fx = (colOffsets[visible.rawFirstCol] || 0) - visible.scrollLeft + 0.5;
          ctx.beginPath(); ctx.moveTo(fx, 0); ctx.lineTo(fx, fullH); ctx.stroke();
          ctx.restore();
        } catch (e) { }
      }

      // record extents
      try {
        const startX = (colOffsets[visible.firstCol] || 0) - visible.scrollLeft + 3;
        const endX = (colOffsets[visible.lastCol] || 0) - visible.scrollLeft + 3;
        window.__lastDrawExtents = { minX: Math.round(startX), maxX: Math.round(endX) };
      } catch (e) { window.__lastDrawExtents = { minX: 0, maxX: 0 }; }
    }

    // Draw consensus row into the provided canvas. Parameterized similarly to drawOverview.
    // Parameters:
    // - canvas: the consensus canvas element
    // - visible: visible object returned by computeVisible()
    // - opts: object with state fallbacks: { FONT, CONSENSUS_TOP_PAD, CONSENSUS_BOTTOM_PAD, colOffsets, maxSeqLen, CHAR_WIDTH, EXPANDED_RIGHT_PAD, maskStr, maskEnabled, BASE_COLORS, DEFAULT_BASE_COLOR }
    drawConsensus(canvas, visible, opts) {
      if (!canvas) return;
      const ctx = this.ensureCanvasBacking(canvas);
      const pr = this.pr || (window.devicePixelRatio || 1);
      const cssW = canvas.width / pr;
      const cssH = canvas.height / pr;
      // clear
      ctx.clearRect(0, 0, cssW, cssH);
      // background
      ctx.fillStyle = this.CONSENSUS_BG;
      ctx.fillRect(0, 0, cssW, cssH);
      // separator line at bottom
      ctx.strokeStyle = this.CONSENSUS_SEPARATOR;
      ctx.lineWidth = 1;
      const sepY = Math.max(0.5, cssH - 0.5);
      ctx.beginPath(); ctx.moveTo(0, sepY); ctx.lineTo(cssW, sepY); ctx.stroke();

      const FONT = (opts && opts.FONT) ? opts.FONT : (window && window.FONT) ? window.FONT : '12px monospace';
      const CONSENSUS_TOP_PAD = (opts && typeof opts.CONSENSUS_TOP_PAD !== 'undefined') ? opts.CONSENSUS_TOP_PAD : ((window && typeof window.CONSENSUS_TOP_PAD !== 'undefined') ? window.CONSENSUS_TOP_PAD : 4);
      const CONSENSUS_BOTTOM_PAD = (opts && typeof opts.CONSENSUS_BOTTOM_PAD !== 'undefined') ? opts.CONSENSUS_BOTTOM_PAD : ((window && typeof window.CONSENSUS_BOTTOM_PAD !== 'undefined') ? window.CONSENSUS_BOTTOM_PAD : 8);
      const colOffsets = (opts && opts.colOffsets) ? opts.colOffsets : (this.colOffsets || []);
      const maxSeqLen = (opts && Number.isFinite(opts.maxSeqLen)) ? opts.maxSeqLen : Math.max(0, (colOffsets.length - 1));
      const CHAR_WIDTH = (opts && opts.CHAR_WIDTH) ? opts.CHAR_WIDTH : this.charWidth || 8;
      const EXPANDED_RIGHT_PAD = (opts && (typeof opts.EXPANDED_RIGHT_PAD !== 'undefined')) ? opts.EXPANDED_RIGHT_PAD : 2;
      const maskStr = (opts && opts.maskStr) ? opts.maskStr : (window && window.mask) ? window.mask : '';
      const maskEnabled = (opts && typeof opts.maskEnabled === 'boolean') ? opts.maskEnabled : true;
      const BASE_COLORS = (opts && opts.BASE_COLORS) ? opts.BASE_COLORS : (window && window.BASE_COLORS) ? window.BASE_COLORS : { 'A': '#2ca02c', 'C': '#1f77b4', 'G': '#d62728', 'T': '#ff7f0e' };
      const DEFAULT_BASE_COLOR = (opts && opts.DEFAULT_BASE_COLOR) ? opts.DEFAULT_BASE_COLOR : (window && window.DEFAULT_BASE_COLOR) ? window.DEFAULT_BASE_COLOR : '#666';

      ctx.font = FONT;
      ctx.textBaseline = 'alphabetic';

      const innerH = Math.max(1, cssH - (CONSENSUS_TOP_PAD + CONSENSUS_BOTTOM_PAD));
      let ascent = 0, descent = 0;
      try {
        const m = ctx.measureText('Mg');
        if (m && typeof m.actualBoundingBoxAscent === 'number') {
          ascent = m.actualBoundingBoxAscent || 0;
          descent = m.actualBoundingBoxDescent || 0;
        }
      } catch (e) { }
      const baselineY = Math.round(CONSENSUS_TOP_PAD + (innerH - (ascent + descent)) / 2 + ascent);

      // consensus string: prefer opts.consensus, else global
      const cons = (opts && opts.consensus) ? opts.consensus : ((window && window.consensusSequence) ? window.consensusSequence : (window && window.computeConsensusSequence ? window.computeConsensusSequence() : null));
      if (!cons || cons.length === 0) return;

      const start = Math.max(0, visible.rawFirstCol - 1);
      const end = Math.min(maxSeqLen - 1, visible.rawLastCol + 1);
      for (let c = start; c <= end; c++) {
        const left = (colOffsets && typeof colOffsets[c] !== 'undefined') ? colOffsets[c] : (c * (CHAR_WIDTH + EXPANDED_RIGHT_PAD));
        const right = (colOffsets && typeof colOffsets[c + 1] !== 'undefined') ? colOffsets[c + 1] : (left + CHAR_WIDTH + EXPANDED_RIGHT_PAD);
        const x = left - (visible && visible.scrollLeft ? visible.scrollLeft : 0);
        const w = Math.max(1, right - left);
        const ch = (cons.charAt(c) || 'N');
        const base = ch ? ch.charAt(0).toUpperCase() : '';
        const color = BASE_COLORS[base] || DEFAULT_BASE_COLOR;
        if (maskEnabled && maskStr && maskStr.charAt(c) === '0') {
          ctx.fillStyle = color;
          const blockTop = CONSENSUS_TOP_PAD;
          const blockH = Math.max(1, cssH - (CONSENSUS_TOP_PAD + CONSENSUS_BOTTOM_PAD));
          ctx.fillRect(x, blockTop, w, blockH);
        } else {
          ctx.fillStyle = color;
          // Center the text in the column
          const textOffset = Math.round((w - CHAR_WIDTH) / 2);
          ctx.fillText(ch, x + textOffset, baselineY);
        }
      }

      // Draw column selection overlay
      const selectedCols = (opts && opts.selectedCols) ? opts.selectedCols : (this.getSelectedCols ? this.getSelectedCols() : (this.selectedCols || new Set()));
      if (selectedCols && selectedCols.size > 0) {
        try {
          this.drawColumnSelectionOverlay(canvas, visible, { CHAR_WIDTH, EXPANDED_RIGHT_PAD, selectedCols, colOffsets });
        } catch (e) { }
      }
    }

    // Draw selected-column overlay into a sequence canvas or context.
    // Accepts either a canvas element or a 2D context as `target`.
    // visible: visible object (scrollLeft, rawFirstCol, rawLastCol)
    // opts: { CHAR_WIDTH, EXPANDED_RIGHT_PAD, selectedCols }
    drawColumnSelectionOverlay(target, visible, opts) {
      try {
        let ctx;
        if (!target) return;
        if (typeof target.getContext === 'function') {
          ctx = this.ensureCanvasBacking(target);
        } else if (target && typeof target.save === 'function') {
          ctx = target; // assume it's already a 2D context transformed to CSS pixels
        } else {
          return;
        }
        const CHAR_WIDTH = (opts && typeof opts.CHAR_WIDTH === 'number') ? opts.CHAR_WIDTH : (this.charWidth || 8);
        const EXPANDED_RIGHT_PAD = (opts && typeof opts.EXPANDED_RIGHT_PAD === 'number') ? opts.EXPANDED_RIGHT_PAD : 2;
        const selectedCols = (opts && opts.selectedCols) ? opts.selectedCols : (window && window.selectedCols) ? window.selectedCols : new Set();
        // Prefer column offsets passed in opts during migration; fall back to instance offsets
        const colOffsets = (opts && opts.colOffsets) ? opts.colOffsets : (this.colOffsets || []);
        const pr = this.pr || (window.devicePixelRatio || 1);
        const cssH = (ctx.canvas && ctx.canvas.getBoundingClientRect) ? ctx.canvas.getBoundingClientRect().height : (ctx.canvas ? ctx.canvas.height / pr : 0);
        ctx.save();
        ctx.globalAlpha = 0.14;
        ctx.fillStyle = this.SEQ_COL_SELECTION;
        for (const c of selectedCols) {
          if (c < (visible && typeof visible.rawFirstCol === 'number' ? visible.rawFirstCol : 0) - 1 || c > (visible && typeof visible.rawLastCol === 'number' ? visible.rawLastCol : 0) + 1) continue;
          const leftOff = (typeof colOffsets[c] !== 'undefined') ? colOffsets[c] : (c * (CHAR_WIDTH + EXPANDED_RIGHT_PAD));
          const rightOff = (typeof colOffsets[c + 1] !== 'undefined') ? colOffsets[c + 1] : (leftOff + CHAR_WIDTH + EXPANDED_RIGHT_PAD);
          const x = leftOff - (visible && visible.scrollLeft ? visible.scrollLeft : 0);
          const w = Math.max(1, rightOff - leftOff);
          ctx.fillRect(x, 0, w, cssH);
        }
        ctx.restore();
      } catch (e) { /* tolerate overlay errors */ }
    }

    // Build a prefix-sum column offsets array for `numCols` columns where each
    // column has width `colWidth` (in CSS pixels). Resulting array has
    // length numCols+1 where colOffsets[i] is the CSS-left for column i.
    buildColOffsets(numCols, colWidth) {
      const w = Math.max(1, colWidth || this.charWidth || 8);
      const offsets = new Array((numCols || 0) + 1);
      let s = 0;
      for (let i = 0; i <= numCols; i++) {
        offsets[i] = s;
        s += (i < numCols) ? w : 0;
      }
      this.colOffsets = offsets;
      return offsets;
    }

    // Build column offsets taking mask/compression into account.
    // maskEnabled: boolean, opts may provide { maxSeqLen, CHAR_WIDTH, EXPANDED_RIGHT_PAD, REDUCED_COL_WIDTH, maskStr }
    // Returns an array of length maxSeqLen+1 with CSS pixel left offsets.
    buildColOffsetsFor(maskEnabled, opts) {
      try {
        opts = opts || {};
        const maxSeqLen = (typeof opts.maxSeqLen === 'number') ? opts.maxSeqLen : Math.max(0, (this.colOffsets && this.colOffsets.length) ? this.colOffsets.length - 1 : 0);
        const CHAR_WIDTH = (typeof opts.CHAR_WIDTH === 'number') ? opts.CHAR_WIDTH : (this.charWidth || 8);
        const EXPANDED_RIGHT_PAD = (typeof opts.EXPANDED_RIGHT_PAD === 'number') ? opts.EXPANDED_RIGHT_PAD : 2;
        const REDUCED_COL_WIDTH = (typeof opts.REDUCED_COL_WIDTH === 'number') ? opts.REDUCED_COL_WIDTH : ((window && typeof window.REDUCED_COL_WIDTH === 'number') ? window.REDUCED_COL_WIDTH : 1);
        const HIDDEN_MARKER_WIDTH = (typeof opts.HIDDEN_MARKER_WIDTH === 'number') ? opts.HIDDEN_MARKER_WIDTH : (this.HIDDEN_MARKER_WIDTH || 4);
        const maskStr = (typeof opts.maskStr === 'string') ? opts.maskStr : ((window && typeof window.maskStr === 'string') ? window.maskStr : null);
        const hideMode = (typeof opts.hideMode === 'boolean') ? opts.hideMode : (this.hideMode || false);

        const out = new Array(Math.max(1, maxSeqLen + 1)).fill(0);
        out[0] = 0;
        
        if (hideMode && maskEnabled && maskStr) {
          // Hide mode: collapsed regions get near-zero width except for central marker
          let inCollapsedRegion = false;
          let regionStart = -1;
          
          for (let i = 0; i < maxSeqLen; i++) {
            const isCollapsed = maskStr.charAt(i) === '0';
            
            if (isCollapsed && !inCollapsedRegion) {
              // Start of collapsed region
              inCollapsedRegion = true;
              regionStart = i;
            } else if (!isCollapsed && inCollapsedRegion) {
              // End of collapsed region - place marker at center
              const regionEnd = i - 1;
              const regionMid = Math.floor((regionStart + regionEnd) / 2);
              
              // Backfill collapsed region with minimal widths
              for (let j = regionStart; j <= regionEnd; j++) {
                const w = (j === regionMid) ? HIDDEN_MARKER_WIDTH : 0;
                out[j + 1] = out[j] + w;
              }
              
              inCollapsedRegion = false;
              regionStart = -1;
            }
            
            if (!isCollapsed) {
              // Expanded column
              const w = CHAR_WIDTH + EXPANDED_RIGHT_PAD;
              out[i + 1] = out[i] + w;
            }
          }
          
          // Handle case where collapsed region extends to end
          if (inCollapsedRegion) {
            const regionEnd = maxSeqLen - 1;
            const regionMid = Math.floor((regionStart + regionEnd) / 2);
            
            for (let j = regionStart; j <= regionEnd; j++) {
              const w = (j === regionMid) ? HIDDEN_MARKER_WIDTH : 0;
              out[j + 1] = out[j] + w;
            }
          }
        } else {
          // Normal mode: collapsed columns have REDUCED_COL_WIDTH
          for (let i = 0; i < maxSeqLen; i++) {
            const useReduced = !!maskEnabled && maskStr && maskStr.charAt(i) === '0';
            const w = useReduced ? REDUCED_COL_WIDTH : (CHAR_WIDTH + EXPANDED_RIGHT_PAD);
            out[i + 1] = out[i] + w;
          }
        }
        
        return out;
      } catch (e) {
        // fallback to uniform offsets
        const w = (this.charWidth || 8) + 2;
        const maxSeqLen = (opts && typeof opts.maxSeqLen === 'number') ? opts.maxSeqLen : 0;
        const offs = new Array(Math.max(1, maxSeqLen + 1)); let s = 0; for (let i = 0; i <= maxSeqLen; i++) { offs[i] = s; s += (i < maxSeqLen) ? w : 0; } return offs;
      }
    }

    // Compute visible region given a scroller and options.
    // opts may provide: { ROW_HEIGHT, BUFFER_ROWS, BUFFER_COLS, CHAR_WIDTH, maxSeqLen, rowCount, seqSpacer }
    // Returns an object similar to the legacy computeVisible() in script.js
    computeVisible(scroller, opts) {
      try {
        opts = opts || {};
        const ROW_HEIGHT = (typeof opts.ROW_HEIGHT === 'number') ? opts.ROW_HEIGHT : ((window && typeof window.ROW_HEIGHT === 'number') ? window.ROW_HEIGHT : 20);
        const BUFFER_ROWS = (typeof opts.BUFFER_ROWS === 'number') ? opts.BUFFER_ROWS : ((window && typeof window.BUFFER_ROWS === 'number') ? window.BUFFER_ROWS : 2);
        const BUFFER_COLS = (typeof opts.BUFFER_COLS === 'number') ? opts.BUFFER_COLS : ((window && typeof window.BUFFER_COLS === 'number') ? window.BUFFER_COLS : 5);
        const CHAR_WIDTH = (typeof opts.CHAR_WIDTH === 'number') ? opts.CHAR_WIDTH : (this.charWidth || 8);
        const maxSeqLen = (typeof opts.maxSeqLen === 'number') ? opts.maxSeqLen : Math.max(0, (this.colOffsets && this.colOffsets.length) ? this.colOffsets.length - 1 : 0);
        const rowCount = (typeof opts.rowCount === 'number') ? opts.rowCount : ((this.alignment && this.alignment.length) ? this.alignment.length : ((window && typeof window.rowCount === 'number') ? window.rowCount : 0));
        const viewH = scroller ? scroller.clientHeight : (window && window.innerHeight) ? window.innerHeight : 0;
        const viewW = scroller ? scroller.clientWidth : (window && window.innerWidth) ? window.innerWidth : 0;
        const scrollTop = scroller ? scroller.scrollTop : 0;
        const scrollLeft = scroller ? scroller.scrollLeft : 0;

        const firstRowNoBuffer = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT));
        const lastRowNoBuffer = Math.min(rowCount - 1, Math.floor((scrollTop + viewH) / ROW_HEIGHT));
        let firstRow = Math.max(0, firstRowNoBuffer - BUFFER_ROWS);
        let lastRow = Math.min(rowCount - 1, lastRowNoBuffer + BUFFER_ROWS);

        // Ensure offsets exist before computing columns; persist computed offsets
        const colOffsets = this.colOffsets && this.colOffsets.length ? this.colOffsets : this.buildColOffsetsFor((opts && !!opts.maskEnabled) ? opts.maskEnabled : true, opts);
        try { if ((!this.colOffsets || this.colOffsets.length === 0) && colOffsets && colOffsets.length) this.colOffsets = colOffsets; } catch (_) { }

        // compute raw first/last columns via binary search helper
        const rawFirstCol = this.colIndexFromCssOffset(scrollLeft);
        const rawLastCol = this.colIndexFromCssOffset(scrollLeft + viewW - 1);

        const leftBuffer = (rawFirstCol >= BUFFER_COLS) ? BUFFER_COLS : 0;
        const rightBuffer = BUFFER_COLS;
        const firstCol = Math.max(0, rawFirstCol - leftBuffer);
        const lastCol = Math.min(maxSeqLen - 1, rawLastCol + rightBuffer);

        return { firstRow, lastRow, firstCol, lastCol, rawFirstCol, rawLastCol, viewW, viewH, scrollLeft, scrollTop, firstRowNoBuffer, lastRowNoBuffer };
      } catch (e) { return { firstRow: 0, lastRow: 0, firstCol: 0, lastCol: 0, rawFirstCol: 0, rawLastCol: 0, viewW: 0, viewH: 0, scrollLeft: 0, scrollTop: 0, firstRowNoBuffer: 0, lastRowNoBuffer: 0 }; }
    }

    // Compute constant mask: delegates to alignment instance
    computeConstantMask() {
      if (!this.alignment || typeof this.alignment.computeConstantMask !== 'function') {
        console.error('SealionViewer.computeConstantMask: alignment object with computeConstantMask method required');
        return '1'.repeat(Math.max(0, (this.colOffsets && this.colOffsets.length) ? this.colOffsets.length - 1 : 0));
      }
      return this.alignment.computeConstantMask();
    }

    // Compute consensus sequence: delegates to alignment instance
    computeConsensusSequence() {
      if (!this.alignment || typeof this.alignment.computeConsensusSequence !== 'function') {
        console.error('SealionViewer.computeConsensusSequence: alignment object with computeConsensusSequence method required');
        return 'N'.repeat(Math.max(0, (this.colOffsets && this.colOffsets.length) ? this.colOffsets.length - 1 : 0));
      }
      return this.alignment.computeConsensusSequence();
    }

    // Compute constant mask treating 'N' as ambiguous: delegates to alignment instance
    computeConstantMaskAllowN() {
      if (!this.alignment || typeof this.alignment.computeConstantMaskAllowN !== 'function') {
        console.error('SealionViewer.computeConstantMaskAllowN: alignment object with computeConstantMaskAllowN method required');
        return '1'.repeat(Math.max(0, (this.colOffsets && this.colOffsets.length) ? this.colOffsets.length - 1 : 0));
      }
      return this.alignment.computeConstantMaskAllowN();
    }

    // Compute constant mask treating 'N' and gaps '-' as ambiguous: delegates to alignment instance
    computeConstantMaskAllowNAndGaps() {
      if (!this.alignment || typeof this.alignment.computeConstantMaskAllowNAndGaps !== 'function') {
        console.error('SealionViewer.computeConstantMaskAllowNAndGaps: alignment object with computeConstantMaskAllowNAndGaps method required');
        return '1'.repeat(Math.max(0, (this.colOffsets && this.colOffsets.length) ? this.colOffsets.length - 1 : 0));
      }
      return this.alignment.computeConstantMaskAllowNAndGaps();
    }

    // Find matches for query in alignment rows (label or sequence). Returns array of row indices.
    findMatches(q) {
      try {
        if (!q) return [];
        const ql = String(q).toLowerCase();
        const rows = this.alignment || (window && window.rows) || [];
        const matches = [];
        for (let i = 0; i < rows.length; i++) {
          const r = rows[i];
          if ((r && r.label && String(r.label).toLowerCase().includes(ql)) || (r && r.sequence && String(r.sequence).toLowerCase().includes(ql))) { matches.push(i); }
        }
        return matches;
      } catch (e) { console.warn('SealionViewer.findMatches failed', e); return []; }
    }

    // Perform a search with the given query string
    // Initializes searchMatches and currentMatchIndex, selects and scrolls to first match
    performSearch(query) {
      try {
        if (!query || !query.trim()) {
          this.searchMatches = [];
          this.currentMatchIndex = -1;
          return;
        }

        this.searchMatches = this.findMatches(query);
        this.currentMatchIndex = this.searchMatches.length > 0 ? 0 : -1;

        if (this.searchMatches.length > 0) {
          // Select and scroll to first match
          const matchRow = this.searchMatches[0];
          if (typeof this.setSelectedRows === 'function') {
            this.setSelectedRows([matchRow]);
            this._scrollToRow(matchRow);
            if (typeof this.scheduleRender === 'function') this.scheduleRender();
          }
          console.info(`Found ${this.searchMatches.length} match${this.searchMatches.length !== 1 ? 'es' : ''} for "${query}"`);
        } else {
          console.info(`No matches found for "${query}"`);
        }
      } catch (e) { console.warn('SealionViewer.performSearch failed', e); }
    }

    // Navigate to the next search match (wraps around to beginning)
    nextMatch() {
      try {
        if (!this.searchMatches || this.searchMatches.length === 0) {
          console.warn('No search matches available. Perform a search first.');
          return;
        }

        this.currentMatchIndex = (this.currentMatchIndex + 1) % this.searchMatches.length;
        const matchRow = this.searchMatches[this.currentMatchIndex];

        if (typeof this.setSelectedRows === 'function') {
          this.setSelectedRows([matchRow]);
          this._scrollToRow(matchRow);
          if (typeof this.scheduleRender === 'function') this.scheduleRender();
        }

        console.info(`Match ${this.currentMatchIndex + 1} of ${this.searchMatches.length}`);
      } catch (e) { console.warn('SealionViewer.nextMatch failed', e); }
    }

    // Navigate to the previous search match (wraps around to end)
    previousMatch() {
      try {
        if (!this.searchMatches || this.searchMatches.length === 0) {
          console.warn('No search matches available. Perform a search first.');
          return;
        }

        this.currentMatchIndex = (this.currentMatchIndex - 1 + this.searchMatches.length) % this.searchMatches.length;
        const matchRow = this.searchMatches[this.currentMatchIndex];

        if (typeof this.setSelectedRows === 'function') {
          this.setSelectedRows([matchRow]);
          this._scrollToRow(matchRow);
          if (typeof this.scheduleRender === 'function') this.scheduleRender();
        }

        console.info(`Match ${this.currentMatchIndex + 1} of ${this.searchMatches.length}`);
      } catch (e) { console.warn('SealionViewer.previousMatch failed', e); }
    }

    // Helper: scroll to a specific row (centers it in viewport)
    _scrollToRow(rowIndex) {
      try {
        const rowHeight = this.ROW_HEIGHT || 20;
        const scroller = this.scroller;
        if (scroller) {
          const targetTop = rowIndex * rowHeight;
          const viewportHeight = scroller.clientHeight || 0;
          scroller.scrollTop = Math.max(0, targetTop - viewportHeight / 2);
        }
      } catch (e) { console.warn('SealionViewer._scrollToRow failed', e); }
    }

    // Map a CSS-pixel x offset (relative to the canvas left) to a column index.
    // Uses binary search on this.colOffsets. Returns an integer column index
    // clamped to [0, numCols-1].
    colIndexFromCssOffset(cssX) {
      const offsets = this.colOffsets;
      let lo = 0, hi = offsets.length - 1;
      if (hi <= 0) return 0;
      if (cssX <= offsets[0]) return 0;
      if (cssX >= offsets[hi]) return hi - 1;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (offsets[mid] <= cssX && cssX < offsets[mid + 1]) return mid;
        if (cssX < offsets[mid]) hi = mid - 1;
        else lo = mid + 1;
      }
      return Math.max(0, Math.min(offsets.length - 2, lo));
    }

    // Map a clientY (page/client coordinate) to a row index.
    // opts may include: { labelCanvas, scroller, ROW_HEIGHT, rowCount }
    rowFromClientY(clientY, opts) {
      try {
        const labelCanvas = (opts && opts.labelCanvas) ? opts.labelCanvas : (document.getElementById ? document.getElementById('labels-canvas') : null);
        const scroller = (opts && opts.scroller) ? opts.scroller : (document.getElementById ? document.getElementById('alignment-scroll') : null);
        const ROW_HEIGHT = (opts && typeof opts.ROW_HEIGHT === 'number') ? opts.ROW_HEIGHT : (window && typeof window.ROW_HEIGHT === 'number' ? window.ROW_HEIGHT : 20);
        const rowCount = (opts && typeof opts.rowCount === 'number') ? opts.rowCount : (window && typeof window.rowCount === 'number' ? window.rowCount : 0);
        if (!labelCanvas) return 0;
        const rect = labelCanvas.getBoundingClientRect();
        const y = clientY - rect.top; // css pixels within canvas
        const scrollTop = scroller ? scroller.scrollTop : (window && window.scrollTop ? window.scrollTop : 0);
        const absY = scrollTop + y;
        let row = Math.floor(absY / ROW_HEIGHT);
        if (row < 0) row = 0;
        if (rowCount && row >= rowCount) row = Math.max(0, rowCount - 1);
        return row;
      } catch (e) { return 0; }
    }

    // Request a render on the next animation frame.
    scheduleRender() {
      if (this._needsRender) return;
      this._needsRender = true;
      this._rafHandle = requestAnimationFrame(() => {
        this._needsRender = false;
        this._rafHandle = null;
        this.drawAll();
      });
    }

    // Placeholder drawAll implementation. In staged migration we'll replace
    // this with the real drawing functions ported from `script.js`.
    drawAll() {
      try {
        // compute visible region using the viewer's scroller and instance settings
        const vis = this.computeVisible(this.scroller, { ROW_HEIGHT: this.ROW_HEIGHT, BUFFER_ROWS: this.BUFFER_ROWS, BUFFER_COLS: this.BUFFER_COLS, CHAR_WIDTH: this.charWidth, maxSeqLen: (this.colOffsets && this.colOffsets.length) ? this.colOffsets.length - 1 : (this.alignment ? Math.max(0, ...this.alignment.map(r => r.sequence.length)) : 0), rowCount: (this.alignment ? this.alignment.length : 0), maskEnabled: !!this.maskEnabled });

        // refresh reference string/index if helper exists
        let refStr = null, refIndex = null;
        try { const _r = (window && window.refreshRefStr) ? window.refreshRefStr() : { refStr: null, refIndex: null }; refStr = _r.refStr; refIndex = _r.refIndex; } catch (_) { refStr = null; refIndex = null; }

        // mask string
        let maskStr = this.maskStr || (window && window.maskStr) || (window && window.mask) || null;

        // gather common opts
        const commonOpts = {
          colOffsets: this.colOffsets || [],
          maxSeqLen: (this.colOffsets && this.colOffsets.length) ? this.colOffsets.length - 1 : (this.alignment ? Math.max(0, ...this.alignment.map(r => r.sequence.length)) : 0),
          CHAR_WIDTH: this.charWidth,
          EXPANDED_RIGHT_PAD: this.EXPANDED_RIGHT_PAD,
          maskStr: maskStr,
          maskEnabled: !!this.maskEnabled,
          hideMode: !!this.hideMode,
          HIDDEN_MARKER_COLOR: this.HIDDEN_MARKER_COLOR
        };

        // draw headers/overview/consensus/labels/sequences in safe guards
        //try { this.drawLabelsOutline(this.labelsOutlineCanvas, vis, { LABEL_FONT: this.labelFont }); } catch (e) { console.error('SealionViewer.drawLabelsOutline failed', e); }
        //try { this.drawLabelsHeader(this.labelsHeaderCanvas, vis, { HEADER_FONT: this.HEADER_FONT, HEADER_HEIGHT: this.HEADER_HEIGHT, labelTextVertOffset: this.labelTextVertOffset, ROW_HEIGHT: this.ROW_HEIGHT, LABEL_FONT: this.labelFont, CONSENSUS_TOP_PAD: this.CONSENSUS_TOP_PAD, CONSENSUS_BOTTOM_PAD: this.CONSENSUS_BOTTOM_PAD, CONSENSUS_HEIGHT: this.CONSENSUS_HEIGHT }); } catch (e) { console.error('SealionViewer.drawLabelsHeader failed', e); }
        try { this.drawLabelsConsensus(this.labelsConsensusCanvas, vis, { LABEL_FONT: this.labelFont, CONSENSUS_TOP_PAD: this.CONSENSUS_TOP_PAD, CONSENSUS_BOTTOM_PAD: this.CONSENSUS_BOTTOM_PAD, CONSENSUS_HEIGHT: this.CONSENSUS_HEIGHT }); } catch (e) { console.error('SealionViewer.drawLabelsConsensus failed', e); }
        try { this.drawOverview(this.overviewCanvas, vis, commonOpts); } catch (e) { console.error('SealionViewer.drawOverview failed', e); }
        try { this.drawHeader(this.headerCanvas, vis, Object.assign({}, commonOpts, { HEADER_FONT: this.HEADER_FONT, HEADER_HEIGHT: this.HEADER_HEIGHT, selectedCols: this.getSelectedCols ? this.getSelectedCols() : (this.selectedCols || new Set()) })); } catch (e) { console.error('SealionViewer.drawHeader failed', e); }
        try { this.drawConsensus(this.consensusCanvas, vis, Object.assign({}, commonOpts, { FONT: this.FONT, CONSENSUS_TOP_PAD: this.CONSENSUS_TOP_PAD, CONSENSUS_BOTTOM_PAD: this.CONSENSUS_BOTTOM_PAD, selectedCols: this.getSelectedCols ? this.getSelectedCols() : (this.selectedCols || new Set()) })); } catch (e) { console.error('SealionViewer.drawConsensus failed', e); }
        try { this.drawLabels(this.labelCanvas, vis, { FONT: this.labelFont || this.FONT, ROW_HEIGHT: this.ROW_HEIGHT, LABEL_WIDTH: this.LABEL_WIDTH, labelTextVertOffset: this.labelTextVertOffset, selectedRows: this.getSelectedRows ? this.getSelectedRows() : (this.selectedRows || new Set()), rows: this.alignment || [], refIndex: refIndex, REF_ACCENT: this.REF_ACCENT }); } catch (e) { console.error('SealionViewer.drawLabels failed', e); }
        try { this.drawSequences(this.seqCanvas, vis, Object.assign({}, { FONT: this.FONT, ROW_HEIGHT: this.ROW_HEIGHT, CHAR_WIDTH: this.charWidth, EXPANDED_RIGHT_PAD: this.EXPANDED_RIGHT_PAD, rows: this.alignment || [], selectedRows: this.getSelectedRows ? this.getSelectedRows() : (this.selectedRows || new Set()), selectedCols: this.getSelectedCols ? this.getSelectedCols() : (this.selectedCols || new Set()), refStr: refStr, refModeEnabled: !!this.refModeEnabled, refIndex: refIndex, maskStr: maskStr, maskEnabled: !!this.maskEnabled, BASE_COLORS: this.BASE_COLORS, DEFAULT_BASE_COLOR: this.DEFAULT_BASE_COLOR, PALE_REF_COLOR: this.PALE_REF_COLOR, COMPRESSED_CELL_VPAD: this.COMPRESSED_CELL_VPAD, seqTextVertOffset: this.seqTextVertOffset, rowCount: (this.alignment ? this.alignment.length : 0), maxSeqLen: commonOpts.maxSeqLen, colOffsets: commonOpts.colOffsets, isRectSelecting: !!this.isRectSelecting, rectStartRow: this.rectStartRow, rectEndRow: this.rectEndRow, rectStartCol: this.rectStartCol, rectEndCol: this.rectEndCol })); } catch (e) { console.error('SealionViewer.drawSequences failed', e); }
      } catch (e) { console.error('SealionViewer.drawAll failed', e); }
    }

    // Small helper to cancel any pending RAF
    cancelRender() {
      if (this._rafHandle) {
        cancelAnimationFrame(this._rafHandle);
        this._rafHandle = null;
      }
      this._needsRender = false;
    }

    // Animate scrolling of a given scroller element. Accepts pixel targets
    // (CSS pixels) and a scroller DOM element. If scroller is not provided,
    // tries to use the document alignment scroll element.
    animateScrollTo(targetLeft, targetTop, scroller, duration = 300) {
      const sc = scroller || (document.getElementById ? document.getElementById('alignment-scroll') : null);
      if (!sc) return;
      if (this._scrollAnimRequest) { cancelAnimationFrame(this._scrollAnimRequest); this._scrollAnimRequest = null; }
      const startLeft = sc.scrollLeft;
      const startTop = sc.scrollTop;
      const totalWidth = (this.colOffsets && this.colOffsets.length > 0) ? this.colOffsets[this.colOffsets.length - 1] : 0;
      const wantLeft = (typeof targetLeft === 'number') ? Math.max(0, Math.min(targetLeft, Math.max(0, totalWidth - (sc ? sc.clientWidth : 0)))) : startLeft;
      // Compute vertical bounds using this.alignment when available; fall back to window.rowCount
      const rowCount = (this.alignment && this.alignment.length) ? this.alignment.length : (window && typeof window.rowCount === 'number' ? window.rowCount : 0);
      const ROW_HEIGHT = (window && typeof window.ROW_HEIGHT === 'number') ? window.ROW_HEIGHT : 20;
      const maxTop = Math.max(0, rowCount * ROW_HEIGHT - (sc ? sc.clientHeight : window.innerHeight));
      const wantTop = (typeof targetTop === 'number') ? Math.max(0, Math.min(targetTop, maxTop)) : startTop;
      const deltaLeft = wantLeft - startLeft;
      const deltaTop = wantTop - startTop;
      const start = performance.now();
      const that = this;
      function tick(now) {
        const t = Math.min(1, (now - start) / duration);
        const eased = 1 - (1 - t) * (1 - t);
        if (Math.abs(deltaLeft) > 0.5) sc.scrollLeft = Math.round(startLeft + deltaLeft * eased);
        if (Math.abs(deltaTop) > 0.5) sc.scrollTop = Math.round(startTop + deltaTop * eased);
        if (t < 1) { that._scrollAnimRequest = requestAnimationFrame(tick); } else { that._scrollAnimRequest = null; }
      }
      this._scrollAnimRequest = requestAnimationFrame(tick);
    }

    // Snap the scroller to a nearby column boundary. Mirrors the legacy
    // `snapScrollToChar` behaviour but uses the viewer's `colOffsets`.
    snapScrollToChar(startLeft, scroller) {
      const sc = scroller || (document.getElementById ? document.getElementById('alignment-scroll') : null);
      if (!sc) return;
      const cur = sc.scrollLeft || 0;
      const offsets = this.colOffsets || [];
      const maxSeqLen = Math.max(0, offsets.length - 1);
      const CHAR_WIDTH = this.charWidth || 8;
      // fallback to character-grid snap when offsets not available
      if (!offsets || offsets.length < 2) {
        let target;
        if (cur > startLeft) target = Math.ceil(cur / CHAR_WIDTH) * CHAR_WIDTH;
        else if (cur < startLeft) target = Math.floor(cur / CHAR_WIDTH) * CHAR_WIDTH;
        else target = Math.round(cur / CHAR_WIDTH) * CHAR_WIDTH;
        if (target !== cur) { if (sc) sc.scrollLeft = target; }
        return;
      }
      let target = cur;
      if (cur > startLeft) {
        const idx = this.colIndexFromCssOffset(cur);
        target = offsets[Math.min(maxSeqLen, idx + 1)];
      } else if (cur < startLeft) {
        const idx = this.colIndexFromCssOffset(cur);
        target = offsets[idx];
      } else {
        const idx = this.colIndexFromCssOffset(cur);
        const leftB = offsets[idx];
        const rightB = offsets[idx + 1] || (leftB + CHAR_WIDTH);
        target = (cur - leftB) < (rightB - cur) ? leftB : rightB;
      }
      if (target !== cur) { if (sc) sc.scrollLeft = target; }
    }

    // Update the global `mask` string for a set of columns and animate the
    // transition of `colOffsets` to reflect the edited mask. This method
    // centralizes mask edits inside the viewer so interaction handlers can
    // call it directly without needing a separate callback in script.js.
    // colsSet: Set<number> | Array<number>
    setMaskBitsForCols(colsSet, bitChar) {
      try {
        const colsArr = (colsSet && typeof colsSet.size === 'number') ? Array.from(colsSet) : (Array.isArray(colsSet) ? colsSet.slice() : []);
        if (!colsArr || colsArr.length === 0) { console.info('mask edit: no columns selected'); return; }
        // normalize existing mask
        let cur = (typeof window.mask !== 'undefined' && window.mask) ? String(window.mask) : null;
        if (!cur || cur.length < (this.colOffsets && this.colOffsets.length ? this.colOffsets.length - 1 : 0)) {
          const maxSeq = (this.colOffsets && this.colOffsets.length) ? this.colOffsets.length - 1 : Math.max(0, (window && typeof window.maxSeqLen === 'number' ? window.maxSeqLen : 0));
          cur = (cur || '') + '1'.repeat(Math.max(0, maxSeq - (cur ? cur.length : 0)));
        }
        // ensure exact length
        const maxLen = (this.colOffsets && this.colOffsets.length) ? this.colOffsets.length - 1 : (window && typeof window.maxSeqLen === 'number' ? window.maxSeqLen : 0);
        if (cur.length > maxLen) cur = cur.slice(0, maxLen);
        const arr = cur.split('');
        const cols = colsArr.filter(c => Number.isFinite(c) && c >= 0 && c < maxLen).sort((a, b) => a - b);
        if (cols.length === 0) { console.info('mask edit: no valid columns in selection'); return; }
        for (const c of cols) arr[c] = bitChar;
        const newMask = arr.join('');
        try { window.mask = newMask; window.maskStr = newMask; this.maskStr = newMask; } catch (_) { }
        // animate to the current maskEnabled preference
        try { this.startMaskTransition(!!this.maskEnabled); } catch (_) { }
      } catch (e) { console.warn('SealionViewer.setMaskBitsForCols failed', e); }
    }

    // Find the next column (to the right) that has a difference from the reference
    // sequence. If selectedRows is provided, only consider differences in those rows.
    // Ignores 'N' and '-' characters.
    // Returns the column index or -1 if no difference found.
    findNextDifference(fromCol, refStr, selectedRows) {
      try {
        if (!this.alignment || !refStr) return -1;
        
        const maxSeqLen = this.colOffsets ? this.colOffsets.length - 1 : 0;
        const startCol = Math.max(0, fromCol + 1);
        
        // Determine which rows to check
        const rowsToCheck = selectedRows && selectedRows.size > 0 
          ? Array.from(selectedRows) 
          : Array.from({ length: this.alignment.length }, (_, i) => i);
        
        // Search from startCol to the end
        for (let col = startCol; col < maxSeqLen; col++) {
          const refChar = refStr.charAt(col);
          if (refChar === 'N' || refChar === '-') continue;
          
          // Check if any of the rows to check have a difference at this column
          for (const rowIdx of rowsToCheck) {
            const row = this.alignment[rowIdx];
            if (!row || !row.sequence) continue;
            
            const seqChar = row.sequence.charAt(col);
            if (seqChar === 'N' || seqChar === '-') continue;
            
            if (seqChar !== refChar) {
              return col;
            }
          }
        }
        
        return -1; // No difference found
      } catch (e) {
        console.warn('findNextDifference failed', e);
        return -1;
      }
    }

    // Find the previous column (to the left) that has a difference from the reference
    // sequence. If selectedRows is provided, only consider differences in those rows.
    // Ignores 'N' and '-' characters.
    // Returns the column index or -1 if no difference found.
    findPreviousDifference(fromCol, refStr, selectedRows) {
      try {
        if (!this.alignment || !refStr) return -1;
        
        const startCol = Math.min(fromCol - 1, (this.colOffsets ? this.colOffsets.length - 2 : 0));
        
        // Determine which rows to check
        const rowsToCheck = selectedRows && selectedRows.size > 0 
          ? Array.from(selectedRows) 
          : Array.from({ length: this.alignment.length }, (_, i) => i);
        
        // Search from startCol backwards to the beginning
        for (let col = startCol; col >= 0; col--) {
          const refChar = refStr.charAt(col);
          if (refChar === 'N' || refChar === '-') continue;
          
          // Check if any of the rows to check have a difference at this column
          for (const rowIdx of rowsToCheck) {
            const row = this.alignment[rowIdx];
            if (!row || !row.sequence) continue;
            
            const seqChar = row.sequence.charAt(col);
            if (seqChar === 'N' || seqChar === '-') continue;
            
            if (seqChar !== refChar) {
              return col;
            }
          }
        }
        
        return -1; // No difference found
      } catch (e) {
        console.warn('findPreviousDifference failed', e);
        return -1;
      }
    }

    // Jump to the next difference site: select the column, center it horizontally,
    // and scroll to the first row with a difference at that column.
    jumpToNextDifference(refStr) {
      try {
        if (!this.alignment || !refStr) {
          console.warn('jumpToNextDifference: no alignment or reference');
          return;
        }
        
        // Get current column (use first selected column or 0)
        const selectedCols = this.getSelectedCols ? this.getSelectedCols() : (this.selectedCols || new Set());
        const currentCol = selectedCols.size > 0 ? Math.max(...Array.from(selectedCols)) : -1;
        
        // Get selected rows (if any)
        const selectedRows = this.getSelectedRows ? this.getSelectedRows() : (this.selectedRows || new Set());
        
        // Find next difference
        const nextCol = this.findNextDifference(currentCol, refStr, selectedRows);
        
        if (nextCol === -1) {
          console.info('No more differences found to the right');
          return;
        }
        
        // Select the column
        if (this.selectedCols) {
          this.selectedCols.clear();
          this.selectedCols.add(nextCol);
        }
        this.anchorCol = nextCol;
        
        // Find the first row with a difference at this column
        let firstDiffRow = -1;
        const refChar = refStr.charAt(nextCol);
        const rowsToCheck = selectedRows.size > 0 
          ? Array.from(selectedRows) 
          : Array.from({ length: this.alignment.length }, (_, i) => i);
        
        for (const rowIdx of rowsToCheck) {
          const row = this.alignment[rowIdx];
          if (!row || !row.sequence) continue;
          
          const seqChar = row.sequence.charAt(nextCol);
          if (seqChar === 'N' || seqChar === '-') continue;
          
          if (seqChar !== refChar) {
            firstDiffRow = rowIdx;
            break;
          }
        }
        
        // Scroll to center the column horizontally
        if (this.scroller && this.colOffsets) {
          const colLeft = this.colOffsets[nextCol] || 0;
          const colRight = this.colOffsets[nextCol + 1] || colLeft;
          const colCenter = (colLeft + colRight) / 2;
          const targetScrollLeft = Math.max(0, colCenter - this.scroller.clientWidth / 2);
          this.scroller.scrollLeft = targetScrollLeft;
        }
        
        // Only scroll vertically if no rows are selected (searching all sequences)
        // When rows are selected, keep the current vertical scroll position
        if (firstDiffRow !== -1 && this.scroller && selectedRows.size === 0) {
          const ROW_HEIGHT = this.ROW_HEIGHT || (window && window.ROW_HEIGHT) || 20;
          const targetScrollTop = firstDiffRow * ROW_HEIGHT;
          this.scroller.scrollTop = targetScrollTop;
        }
        
        // Render
        if (typeof this.scheduleRender === 'function') {
          this.scheduleRender();
        }
        
        console.info('Jumped to next difference at column', nextCol, 'row', firstDiffRow);
      } catch (e) {
        console.warn('jumpToNextDifference failed', e);
      }
    }

    // Jump to the previous difference site: select the column, center it horizontally,
    // and scroll to the first row with a difference at that column.
    jumpToPreviousDifference(refStr) {
      try {
        if (!this.alignment || !refStr) {
          console.warn('jumpToPreviousDifference: no alignment or reference');
          return;
        }
        
        // Get current column (use first selected column or max)
        const selectedCols = this.getSelectedCols ? this.getSelectedCols() : (this.selectedCols || new Set());
        const maxSeqLen = this.colOffsets ? this.colOffsets.length - 1 : 0;
        const currentCol = selectedCols.size > 0 ? Math.min(...Array.from(selectedCols)) : maxSeqLen;
        
        // Get selected rows (if any)
        const selectedRows = this.getSelectedRows ? this.getSelectedRows() : (this.selectedRows || new Set());
        
        // Find previous difference
        const prevCol = this.findPreviousDifference(currentCol, refStr, selectedRows);
        
        if (prevCol === -1) {
          console.info('No more differences found to the left');
          return;
        }
        
        // Select the column
        if (this.selectedCols) {
          this.selectedCols.clear();
          this.selectedCols.add(prevCol);
        }
        this.anchorCol = prevCol;
        
        // Find the first row with a difference at this column
        let firstDiffRow = -1;
        const refChar = refStr.charAt(prevCol);
        const rowsToCheck = selectedRows.size > 0 
          ? Array.from(selectedRows) 
          : Array.from({ length: this.alignment.length }, (_, i) => i);
        
        for (const rowIdx of rowsToCheck) {
          const row = this.alignment[rowIdx];
          if (!row || !row.sequence) continue;
          
          const seqChar = row.sequence.charAt(prevCol);
          if (seqChar === 'N' || seqChar === '-') continue;
          
          if (seqChar !== refChar) {
            firstDiffRow = rowIdx;
            break;
          }
        }
        
        // Scroll to center the column horizontally
        if (this.scroller && this.colOffsets) {
          const colLeft = this.colOffsets[prevCol] || 0;
          const colRight = this.colOffsets[prevCol + 1] || colLeft;
          const colCenter = (colLeft + colRight) / 2;
          const targetScrollLeft = Math.max(0, colCenter - this.scroller.clientWidth / 2);
          this.scroller.scrollLeft = targetScrollLeft;
        }
        
        // Only scroll vertically if no rows are selected (searching all sequences)
        // When rows are selected, keep the current vertical scroll position
        if (firstDiffRow !== -1 && this.scroller && selectedRows.size === 0) {
          const ROW_HEIGHT = this.ROW_HEIGHT || (window && window.ROW_HEIGHT) || 20;
          const targetScrollTop = firstDiffRow * ROW_HEIGHT;
          this.scroller.scrollTop = targetScrollTop;
        }
        
        // Render
        if (typeof this.scheduleRender === 'function') {
          this.scheduleRender();
        }
        
        console.info('Jumped to previous difference at column', prevCol, 'row', firstDiffRow);
      } catch (e) {
        console.warn('jumpToPreviousDifference failed', e);
      }
    }

    // Animate mask transition (interpolate colOffsets between current and
    // target offsets computed with mask enabled/disabled). This mirrors the
    // legacy startMaskTransition but keeps the animation logic inside the
    // viewer where column geometry is authoritative.
    startMaskTransition(toEnabled) {
      try {
        if (this._maskAnimRequest) { cancelAnimationFrame(this._maskAnimRequest); this._maskAnimRequest = null; }
        // ensure mask string is up to date on window (script.js keeps a separate
        // internal maskStr; callers who need that should call refreshMaskStr).
        console.info('SealionViewer: mask animation start', { toEnabled: !!toEnabled });
        const from = (this.colOffsets && this.colOffsets.slice) ? this.colOffsets.slice() : [];
        const maskStr = (window && typeof window.maskStr === 'string') ? window.maskStr : (window && typeof window.mask === 'string') ? window.mask : null;
        const REDUCED_COL_WIDTH = (window && typeof window.REDUCED_COL_WIDTH === 'number') ? window.REDUCED_COL_WIDTH : 1;
        const EXPANDED_RIGHT_PAD = (window && typeof window.EXPANDED_RIGHT_PAD === 'number') ? window.EXPANDED_RIGHT_PAD : 2;
        const to = this.buildColOffsetsFor(toEnabled, { maxSeqLen: (this.colOffsets && this.colOffsets.length) ? this.colOffsets.length - 1 : (window && typeof window.maxSeqLen === 'number' ? window.maxSeqLen : 0), CHAR_WIDTH: this.charWidth, REDUCED_COL_WIDTH: REDUCED_COL_WIDTH, EXPANDED_RIGHT_PAD: EXPANDED_RIGHT_PAD, maskStr: maskStr });
        const start = performance.now();
        const DURATION = (window && typeof window.MASK_ANIM_MS === 'number') ? window.MASK_ANIM_MS : 220;
        const that = this;
        function easeOutQuad(t) { return 1 - (1 - t) * (1 - t); }
        function tick(now) {
          try {
            const dt = Math.min(1, (now - start) / DURATION);
            const eased = easeOutQuad(dt);
            const maxIdx = Math.max((from && from.length) ? from.length - 1 : 0, (to && to.length) ? to.length - 1 : 0);
            // interpolate into this.colOffsets as CSS pixels (float values allowed during animation)
            that.colOffsets = that.colOffsets || new Array(maxIdx + 1).fill(0);
            for (let i = 0; i <= maxIdx; i++) {
              const f = (from && typeof from[i] !== 'undefined') ? from[i] : 0;
              const t0 = (to && typeof to[i] !== 'undefined') ? to[i] : f;
              that.colOffsets[i] = f + (t0 - f) * eased;
            }
            // update spacer width to reflect interpolated total
            try { if (that.seqSpacer) that.seqSpacer.style.width = Math.max(1, Math.round(that.colOffsets[that.colOffsets.length - 1] || 0)) + 'px'; } catch (_) { }
            if (typeof that.scheduleRender === 'function') that.scheduleRender();
            if (dt < 1) { that._maskAnimRequest = requestAnimationFrame(tick); }
            else {
              that._maskAnimRequest = null;
              // finalize
              that.maskEnabled = !!toEnabled;
              try { window.maskEnabled = !!that.maskEnabled; } catch (_) { }
              // rebuild definitive integer offsets and resize backings
              try { const out = that.buildColOffsetsFor(!!that.maskEnabled, { maxSeqLen: (to && to.length) ? to.length - 1 : 0, CHAR_WIDTH: that.charWidth, REDUCED_COL_WIDTH: REDUCED_COL_WIDTH, EXPANDED_RIGHT_PAD: EXPANDED_RIGHT_PAD, maskStr: maskStr }); that.colOffsets = out; } catch (_) { }
              try { that.setCanvasCSSSizes(); } catch (_) { }
              try { that.resizeBackings(); } catch (_) { }
              if (typeof that.scheduleRender === 'function') that.scheduleRender();
              console.info('SealionViewer: mask animation end', { toEnabled: !!toEnabled });
            }
          } catch (e) { console.warn('SealionViewer: mask tick error', e); }
        }
        this._maskAnimRequest = requestAnimationFrame(tick);
      } catch (e) { console.warn('SealionViewer.startMaskTransition failed', e); }
    }

    // Public helper to update devicePixelRatio (call after zoom / DPR change)
    refreshDPR() {
      this.pr = window.devicePixelRatio || 1;
      this.scheduleRender();
    }

    // Toggle hide mode (collapsed regions are hidden with center markers)
    toggleHideMode() {
      try {
        this.hideMode = !this.hideMode;
        console.info('Hide mode:', this.hideMode ? 'ON' : 'OFF');
        
        // Rebuild column offsets with new hide mode
        if (typeof this.buildColOffsetsFor === 'function' && this.colOffsets) {
          const maxSeqLen = this.colOffsets.length - 1;
          this.colOffsets = this.buildColOffsetsFor(this.maskEnabled, {
            maxSeqLen: maxSeqLen,
            CHAR_WIDTH: this.charWidth,
            EXPANDED_RIGHT_PAD: this.EXPANDED_RIGHT_PAD || 2,
            REDUCED_COL_WIDTH: this.REDUCED_COL_WIDTH || 1,
            HIDDEN_MARKER_WIDTH: this.HIDDEN_MARKER_WIDTH || 4,
            hideMode: this.hideMode,
            maskStr: (window && window.maskStr) || (window && window.mask) || null
          });
        }
        
        // Update canvas sizes and re-render
        if (typeof this.setCanvasCSSSizes === 'function') {
          this.setCanvasCSSSizes();
        }
        if (typeof this.resizeBackings === 'function') {
          this.resizeBackings();
        }
        if (typeof this.scheduleRender === 'function') {
          this.scheduleRender();
        }
      } catch (e) {
        console.warn('toggleHideMode failed', e);
      }
    }

    // Expose class on window for easy staged consumption from existing code.
  }

  // Default visual/behaviour settings the viewer uses when constructed.
  // Consumers may pass an overrides object as the third constructor argument
  // to change any of these defaults. Keeping the defaults close to the class
  // makes staged migration and later configurability easier.
  SealionViewer.DEFAULTS = {
    FONT_SIZE: 14,
    FONT: '14px monospace',
    HEADER_FONT: '12px sans-serif',
    LABEL_WIDTH: 260,
    ROW_HEIGHT: 20,
    ROW_PADDING: 6,
    HEADER_HEIGHT: 30,
    OVERVIEW_HEIGHT: 48,
    CONSENSUS_HEIGHT: 20,
    CONSENSUS_TOP_PAD: 4,
    CONSENSUS_BOTTOM_PAD: 8,
    EXPANDED_RIGHT_PAD: 2,
    REDUCED_COL_WIDTH: 1,
    HIDDEN_MARKER_WIDTH: 4,
    HIDDEN_MARKER_COLOR: '#d0d0d0',
    COMPRESSED_CELL_VPAD: 2,
    BUFFER_ROWS: 2,
    BUFFER_COLS: 5,
    MASK_ANIM_MS: 220,
    BASE_COLORS: { 'A': '#2ca02c', 'C': '#1f77b4', 'G': '#d62728', 'T': '#ff7f0e' },
    DEFAULT_BASE_COLOR: '#666',
    PALE_REF_COLOR: '#e6e6e6',
    REF_ACCENT: '#2b8cff',
    // Canvas background colors
    OVERVIEW_BG: '#f7f7f7',
    OVERVIEW_EXPANDED_COL: '#ddd',
    OVERVIEW_COLLAPSED_COL: '#999',
    OVERVIEW_VIEWPORT: 'rgba(0,120,200,0.9)',
    HEADER_BG: '#f3f3f3',
    HEADER_TEXT: '#333',
    HEADER_STROKE: '#666',
    HEADER_SELECTION: '#ffd54d',
    CONSENSUS_BG: '#fafafa',
    CONSENSUS_SEPARATOR: '#e0e0e0',
    LABELS_BG: '#f3f3f3',
    LABELS_TEXT: '#111',
    LABELS_HEADER_TEXT: '#333',
    // Index styling
    INDEX_FONT_STYLE: 'italic',
    INDEX_COLOR: '#888888',
    INDEX_RIGHT_ALIGN_POS: 50,
    LABEL_START_POS: 56,
    SEQ_SELECTED_ROW: 'rgba(207, 232, 255, 0.5)',
    SEQ_EVEN_ROW: '#fff',
    SEQ_ODD_ROW: '#fafafa',
    SEQ_COL_SELECTION: '#ffd54d',
    //SEQ_COL_SELECTION: 'rgba(0,120,200,0.9)',
    SEQ_RECT_SELECTION_START: 'rgba(255,0,0,0.6)',
    SEQ_RECT_SELECTION_END: 'rgba(0,0,255,0.8)',
    maskEnabled: true,
    snapEnabled: true
  };

  window.SealionViewer = SealionViewer;

})();
