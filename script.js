// script.js - virtualized alignment canvas renderer
// Expects `alignment` to be provided by alignment.js (loaded before this script in index.html)

(function(){

    // Button to set the consensus sequence as the reference and clear any selected row
    const diffConsensusBtn = document.getElementById('diff-consensus-btn');
    if(diffConsensusBtn){
          diffConsensusBtn.addEventListener('click', ()=>{
        try{
          // compute or reuse consensus
          const cons = (window && window.consensusSequence) ? window.consensusSequence : computeConsensusSequence();
          if(!cons){ console.warn('No consensus available to set as reference'); return; }
          try{ window.reference = String(cons); }catch(_){ reference = String(cons); }
          // clear any selected row (user asked to clear the previously selected row)
          try{ if(viewer && typeof viewer.clearSelectionSets === 'function') viewer.clearSelectionSets(); }catch(_){ }
          // refresh reference state (will set refIndex if any row exactly matches consensus)
          // note: we intentionally do NOT auto-select any matching row when the reference
          // is the consensus; rows that happen to equal the consensus should be treated
          // the same as other sequences (no special highlight).
          refreshRefStr();
          // enable reference colouring UI so effect is visible
          if(refToggle){ try{ refToggle.checked = true; }catch(_){ } }
          refModeEnabled = true;
          try{ window.__refModeEnabled = !!refModeEnabled; }catch(_){ }
          console.info('Set reference to consensus');
          scheduleRender();
        }catch(e){ console.warn('diff-consensus failed', e); }
      });
    }
    setStatus('checking alignment data...');
    if(typeof alignment === 'undefined'){
      const msg = 'alignment not found; make sure alignment.js is loaded before script.js';
      console.error(msg);
      setStatus('ERROR: alignment not found');
      return;
    }

  const labelCanvas = document.getElementById('labels-canvas');
  const seqCanvas = document.getElementById('seq-canvas');
  const headerCanvas = document.getElementById('header-canvas');
  const overviewCanvas = document.getElementById('overview-canvas');
  const labelsHeaderCanvas = document.getElementById('labels-header-canvas');
  const consensusCanvas = document.getElementById('consensus-canvas');
  // viewer instance reference (populated later, after geometry is known)
  let viewer = null;
  // Helper to prefer viewer-owned properties but fall back to local value.
  function getViewerProp(name, localVal, viewerKey){
    try{
      const key = viewerKey || name;
      // Prefer explicit instance property (viewer[key]) if available
      if(viewer && typeof viewer[key] !== 'undefined') return viewer[key];
      // Then prefer the viewer's default constants if provided (single source of truth)
      if(viewer && viewer.DEFAULTS && typeof viewer.DEFAULTS[name] !== 'undefined') return viewer.DEFAULTS[name];
      // Then any global window override
      if(window && typeof window[name] !== 'undefined') return window[name];
      return localVal;
    }catch(_){ return localVal; }
  }

  // Setter that writes to the viewer instance when available, otherwise to window globals.
  function setViewerProp(name, value, viewerKey){
    try{
      const key = viewerKey || name;
      if(viewer){ try{ viewer[key] = value; }catch(_){ } return; }
      try{ window[name] = value; }catch(_){ }
    }catch(_){ }
  }
  // prefer the single scroll root when present — we'll override these below if needed
  let leftScroll = document.getElementById('left-scroll');
  let rightScroll = document.getElementById('right-scroll');
  const seqSpacer = document.getElementById('seq-spacer');
  const seqInner = document.getElementById('seq-inner');
  const leftSpacer = document.getElementById('left-spacer');
  const leftInner = document.getElementById('left-inner');
  // the alignment scroll element is the authoritative scroller for both axes
  const alignScroll = document.getElementById('alignment-scroll');
  if(alignScroll){ leftScroll = alignScroll; rightScroll = alignScroll; }
  // canonical scroller used everywhere from now on
  const scroller = alignScroll || rightScroll || leftScroll || null;
  // Staged refactor: ensure a SealionViewer instance exists. sealion.js may be
  // loaded after this script (index ordering). We define the function here but
  // defer calling it until alignment geometry (maxSeqLen, colOffsets) is known.
  function ensureViewer() {
    if (viewer) return viewer;
    if (window && window.SealionViewer) {
        try{
          // instantiate with the full alignment rows so the viewer can
          // compute row counts and selection correctly.
          // Previously we passed an object with only maxSeqLen which meant
          // viewer.alignment.length was falsy and keyboard row navigation
          // computed a zero-height content area. Pass the canonical `rows`
          // array (from alignment.js) instead.
          // Instantiate viewer attached to the main grid container. The
          // viewer will create or reuse its internal canvases/spacers inside
          // this container, so we only need to pass the alignment rows.
          // Pass the viewer default settings as the initial options object so
          // appearance-related constants are centralized in the viewer.
          viewer = new window.SealionViewer('#sealion', (typeof rows !== 'undefined') ? rows : null, window.SealionViewer ? window.SealionViewer.DEFAULTS : {});
        }catch(e){ console.error('SealionViewer construction failed', e); viewer = null; return null; }
        // expose on window so legacy wrappers and external callers can find it
        try{ window.viewer = viewer; }catch(_){ }
        console.info('SealionViewer instantiated');
        try{
      // The viewer creates/reuses canvases and spacers within the '#grid'
      // container. Only wire high-level callbacks to the viewer here; DOM
      // references are unnecessary because the viewer holds them.
      viewer.attachInteractionHandlers({ scroller: scroller, callbacks: {
        setColSelectionToRange: setColSelectionToRange,
        addRangeToColSelection: addRangeToColSelection,
        setSelectionToRange: setSelectionToRange,
        addRangeToSelection: addRangeToSelection,
        clearRectSelection: clearRectSelection,
        clearSelectionSets: function(){ try{ if(viewer && typeof viewer.clearSelectionSets === 'function') viewer.clearSelectionSets(); }catch(_){ } },
        updateRectSelection: function(r0,r1,c0,c1,orig){ try{ if(viewer && typeof viewer.updateRectSelection === 'function'){ viewer.updateRectSelection(r0,r1,c0,c1,orig); } }catch(_){ } },
        finalizeRectSelection: function(r0,r1,c0,c1,orig){ try{ if(viewer && typeof viewer.finalizeRectSelection === 'function'){ viewer.finalizeRectSelection(r0,r1,c0,c1,orig); } }catch(_){ } },
        scheduleRender: scheduleRender
      }});
        } catch (e) {
          console.error('Failed to attach interaction handlers to SealionViewer', e);
        }
        return viewer;
    }
    // SealionViewer not available yet — try again shortly
    setTimeout(ensureViewer, 200);
    return null;
  }
  const searchInput = document.getElementById('search-input');
  const searchNextBtn = document.getElementById('search-next');
  
  const snapToggle = document.getElementById('snap-toggle');
  
  // divider element for resizing the labels column
  const labelDivider = document.getElementById('label-divider');
  const maskToggle = document.getElementById('mask-toggle');
  const refToggle = document.getElementById('ref-toggle');

  // Visual constants (fonts, sizes, colors) are provided by the SealionViewer
  // instance and its `DEFAULTS`. Use `getViewerProp(name, fallback)` to read
  // values and `setViewerProp(name, value)` to publish measurements back to
  // the viewer. Local fallbacks are intentionally removed to centralize config.

  const rows = alignment;
  const rowCount = rows.length;
  const maxSeqLen = Math.max(0, ...rows.map(r=>r.sequence.length));
  // Attempt to instantiate the SealionViewer now that alignment geometry exists.
  try{ ensureViewer(); }catch(_){ }
  // mask string (should be provided by alignment.js). If absent we initialize to all '1's
  // so compression machinery is always enabled but starts uncompressed.
  // Evaluate and normalize lazily so global `mask` can be injected/edited at runtime.
  let maskStr = null;
  // Populate maskStr from utils (sealion/utils.js); fall back to all '1's if helper missing
  try{ maskStr = (window && window.refreshMaskStr) ? window.refreshMaskStr() : '1'.repeat(maxSeqLen); }catch(_){ maskStr = '1'.repeat(maxSeqLen); }
  // reference handling: evaluate lazily and expose
  let refStr = null;
  let refIndex = null;
  // populate refStr/refIndex using utils (if available)
  try{ const _r = (window && window.refreshRefStr) ? window.refreshRefStr() : { refStr: null, refIndex: null }; refStr = _r.refStr; refIndex = _r.refIndex; }catch(_){ refStr = null; refIndex = null; }
  const REDUCED_COL_WIDTH = 1; // CSS pixels for compressed columns
  // extra right-side padding (CSS pixels) added to expanded columns to avoid clipping
  const EXPANDED_RIGHT_PAD = 2;
  // vertical padding inside compressed cell blocks so background peeks above/below
  const COMPRESSED_CELL_VPAD = 2; // CSS pixels
  // vertical padding inside consensus row (fixed top and bottom pads)
  const CONSENSUS_TOP_PAD = 4; // px
  const CONSENSUS_BOTTOM_PAD = 8; // px
  // Mask compression is always enabled; start with a mask of all '1's (no actual compression)
  let maskEnabled = true;
  let refModeEnabled = refToggle ? !!refToggle.checked : false;
  // Helper: modify the global `mask` string for a set of columns and animate to the new offsets.
  function setMaskBitsForCols(colsSet, bitChar){
    // Viewer-only API: the SealionViewer now owns mask edits. If the viewer
    // is missing this is a fatal migration error (log and no-op).
    try{
      if(viewer && typeof viewer.setMaskBitsForCols === 'function'){
        return viewer.setMaskBitsForCols(colsSet, bitChar);
      }
      console.error('setMaskBitsForCols: SealionViewer not available — viewer required for mask edits');
    }catch(e){ console.warn('setMaskBitsForCols failed', e); }
  }
  // Helper to obtain authoritative column offsets from the SealionViewer instance.
  // The viewer owns the offsets; script-level code should consult the viewer
  // rather than maintain a separate global copy.
  function getViewerColOffsets(){
    try{ return (viewer && viewer.colOffsets) ? viewer.colOffsets : []; }catch(_){ return []; }
  }
  // Ask the viewer to rebuild and publish its colOffsets when layout-affecting
  // measurements change (CHAR_WIDTH, mask, etc.). This replaces the legacy
  // syncColOffsetsFromViewer helper which maintained a separate copy.
  function ensureViewerColOffsetsBuilt(){
    try{
      if(viewer && typeof viewer.buildColOffsetsFor === 'function'){
        const _CHAR_WIDTH = getViewerProp('CHAR_WIDTH', CHAR_WIDTH, 'charWidth');
        const _EXPANDED_RIGHT_PAD = getViewerProp('EXPANDED_RIGHT_PAD', EXPANDED_RIGHT_PAD);
        const _REDUCED_COL_WIDTH = getViewerProp('REDUCED_COL_WIDTH', REDUCED_COL_WIDTH);
        const out = viewer.buildColOffsetsFor(maskEnabled, { maxSeqLen: maxSeqLen, CHAR_WIDTH: _CHAR_WIDTH, EXPANDED_RIGHT_PAD: _EXPANDED_RIGHT_PAD, REDUCED_COL_WIDTH: _REDUCED_COL_WIDTH, maskStr: maskStr });
        try{ viewer.colOffsets = out; }catch(_){ }
      }
    }catch(_){ }
  }
  // helper: given an absolute CSS offset, find the column index containing that x
  function colIndexFromOffset(offset){
    try{ const v = (viewer || (window && window.viewer)) ? (viewer || window.viewer) : null; if(v && typeof v.colIndexFromCssOffset === 'function') return v.colIndexFromCssOffset(offset); }catch(_){ }
      if(offset <= 0) return 0;
      const last = maxSeqLen;
      const co = getViewerColOffsets();
      if(!co || co.length === 0){
        const _CHAR_WIDTH = getViewerProp('CHAR_WIDTH', CHAR_WIDTH, 'charWidth');
        const _EXPANDED_RIGHT_PAD = getViewerProp('EXPANDED_RIGHT_PAD', EXPANDED_RIGHT_PAD);
        return Math.min(maxSeqLen - 1, Math.max(0, Math.floor(offset / (_CHAR_WIDTH + _EXPANDED_RIGHT_PAD))));
      }
      if(offset >= co[last]) return Math.max(0, last-1);
      let low = 0, high = last; 
      while(low < high){
        const mid = Math.floor((low + high) / 2);
        if(co[mid] <= offset) low = mid + 1; else high = mid;
      }
      const idx = Math.max(0, low - 1);
      return Math.min(idx, maxSeqLen - 1);
  }
  // Apply custom mask button: when clicked, override current mask with `custom_mask` global


    // Compute a mask that marks constant sites (0) vs variable sites (1).
    // Delegates to SealionViewer when available, otherwise to SealionUtils/global helper.
    function computeConstantMask(){
      try{
        if(viewer && typeof viewer.computeConstantMask === 'function') return viewer.computeConstantMask();
      }catch(_){ }
      try{
        if(window && window.SealionUtils && typeof window.SealionUtils.computeConstantMask === 'function') return window.SealionUtils.computeConstantMask(rows, maxSeqLen);
        if(typeof computeConstantMask === 'function' && window && window.computeConstantMask === computeConstantMask){ /* avoid recursion if global */ }
        if(window && typeof window.computeConstantMask === 'function') return window.computeConstantMask(rows, maxSeqLen);
      }catch(_){ }
      return '1'.repeat(Math.max(0, maxSeqLen));
    }

    // Compute consensus sequence for the alignment.
    // Delegates to SealionViewer when available, otherwise to SealionUtils/global helper.
    function computeConsensusSequence(){
      try{
        if(viewer && typeof viewer.computeConsensusSequence === 'function') return viewer.computeConsensusSequence();
      }catch(_){ }
      try{
        if(window && window.SealionUtils && typeof window.SealionUtils.computeConsensusSequence === 'function') return window.SealionUtils.computeConsensusSequence(rows, maxSeqLen);
        if(window && typeof window.computeConsensusSequence === 'function') return window.computeConsensusSequence(rows, maxSeqLen);
      }catch(_){ }
      return 'N'.repeat(Math.max(0, maxSeqLen));
    }

    // Apply constant mask button
    const applyConstantMaskBtn = document.getElementById('apply-constant-mask-btn');
    if(applyConstantMaskBtn){
      applyConstantMaskBtn.addEventListener('click', ()=>{
        try{
          const cm = computeConstantMask();
          if(cm){
            try{ window.mask = String(cm); }catch(_){ mask = String(cm); }
            console.info('apply-constant-mask: applied (length=' + (String(cm).length) + ')');
          }
        }catch(e){ console.warn('apply-constant-mask failed', e); }
        refreshMaskStr();
        try{ if(viewer && typeof viewer.startMaskTransition === 'function') viewer.startMaskTransition(!!maskEnabled); else console.error('startMaskTransition: SealionViewer missing; cannot run mask transition'); }catch(e){ console.error('startMaskTransition call failed', e); }
      });
    }
  if(refToggle){
    refToggle.addEventListener('change', ()=>{
      refModeEnabled = !!refToggle.checked;
      refreshRefStr();
      try{ window.__refModeEnabled = !!refModeEnabled; }catch(_){ }
      scheduleRender();
    });
  }

  // Compute constant mask treating 'N' as an ambiguous wildcard that matches any base.
  // Delegates to SealionViewer when available, otherwise to SealionUtils/global helper.
  function computeConstantMaskAllowN(){
    try{
      if(viewer && typeof viewer.computeConstantMaskAllowN === 'function') return viewer.computeConstantMaskAllowN();
    }catch(_){ }
    try{
      if(window && window.SealionUtils && typeof window.SealionUtils.computeConstantMaskAllowN === 'function') return window.SealionUtils.computeConstantMaskAllowN(rows, maxSeqLen);
      if(window && typeof window.computeConstantMaskAllowN === 'function') return window.computeConstantMaskAllowN(rows, maxSeqLen);
    }catch(_){ }
    return '1'.repeat(Math.max(0, maxSeqLen));
  }

  // Compute constant mask treating both 'N' and gap '-' as ambiguous/wildcards.
  // Delegates to SealionViewer when available, otherwise to SealionUtils/global helper.
  function computeConstantMaskAllowNAndGaps(){
    try{
      if(viewer && typeof viewer.computeConstantMaskAllowNAndGaps === 'function') return viewer.computeConstantMaskAllowNAndGaps();
    }catch(_){ }
    try{
      if(window && window.SealionUtils && typeof window.SealionUtils.computeConstantMaskAllowNAndGaps === 'function') return window.SealionUtils.computeConstantMaskAllowNAndGaps(rows, maxSeqLen);
      if(window && typeof window.computeConstantMaskAllowNAndGaps === 'function') return window.computeConstantMaskAllowNAndGaps(rows, maxSeqLen);
    }catch(_){ }
    return '1'.repeat(Math.max(0, maxSeqLen));
  }

  // Wire up the new apply buttons
  const applyConstantAmbiguousBtn = document.getElementById('apply-constant-ambiguous-btn');
  if(applyConstantAmbiguousBtn){
    applyConstantAmbiguousBtn.addEventListener('click', ()=>{
      try{
        const cm = computeConstantMaskAllowN();
        if(cm){ try{ window.mask = String(cm); }catch(_){ mask = String(cm); } console.info('apply-constant-ambiguous: applied (length=' + cm.length + ')'); }
      }catch(e){ console.warn('apply-constant-ambiguous failed', e); }
      refreshMaskStr();
      try{ if(viewer && typeof viewer.startMaskTransition === 'function') viewer.startMaskTransition(!!maskEnabled); else console.error('startMaskTransition: SealionViewer missing; cannot run mask transition'); }catch(e){ console.error('startMaskTransition call failed', e); }
    });
  }

  const applyConstantGappedBtn = document.getElementById('apply-constant-gapped-btn');
  if(applyConstantGappedBtn){
    applyConstantGappedBtn.addEventListener('click', ()=>{
      try{
        const cm = computeConstantMaskAllowNAndGaps();
        if(cm){ try{ window.mask = String(cm); }catch(_){ mask = String(cm); } console.info('apply-constant-gapped: applied (length=' + cm.length + ')'); }
      }catch(e){ console.warn('apply-constant-gapped failed', e); }
      refreshMaskStr();
      try{ if(viewer && typeof viewer.startMaskTransition === 'function') viewer.startMaskTransition(!!maskEnabled); else console.error('startMaskTransition: SealionViewer missing; cannot run mask transition'); }catch(e){ console.error('startMaskTransition call failed', e); }
    });
  }

    // Button to set the currently selected sequence as the reference
    const setRefBtn = document.getElementById('set-ref-btn');
    if(setRefBtn){
      setRefBtn.addEventListener('click', ()=>{
        try{
          // prefer viewer.anchorRow if available, else first selected row, else top visible row (0)
          let idx = null;
          try{ if(viewer && typeof viewer.anchorRow !== 'undefined' && viewer.anchorRow !== null) idx = viewer.anchorRow; }catch(_){ }
          if(idx === null){ const s = getSelectedRows(); if(s && s.size > 0) idx = Array.from(s)[0]; else idx = 0; }
          idx = Math.max(0, Math.min(rowCount - 1, idx));
          const seq = (rows[idx] && rows[idx].sequence) ? rows[idx].sequence : null;
          if(!seq){ console.warn('No sequence available at selected row to use as reference'); return; }
          try{ window.reference = String(seq); }catch(_){ reference = String(seq); }
          refreshRefStr();
          // Ensure the chosen row is used as the reference index (avoid matching the first identical sequence elsewhere)
          try{ refIndex = idx; window.__refIndex = refIndex; }catch(_){ }
          // enable reference colouring UI so effect is visible
          if(refToggle){ try{ refToggle.checked = true; }catch(_){ } }
          refModeEnabled = true;
          try{ window.__refModeEnabled = !!refModeEnabled; }catch(_){ }
          console.info('Set reference to row', idx);
          scheduleRender();
        }catch(e){ console.warn('set-ref failed', e); }
      });
    }

    // Font size controls: increase/decrease text (labels and nucleotides)
    const fontIncreaseBtn = document.getElementById('font-increase-btn');
    const fontDecreaseBtn = document.getElementById('font-decrease-btn');
    function updateFontSize(delta){
        try{
          FONT_SIZE = Math.max(8, Math.min(32, FONT_SIZE + delta));
          FONT = FONT_SIZE + 'px monospace';
          // re-measure and resize canvases to apply new font
          measureCharWidthFromReal();
          measureRowHeightFromFonts();
    // make consensus row equal to a sequence ROW_HEIGHT
    CONSENSUS_HEIGHT = Math.max(12, ROW_HEIGHT);
    try{ document.documentElement.style.setProperty('--consensus-height', CONSENSUS_HEIGHT + 'px'); }catch(_){ }
    setCanvasCSSSizes();
          measureTextVerticalOffset();
          resizeBackings();
          scheduleRender();
          console.info('FONT_SIZE set to', FONT_SIZE);
        }catch(e){ console.warn('updateFontSize failed', e); }
      }
      if(fontIncreaseBtn) fontIncreaseBtn.addEventListener('click', ()=> updateFontSize(1));
      if(fontDecreaseBtn) fontDecreaseBtn.addEventListener('click', ()=> updateFontSize(-1));

    // Animation helpers for mask toggle
    let maskAnimRequest = null;
    const MASK_ANIM_MS = 220;
  // mask transition is handled directly by the SealionViewer; no fallback here.

  // Selection is owned by the SealionViewer instance. After migration the
  // viewer is authoritative; these helpers call the viewer API directly and
  // fall back to sensible no-ops (empty sets) if the viewer isn't available.
  function getSelectedRows(){
    try{ return (viewer && typeof viewer.getSelectedRows === 'function') ? viewer.getSelectedRows() : new Set(); }catch(_){ return new Set(); }
  }
  function getSelectedCols(){
    try{ return (viewer && typeof viewer.getSelectedCols === 'function') ? viewer.getSelectedCols() : new Set(); }catch(_){ return new Set(); }
  }

  // Selection setters now directly call the viewer. If the viewer is not yet
  // present we intentionally no-op — the app should instantiate the viewer
  // early in the migration so these methods are available.
  function setSelectionToRange(a,b){
    const lo = Math.max(0, Math.min(a,b));
    const hi = Math.min(rowCount-1, Math.max(a,b));
    const rows = [];
    for(let r=lo;r<=hi;r++) rows.push(r);
    try{ if(viewer && typeof viewer.setSelectedRows === 'function'){ viewer.setSelectedRows(rows); if(typeof viewer.scheduleRender === 'function') viewer.scheduleRender(); } }catch(_){ }
  }

  function addRangeToSelection(a,b){
    const lo = Math.max(0, Math.min(a,b));
    const hi = Math.min(rowCount-1, Math.max(a,b));
    try{
      if(viewer && typeof viewer.setSelectedRows === 'function' && typeof viewer.getSelectedRows === 'function'){
        const cur = new Set(viewer.getSelectedRows());
        for(let r=lo;r<=hi;r++) cur.add(r);
        viewer.setSelectedRows(Array.from(cur)); if(typeof viewer.scheduleRender === 'function') viewer.scheduleRender();
      }
    }catch(_){ }
  }

  function clearRectSelection(){
    try{ if(viewer && typeof viewer.clearRectSelection === 'function') viewer.clearRectSelection(); }catch(_){ }
  }

  // leave canvas placement to DOM (they live in `left-inner` / `seq-inner` in index.html)
  // and rely on the spacer + absolute/sticky positioning to control layout.

  // We'll use large CSS-sized canvases for scrollbars, but render only the visible region.
  function setCanvasCSSSizes(){
    try{ const v = (viewer || (window && window.viewer)) ? (viewer || window.viewer) : null; if(v && typeof v.setCanvasCSSSizes === 'function'){ v.setCanvasCSSSizes({ LABEL_WIDTH: LABEL_WIDTH, ROW_HEIGHT: ROW_HEIGHT }); return; } }catch(_){ }
    // set outer CSS size so scrollbars reflect full content
    const LABEL_W = getViewerProp('LABEL_WIDTH', LABEL_WIDTH);
    const ROW_H = getViewerProp('ROW_HEIGHT', ROW_HEIGHT);
    labelCanvas.style.width = LABEL_W + 'px';
    // ensure label canvas is positioned at the top of its container
    try{ labelCanvas.style.position = labelCanvas.style.position || 'absolute'; labelCanvas.style.left = '0px'; labelCanvas.style.top = '0px'; labelCanvas.style.zIndex = '1'; }catch(_){ }
  // left spacer defines the full vertical scroll height; label canvas stays viewport-sized
  // keep canvas CSS height equal to the visible scroll area (use right scroll as canonical)
  // use clientWidth/clientHeight (integers) to avoid fractional-pixel drift from getBoundingClientRect
  const viewportHeight = Math.max(1, (scroller && scroller.clientHeight) ? scroller.clientHeight : window.innerHeight);
  const viewportWidth = Math.max(1, (scroller && scroller.clientWidth) ? scroller.clientWidth : window.innerWidth);
  const totalHeight = rowCount * ROW_H;
  // canvases should always match the viewport height (they are viewport-backed); spacers define full scrollable content
  labelCanvas.style.height = viewportHeight + 'px';

  // Instead of setting a huge CSS width on the sequence canvas, use a spacer element to define scroll width
  // Ensure column offsets are synced from the viewer and compute actual total width
  try{ ensureViewerColOffsetsBuilt(); }catch(_){ }
  // colOffsets may be in backing pixels when transformations were applied; compute a
  // CSS-pixel total width by dividing by devicePixelRatio when appropriate so the
  // overview scale matches the visible CSS width.
  const pr_local = window.devicePixelRatio || 1;
  const _co = getViewerColOffsets();
  const rawTotal = (_co && _co.length > 0) ? (_co[maxSeqLen] || (_co[_co.length - 1] || 0)) : (maxSeqLen * (getViewerProp('CHAR_WIDTH', CHAR_WIDTH, 'charWidth') + getViewerProp('EXPANDED_RIGHT_PAD', EXPANDED_RIGHT_PAD)));
  // colOffsets are maintained in CSS pixels; use rawTotal directly for spacer width
  const totalWidth = rawTotal;
  if(seqSpacer){
    seqSpacer.style.width = totalWidth + 'px';
    // ensure spacer is a block-level element so its height contributes predictably
    seqSpacer.style.display = 'block';
    // also set spacer height so the right scrollbox gets the same vertical scrollable height as the left
    seqSpacer.style.height = totalHeight + 'px';
  }
  if(leftSpacer) leftSpacer.style.height = totalHeight + 'px';
  // Make the scrollboxes the containing blocks for the overlay canvases.
  // Append the canvases into the scrollboxes and absolutely position them so
  // they overlay the visible viewport but do not affect scrollHeight (the
  // spacer remains the authoritative scroll height element).
  // canvases are placed in the DOM as authored; do not reparent them programmatically here.
  // just ensure container positioning is sane for overlaying.
  try{
    if(leftScroll) leftScroll.style.position = leftScroll.style.position || 'relative';
    if(scroller && scroller.style) scroller.style.position = scroller.style.position || 'relative';
  }catch(e){}
  seqCanvas.style.position = 'absolute';
  seqCanvas.style.left = '0px';
  seqCanvas.style.top = '0px';
  seqCanvas.style.zIndex = '1';
  seqCanvas.style.height = viewportHeight + 'px';
  seqCanvas.style.width = viewportWidth + 'px';

  if(headerCanvas){ headerCanvas.style.width = viewportWidth + 'px'; headerCanvas.style.height = Math.round(HEADER_HEIGHT) + 'px'; }
  if(overviewCanvas){
    // prefer the header container width so the overview exactly matches the alignment panel
    // subtract the vertical scrollbar width of the alignment scroller so the overview's
    // right edge lines up with the content area (not the scrollbar).
    const parentW = (overviewCanvas.parentElement && overviewCanvas.parentElement.clientWidth) ? overviewCanvas.parentElement.clientWidth : viewportWidth;
    const scrollbarWidth = scroller ? Math.max(0, scroller.offsetWidth - scroller.clientWidth) : 0;
    const hdrW = Math.max(1, parentW - scrollbarWidth);
    overviewCanvas.style.width = hdrW + 'px';
    overviewCanvas.style.height = Math.round(OVERVIEW_HEIGHT) + 'px';
  }

  // measure character width using the chosen font and set CHAR_WIDTH accordingly
  function measureCharWidth(){
    try{ const v = (viewer || (window && window.viewer)) ? (viewer || window.viewer) : null; if(v && typeof v.measureCharWidth === 'function'){ const val = v.measureCharWidth(getViewerProp('FONT', ''), { apply: true, maskEnabled: !!maskEnabled }); setViewerProp('CHAR_WIDTH', val, 'charWidth'); try{ if(v && typeof v.charWidth !== 'undefined') v.charWidth = val; }catch(_){ } return; } }catch(_){ }
    const ctx = document.createElement('canvas').getContext('2d');
    ctx.font = getViewerProp('FONT', '14px monospace');
    const metrics = ctx.measureText('W');
    // fallback if measurement fails
    const w = metrics && metrics.width ? metrics.width : (getViewerProp('CHAR_WIDTH', 12));
    // round up to integer CSS pixels to avoid underestimation
    const newCharWidth = Math.max(1, Math.ceil(w));
    // Rebuild offsets (CHAR_WIDTH changed) and sync to viewer if present
  try{ setViewerProp('CHAR_WIDTH', newCharWidth, 'charWidth'); ensureViewerColOffsetsBuilt(); }catch(_){ }
    try{ const v = (typeof viewer !== 'undefined' && viewer) ? viewer : (window && window.viewer) ? window.viewer : null; if(v && typeof v.charWidth !== 'undefined'){ try{ v.charWidth = newCharWidth; }catch(_){ } } }catch(_){ }
  }

  // Backing store pixel scaling for crisp text
  function resizeBackings(){
    try{ const v = (viewer || (window && window.viewer)) ? (viewer || window.viewer) : null; if(v && typeof v.resizeBackings === 'function'){ v.resizeBackings(); return; } }catch(_){ }
    const pr = window.devicePixelRatio || 1;

    // determine right-side viewport size first (use clientHeight/clientWidth as canonical viewport size)
  const totalHeight = rowCount * getViewerProp('ROW_HEIGHT', ROW_HEIGHT);
  const viewportHeight = Math.max(1, (scroller && scroller.clientHeight) ? scroller.clientHeight : window.innerHeight);
  const viewportWidth = Math.max(1, (scroller && scroller.clientWidth) ? scroller.clientWidth : window.innerWidth);
    // labels: backing equals viewport height (keep label and sequence canvases identical vertically)
    labelCanvas.width = Math.max(1, Math.round(getViewerProp('LABEL_WIDTH', LABEL_WIDTH) * pr));
    labelCanvas.height = Math.max(1, Math.round(viewportHeight * pr));
    // label canvas: position absolute inside left-inner so it doesn't add layout height
    labelCanvas.style.left = '0px';
    labelCanvas.style.top = '0px';
    labelCanvas.style.position = labelCanvas.style.position || 'absolute';
    labelCanvas.style.zIndex = '1';
    labelCanvas.getContext('2d').setTransform(pr,0,0,pr,0,0);

  // sequences: backing equals viewport size (we render only visible area)
  const seqBackingWidth = Math.max(1, Math.round(viewportWidth * pr));
  const seqBackingHeight = Math.max(1, Math.round(viewportHeight * pr));
  seqCanvas.width = seqBackingWidth;
  seqCanvas.height = seqBackingHeight;
  seqCanvas.style.left = '0px';
  seqCanvas.style.top = '0px';
  seqCanvas.getContext('2d').setTransform(pr,0,0,pr,0,0);

    // header backing: width same as seq backing width, height = HEADER_HEIGHT
  if(headerCanvas){
    headerCanvas.width = Math.max(1, Math.round(viewportWidth * pr));
    headerCanvas.height = Math.max(1, Math.round(HEADER_HEIGHT * pr));
    try{ headerCanvas.getContext('2d').setTransform(pr,0,0,pr,0,0); }catch(e){}
  }
  if(overviewCanvas){
    // size overview backing to the header container width so it lines up exactly
    // subtract scrollbar width of the canonical scroller so backing aligns with content area
    const parentW = (overviewCanvas.parentElement && overviewCanvas.parentElement.clientWidth) ? overviewCanvas.parentElement.clientWidth : viewportWidth;
    const scrollbarWidth = scroller ? Math.max(0, scroller.offsetWidth - scroller.clientWidth) : 0;
    const hdrCssW = Math.max(1, parentW - scrollbarWidth);
    overviewCanvas.width = Math.max(1, Math.round(hdrCssW * pr));
    overviewCanvas.height = Math.max(1, Math.round(OVERVIEW_HEIGHT * pr));
    try{ overviewCanvas.getContext('2d').setTransform(pr,0,0,pr,0,0); }catch(e){}
  }
  if(consensusCanvas){
    const parentWc = (consensusCanvas.parentElement && consensusCanvas.parentElement.clientWidth) ? consensusCanvas.parentElement.clientWidth : viewportWidth;
    const scrollbarWidthc = scroller ? Math.max(0, scroller.offsetWidth - scroller.clientWidth) : 0;
    const hdrCssWc = Math.max(1, parentWc - scrollbarWidthc);
    consensusCanvas.width = Math.max(1, Math.round(hdrCssWc * pr));
    consensusCanvas.height = Math.max(1, Math.round(CONSENSUS_HEIGHT * pr));
    try{ consensusCanvas.getContext('2d').setTransform(pr,0,0,pr,0,0); }catch(e){}
  }
    if(labelsHeaderCanvas){
        labelsHeaderCanvas.width = Math.max(1, Math.round(getViewerProp('LABEL_WIDTH', LABEL_WIDTH) * pr));
      labelsHeaderCanvas.height = Math.max(1, Math.round(HEADER_HEIGHT * pr));
      labelsHeaderCanvas.getContext('2d').setTransform(pr,0,0,pr,0,0);
    }
    // final enforcement to ensure integer pixel equality for CSS and backing sizes
  try{ const v = (viewer || (window && window.viewer)) ? (viewer || window.viewer) : null; if(v && typeof v.enforceIntegerGeometry === 'function'){ v.enforceIntegerGeometry(); return; } }catch(_){ }
    enforceIntegerGeometry();
  // diagnostic log removed
  }

  // Enforce exact integer CSS dimensions and backing pixel dimensions for all canvases.
  // This is an assertion/pass that corrects any tiny rounding drift after layout changes.
  function enforceIntegerGeometry(){
    try{ const v = (viewer || (window && window.viewer)) ? (viewer || window.viewer) : null; if(v && typeof v.enforceIntegerGeometry === 'function'){ v.enforceIntegerGeometry(); return; } }catch(_){ }
    const pr = window.devicePixelRatio || 1;
  const viewportHeight = Math.max(1, (scroller && scroller.clientHeight) ? scroller.clientHeight : window.innerHeight);
  const viewportWidth = Math.max(1, (scroller && scroller.clientWidth) ? scroller.clientWidth : window.innerWidth);
  const ROW_H = getViewerProp('ROW_HEIGHT', ROW_HEIGHT);
  const totalHeight = rowCount * ROW_H;

  // CSS pixels (integers) - canvases are viewport-backed so keep them viewport-sized
  // force top-alignment for label and sequence canvases so drawing lines up with spacer at the top
  try{ labelCanvas.style.position = labelCanvas.style.position || 'absolute'; labelCanvas.style.left = '0px'; labelCanvas.style.top = '0px'; }catch(_){ }
  try{ seqCanvas.style.position = seqCanvas.style.position || 'absolute'; seqCanvas.style.left = '0px'; seqCanvas.style.top = '0px'; }catch(_){ }
  labelCanvas.style.height = viewportHeight + 'px';
  seqCanvas.style.height = viewportHeight + 'px';
  seqCanvas.style.width = viewportWidth + 'px';
  if(headerCanvas){ headerCanvas.style.width = viewportWidth + 'px'; headerCanvas.style.height = Math.round(HEADER_HEIGHT) + 'px'; }
  if(labelsHeaderCanvas){ labelsHeaderCanvas.style.height = Math.round(HEADER_HEIGHT) + 'px'; }
  if(seqSpacer) seqSpacer.style.height = totalHeight + 'px';
  if(leftSpacer) leftSpacer.style.height = totalHeight + 'px';

    // backing/device pixels (integers)
  labelCanvas.width = Math.max(1, Math.round(getViewerProp('LABEL_WIDTH', LABEL_WIDTH) * pr));
  labelCanvas.height = Math.max(1, Math.round(viewportHeight * pr));
  seqCanvas.width = Math.max(1, Math.round(viewportWidth * pr));
  seqCanvas.height = Math.max(1, Math.round(viewportHeight * pr));
    headerCanvas.width = Math.max(1, Math.round(viewportWidth * pr));
    headerCanvas.height = Math.max(1, Math.round(HEADER_HEIGHT * pr));
    if(labelsHeaderCanvas){
      labelsHeaderCanvas.width = Math.max(1, Math.round(LABEL_WIDTH * pr));
      labelsHeaderCanvas.height = Math.max(1, Math.round(HEADER_HEIGHT * pr));
    }
    if(overviewCanvas){
      const parentW = (overviewCanvas.parentElement && overviewCanvas.parentElement.clientWidth) ? overviewCanvas.parentElement.clientWidth : viewportWidth;
      const scrollbarWidth = scroller ? Math.max(0, scroller.offsetWidth - scroller.clientWidth) : 0;
      const hdrCssW = Math.max(1, parentW - scrollbarWidth);
      overviewCanvas.width = Math.max(1, Math.round(hdrCssW * pr));
      overviewCanvas.height = Math.max(1, Math.round(OVERVIEW_HEIGHT * pr));
    }

    // reapply transforms
    try{ labelCanvas.getContext('2d').setTransform(pr,0,0,pr,0,0); }catch(e){}
    try{ seqCanvas.getContext('2d').setTransform(pr,0,0,pr,0,0); }catch(e){}
    try{ headerCanvas.getContext('2d').setTransform(pr,0,0,pr,0,0); }catch(e){}
    if(labelsHeaderCanvas){ try{ labelsHeaderCanvas.getContext('2d').setTransform(pr,0,0,pr,0,0); }catch(e){} }
  // layout diagnostics helper removed
    // ensure scrollTop doesn't exceed new content height
    clampScrollPositions();
  }

  // `logLayoutDiagnostics` removed.

  // If the scroll position is past the maximum allowed by content height, clamp it.
  function clampScrollPositions(){
    try{
    const viewportHeight = Math.max(1, scroller ? scroller.clientHeight : window.innerHeight);
      const totalHeight = rowCount * ROW_HEIGHT;
      const maxScroll = Math.max(0, totalHeight - viewportHeight);
      // Prefer viewer-managed programmatic scroll to keep scrolling/snap logic centralized.
      try{
        if(viewer && typeof viewer.setScrollTopImmediate === 'function'){
          if(scroller && scroller.scrollTop > maxScroll) viewer.setScrollTopImmediate(maxScroll);
          try{ if(leftScroll && leftScroll !== scroller && leftScroll.scrollTop > maxScroll) viewer.setScrollTopImmediate(maxScroll); }catch(_){ }
        } else {
          // Fallback (rare): do not perform direct DOM writes here. Warn so the issue
          // can be diagnosed and the viewer required for programmatic scrolling.
          console.warn('clampScrollPositions: SealionViewer not available; cannot clamp without direct DOM write (viewer required)');
        }
      }catch(e){ /* tolerate clamp errors */ }
    }catch(e){}
  }

  // measure CHAR_WIDTH from seqCanvas actual context (ensures consistent rendering)
  function measureCharWidthFromReal(){
    // Use an offscreen canvas context without any device-pixel transform to get
    // a measurement in CSS pixels. The visible seqCanvas context may have a
    // DPR transform applied which would return values in backing pixels, causing
    // CHAR_WIDTH to be inflated by devicePixelRatio.
  try{ const v = (viewer || (window && window.viewer)) ? (viewer || window.viewer) : null; if(v && typeof v.measureCharWidthFromReal === 'function'){ const val = v.measureCharWidthFromReal(FONT); CHAR_WIDTH = val; try{ if(v && typeof v.charWidth !== 'undefined') v.charWidth = CHAR_WIDTH; }catch(_){ } try{ ensureViewerColOffsetsBuilt(); }catch(_){ } return; } }catch(_){ }
    try{
      const off = document.createElement('canvas').getContext('2d');
      off.font = getViewerProp('FONT', FONT);
      const m = off.measureText('W');
      const w = m && m.width ? m.width : CHAR_WIDTH;
      CHAR_WIDTH = Math.max(1, Math.ceil(w));
    }catch(e){
      // fallback to existing approach if offscreen measurement fails
      try{
        const ctx = seqCanvas.getContext('2d');
        ctx.save();
        ctx.setTransform(1,0,0,1,0,0);
        ctx.font = getViewerProp('FONT', FONT);
        const m2 = ctx.measureText('W');
        const w2 = m2 && m2.width ? m2.width : CHAR_WIDTH;
        CHAR_WIDTH = Math.max(1, Math.ceil(w2));
        ctx.restore();
      }catch(_){ /* nothing */ }
    }
  // CHAR_WIDTH changed -> ask viewer to rebuild col offsets
  try{ ensureViewerColOffsetsBuilt(); }catch(_){ }
    // ensure viewer sees updated char width as well
    try{ const v = (typeof viewer !== 'undefined' && viewer) ? viewer : (window && window.viewer) ? window.viewer : null; if(v && typeof v.charWidth !== 'undefined'){ try{ v.charWidth = CHAR_WIDTH; }catch(_){ } } }catch(_){ }
  }


  // Measure vertical text metrics (ascent/descent) to compute a centering offset
  // Per-canvas vertical text metrics (ascent/descent) to compute centering offsets
  let labelTextVertOffset = Math.floor(ROW_HEIGHT/2); // default
  let seqTextVertOffset = Math.floor(ROW_HEIGHT/2); // default
  function measureTextVerticalOffset(){
    try{ const v = (viewer || (window && window.viewer)) ? (viewer || window.viewer) : null; if(v && typeof v.measureTextVerticalOffset === 'function'){ const res = v.measureTextVerticalOffset({ FONT: FONT, ROW_HEIGHT: ROW_HEIGHT }); if(res){ seqTextVertOffset = res.seqTextVertOffset; labelTextVertOffset = res.labelTextVertOffset; } return; } }catch(_){ }
    // sequence font metrics
    try{
      const ctx = seqCanvas.getContext('2d');
      ctx.font = getViewerProp('FONT', FONT);
      const metrics = ctx.measureText('Mg'); // two-letter sample that usually spans ascent/descent
      if(metrics && typeof metrics.actualBoundingBoxAscent === 'number'){
        const ascent = metrics.actualBoundingBoxAscent;
        const descent = metrics.actualBoundingBoxDescent || 0;
        seqTextVertOffset = Math.round((ROW_HEIGHT - (ascent + descent)) / 2 + ascent);
      } else {
        seqTextVertOffset = Math.round(ROW_HEIGHT/2);
      }
    }catch(e){ seqTextVertOffset = Math.round(ROW_HEIGHT/2); }

    // label font metrics (labels may use a different font in future)
    try{
      const ctx2 = labelCanvas.getContext('2d');
      ctx2.font = getViewerProp('FONT', FONT);
      const metrics2 = ctx2.measureText('Mg');
      if(metrics2 && typeof metrics2.actualBoundingBoxAscent === 'number'){
        const ascent2 = metrics2.actualBoundingBoxAscent;
        const descent2 = metrics2.actualBoundingBoxDescent || 0;
        labelTextVertOffset = Math.round((ROW_HEIGHT - (ascent2 + descent2)) / 2 + ascent2);
      } else {
        labelTextVertOffset = Math.round(ROW_HEIGHT/2);
      }
    }catch(e){ labelTextVertOffset = Math.round(ROW_HEIGHT/2); }
  }

  // Measure font pixel heights for label and sequence and set ROW_HEIGHT to the minimum
  function measureRowHeightFromFonts(){
    try{ const v = (viewer || (window && window.viewer)) ? (viewer || window.viewer) : null; if(v && typeof v.measureRowHeightFromFonts === 'function'){ const newRow = v.measureRowHeightFromFonts({ FONT: FONT, ROW_PADDING: ROW_PADDING, apply: true }); ROW_HEIGHT = newRow; try{ document.documentElement.style.setProperty('--row-height', ROW_HEIGHT + 'px'); }catch(_){ } return; } }catch(_){ }
    const ctx = seqCanvas.getContext('2d');
    // sequence font
    ctx.font = getViewerProp('FONT', FONT);
    const seqMetrics = ctx.measureText('Mg');
    let seqHeight = 0;
    // mask helper moved to `sealion/utils.js` (refreshMaskStr). Call global helper.
    document.documentElement.style.setProperty('--row-height', ROW_HEIGHT + 'px');
    // Populate local maskStr from utils
    try{ maskStr = (window && window.refreshMaskStr) ? window.refreshMaskStr() : '1'.repeat(maxSeqLen); }catch(_){ maskStr = '1'.repeat(maxSeqLen); }

  }

  // compute visible rows/cols given current scroll positions
  function computeVisible(){
    try{
      const v = (viewer || (window && window.viewer)) ? (viewer || window.viewer) : null;
      if(v && typeof v.computeVisible === 'function'){
        return v.computeVisible(scroller, { ROW_HEIGHT: getViewerProp('ROW_HEIGHT', ROW_HEIGHT), BUFFER_ROWS: getViewerProp('BUFFER_ROWS', BUFFER_ROWS), BUFFER_COLS: getViewerProp('BUFFER_COLS', BUFFER_COLS), CHAR_WIDTH: getViewerProp('CHAR_WIDTH', CHAR_WIDTH, 'charWidth'), maxSeqLen: maxSeqLen, rowCount: rowCount, maskEnabled: !!maskEnabled });
      }
    }catch(_){ }

    const scrollTop = scroller ? scroller.scrollTop : 0;
    const scrollLeft = scroller ? scroller.scrollLeft : 0;
    const viewH = scroller ? scroller.clientHeight : window.innerHeight;
    const viewW = scroller ? scroller.clientWidth : window.innerWidth;

    // prefer viewer-provided constants for fallback layout arithmetic
    const ROW_H = getViewerProp('ROW_HEIGHT', ROW_HEIGHT);
    const BUF_ROWS = getViewerProp('BUFFER_ROWS', BUFFER_ROWS);
    const BUF_COLS = getViewerProp('BUFFER_COLS', BUFFER_COLS);
    // canonical (unbuffered) first/last rows that correspond exactly to the scrollTop/viewH
    const firstRowNoBuffer = Math.max(0, Math.floor(scrollTop / ROW_H));
    const lastRowNoBuffer = Math.min(rowCount - 1, Math.floor((scrollTop + viewH) / ROW_H));

    // buffered range for drawing to avoid pop-in
    let firstRow = firstRowNoBuffer - BUF_ROWS;
    let lastRow = Math.min(rowCount - 1, lastRowNoBuffer + BUF_ROWS);
    firstRow = Math.max(0, firstRow);

    // compute column range: prefer viewer offsets when available, otherwise approximate via char width
    let rawFirstCol = 0, rawLastCol = Math.max(0, Math.min(maxSeqLen - 1, Math.floor(viewW / Math.max(1, getViewerProp('CHAR_WIDTH', CHAR_WIDTH, 'charWidth')))));
    try{
      const co = getViewerColOffsets();
      if(co && co.length > 0){
        // binary-search like approach via colIndexFromOffset helper
        rawFirstCol = colIndexFromOffset(scrollLeft);
        rawLastCol = colIndexFromOffset(scrollLeft + viewW - 1);
      } else {
        const _CHAR_WIDTH = getViewerProp('CHAR_WIDTH', CHAR_WIDTH, 'charWidth');
        const _EXPANDED_RIGHT_PAD = getViewerProp('EXPANDED_RIGHT_PAD', EXPANDED_RIGHT_PAD);
        const approxColW = (_CHAR_WIDTH + _EXPANDED_RIGHT_PAD) || 1;
        rawFirstCol = Math.max(0, Math.floor(scrollLeft / approxColW));
        rawLastCol = Math.min(maxSeqLen - 1, Math.floor((scrollLeft + viewW - 1) / approxColW));
      }
    }catch(_){ /* tolerate */ }

    const leftBuffer = (rawFirstCol >= BUF_COLS) ? BUF_COLS : 0;
    const rightBuffer = BUF_COLS;
    const firstCol = Math.max(0, rawFirstCol - leftBuffer);
    const lastCol = Math.min(maxSeqLen - 1, rawLastCol + rightBuffer);

    // reference helper moved to `sealion/utils.js` (refreshRefStr). Call global helper.
    try{ const _r = (window && window.refreshRefStr) ? window.refreshRefStr() : { refStr: null, refIndex: null }; refStr = _r.refStr; refIndex = _r.refIndex; }catch(_){ refStr = null; refIndex = null; }

    return { firstRow, lastRow, firstCol, lastCol, rawFirstCol, rawLastCol, viewW, viewH, scrollLeft, scrollTop, firstRowNoBuffer, lastRowNoBuffer };
  }
  // Populate local maskStr from utils
  try{ maskStr = (window && window.refreshMaskStr) ? window.refreshMaskStr() : '1'.repeat(maxSeqLen); }catch(_){ maskStr = '1'.repeat(maxSeqLen); }
  // `drawLabels` moved into `SealionViewer.drawLabels` during staged migration.
  // The viewer implementation is authoritative; local legacy implementation removed.

  

  // consensus drawing moved into `SealionViewer.drawConsensus` during staged migration
    // overview drawing moved into `SealionViewer.drawOverview` during staged migration

  

  // `drawSequences` moved into `SealionViewer.drawSequences` during staged migration.
  // The viewer implementation is authoritative; local legacy implementation removed.

  // main render loop throttled with rAF
  let scheduled = false;
  // flag to emit a lightweight one-time runtime assertion on first draw
  let firstDrawLogged = false;
  function scheduleRender(){
    if(scheduled) return;
    scheduled = true;
    requestAnimationFrame(()=>{
      scheduled = false;
      // Ensure the SealionViewer instance has the canonical geometry/state
      // before any draw call. During the staged migration the viewer may be
      // constructed early or slightly later; sync authoritative values so
      // draw* methods never observe missing offsets or charWidth.
      try{
        const v = (typeof viewer !== 'undefined' && viewer) ? viewer : (window && window.viewer) ? window.viewer : null;
        if(v){
          try{ v.alignment = rows; }catch(_){ }
          try{ /* viewer owns colOffsets */ }catch(_){ }
          try{ v.charWidth = CHAR_WIDTH; }catch(_){ }
        }
      }catch(_){ }
      // One-time runtime assertions / lightweight diagnostics to aid debugging
      try{
        if(!firstDrawLogged){
          const pr = window.devicePixelRatio || 1;
          const v = (typeof viewer !== 'undefined' && viewer) ? viewer : (window && window.viewer) ? window.viewer : null;
          const seqCssW = seqCanvas ? (seqCanvas.getBoundingClientRect().width || (seqCanvas.width / pr)) : 0;
          const seqCssH = seqCanvas ? (seqCanvas.getBoundingClientRect().height || (seqCanvas.height / pr)) : 0;
          const seqBacking = seqCanvas ? { w: seqCanvas.width, h: seqCanvas.height } : null;
          const info = {
            when: Date.now(),
            viewerPresent: !!v,
            colOffsetsLength: (v && v.colOffsets && v.colOffsets.length) ? v.colOffsets.length : 0,
            totalWidth: (v && v.colOffsets && v.colOffsets.length) ? v.colOffsets[maxSeqLen] : 0,
            CHAR_WIDTH: CHAR_WIDTH,
            viewerCharWidth: v && typeof v.charWidth !== 'undefined' ? v.charWidth : null,
            rowCount: rowCount,
            ROW_HEIGHT: ROW_HEIGHT,
            seqCanvasCss: { w: Math.round(seqCssW), h: Math.round(seqCssH) },
            seqCanvasBacking: seqBacking,
            scrollerClient: scroller ? { w: scroller.clientWidth, h: scroller.clientHeight, scrollLeft: scroller.scrollLeft, scrollTop: scroller.scrollTop } : null
          };
          try{ window.__sealionFirstDrawInfo = info; }catch(_){ }
          console.info('SealionViewer: first draw', info);
          // simple sanity checks
          if(!v) console.warn('SealionViewer instance missing on first draw');
          if(!(v && v.colOffsets && v.colOffsets.length >= (maxSeqLen + 1))) console.warn('colOffsets length shorter than expected', { colOffsetsLength: (v && v.colOffsets && v.colOffsets.length) ? v.colOffsets.length : 0, expected: maxSeqLen + 1 });
          if(!seqCanvas) console.warn('seqCanvas not present');
          if(seqBacking && seqBacking.w <= 0) console.warn('seqCanvas backing width is zero or missing', seqBacking);
          firstDrawLogged = true;
        }
      }catch(e){ /* don't let diagnostics break rendering */ }
  const vis = computeVisible();
  // draw independent headers first (they don't scroll vertically)
  // (debug logs removed)
  try{
  viewer.drawLabelsHeader(labelsHeaderCanvas, vis, { HEADER_FONT: getViewerProp('HEADER_FONT', HEADER_FONT), HEADER_HEIGHT: getViewerProp('HEADER_HEIGHT', HEADER_HEIGHT), labelTextVertOffset: labelTextVertOffset, ROW_HEIGHT: getViewerProp('ROW_HEIGHT', ROW_HEIGHT) });
  }catch(e){ console.error('viewer.drawLabelsHeader failed', e); }

  try{
  viewer.drawOverview(overviewCanvas, vis, { colOffsets: getViewerColOffsets(), maxSeqLen: maxSeqLen, CHAR_WIDTH: getViewerProp('CHAR_WIDTH', CHAR_WIDTH, 'charWidth'), EXPANDED_RIGHT_PAD: getViewerProp('EXPANDED_RIGHT_PAD', EXPANDED_RIGHT_PAD), maskStr: maskStr, maskEnabled: !!maskEnabled });
  }catch(e){ console.error('viewer.drawOverview failed', e); }

    try{
  viewer.drawHeader(headerCanvas, vis, { colOffsets: getViewerColOffsets(), maxSeqLen: maxSeqLen, CHAR_WIDTH: getViewerProp('CHAR_WIDTH', CHAR_WIDTH, 'charWidth'), EXPANDED_RIGHT_PAD: getViewerProp('EXPANDED_RIGHT_PAD', EXPANDED_RIGHT_PAD), HEADER_FONT: getViewerProp('HEADER_FONT', HEADER_FONT), HEADER_HEIGHT: getViewerProp('HEADER_HEIGHT', HEADER_HEIGHT), selectedCols: getSelectedCols() });
  }catch(e){ console.error('viewer.drawHeader failed', e); }

  try{
  viewer.drawConsensus(consensusCanvas, vis, { FONT: getViewerProp('FONT', FONT), CONSENSUS_TOP_PAD: getViewerProp('CONSENSUS_TOP_PAD', CONSENSUS_TOP_PAD), CONSENSUS_BOTTOM_PAD: getViewerProp('CONSENSUS_BOTTOM_PAD', CONSENSUS_BOTTOM_PAD), colOffsets: getViewerColOffsets(), maxSeqLen: maxSeqLen, CHAR_WIDTH: getViewerProp('CHAR_WIDTH', CHAR_WIDTH, 'charWidth'), EXPANDED_RIGHT_PAD: getViewerProp('EXPANDED_RIGHT_PAD', EXPANDED_RIGHT_PAD), maskStr: maskStr, maskEnabled: !!maskEnabled, BASE_COLORS: getViewerProp('BASE_COLORS', BASE_COLORS), DEFAULT_BASE_COLOR: getViewerProp('DEFAULT_BASE_COLOR', DEFAULT_BASE_COLOR) });
  }catch(e){ console.error('viewer.drawConsensus failed', e); }

    try{
  viewer.drawLabels(labelCanvas, vis, { FONT: getViewerProp('FONT', FONT), ROW_HEIGHT: getViewerProp('ROW_HEIGHT', ROW_HEIGHT), LABEL_WIDTH: getViewerProp('LABEL_WIDTH', LABEL_WIDTH), labelTextVertOffset: labelTextVertOffset, selectedRows: getSelectedRows(), rows: rows, refIndex: refIndex, REF_ACCENT: getViewerProp('REF_ACCENT', REF_ACCENT) });
  }catch(e){ console.error('viewer.drawLabels failed', e); }

  try{
  viewer.drawSequences(seqCanvas, vis, { FONT: getViewerProp('FONT', FONT), ROW_HEIGHT: getViewerProp('ROW_HEIGHT', ROW_HEIGHT), CHAR_WIDTH: getViewerProp('CHAR_WIDTH', CHAR_WIDTH, 'charWidth'), EXPANDED_RIGHT_PAD: getViewerProp('EXPANDED_RIGHT_PAD', EXPANDED_RIGHT_PAD), rows: rows, selectedRows: getSelectedRows(), selectedCols: getSelectedCols(), refStr: refStr, refModeEnabled: refModeEnabled, refIndex: refIndex, maskStr: maskStr, maskEnabled: !!maskEnabled, BASE_COLORS: getViewerProp('BASE_COLORS', BASE_COLORS), DEFAULT_BASE_COLOR: getViewerProp('DEFAULT_BASE_COLOR', DEFAULT_BASE_COLOR), PALE_REF_COLOR: getViewerProp('PALE_REF_COLOR', PALE_REF_COLOR), COMPRESSED_CELL_VPAD: getViewerProp('COMPRESSED_CELL_VPAD', COMPRESSED_CELL_VPAD), seqTextVertOffset: seqTextVertOffset, rowCount: rowCount, maxSeqLen: maxSeqLen, colOffsets: getViewerColOffsets(), isRectSelecting: (viewer && typeof viewer.isRectSelecting === 'boolean') ? viewer.isRectSelecting : false, rectStartRow: (viewer && typeof viewer.rectStartRow === 'number') ? viewer.rectStartRow : null, rectEndRow: (viewer && typeof viewer.rectEndRow === 'number') ? viewer.rectEndRow : null, rectStartCol: (viewer && typeof viewer.rectStartCol === 'number') ? viewer.rectStartCol : null, rectEndCol: (viewer && typeof viewer.rectEndCol === 'number') ? viewer.rectEndCol : null });
  }catch(e){ console.error('viewer.drawSequences failed', e); }
  // diagnostics are available in the console.
    });
  }

  // initial sizing + measure
  // initial measure and sizing
  measureCharWidth();
  // measure fonts to determine ROW_HEIGHT before sizing
  measureRowHeightFromFonts();
  // consensus row should match sequence row height
  CONSENSUS_HEIGHT = Math.max(12, ROW_HEIGHT);
  try{ document.documentElement.style.setProperty('--consensus-height', CONSENSUS_HEIGHT + 'px'); }catch(_){ }
  setCanvasCSSSizes();
  // give the spacer a moment to size (if DOM still settling) then measure real width and backings
  requestAnimationFrame(()=>{
    measureCharWidthFromReal();
    // remeasure row height in case font rendering differs in the real canvas
    measureRowHeightFromFonts();
    // update consensus height to match new row measurements
    // ensure consensus height equals ROW_HEIGHT so it matches sequence rows on first paint
    CONSENSUS_HEIGHT = Math.max(12, ROW_HEIGHT);
  try{ document.documentElement.style.setProperty('--consensus-height', CONSENSUS_HEIGHT + 'px'); }catch(_){ }
  setCanvasCSSSizes();
    measureTextVerticalOffset();
    resizeBackings();
    scheduleRender();
    // initialization complete: hide the status overlay if present
    try{ setStatus(null); }catch(_){ }
  });

  // reflow handler: when the spacer's width might change (e.g., charset measurement), recompute
  let resizeDebounce;
  const observer = new ResizeObserver(()=>{
    clearTimeout(resizeDebounce);
    resizeDebounce = setTimeout(()=>{
      measureCharWidthFromReal();
      setCanvasCSSSizes();
      measureTextVerticalOffset();
      resizeBackings();
      scheduleRender();
    }, 50);
  });
  if(scroller) observer.observe(scroller);

  // --- label divider drag-to-resize behaviour ---
  if(labelDivider){
    let isLabelDragging = false;
    let labelDragStartX = 0;
    let labelDragStartWidth = LABEL_WIDTH;
    // min/max label width to avoid collapsing UI
    const MIN_LABEL_WIDTH = 120;
    const MAX_LABEL_WIDTH = 800;
    labelDivider.addEventListener('mousedown', (e)=>{
      if(e.button !== 0) return;
      isLabelDragging = true;
      labelDragStartX = e.clientX;
      labelDragStartWidth = LABEL_WIDTH;
      try{ document.body.style.userSelect = 'none'; }catch(_){ }
      e.preventDefault();
    });
    window.addEventListener('mousemove', (e)=>{
      if(!isLabelDragging) return;
      const dx = e.clientX - labelDragStartX;
      let nw = Math.max(MIN_LABEL_WIDTH, Math.min(MAX_LABEL_WIDTH, Math.round(labelDragStartWidth + dx)));
      if(nw === LABEL_WIDTH) return;
      LABEL_WIDTH = nw;
      // sync CSS var and apply immediate layout changes
      try{ document.documentElement.style.setProperty('--label-width', LABEL_WIDTH + 'px'); }catch(_){ }
      try{ setCanvasCSSSizes(); resizeBackings(); scheduleRender(); }catch(_){ }
    });
    window.addEventListener('mouseup', (e)=>{
      if(!isLabelDragging) return;
      isLabelDragging = false;
      try{ document.body.style.userSelect = ''; }catch(_){ }
      // final apply and persist preference
      try{ document.documentElement.style.setProperty('--label-width', LABEL_WIDTH + 'px'); }catch(_){ }
      try{ localStorage.setItem('sealion_label_width', String(LABEL_WIDTH)); }catch(_){ }
      try{ setCanvasCSSSizes(); resizeBackings(); scheduleRender(); }catch(_){ }
    });
    // restore persisted width if present
    try{
      const saved = localStorage.getItem('sealion_label_width');
      if(saved){ const v = parseInt(saved,10); if(Number.isFinite(v) && v > 0) { LABEL_WIDTH = v; document.documentElement.style.setProperty('--label-width', LABEL_WIDTH + 'px'); } }
    }catch(_){ }
  }


  // selection helpers: compute row from clientY within labelCanvas
  function rowFromClientY(clientY){
    // Viewer is authoritative for hit-testing
    try{
      return viewer.rowFromClientY(clientY, { labelCanvas: labelCanvas, scroller: scroller, ROW_HEIGHT: ROW_HEIGHT, rowCount: rowCount });
    }catch(e){
      console.error('viewer.rowFromClientY failed', e);
      throw e;
    }
  }

  // helper: compute column under clientX within seq/header
  // helper: compute column under clientX within seq/header — use viewer.hit-testing when needed
  // label interactions (click/drag/wheel) are handled by SealionViewer.attachInteractionHandlers
  // (selection state now lives in the viewer; these helpers delegate to the viewer when available)

  // colFromClientX removed during migration — use viewer.colIndexFromCssOffset(absX) instead

  function setColSelectionToRange(a,b){
    const lo = Math.max(0, Math.min(a,b));
    const hi = Math.min(maxSeqLen-1, Math.max(a,b));
    try{
      if(viewer && typeof viewer.setSelectedCols === 'function'){
        const cols = [];
        for(let c=lo;c<=hi;c++) cols.push(c);
        viewer.setSelectedCols(cols);
      }
    }catch(_){ }
  }

  function addRangeToColSelection(a,b){
    const lo = Math.max(0, Math.min(a,b));
    const hi = Math.min(maxSeqLen-1, Math.max(a,b));
    try{
      if(viewer && typeof viewer.setSelectedCols === 'function' && typeof viewer.getSelectedCols === 'function'){
        const cur = new Set(viewer.getSelectedCols());
        for(let c=lo;c<=hi;c++) cur.add(c);
        viewer.setSelectedCols(Array.from(cur));
      }
    }catch(_){ }
  }

  function toggleRangeInColSelection(a,b){
    const lo = Math.max(0, Math.min(a,b));
    const hi = Math.min(maxSeqLen-1, Math.max(a,b));
    try{
      if(viewer && typeof viewer.setSelectedCols === 'function' && typeof viewer.getSelectedCols === 'function'){
        const cur = new Set(viewer.getSelectedCols());
        for(let c=lo;c<=hi;c++){ if(cur.has(c)) cur.delete(c); else cur.add(c); }
        viewer.setSelectedCols(Array.from(cur));
      }
    }catch(_){ }
  }

  // render selected columns as a pale overlay in header and sequence area
  function drawColumnSelectionOverlay(visible){
    try{
      const sel = getSelectedCols();
      viewer.drawColumnSelectionOverlay(seqCanvas, visible, { CHAR_WIDTH: getViewerProp('CHAR_WIDTH', CHAR_WIDTH, 'charWidth'), EXPANDED_RIGHT_PAD: getViewerProp('EXPANDED_RIGHT_PAD', EXPANDED_RIGHT_PAD), selectedCols: sel, colOffsets: getViewerColOffsets() });
    }catch(e){ console.error('viewer.drawColumnSelectionOverlay failed', e); }
  }

  

  // header interactions (column click/drag) are handled by SealionViewer.attachInteractionHandlers

  // consensus canvas column interactions are handled by SealionViewer.attachInteractionHandlers

  // overview interactions (click/drag) are handled by SealionViewer.attachInteractionHandlers

  // Sequence canvas interactions (wheel, selection, panning) are handled by SealionViewer.attachInteractionHandlers

  // Vertical scrolling is handled by the SealionViewer instance's scroll handler.
  // The viewer was passed the canonical `scroller` in ensureViewer() and will
  // mirror left/right scrolls and schedule renders. We keep the legacy helpers
  // below so callers can still programmatically set scroll positions; those
  // helpers prefer to call into `viewer` when available.

  // helpers to set scroll positions programmatically while suppressing the scroll handler actions
  function setScrollLeftImmediate(x){
    // Delegate to viewer-provided programmatic scroll method. If the viewer
    // is not present treat this as a no-op and warn — we removed legacy
    // direct DOM fallbacks to keep the viewer authoritative.
    try{
      if(viewer && typeof viewer.setScrollLeftImmediate === 'function'){
        return viewer.setScrollLeftImmediate(x);
      }
    }catch(_){ }
    console.warn('setScrollLeftImmediate: SealionViewer not available; no-op');
  }

  function setScrollTopImmediate(y){
    try{
      if(viewer && typeof viewer.setScrollTopImmediate === 'function'){
        return viewer.setScrollTopImmediate(y);
      }
    }catch(_){ }
    console.warn('setScrollTopImmediate: SealionViewer not available; no-op');
  }

  // when the right horizontally scrolls we only need to redraw header and sequences
  // re-enable snapping to integer character after scrolling stops (direction-aware)
  let snapTimeout = null;
  let scrollStartLeft = 0;
  let snapEnabled = snapToggle ? !!snapToggle.checked : true;
  if(snapToggle){
    snapToggle.addEventListener('change', ()=>{ snapEnabled = !!snapToggle.checked; });
  }

  

  // Command-drag panning: hold Meta (Command on macOS) and drag to pan the alignment viewport
  let isCmdDrag = false;
  let dragStartX = 0, dragStartY = 0, dragStartScrollLeft = 0, dragStartScrollTop = 0;
  function endCmdDrag(){
    if(!isCmdDrag) return;
    isCmdDrag = false;
    try{ document.body.style.userSelect = ''; }catch(e){}
    // restore grab cursor if space is still down
    updateSpaceCursor();
  }
  // Smooth scroll animation helper moved into SealionViewer (viewer.animateScrollTo).
  // Track Space key as the panning modifier (user requested Space to enable drag-scroll)
  let isSpaceDown = false;
  // helper: when space is held, show 'grab' cursor on relevant elements; when released, clear it
  function updateSpaceCursor(){
    try{
      const cur = (isSpaceDown && !isCmdDrag) ? 'grab' : '';
      // restrict cursor hint to seqCanvas only per user request
      if(seqCanvas) seqCanvas.style.cursor = cur;
    }catch(e){ }
  }
  

  // snapScrollToChar legacy removed; inline fallback used where needed

  // Snapping and scroll handling are delegated to the SealionViewer instance.

  // on window resize recompute backings
  window.addEventListener('resize', ()=>{
    setCanvasCSSSizes();
    resizeBackings();
    scheduleRender();
  });

  // compute and expose constantMask at initialization
  try{ const cm = computeConstantMask(); window.constantMask = cm; }catch(_){ }
  try{ const cam = computeConstantMaskAllowN(); window.constantAmbiguousMask = cam; }catch(_){ }
  try{ const cgm = computeConstantMaskAllowNAndGaps(); window.constantGappedMask = cgm; }catch(_){ }
  try{ const cons = computeConsensusSequence(); window.consensusSequence = cons; }catch(_){ }
  // all initialization completed
  setStatus('initialized');

}

})();