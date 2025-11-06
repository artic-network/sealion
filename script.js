// script.js - virtualized alignment canvas renderer
// Expects `alignment` to be provided by alignment.js (loaded before this script in index.html)

(function(){
  const __statusEl = document.getElementById('init-status');
  function setStatus(msg){ try{ if(__statusEl) __statusEl.textContent = msg; }catch(e){} }

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
          try{ selectedRows.clear(); anchorRow = null; }catch(_){ }
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
  try{
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
  const searchInput = document.getElementById('search-input');
  const searchNextBtn = document.getElementById('search-next');
  const copyRowBtn = document.getElementById('copy-row');
  const snapToggle = document.getElementById('snap-toggle');
  const markerToggle = document.getElementById('marker-toggle');
  const maskToggle = document.getElementById('mask-toggle');
  const refToggle = document.getElementById('ref-toggle');

  let ROW_HEIGHT = 20; // px per row (may be recomputed from font metrics)
  const LABEL_WIDTH = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--label-width')) || 260;
  let CHAR_WIDTH = 12; // px per base/column (will be measured)
  const HEADER_HEIGHT = 30;
  // consensus row height (CSS pixels). Make mutable so it can follow ROW_HEIGHT/font changes.
  let CONSENSUS_HEIGHT = 20;
  const OVERVIEW_HEIGHT = 48;
  let FONT_SIZE = 14;
  let FONT = FONT_SIZE + 'px monospace';
  // fixed header font: keep ruler/header font constant regardless of FONT_SIZE
  const HEADER_FONT = '12px sans-serif';
  // extra vertical padding added to measured text height so rows are taller
  const ROW_PADDING = 6; // px
  const BUFFER_ROWS = 2; // draw 2 rows above/below viewport
  const BUFFER_COLS = 5; // draw extra columns left/right

  // nucleotide color map: map uppercase base -> CSS color
  const BASE_COLORS = {
    'A': '#2ca02c', // green
    'C': '#1f77b4', // blue
    'G': '#d62728', // red
    'T': '#ff7f0e'  // orange
  };
  const REF_ACCENT = '#2b8cff'; // accent color for reference row
  const DEFAULT_BASE_COLOR = '#666'; // grey for any other character
  const PALE_REF_COLOR = '#e6e6e6'; // pale grey for matches against reference

  const rows = alignment;
  const rowCount = rows.length;
  const maxSeqLen = Math.max(0, ...rows.map(r=>r.sequence.length));
  // mask string (should be provided by alignment.js). If absent we initialize to all '1's
  // so compression machinery is always enabled but starts uncompressed.
  // Evaluate and normalize lazily so global `mask` can be injected/edited at runtime.
  let maskStr = null;
  function refreshMaskStr(){
    try{
      if(typeof mask !== 'undefined' && mask){
        let s = String(mask || '');
        if(s.length < maxSeqLen){
          console.warn('mask provided but length < maxSeqLen; padding with 1s', s.length, '<', maxSeqLen);
          s = s + '1'.repeat(Math.max(0, maxSeqLen - s.length));
        } else if(s.length > maxSeqLen){
          // truncate to expected length
          s = s.slice(0, maxSeqLen);
        }
        maskStr = s;
        // persist normalized mask back to the global for external inspection
        try{ window.mask = maskStr; }catch(_){ mask = maskStr; }
      } else {
        // no mask provided -> initialize to all '1's (no compression)
        maskStr = '1'.repeat(maxSeqLen);
        try{ window.mask = maskStr; }catch(_){ mask = maskStr; }
      }
    }catch(e){
      maskStr = '1'.repeat(maxSeqLen);
      try{ window.mask = maskStr; }catch(_){ mask = maskStr; }
    }
    // expose for debugging in devtools
    try{ window.__maskStr = maskStr; }catch(_){ }
    return maskStr;
  }
  // evaluate mask presence once at startup (and expose for debugging)
  refreshMaskStr();
  // reference handling: evaluate lazily and expose
  let refStr = null;
  let refIndex = null;
  function refreshRefStr(){
    try{
      if(typeof reference !== 'undefined' && reference){
        const s = String(reference);
        if(s.length >= maxSeqLen){ refStr = s; } else { console.warn('reference provided but length < maxSeqLen', s.length, '<', maxSeqLen); refStr = null; }
      } else { refStr = null; }
    }catch(e){ refStr = null; }
    // determine index of the sequence that matches the reference (if any)
    try{
      if(refStr){
        const idx = rows.findIndex(r => (r && r.sequence) ? String(r.sequence) === refStr : false);
        refIndex = (idx >= 0) ? idx : null;
      } else {
        refIndex = null;
      }
    }catch(_){ refIndex = null; }
    // If the reference string is the consensus sequence, do not treat any real row as the "reference row".
    // This prevents highlighting an existing sequence as the canonical reference when the reference is
    // the computed consensus (a synthetic aggregate), per UX request.
    try{
      if(refStr && window && window.consensusSequence && String(refStr) === String(window.consensusSequence)){
        refIndex = null;
      }
    }catch(_){ }
    try{ window.__refStr = refStr; window.__refIndex = refIndex; }catch(_){ }
    return refStr;
  }
  refreshRefStr();
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
    try{
      if(!colsSet || typeof colsSet.size === 'undefined' || colsSet.size === 0){
        console.info('mask edit: no columns selected');
        return;
      }
      // obtain current mask (fall back to all '1's)
      let cur = (typeof mask !== 'undefined' && mask) ? String(mask) : null;
      if(!cur || cur.length < maxSeqLen){
        // pad or create a mask of all 1s so we have an editable buffer
        cur = (cur || '') + '1'.repeat(Math.max(0, maxSeqLen - (cur ? cur.length : 0)));
      }
      // ensure exact length
      if(cur.length > maxSeqLen) cur = cur.slice(0, maxSeqLen);
      const arr = cur.split('');
      const cols = Array.from(colsSet).filter(c=>Number.isFinite(c) && c >= 0 && c < maxSeqLen).sort((a,b)=>a-b);
      if(cols.length === 0){ console.info('mask edit: no valid columns in selection'); return; }
      for(const c of cols) arr[c] = bitChar;
      const newMask = arr.join('');
      try{ window.mask = newMask; }catch(_){ mask = newMask; }
      console.info('mask edited', { cols, setTo: bitChar, newMaskLength: newMask.length });
      // refresh and animate offsets to reflect the edited mask
      refreshMaskStr();
      // animate to the new offsets using current maskEnabled state
      startMaskTransition(!!maskEnabled);
    }catch(e){ console.warn('setMaskBitsForCols failed', e); }
  }
  // column offsets prefix sum (length maxSeqLen+1) in CSS pixels
  let colOffsets = new Array(Math.max(1, maxSeqLen + 1)).fill(0);
  function buildColOffsetsFor(enabled){
    const out = new Array(Math.max(1, maxSeqLen + 1)).fill(0);
    out[0] = 0;
    for(let i=0;i<maxSeqLen;i++){
      const useReduced = enabled && maskStr && maskStr.charAt(i) === '0';
  const w = useReduced ? REDUCED_COL_WIDTH : (CHAR_WIDTH + EXPANDED_RIGHT_PAD);
      out[i+1] = out[i] + w;
    }
    return out;
  }
  function buildColOffsets(){
    const out = buildColOffsetsFor(maskEnabled);
    // copy into the shared colOffsets array to preserve reference
    for(let i=0;i<out.length;i++) colOffsets[i] = out[i];
    // expose offsets for debugging
    try{ window.colOffsets = colOffsets; }catch(e){}
  }
  // helper: given an absolute CSS offset, find the column index containing that x
  function colIndexFromOffset(offset){
    // clamp
    if(offset <= 0) return 0;
    const last = maxSeqLen;
    if(offset >= colOffsets[last]) return Math.max(0, last-1);
    let low = 0, high = last; // search in [0,last)
    while(low < high){
      const mid = Math.floor((low + high) / 2);
      if(colOffsets[mid] <= offset) low = mid + 1; else high = mid;
    }
    const idx = Math.max(0, low - 1);
    return Math.min(idx, maxSeqLen - 1);
  }
  // Apply custom mask button: when clicked, override current mask with `custom_mask` global


    // Compute a mask that marks constant sites (0) vs variable sites (1).
    // Assumptions: `rows` is an array of objects with a `sequence` string property and
    // `maxSeqLen` is the alignment length. Missing characters are treated as empty string
    // so a column is considered constant only if every sequence has the same character
    // (including the empty char) at that position.
    function computeConstantMask(){
      try{
        const out = new Array(Math.max(0, maxSeqLen));
        for(let c=0;c<maxSeqLen;c++){
          let first = null;
          let constant = true;
          for(let r=0;r<rows.length;r++){
            const seq = (rows[r] && rows[r].sequence) ? rows[r].sequence : '';
            const ch = seq.charAt(c) || '';
            if(first === null) first = ch;
            else if(ch !== first){ constant = false; break; }
          }
          out[c] = constant ? '0' : '1';
        }
        const mask = out.join('');
        try{ window.constantMask = String(mask); }catch(_){ }
        console.info('constantMask computed (len=' + mask.length + ')');
        return mask;
      }catch(e){ console.warn('computeConstantMask failed', e); return '1'.repeat(Math.max(0, maxSeqLen)); }
    }

    // Compute consensus sequence for the alignment.
    // For each column, pick the most frequent character across rows. In ties or empties, choose 'N'.
    function computeConsensusSequence(){
      try{
        const out = new Array(Math.max(0, maxSeqLen));
        for(let c=0;c<maxSeqLen;c++){
          const counts = new Map();
          for(let r=0;r<rows.length;r++){
            const seq = (rows[r] && rows[r].sequence) ? rows[r].sequence : '';
            const ch = (seq.charAt(c) || '').toUpperCase();
            const prev = counts.get(ch) || 0;
            counts.set(ch, prev + 1);
          }
          // find max count. Prefer A/C/G/T order in ties, else choose most frequent non-empty, else 'N'
          let best = ''; let bestCount = -1;
          // prefer canonical bases order
          const preferred = ['A','C','G','T'];
          for(const b of preferred){ const cnt = counts.get(b) || 0; if(cnt > bestCount){ best = b; bestCount = cnt; } }
          // if no preferred base was found, look for any other highest
          if(bestCount <= 0){
            for(const [k,v] of counts.entries()){ if(!k) continue; if(v > bestCount){ best = k; bestCount = v; } }
          }
          // if still nothing, default to 'N'
          if(!best || best === '') best = 'N';
          out[c] = best;
        }
        const cons = out.join('');
        try{ window.consensusSequence = cons; }catch(_){ }
        console.info('consensus computed (len=' + cons.length + ')');
        return cons;
      }catch(e){ console.warn('computeConsensusSequence failed', e); return 'N'.repeat(Math.max(0, maxSeqLen)); }
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
        startMaskTransition(!!maskEnabled);
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
  function computeConstantMaskAllowN(){
    try{
      const out = new Array(Math.max(0, maxSeqLen));
      for(let c=0;c<maxSeqLen;c++){
        let firstNonAmbig = null;
        let constant = true;
        for(let r=0;r<rows.length;r++){
          const seq = (rows[r] && rows[r].sequence) ? rows[r].sequence : '';
          const ch = (seq.charAt(c) || '').toUpperCase();
          if(ch === 'N' || ch === '') continue; // treat N and empty as ambiguous here
          if(firstNonAmbig === null) firstNonAmbig = ch;
          else if(ch !== firstNonAmbig){ constant = false; break; }
        }
        // if we saw no non-ambiguous base (all N/empty), treat as constant
        out[c] = constant ? '0' : '1';
      }
      const mask = out.join('');
      try{ window.constantAmbiguousMask = String(mask); }catch(_){ }
      console.info('constantAmbiguousMask computed (len=' + mask.length + ')');
      return mask;
    }catch(e){ console.warn('computeConstantMaskAllowN failed', e); return '1'.repeat(Math.max(0, maxSeqLen)); }
  }

  // Compute constant mask treating both 'N' and gap '-' as ambiguous/wildcards.
  function computeConstantMaskAllowNAndGaps(){
    try{
      const out = new Array(Math.max(0, maxSeqLen));
      for(let c=0;c<maxSeqLen;c++){
        let firstNonAmbig = null;
        let constant = true;
        for(let r=0;r<rows.length;r++){
          const seq = (rows[r] && rows[r].sequence) ? rows[r].sequence : '';
          const ch = (seq.charAt(c) || '').toUpperCase();
          if(ch === 'N' || ch === '-' || ch === '') continue; // treat N, gaps and empty as ambiguous here
          if(firstNonAmbig === null) firstNonAmbig = ch;
          else if(ch !== firstNonAmbig){ constant = false; break; }
        }
        out[c] = constant ? '0' : '1';
      }
      const mask = out.join('');
      try{ window.constantGappedMask = String(mask); }catch(_){ }
      console.info('constantGappedMask computed (len=' + mask.length + ')');
      return mask;
    }catch(e){ console.warn('computeConstantMaskAllowNAndGaps failed', e); return '1'.repeat(Math.max(0, maxSeqLen)); }
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
      startMaskTransition(!!maskEnabled);
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
      startMaskTransition(!!maskEnabled);
    });
  }

    // Button to set the currently selected sequence as the reference
    const setRefBtn = document.getElementById('set-ref-btn');
    if(setRefBtn){
      setRefBtn.addEventListener('click', ()=>{
        try{
          // prefer anchorRow if available, else first selected row, else top visible row (0)
          let idx = null;
          if(typeof anchorRow === 'number' && anchorRow !== null) idx = anchorRow;
          else if(selectedRows && selectedRows.size > 0) idx = Array.from(selectedRows)[0];
          else idx = 0;
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
  function easeOutQuad(t){ return 1 - (1 - t) * (1 - t); }
  function startMaskTransition(toEnabled){
    // cancel any running animation
    if(maskAnimRequest){ cancelAnimationFrame(maskAnimRequest); maskAnimRequest = null; }
  // re-evaluate mask availability right before building target offsets
  refreshMaskStr();
    // instrumentation: indicate animation is active
    try{ window.__maskAnimating = true; window.__maskAnimStart = Date.now(); }catch(_){ }
    console.info('mask animation start', { toEnabled: !!toEnabled, hasMask: !!maskStr });
  const from = colOffsets.slice();
  const to = buildColOffsetsFor(toEnabled);
    const start = performance.now();
    function tick(now){
      const dt = Math.min(1, (now - start) / MASK_ANIM_MS);
      const eased = easeOutQuad(dt);
      for(let i=0;i<=maxSeqLen;i++){
        const f = (from[i] || 0);
        const t = (to[i] || 0);
        colOffsets[i] = f + (t - f) * eased;
      }
      // set spacer width to match interpolated total
      try{ if(seqSpacer) seqSpacer.style.width = Math.max(1, Math.round(colOffsets[maxSeqLen])) + 'px'; }catch(_){ }
      scheduleRender();
      if(dt < 1){
        maskAnimRequest = requestAnimationFrame(tick);
      } else {
        maskAnimRequest = null;
        // finalize state
        maskEnabled = toEnabled;
        // rebuild definitive integer offsets and resize backings
        buildColOffsets();
        setCanvasCSSSizes();
        resizeBackings();
        scheduleRender();
        // instrumentation: mark animation end
        try{ window.__maskAnimating = false; window.__maskAnimEnd = Date.now(); }catch(_){ }
        console.info('mask animation end', { toEnabled: !!toEnabled, durationMs: (Date.now() - window.__maskAnimStart) });
      }
    }
    maskAnimRequest = requestAnimationFrame(tick);
  }

  // selection state: set of selected row indices
  const selectedRows = new Set();
  let anchorRow = null; // for shift-extend
  let isSelecting = false;
  let selectionStartRow = null;
  let selectionMode = 'replace';
  // rectangular selection state
  let isRectSelecting = false;
  let rectStartRow = null, rectStartCol = null;
  let rectEndRow = null, rectEndCol = null;
  // store original rect when doing shift-expand (union)
  let rectOriginal = null;

  function clearRectSelection(){
    isRectSelecting = false;
    rectStartRow = rectStartCol = rectEndRow = rectEndCol = null;
  }

  // leave canvas placement to DOM (they live in `left-inner` / `seq-inner` in index.html)
  // and rely on the spacer + absolute/sticky positioning to control layout.

  // We'll use large CSS-sized canvases for scrollbars, but render only the visible region.
  function setCanvasCSSSizes(){
    // set outer CSS size so scrollbars reflect full content
    labelCanvas.style.width = LABEL_WIDTH + 'px';
    // ensure label canvas is positioned at the top of its container
    try{ labelCanvas.style.position = labelCanvas.style.position || 'absolute'; labelCanvas.style.left = '0px'; labelCanvas.style.top = '0px'; labelCanvas.style.zIndex = '1'; }catch(_){ }
  // left spacer defines the full vertical scroll height; label canvas stays viewport-sized
  // keep canvas CSS height equal to the visible scroll area (use right scroll as canonical)
  // use clientWidth/clientHeight (integers) to avoid fractional-pixel drift from getBoundingClientRect
  const viewportHeight = Math.max(1, (scroller && scroller.clientHeight) ? scroller.clientHeight : window.innerHeight);
  const viewportWidth = Math.max(1, (scroller && scroller.clientWidth) ? scroller.clientWidth : window.innerWidth);
  const totalHeight = rowCount * ROW_HEIGHT;
  // canvases should always match the viewport height (they are viewport-backed); spacers define full scrollable content
  labelCanvas.style.height = viewportHeight + 'px';

  // Instead of setting a huge CSS width on the sequence canvas, use a spacer element to define scroll width
  // Build column offsets if needed and compute actual total width
  buildColOffsets();
  // colOffsets may be in backing pixels when transformations were applied; compute a
  // CSS-pixel total width by dividing by devicePixelRatio when appropriate so the
  // overview scale matches the visible CSS width.
  const pr_local = window.devicePixelRatio || 1;
  const rawTotal = colOffsets[maxSeqLen] || (maxSeqLen * (CHAR_WIDTH + EXPANDED_RIGHT_PAD));
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
    if(consensusCanvas){
      const parentWc = (consensusCanvas.parentElement && consensusCanvas.parentElement.clientWidth) ? consensusCanvas.parentElement.clientWidth : viewportWidth;
      const scrollbarWidthc = scroller ? Math.max(0, scroller.offsetWidth - scroller.clientWidth) : 0;
      const cssWc = Math.max(1, parentWc - scrollbarWidthc);
      consensusCanvas.style.width = cssWc + 'px';
      consensusCanvas.style.height = CONSENSUS_HEIGHT + 'px';
    }
    if(labelsHeaderCanvas){
      labelsHeaderCanvas.style.width = LABEL_WIDTH + 'px';
      labelsHeaderCanvas.style.height = Math.round(HEADER_HEIGHT) + 'px';
    }
  }

  // measure character width using the chosen font and set CHAR_WIDTH accordingly
  function measureCharWidth(){
    const ctx = document.createElement('canvas').getContext('2d');
    ctx.font = FONT;
    const metrics = ctx.measureText('W');
    // fallback if measurement fails
    const w = metrics && metrics.width ? metrics.width : CHAR_WIDTH;
    // round up to integer CSS pixels to avoid underestimation
    CHAR_WIDTH = Math.max(1, Math.ceil(w));
  }

  // Backing store pixel scaling for crisp text
  function resizeBackings(){
    const pr = window.devicePixelRatio || 1;

    // determine right-side viewport size first (use clientHeight/clientWidth as canonical viewport size)
  const totalHeight = rowCount * ROW_HEIGHT;
  const viewportHeight = Math.max(1, (scroller && scroller.clientHeight) ? scroller.clientHeight : window.innerHeight);
  const viewportWidth = Math.max(1, (scroller && scroller.clientWidth) ? scroller.clientWidth : window.innerWidth);
    // labels: backing equals viewport height (keep label and sequence canvases identical vertically)
    labelCanvas.width = Math.max(1, Math.round(LABEL_WIDTH * pr));
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
      labelsHeaderCanvas.width = Math.max(1, Math.round(LABEL_WIDTH * pr));
      labelsHeaderCanvas.height = Math.max(1, Math.round(HEADER_HEIGHT * pr));
      labelsHeaderCanvas.getContext('2d').setTransform(pr,0,0,pr,0,0);
    }
    // final enforcement to ensure integer pixel equality for CSS and backing sizes
    enforceIntegerGeometry();
    // diagnostic log to help debug canvas/container mismatches when requested
    logLayoutDiagnostics('resizeBackings');
  }

  // Enforce exact integer CSS dimensions and backing pixel dimensions for all canvases.
  // This is an assertion/pass that corrects any tiny rounding drift after layout changes.
  function enforceIntegerGeometry(){
    const pr = window.devicePixelRatio || 1;
  const viewportHeight = Math.max(1, (scroller && scroller.clientHeight) ? scroller.clientHeight : window.innerHeight);
  const viewportWidth = Math.max(1, (scroller && scroller.clientWidth) ? scroller.clientWidth : window.innerWidth);
  const totalHeight = rowCount * ROW_HEIGHT;

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
  labelCanvas.width = Math.max(1, Math.round(LABEL_WIDTH * pr));
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
    logLayoutDiagnostics('enforceIntegerGeometry');
    // ensure scrollTop doesn't exceed new content height
    clampScrollPositions();
  }

  // Layout debugging helper: logs size info to console and HUD (if debug enabled)
  function logLayoutDiagnostics(ctxLabel){
    try{
      const pr = window.devicePixelRatio || 1;
  const rs = scroller ? scroller.getBoundingClientRect() : { width:0, height:0 };
      const si = seqInner ? seqInner.getBoundingClientRect() : { width:0, height:0 };
      const sp = seqSpacer ? seqSpacer.getBoundingClientRect() : { width:0, height:0 };
      const sc = seqCanvas ? seqCanvas.getBoundingClientRect() : { width:0, height:0 };
      const lc = labelCanvas ? labelCanvas.getBoundingClientRect() : { width:0, height:0 };
      const info = {
        ctx: ctxLabel,
  rightScrollClient: scroller ? { w: scroller.clientWidth, h: scroller.clientHeight } : null,
  rightScrollScroll: scroller ? { top: scroller.scrollTop, height: scroller.scrollHeight } : null,
        rightScrollRect: { w: Math.round(rs.width), h: Math.round(rs.height) },
        seqInnerRect: { w: Math.round(si.width), h: Math.round(si.height) },
        seqSpacerRect: { w: Math.round(sp.width), h: Math.round(sp.height) },
        seqCanvasCss: { w: Math.round(sc.width), h: Math.round(sc.height) },
        seqCanvasBacking: seqCanvas ? { w: seqCanvas.width, h: seqCanvas.height } : null,
        labelCanvasCss: { w: Math.round(lc.width), h: Math.round(lc.height) },
        labelCanvasBacking: labelCanvas ? { w: labelCanvas.width, h: labelCanvas.height } : null,
        leftScrollScroll: leftScroll ? { top: leftScroll.scrollTop, height: leftScroll.scrollHeight } : null,
        pr: pr,
        ROW_HEIGHT: ROW_HEIGHT,
        HEADER_HEIGHT: HEADER_HEIGHT,
        CHAR_WIDTH: CHAR_WIDTH
      };
      // primary diagnostics are logged to console; consumers can inspect `info` there.
      console.info('LAYOUT-DIAG', info);
    }catch(e){ console.warn('layout diag failed', e); }
  }

  // If the scroll position is past the maximum allowed by content height, clamp it.
  function clampScrollPositions(){
    try{
    const viewportHeight = Math.max(1, scroller ? scroller.clientHeight : window.innerHeight);
      const totalHeight = rowCount * ROW_HEIGHT;
      const maxScroll = Math.max(0, totalHeight - viewportHeight);
      if(scroller && scroller.scrollTop > maxScroll){ scroller.scrollTop = maxScroll; }
      try{ if(leftScroll && leftScroll !== scroller && leftScroll.scrollTop > maxScroll){ leftScroll.scrollTop = maxScroll; } }catch(e){}
    }catch(e){}
  }

  // measure CHAR_WIDTH from seqCanvas actual context (ensures consistent rendering)
  function measureCharWidthFromReal(){
    const ctx = seqCanvas.getContext('2d');
    ctx.font = FONT;
    const m = ctx.measureText('W');
    const w = m && m.width ? m.width : CHAR_WIDTH;
    CHAR_WIDTH = Math.max(1, Math.ceil(w));
    // CHAR_WIDTH changed -> rebuild col offsets
    try{ buildColOffsets(); }catch(_){ }
  }


  // Measure vertical text metrics (ascent/descent) to compute a centering offset
  // Per-canvas vertical text metrics (ascent/descent) to compute centering offsets
  let labelTextVertOffset = Math.floor(ROW_HEIGHT/2); // default
  let seqTextVertOffset = Math.floor(ROW_HEIGHT/2); // default
  function measureTextVerticalOffset(){
    // sequence font metrics
    try{
      const ctx = seqCanvas.getContext('2d');
      ctx.font = FONT;
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
      ctx2.font = FONT;
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
    const ctx = seqCanvas.getContext('2d');
    // sequence font
    ctx.font = FONT;
    const seqMetrics = ctx.measureText('Mg');
    let seqHeight = 0;
    if(seqMetrics && typeof seqMetrics.actualBoundingBoxAscent === 'number'){
      seqHeight = Math.ceil((seqMetrics.actualBoundingBoxAscent || 0) + (seqMetrics.actualBoundingBoxDescent || 0));
    } else {
      // fallback: parse font px size
      const m = FONT.match(/(\d+)px/);
      const px = m ? parseInt(m[1],10) : 14;
      seqHeight = Math.round(px * 1.2);
    }

    // label font (we currently use the same FONT for labels; measure similarly in case of future divergence)
    const ctx2 = labelCanvas.getContext('2d');
    ctx2.font = FONT;
    const labMetrics = ctx2.measureText('Mg');
    let labHeight = 0;
    if(labMetrics && typeof labMetrics.actualBoundingBoxAscent === 'number'){
      labHeight = Math.ceil((labMetrics.actualBoundingBoxAscent || 0) + (labMetrics.actualBoundingBoxDescent || 0));
    } else {
      const m2 = FONT.match(/(\d+)px/);
      const px2 = m2 ? parseInt(m2[1],10) : 14;
      labHeight = Math.round(px2 * 1.2);
    }

  // set ROW_HEIGHT to the maximum of the two measured text heights plus padding
  // so both panels have enough room while keeping the same font size
  const newRow = Math.max(8, Math.ceil(Math.max(seqHeight, labHeight) + ROW_PADDING));
    ROW_HEIGHT = newRow;
    // sync CSS variable so layout that uses --row-height matches
    document.documentElement.style.setProperty('--row-height', ROW_HEIGHT + 'px');
  }

  // compute visible rows/cols given current scroll positions
  function computeVisible(){
    const scrollTop = scroller ? scroller.scrollTop : 0;
    const scrollLeft = scroller ? scroller.scrollLeft : 0;
    const viewH = scroller ? scroller.clientHeight : window.innerHeight;
    const viewW = scroller ? scroller.clientWidth : window.innerWidth;

  // canonical (unbuffered) first/last rows that correspond exactly to the scrollTop/viewH
  const firstRowNoBuffer = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT));
  const lastRowNoBuffer = Math.min(rowCount - 1, Math.floor((scrollTop + viewH) / ROW_HEIGHT));

  // buffered range for drawing to avoid pop-in
  let firstRow = firstRowNoBuffer - BUFFER_ROWS;
  let lastRow = Math.min(rowCount - 1, lastRowNoBuffer + BUFFER_ROWS);
  firstRow = Math.max(0, firstRow);

      // compute CHAR_WIDTH as before (measured single-col width) but visible columns are computed from colOffsets
      let cssCharWidth = CHAR_WIDTH;
      try{
        const spacerRect = seqSpacer.getBoundingClientRect();
        if(spacerRect && spacerRect.width > 0 && maxSeqLen > 0 && !maskEnabled){
          // when mask disabled we can infer char width from spacer
          cssCharWidth = spacerRect.width / maxSeqLen;
        }
      }catch(e){ }
      // fallback to canvas-measured width when needed
      try{ const seqCtx = seqCanvas.getContext('2d'); seqCtx.font = FONT; const m = seqCtx.measureText('W'); const cw = (m && m.width) ? m.width : CHAR_WIDTH; cssCharWidth = Math.max(cssCharWidth, cw); }catch(_){ }
      CHAR_WIDTH = Math.max(1, Math.ceil(cssCharWidth));
      // ensure offsets are rebuilt with latest CHAR_WIDTH
      try{ buildColOffsets(); }catch(_){ }

      // raw visible columns (no buffer) — use binary search on colOffsets
      const rawFirstCol = colIndexFromOffset(scrollLeft);
      const rawLastCol = colIndexFromOffset(scrollLeft + viewW - 1);

  // buffered range for drawing to avoid pop-in
  // Use an asymmetric buffer: only buffer to the left when there's enough room.
  // This avoids drawing many columns to the left of the viewport when near the left edge
  // which can result in negative draw coordinates that look like misalignment.
  const leftBuffer = (rawFirstCol >= BUFFER_COLS) ? BUFFER_COLS : 0;
  const rightBuffer = BUFFER_COLS;
  let firstCol = Math.max(0, rawFirstCol - leftBuffer);
  let lastCol = Math.min(maxSeqLen - 1, rawLastCol + rightBuffer);

    return { firstRow, lastRow, firstCol, lastCol, rawFirstCol, rawLastCol, viewW, viewH, scrollLeft, scrollTop, firstRowNoBuffer, lastRowNoBuffer };
  }

  // Draw visible labels into the label canvas backing (which we sized to full height) but only clear/draw visible region for speed
  function drawLabels(visible){
    const ctx = labelCanvas.getContext('2d');
    ctx.font = FONT;
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#111';

    const pr = window.devicePixelRatio || 1;
    const cssW = labelCanvas.width / pr;
    const cssH = labelCanvas.height / pr;
    // clear viewport backing
    ctx.clearRect(0, 0, cssW, cssH);

    for(let i=visible.firstRow;i<=visible.lastRow;i++){
      // quantize row Y and height to device pixels for crisp alignment with sequence canvas
      // compute absolute row position relative to viewport top using scrollTop so both canvases match
      const rawRowY = (i * ROW_HEIGHT) - visible.scrollTop;
      const rowY = Math.round(rawRowY * pr) / pr;
      const rowH = Math.round(ROW_HEIGHT * pr) / pr;
      const label = rows[i].label || '';
      // selection highlight (takes precedence) or alternating row stripe
      if(selectedRows.has(i)){
        ctx.fillStyle = '#cfe8ff'; // light selection blue
      } else if(i % 2 === 0){
        ctx.fillStyle = '#fff';
      } else {
        ctx.fillStyle = '#fbfbfb';
      }
      ctx.fillRect(0, rowY, LABEL_WIDTH, rowH);
      // draw a subtle left accent for the reference sequence row
      if(typeof refIndex === 'number' && i === refIndex){
        try{ ctx.fillStyle = REF_ACCENT; ctx.fillRect(0, rowY, 4, rowH); }catch(_){ }
      }
      ctx.fillStyle = '#111';
  const y = Math.round((rawRowY + labelTextVertOffset) * pr) / pr;
      ctx.fillText(label, 6, y);
    }
  }

  // Draw header digits (we render only the portion visible in the header backing)
  function drawHeader(visible){
    if(!headerCanvas) return;
    const ctx = headerCanvas.getContext('2d');
    const pr = window.devicePixelRatio || 1;
    const cssW = headerCanvas.width / pr;
    // clear header area
    ctx.clearRect(0,0, cssW, HEADER_HEIGHT);
  // header uses a fixed font size independent of the main FONT
  ctx.font = HEADER_FONT;
    ctx.textBaseline = 'alphabetic';

  // background
  ctx.fillStyle = '#f3f3f3';
  ctx.fillRect(0,0, cssW, HEADER_HEIGHT);
  // draw column selection overlay under ticks
  if(selectedCols.size > 0){ drawHeaderColumnOverlay(visible); }

  // Determine visible column range (use rawFirst/rawLast for precise tick placement)
  const start = Math.max(0, visible.rawFirstCol - 1);
  const end = Math.min(maxSeqLen - 1, visible.rawLastCol + 1);

    // Adaptive tick step: choose a base-step so labels are at least MIN_TICK_PX apart
    const MIN_TICK_PX = 48; // desired minimum px between major ticks
    // estimate average visual width per base using total offsets
  const totalVisualWidth = colOffsets[maxSeqLen] || (maxSeqLen * (CHAR_WIDTH + EXPANDED_RIGHT_PAD));
    const avgBasePx = (maxSeqLen > 0) ? (totalVisualWidth / maxSeqLen) : CHAR_WIDTH;
    // choose a 'nice' tick step (1,2,5 * 10^n) so avgBasePx * step >= MIN_TICK_PX
    function chooseTickStep(avgPx){
      if(avgPx <= 0) return 10;
      const candidates = [1,2,5];
      // compute target multiplier
      const raw = MIN_TICK_PX / avgPx;
      const pow = Math.max(0, Math.floor(Math.log10(raw)) - 1);
      // expand search over a few powers to find suitable
      for(let p = pow; p <= pow + 5; p++){
        for(const c of candidates){
          const step = c * Math.pow(10, p);
          if(step * avgPx >= MIN_TICK_PX) return step;
        }
      }
      // fallback
      return Math.max(10, Math.ceil(raw));
    }
    const step = chooseTickStep(avgBasePx);
    const smallTickH = Math.max(2, Math.round(HEADER_HEIGHT * 0.28));
    const largeTickH = Math.max(3, Math.round(HEADER_HEIGHT * 0.6));
    const bottom = HEADER_HEIGHT;
    ctx.strokeStyle = '#666';
    ctx.lineWidth = 1;
    ctx.fillStyle = '#333';

    // Draw ticks in canvas-local coordinates using colOffsets to handle variable widths
    for(let c = start; c <= end; c++){
      const colLeft = colOffsets[c] || 0;
  const colRight = colOffsets[c+1] || (colLeft + CHAR_WIDTH + EXPANDED_RIGHT_PAD);
      const centerLocal = ((colLeft + colRight) / 2) - visible.scrollLeft;
      const x = Math.round(centerLocal) + 0.5;
      const posIndex = c + 1;
      const isMajor = (posIndex % step) === 0;
      const isMinor = !isMajor && (step >= 2) && ((posIndex % (step/2)) === 0);
      const tickH = isMajor ? largeTickH : (isMinor ? Math.max(2, Math.round(HEADER_HEIGHT * 0.4)) : smallTickH);
      ctx.beginPath();
      ctx.moveTo(x, bottom - tickH);
      ctx.lineTo(x, bottom - 1);
      ctx.stroke();
      if(isMajor){
        const label = String(posIndex);
        const labelX = Math.round(centerLocal) + 3; // left padding from centered tick
        // Position the label baseline so the bottom of the digits is flush with the top of the tick mark.
        // Use actualBoundingBoxDescent when available for precise placement; otherwise fall back
        // to a reasonable estimate so labels don't overlap ticks.
        let labelY;
        try{
          const metrics = ctx.measureText(label);
          const descent = (metrics && typeof metrics.actualBoundingBoxDescent === 'number') ? metrics.actualBoundingBoxDescent : Math.max(2, Math.round(HEADER_HEIGHT * 0.18));
          // place baseline so (baseline + descent) == (top of tick) - padding
          const padding = 2;
          labelY = Math.round((bottom - tickH) - padding - descent);
        }catch(e){
          // fallback to previous centered placement if measurement fails
          labelY = Math.round(HEADER_HEIGHT/2 + (seqTextVertOffset - ROW_HEIGHT/2));
        }
        ctx.fillText(label, labelX, labelY);
      }
    }

    // draw marker(s) if enabled (compute positions in the same local coordinate space)
    if(markerEnabled || window.__showMarker){
      try{
        const ctxm = headerCanvas.getContext('2d');
        ctxm.save();
  const gx = Math.round((colOffsets[0] || 0) - visible.scrollLeft + 0.5);
  const gx2 = Math.round((colOffsets[1] || (colOffsets[0] + CHAR_WIDTH + EXPANDED_RIGHT_PAD)) - visible.scrollLeft + 0.5);
        ctxm.strokeStyle = 'rgba(0,200,0,0.9)';
        ctxm.lineWidth = 2;
        const h = headerCanvas.height / (window.devicePixelRatio || 1);
        ctxm.beginPath(); ctxm.moveTo(gx,0); ctxm.lineTo(gx,h); ctxm.stroke();
        ctxm.strokeStyle = 'rgba(0,120,200,0.9)';
        ctxm.beginPath(); ctxm.moveTo(gx2,0); ctxm.lineTo(gx2,h); ctxm.stroke();
        ctxm.restore();
      }catch(e){ }
    }
  }

  // Draw consensus row underneath the header (single-raster representing per-column consensus)
  function drawConsensus(visible){
    if(!consensusCanvas) return;
    const ctx = consensusCanvas.getContext('2d');
    const pr = window.devicePixelRatio || 1;
    const cssW = consensusCanvas.width / pr;
    const cssH = consensusCanvas.height / pr;
    // clear
    ctx.clearRect(0,0, cssW, cssH);
    // background (match header background)
    ctx.fillStyle = '#fafafa';
    ctx.fillRect(0,0, cssW, cssH);
  // draw a bottom separator line so the divider appears below the consensus sequence
  ctx.strokeStyle = '#e0e0e0';
  ctx.lineWidth = 1;
  const sepY = Math.max(0.5, cssH - 0.5);
  ctx.beginPath(); ctx.moveTo(0, sepY); ctx.lineTo(cssW, sepY); ctx.stroke();

    ctx.font = FONT;
    ctx.textBaseline = 'alphabetic';

    // compute vertical metrics inside the inner box (cssH minus top+bottom pads)
    const innerH = Math.max(1, cssH - (CONSENSUS_TOP_PAD + CONSENSUS_BOTTOM_PAD));
    let ascent = 0, descent = 0;
    try{
      const m = ctx.measureText('Mg');
      if(m && typeof m.actualBoundingBoxAscent === 'number'){
        ascent = m.actualBoundingBoxAscent || 0;
        descent = m.actualBoundingBoxDescent || 0;
      }
    }catch(e){}
    const baselineY = Math.round(CONSENSUS_TOP_PAD + (innerH - (ascent + descent)) / 2 + ascent);

    // ensure we have a consensus string
    const cons = (window && window.consensusSequence) ? window.consensusSequence : computeConsensusSequence();
    if(!cons || cons.length === 0) return;

    const start = Math.max(0, visible.rawFirstCol - 1);
    const end = Math.min(maxSeqLen - 1, visible.rawLastCol + 1);
    for(let c = start; c <= end; c++){
      const left = colOffsets[c] || 0;
      const right = colOffsets[c+1] || (left + CHAR_WIDTH + EXPANDED_RIGHT_PAD);
      const x = left - visible.scrollLeft;
      const w = Math.max(1, right - left);
      const ch = (cons.charAt(c) || 'N');
      const base = ch ? ch.charAt(0).toUpperCase() : '';
      const color = BASE_COLORS[base] || DEFAULT_BASE_COLOR;
      if(maskEnabled && maskStr && maskStr.charAt(c) === '0'){
        // compressed: draw a block inset by the top/bottom pads so the bg shows above/below
        ctx.fillStyle = color;
        const blockTop = CONSENSUS_TOP_PAD;
        const blockH = Math.max(1, cssH - (CONSENSUS_TOP_PAD + CONSENSUS_BOTTOM_PAD));
        ctx.fillRect(x, blockTop, w, blockH);
      } else {
        ctx.fillStyle = color;
        ctx.fillText(ch, x + 3, baselineY);
      }
    }
  }

  // Draw overview canvas showing full alignment and the current viewport window
  function drawOverview(visible){
    if(!overviewCanvas) return;
    const ctx = overviewCanvas.getContext('2d');
    const pr = window.devicePixelRatio || 1;
    // Use the canvas's layout (CSS) width via getBoundingClientRect so we draw into the
    // visible area. If the backing buffer size (canvas.width/height) doesn't match the
    // CSS size * DPR, resize the backing and reapply the device-pixel transform so drawing
    // covers the full visible area. This avoids cases where the backing buffer is stale
    // and the graphic appears half or partially rendered.
    const rect = overviewCanvas.getBoundingClientRect();
    const cssW = rect && rect.width ? rect.width : (overviewCanvas.width / pr);
    const cssH = rect && rect.height ? rect.height : (overviewCanvas.height / pr);
    // ensure backing matches CSS * DPR
    const wantW = Math.max(1, Math.round(cssW * pr));
    const wantH = Math.max(1, Math.round(cssH * pr));
    if(overviewCanvas.width !== wantW || overviewCanvas.height !== wantH){
      overviewCanvas.width = wantW;
      overviewCanvas.height = wantH;
      try{ overviewCanvas.getContext('2d').setTransform(pr,0,0,pr,0,0); }catch(e){}
    }
    ctx.clearRect(0,0, cssW, cssH);
    // background
    ctx.fillStyle = '#f7f7f7';
    ctx.fillRect(0,0, cssW, cssH);

  // colOffsets may be in backing/device pixels; convert to CSS pixels so scale matches cssW
  const rawTotal = colOffsets[maxSeqLen] || (maxSeqLen * (CHAR_WIDTH + EXPANDED_RIGHT_PAD));
  // colOffsets are in CSS pixels; total width is rawTotal in CSS pixels
  const totalWidth = rawTotal;
    if(totalWidth <= 0) return;
    const scale = cssW / totalWidth;

    // draw compressed columns as darker bars and uncompressed as light
    // iterate columns and draw a 1px-high stripe for each (scaled width)
    const barH = Math.max(4, Math.floor(cssH * 0.35));
    const barY = Math.round((cssH - barH) / 2);
    // To avoid cumulative rounding errors (which can make the drawn bars add up to less
    // than the full width), compute rounded positions for the left and right edges and
    // derive width as their difference. This guarantees the bars tile across the full
    // visible width without leaving gaps or appearing 'half-size'.
    for(let c=0;c<maxSeqLen;c++){
      const left = colOffsets[c] || 0;
      const right = colOffsets[c+1] || (left + CHAR_WIDTH + EXPANDED_RIGHT_PAD);
      const x = Math.round(left * scale);
      const nextX = Math.round(right * scale);
      const w = Math.max(1, nextX - x);
      const isCompressed = maskStr && maskStr.charAt(c) === '0';
      ctx.fillStyle = isCompressed ? '#999' : '#ddd';
      ctx.fillRect(x, barY, w, barH);
    }

    // draw viewport rectangle
    try{
      const viewX = Math.round(visible.scrollLeft * scale);
      const viewW = Math.max(2, Math.round(visible.viewW * scale));
      ctx.save();
      ctx.strokeStyle = 'rgba(0,120,200,0.9)';
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.6;
      ctx.strokeRect(viewX + 0.5, 2 + 0.5, viewW - 1, cssH - 4);
      ctx.restore();
    }catch(e){}
  }

  // Draw labels header (simple static header above the labels column)
  function drawLabelsHeader(){
    if(!labelsHeaderCanvas) return;
    const ctx = labelsHeaderCanvas.getContext('2d');
    const pr = window.devicePixelRatio || 1;
    const w = labelsHeaderCanvas.width / pr;
    ctx.clearRect(0,0,w,HEADER_HEIGHT);
  // labels header (the little "Labels" title) uses the fixed header font
  ctx.font = HEADER_FONT;
    ctx.textBaseline = 'alphabetic';
    // background
    ctx.fillStyle = '#f3f3f3';
    ctx.fillRect(0,0,w,HEADER_HEIGHT);
    ctx.fillStyle = '#333';
  // draw the label title centered vertically
  const title = 'Labels';
  const y = Math.round(HEADER_HEIGHT/2 + (labelTextVertOffset - ROW_HEIGHT/2));
  ctx.fillText(title, 6, y);
  }

  // Draw sequences viewport into seqCanvas (backing is viewport-sized)
  function drawSequences(visible){
    const ctx = seqCanvas.getContext('2d');
  const pr = window.devicePixelRatio || 1;
  ctx.clearRect(0,0, seqCanvas.width / pr, seqCanvas.height / pr);
  // draw columns at absolute sequence coordinates minus the scroll offset so the viewport shows the correct slice
  // variable-width columns use colOffsets to compute positions
  ctx.font = FONT;
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#000';

  const rowsToDraw = visible.lastRow - visible.firstRow + 1;
  const colsToDraw = visible.lastCol - visible.firstCol + 1;

  // compute local offset (for sub-character scrolling) - still useful for grid alignment
  // (reuse localOffset declared above)

  // First pass: draw row backgrounds (including row selection highlight)
  for(let r=visible.firstRow; r<=visible.lastRow; r++){
    if(selectedRows.has(r)){
      ctx.fillStyle = '#cfe8ff'; // match label selection color
    } else if((r % 2) === 0){
      ctx.fillStyle = '#fff';
    } else {
      ctx.fillStyle = '#fafafa';
    }
    const rawRowY = (r * ROW_HEIGHT) - visible.scrollTop;
    const rowY = Math.round(rawRowY * pr) / pr;
    const rowH = Math.round(ROW_HEIGHT * pr) / pr;
    ctx.fillRect(0, rowY, visible.viewW, rowH);
    // draw a thin left accent in the sequence viewport for the reference row
    if(typeof refIndex === 'number' && r === refIndex){
      try{ ctx.save(); ctx.fillStyle = REF_ACCENT; ctx.globalAlpha = 0.9; ctx.fillRect(0, rowY, 4, rowH); ctx.restore(); }catch(_){ }
    }
  }

  // column selection overlay (drawn over row backgrounds, before glyphs)
  if(selectedCols.size > 0){ drawColumnSelectionOverlay(visible); }

  // Second pass: draw sequence characters
  for(let r=visible.firstRow; r<=visible.lastRow; r++){
    const rawRowY = (r * ROW_HEIGHT) - visible.scrollTop;
    const y = Math.round((rawRowY + seqTextVertOffset) * pr) / pr; // local to backing
    const seq = rows[r].sequence || '';
    ctx.fillStyle = '#000';
    for(let c=visible.firstCol; c<=visible.lastCol; c++){
      const rawCh = seq[c] || ' ';
      const ch = String(rawCh);
      const colLeft = colOffsets[c] || 0;
  const colRight = colOffsets[c+1] || (colLeft + CHAR_WIDTH + EXPANDED_RIGHT_PAD);
      const x = colLeft - visible.scrollLeft;
      const w = Math.max(1, colRight - colLeft);
      // color bases A/C/G/T specially (case-insensitive), but if reference-mode is enabled
      // and the character equals the reference at this column, render pale grey instead.
      const base = ch ? ch.charAt(0).toUpperCase() : '';
      const refChar = (refStr && refStr.charAt(c)) ? refStr.charAt(c).toUpperCase() : null;
      const isSameRef = refModeEnabled && refStr && refChar === base;
      const isRefRow = (typeof refIndex === 'number' && refIndex === r);
      // Reference row should always keep nucleotide colours; other rows may be de-emphasized when matching reference
      const color = isRefRow ? (BASE_COLORS[base] || DEFAULT_BASE_COLOR) : (isSameRef ? PALE_REF_COLOR : (BASE_COLORS[base] || DEFAULT_BASE_COLOR));
      if(maskEnabled && maskStr && maskStr.charAt(c) === '0'){
        // compressed cell: draw a slightly shorter colored block so the row background is visible
        ctx.fillStyle = color;
        // compute vertical inset so the block is centered within the row
        const topCss = rawRowY + COMPRESSED_CELL_VPAD;
        const blockH = Math.max(1, ROW_HEIGHT - (COMPRESSED_CELL_VPAD * 2));
        const topQ = Math.round(topCss * pr) / pr;
        const hQ = Math.round(blockH * pr) / pr;
        ctx.fillRect(x, topQ, w, hQ);
      } else {
        ctx.fillStyle = color;
        // draw at local canvas coordinate relative to visible scroll
        ctx.fillText(ch, x + 3, y);
      }
    }
  }

  // draw rectangular selection border (if any) on top of glyphs
  if(isRectSelecting || (rectStartRow !== null && rectEndRow !== null && rectStartCol !== null && rectEndCol !== null)){
    try{
      const rlo = Math.max(0, Math.min(rectStartRow, rectEndRow));
      const rhi = Math.min(rowCount-1, Math.max(rectStartRow, rectEndRow));
      const clo = Math.max(0, Math.min(rectStartCol, rectEndCol));
      const chi = Math.min(maxSeqLen-1, Math.max(rectStartCol, rectEndCol));
      // only draw if intersects visible region
      if(rhi >= visible.firstRow && rlo <= visible.lastRow && chi >= visible.rawFirstCol && clo <= visible.rawLastCol){
        const topY = (rlo - visible.firstRow) * ROW_HEIGHT - (visible.scrollTop - visible.firstRow * ROW_HEIGHT);
        const bottomY = (rhi - visible.firstRow + 1) * ROW_HEIGHT - (visible.scrollTop - visible.firstRow * ROW_HEIGHT);
        const leftX = (colOffsets[clo] || 0) - visible.scrollLeft;
  const rightX = (colOffsets[chi+1] || (colOffsets[chi] + CHAR_WIDTH + EXPANDED_RIGHT_PAD)) - visible.scrollLeft;
        // quantize to device pixels
        const dpr = window.devicePixelRatio || 1;
        const t = Math.round(topY * dpr) / dpr;
        const b = Math.round(bottomY * dpr) / dpr;
        const l = Math.round(leftX * dpr) / dpr;
        const r = Math.round(rightX * dpr) / dpr;
        ctx.save();
        ctx.strokeStyle = 'rgba(0,120,200,0.9)';
        ctx.lineWidth = 2;
        ctx.setLineDash([4,2]);
        ctx.strokeRect(l + 0.5, t + 0.5, Math.max(1, r - l - 1), Math.max(1, b - t - 1));
        ctx.restore();
      }
    }catch(e){}
  }

    // debug grid overlay (draw column boundaries)
    if(window.__showGrid){
      ctx.save();
      ctx.strokeStyle = 'rgba(255,0,0,0.6)';
      ctx.lineWidth = 1;
      // full height in CSS pixels
      const fullH = seqCanvas.height / (window.devicePixelRatio || 1);
      const startC = Math.max(0, visible.rawFirstCol - 1);
      const endC = Math.min(maxSeqLen-1, visible.rawLastCol + 1);
      for(let c=startC; c<=endC+1; c++){
        const gx = (colOffsets[c] || 0) - visible.scrollLeft + 0.5; // half-px for crisp line
        ctx.beginPath();
        ctx.moveTo(gx, 0);
        ctx.lineTo(gx, fullH);
        ctx.stroke();
      }
      // highlight rawFirstCol boundary
      ctx.strokeStyle = 'rgba(0,0,255,0.8)';
      const fx = (colOffsets[visible.rawFirstCol] || 0) - visible.scrollLeft + 0.5;
      ctx.beginPath(); ctx.moveTo(fx,0); ctx.lineTo(fx, fullH); ctx.stroke();
      ctx.restore();
    }
    // record draw extents for HUD
    // draw marker(s) if enabled
    if(markerEnabled || window.__showMarker){
      try{
    ctx.save();
    // quantize marker positions to device pixels for seq canvas as well
    const dpr_s = window.devicePixelRatio || 1;
    const fullH = seqCanvas.height / dpr_s;
  const gx_css = -visible.scrollLeft + 0.5;
  const gx2_css = -(visible.scrollLeft - CHAR_WIDTH) + 0.5;
  const gx = Math.round(gx_css * dpr_s) / dpr_s;
  const gx2 = Math.round(gx2_css * dpr_s) / dpr_s;
    ctx.strokeStyle = 'rgba(0,200,0,0.9)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(gx,0); ctx.lineTo(gx,fullH); ctx.stroke();
    ctx.strokeStyle = 'rgba(0,120,200,0.9)'; ctx.beginPath(); ctx.moveTo(gx2,0); ctx.lineTo(gx2,fullH); ctx.stroke();
        ctx.restore();
      }catch(e){}
    }

    (function recordExtents(){
      try{
        const startX = (colOffsets[visible.firstCol] || 0) - visible.scrollLeft + 3;
        const endX = (colOffsets[visible.lastCol] || 0) - visible.scrollLeft + 3;
        window.__lastDrawExtents = { minX: Math.round(startX), maxX: Math.round(endX) };
      }catch(e){
        window.__lastDrawExtents = { minX:0, maxX:0 };
      }
    })();
  }

  // main render loop throttled with rAF
  let scheduled = false;
  function scheduleRender(){
    if(scheduled) return;
    scheduled = true;
    requestAnimationFrame(()=>{
      scheduled = false;
  const vis = computeVisible();
  // draw independent headers first (they don't scroll vertically)
  drawLabelsHeader();
  drawOverview(vis);
  drawHeader(vis);
    drawConsensus(vis);
  drawLabels(vis);
  drawSequences(vis);
  // diagnostics are available in console via logLayoutDiagnostics; remove on-screen HUD.
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

  // debug HUD setup: show if URL contains ?debug
  // debug HUD removed — rely on console.log and `logLayoutDiagnostics()` for runtime diagnostics.

  // search and copy helpers
  let lastSearchIdx = -1;
  function findMatches(q){
    if(!q) return [];
    q = q.toLowerCase();
    const matches = [];
    for(let i=0;i<rows.length;i++){
      if((rows[i].label && rows[i].label.toLowerCase().includes(q)) || (rows[i].sequence && rows[i].sequence.toLowerCase().includes(q))){
        matches.push(i);
      }
    }
    return matches;
  }
  if(searchNextBtn && searchInput){
    searchNextBtn.addEventListener('click', ()=>{
      const q = searchInput.value.trim();
      if(!q) return;
      const matches = findMatches(q);
      if(matches.length===0) return;
      lastSearchIdx = (lastSearchIdx + 1) % matches.length;
      const row = matches[lastSearchIdx];
      // scroll to row
      if(scroller) scroller.scrollTop = row * ROW_HEIGHT;
      try{ if(leftScroll && leftScroll !== scroller) leftScroll.scrollTop = scroller.scrollTop; }catch(e){}
      scheduleRender();
    });
  }

  if(copyRowBtn){
    copyRowBtn.addEventListener('click', ()=>{
      // copy currently visible top row
      const vis = computeVisible();
      const row = vis.firstRow;
      const item = rows[row];
      const text = (item ? item.label : '') + '\t' + ((item && item.sequence) ? item.sequence : '');
      try{ navigator.clipboard && navigator.clipboard.writeText ? navigator.clipboard.writeText(text) : null; }catch(e){}
    });
  }

  // selection helpers: compute row from clientY within labelCanvas
  function rowFromClientY(clientY){
    if(!labelCanvas) return 0;
    const rect = labelCanvas.getBoundingClientRect();
    const y = clientY - rect.top; // css pixels within canvas
    const scrollTop = scroller ? scroller.scrollTop : 0;
    const absY = scrollTop + y;
    let row = Math.floor(absY / ROW_HEIGHT);
    if(row < 0) row = 0;
    if(row >= rowCount) row = rowCount - 1;
    return row;
  }

  // helper: compute column under clientX within seq/header
  function colFromClientXLocal(clientX){
    // Use seqCanvas bounding box so clicks over the seq viewport map correctly
    if(!seqCanvas) return colFromClientX(clientX);
    const rect = seqCanvas.getBoundingClientRect();
    const x = clientX - rect.left; // css pixels within seq canvas
    const scrollLeft = scroller ? scroller.scrollLeft : 0;
    const absX = scrollLeft + x;
    return colIndexFromOffset(absX);
  }

  function setSelectionToRange(a,b){
    const lo = Math.max(0, Math.min(a,b));
    const hi = Math.min(rowCount-1, Math.max(a,b));
    selectedRows.clear();
    for(let r=lo;r<=hi;r++) selectedRows.add(r);
  }

  function addRangeToSelection(a,b){
    const lo = Math.max(0, Math.min(a,b));
    const hi = Math.min(rowCount-1, Math.max(a,b));
    for(let r=lo;r<=hi;r++) selectedRows.add(r);
  }

  function toggleRangeInSelection(a,b){
    const lo = Math.max(0, Math.min(a,b));
    const hi = Math.min(rowCount-1, Math.max(a,b));
    for(let r=lo;r<=hi;r++){
      if(selectedRows.has(r)) selectedRows.delete(r); else selectedRows.add(r);
    }
  }

  // wire up label canvas interactions: click/drag selection, shift-extend, cmd-toggle, and forward wheel to scroller
  if(labelCanvas){
  selectionMode = 'replace';
    let selectionOrigin = null;
    labelCanvas.addEventListener('mousedown', (e)=>{
      if(e.button !== 0) return; // only left button
      const row = rowFromClientY(e.clientY);
      // determine origin (shift -> anchorRow if present)
        // clear any column or rectangle selection when starting a row selection
        selectedCols.clear();
        clearRectSelection();
        if(e.shiftKey && anchorRow !== null){ selectionOrigin = anchorRow; } else { selectionOrigin = row; }
        if(e.metaKey){ selectionMode = 'add'; }
        else selectionMode = 'replace';

        if(e.shiftKey && anchorRow !== null){
          setSelectionToRange(anchorRow, row);
        } else if(e.metaKey){
          // toggle clicked row
          if(selectedRows.has(row)) selectedRows.delete(row); else selectedRows.add(row);
          anchorRow = row;
        } else {
          // normal click: start new selection
          selectedRows.clear();
          selectedRows.add(row);
          anchorRow = row;
        }
      isSelecting = true;
      selectionStartRow = row;
      scheduleRender();
      e.preventDefault();
    });

    window.addEventListener('mousemove', (e)=>{
      if(!isSelecting) return;
      const row = rowFromClientY(e.clientY);
      if(selectionMode === 'replace'){
        setSelectionToRange(selectionOrigin, row);
      } else if(selectionMode === 'add'){
        addRangeToSelection(selectionOrigin, row);
      }
      scheduleRender();
    });

    window.addEventListener('mouseup', (e)=>{
      if(!isSelecting) return;
      isSelecting = false;
      // update anchor to last selected row (use last selectionStartRow if available)
      const row = rowFromClientY(e.clientY);
      anchorRow = row;
      scheduleRender();
    });

    // forward wheel events from labels to canonical scroller so wheel on labels scrolls viewport
    labelCanvas.addEventListener('wheel', (e)=>{
      if(!scroller) return;
      scroller.scrollTop += e.deltaY;
      scroller.scrollLeft += e.deltaX;
      scheduleRender();
      e.preventDefault();
    }, { passive: false });
  }

  // --- Column selection state and helpers ---
  const selectedCols = new Set();
  let anchorCol = null;
  let isColSelecting = false;
  let selectionStartCol = null;

  function colFromClientX(clientX){
    if(!headerCanvas) return 0;
    const rect = headerCanvas.getBoundingClientRect();
    const x = clientX - rect.left; // css pixels within header
    const scrollLeft = scroller ? scroller.scrollLeft : 0;
    const absX = scrollLeft + x;
    // map absolute offset to column index using colOffsets
    const col = colIndexFromOffset(absX);
    return col;
  }

  function setColSelectionToRange(a,b){
    const lo = Math.max(0, Math.min(a,b));
    const hi = Math.min(maxSeqLen-1, Math.max(a,b));
    selectedCols.clear();
    for(let c=lo;c<=hi;c++) selectedCols.add(c);
  }

  function addRangeToColSelection(a,b){
    const lo = Math.max(0, Math.min(a,b));
    const hi = Math.min(maxSeqLen-1, Math.max(a,b));
    for(let c=lo;c<=hi;c++) selectedCols.add(c);
  }

  function toggleRangeInColSelection(a,b){
    const lo = Math.max(0, Math.min(a,b));
    const hi = Math.min(maxSeqLen-1, Math.max(a,b));
    for(let c=lo;c<=hi;c++){
      if(selectedCols.has(c)) selectedCols.delete(c); else selectedCols.add(c);
    }
  }

  // render selected columns as a pale overlay in header and sequence area
  function drawColumnSelectionOverlay(visible){
    try{
      const pr = window.devicePixelRatio || 1;
      const seqCtx = seqCanvas.getContext('2d');
      const cssH = seqCanvas.height / pr;
      seqCtx.save();
      seqCtx.globalAlpha = 0.14;
      seqCtx.fillStyle = '#ffd54d'; // pale amber highlight for columns
      for(const c of selectedCols){
        // skip columns outside visible range
        if(c < visible.rawFirstCol - 1 || c > visible.rawLastCol + 1) continue;
        const x = (colOffsets[c] || 0) - visible.scrollLeft;
  const w = (colOffsets[c+1] || (colOffsets[c] + CHAR_WIDTH + EXPANDED_RIGHT_PAD)) - (colOffsets[c] || 0);
        seqCtx.fillRect(x, 0, w, cssH);
      }
      seqCtx.restore();
    }catch(e){ }
  }

  function drawHeaderColumnOverlay(visible){
    try{
      if(!headerCanvas) return;
      const headerCtx = headerCanvas.getContext('2d');
      headerCtx.save();
      headerCtx.globalAlpha = 0.14;
      headerCtx.fillStyle = '#ffd54d';
      const headerH = HEADER_HEIGHT;
      for(const c of selectedCols){
        if(c < visible.rawFirstCol - 1 || c > visible.rawLastCol + 1) continue;
        const x = (colOffsets[c] || 0) - visible.scrollLeft;
  const w = (colOffsets[c+1] || (colOffsets[c] + CHAR_WIDTH + EXPANDED_RIGHT_PAD)) - (colOffsets[c] || 0);
        headerCtx.fillRect(x, 0, w, headerH);
      }
      headerCtx.restore();
    }catch(e){ }
  }

  // header interaction: click/drag to select columns (clears row selection)
  if(headerCanvas){
    headerCanvas.addEventListener('mousedown', (e)=>{
      if(e.button !== 0) return;
      // start column selection: clear row selection and any rectangular selection
      selectedRows.clear();
      clearRectSelection();
      const col = colFromClientX(e.clientX);
      if(e.shiftKey && anchorCol !== null){ selectionStartCol = anchorCol; } else { selectionStartCol = col; }
      if(e.metaKey) selectionMode = 'add'; else selectionMode = 'replace';
      if(e.shiftKey && anchorCol !== null){ setColSelectionToRange(anchorCol, col); }
      else if(e.metaKey){ if(selectedCols.has(col)) selectedCols.delete(col); else selectedCols.add(col); anchorCol = col; }
      else { selectedCols.clear(); selectedCols.add(col); anchorCol = col; }
      isColSelecting = true;
      scheduleRender();
      e.preventDefault();
    });

    window.addEventListener('mousemove', (e)=>{
      if(!isColSelecting) return;
      const col = colFromClientX(e.clientX);
      if(e.metaKey){ addRangeToColSelection(selectionStartCol, col); }
      else setColSelectionToRange(selectionStartCol, col);
      scheduleRender();
    });

    window.addEventListener('mouseup', (e)=>{
      if(!isColSelecting) return;
      isColSelecting = false;
      const col = colFromClientX(e.clientX);
      anchorCol = col;
      scheduleRender();
    });
  }

  // Allow selecting columns by dragging on the consensus canvas as well (behaves like header)
  if(consensusCanvas){
    consensusCanvas.addEventListener('mousedown', (e)=>{
      if(e.button !== 0) return;
      // clear row selection and any rectangular selection
      selectedRows.clear();
      clearRectSelection();
      const col = colFromClientX(e.clientX);
      if(e.shiftKey && anchorCol !== null){ selectionStartCol = anchorCol; } else { selectionStartCol = col; }
      if(e.metaKey) selectionMode = 'add'; else selectionMode = 'replace';
      if(e.shiftKey && anchorCol !== null){ setColSelectionToRange(anchorCol, col); }
      else if(e.metaKey){ if(selectedCols.has(col)) selectedCols.delete(col); else selectedCols.add(col); anchorCol = col; }
      else { selectedCols.clear(); selectedCols.add(col); anchorCol = col; }
      isColSelecting = true;
      scheduleRender();
      e.preventDefault();
    });
  }

  // Overview canvas interactions: click to jump the viewport, drag to pan
  if(overviewCanvas){
    let isOverviewDragging = false;
    let overviewDragStartX = 0;
    overviewCanvas.addEventListener('mousedown', (e)=>{
      if(e.button !== 0) return;
      isOverviewDragging = true;
      overviewDragStartX = e.clientX;
      // jump viewport to center on clicked point
      const rect = overviewCanvas.getBoundingClientRect();
      const x = e.clientX - rect.left; // css pixels
  const pr = window.devicePixelRatio || 1;
  const rawTotal = colOffsets[maxSeqLen] || (maxSeqLen * CHAR_WIDTH);
  // colOffsets are CSS pixels; interactions should map client/CSS coords to CSS total width
  const totalWidth = rawTotal;
  const cssW = overviewCanvas.getBoundingClientRect().width;
  const scale = cssW / Math.max(1, totalWidth);
      const target = Math.round(x / scale - (scroller ? scroller.clientWidth/2 : 0));
      if(scroller) scroller.scrollLeft = Math.max(0, target);
      scheduleRender();
      e.preventDefault();
    });
    window.addEventListener('mousemove', (e)=>{
      if(!isOverviewDragging) return;
      const rect = overviewCanvas.getBoundingClientRect();
      const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
  const pr = window.devicePixelRatio || 1;
  const rawTotal = colOffsets[maxSeqLen] || (maxSeqLen * CHAR_WIDTH);
  // colOffsets are CSS pixels; interactions should map client/CSS coords to CSS total width
  const totalWidth = rawTotal;
  const cssW = overviewCanvas.getBoundingClientRect().width;
  const scale = cssW / Math.max(1, totalWidth);
      const target = Math.round(x / scale - (scroller ? scroller.clientWidth/2 : 0));
      if(scroller) scroller.scrollLeft = Math.max(0, target);
      scheduleRender();
    });
    window.addEventListener('mouseup', ()=>{ isOverviewDragging = false; });
  }

  // --- Sequence canvas interactions: rectangular selection and wheel forwarding ---
  if(seqCanvas){
    // forward wheel/touchpad events to scroller so scrolling works when pointer is over seqCanvas
    seqCanvas.addEventListener('wheel', (e)=>{
      if(!scroller) return;
      scroller.scrollTop += e.deltaY;
      scroller.scrollLeft += e.deltaX;
      scheduleRender();
      e.preventDefault();
    }, { passive: false });

    seqCanvas.addEventListener('mousedown', (e)=>{
      if(e.button !== 0) return;
      // Command-drag panning begins here as well
      if(isSpaceDown){
        isCmdDrag = true;
        dragStartX = e.clientX; dragStartY = e.clientY;
        dragStartScrollLeft = scroller ? scroller.scrollLeft : 0;
        dragStartScrollTop = scroller ? scroller.scrollTop : 0;
  try{ if(seqCanvas) seqCanvas.style.cursor = 'grabbing'; document.body.style.userSelect = 'none'; }catch(_){ }
        e.preventDefault();
        return;
      }
      // start rectangular selection in seq canvas — this replaces row/column selections
      // If Shift is held, expand/reduce from existing anchor/rect start; otherwise start a new rect
      selectedRows.clear(); selectedCols.clear();
      const row = rowFromClientY(e.clientY);
      const col = colFromClientXLocal(e.clientX);
      if(e.shiftKey){
        // If there is an existing rectangle, prepare to expand it by union with the new area.
        if(rectStartRow !== null && rectEndRow !== null && rectStartCol !== null && rectEndCol !== null){
          const rlo = Math.max(0, Math.min(rectStartRow, rectEndRow));
          const rhi = Math.min(rowCount-1, Math.max(rectStartRow, rectEndRow));
          const clo = Math.max(0, Math.min(rectStartCol, rectEndCol));
          const chi = Math.min(maxSeqLen-1, Math.max(rectStartCol, rectEndCol));
          rectOriginal = { rlo, rhi, clo, chi };
        } else {
          // no existing rect — treat this like a normal start with original equal to the clicked cell
          rectOriginal = { rlo: row, rhi: row, clo: col, chi: col };
        }
        // initialize live end to the clicked point (will be expanded during move)
        rectStartRow = rectOriginal.rlo; rectStartCol = rectOriginal.clo;
        rectEndRow = row; rectEndCol = col;
      } else {
        rectOriginal = null;
        rectStartRow = row; rectEndRow = row; rectStartCol = col; rectEndCol = col;
      }
  isRectSelecting = true;
  // set anchor points (anchor follows the selection corner)
  anchorRow = rectStartRow; anchorCol = rectStartCol;
  // initialize live selection sets for immediate feedback
  const rlo0 = Math.max(0, Math.min(rectStartRow, rectEndRow));
  const rhi0 = Math.min(rowCount-1, Math.max(rectStartRow, rectEndRow));
  const clo0 = Math.max(0, Math.min(rectStartCol, rectEndCol));
  const chi0 = Math.min(maxSeqLen-1, Math.max(rectStartCol, rectEndCol));
  selectedRows.clear(); selectedCols.clear();
  for(let r=rlo0;r<=rhi0;r++) selectedRows.add(r);
  for(let c=clo0;c<=chi0;c++) selectedCols.add(c);
      scheduleRender();
      e.preventDefault();
    });

    window.addEventListener('mousemove', (e)=>{
      if(isCmdDrag){
        // panning in progress
        if(!e.buttons || !isSpaceDown){ endCmdDrag(); return; }
        const dx = e.clientX - dragStartX;
        const dy = e.clientY - dragStartY;
        const targetLeft = Math.max(0, Math.round(dragStartScrollLeft - dx));
        const targetTop = Math.max(0, Math.round(dragStartScrollTop - dy));
        if(scroller){ scroller.scrollLeft = targetLeft; scroller.scrollTop = targetTop; }
        scheduleRender();
        return;
      }
      if(!isRectSelecting) return;
      rectEndRow = rowFromClientY(e.clientY);
      rectEndCol = colFromClientXLocal(e.clientX);
      // update live selection sets for rows and columns (single contiguous region)
      let rlo = Math.max(0, Math.min(rectStartRow, rectEndRow));
      let rhi = Math.min(rowCount-1, Math.max(rectStartRow, rectEndRow));
      let clo = Math.max(0, Math.min(rectStartCol, rectEndCol));
      let chi = Math.min(maxSeqLen-1, Math.max(rectStartCol, rectEndCol));
      // if we have an original rect (shift-expand), take the union of original and current drag box
      if(rectOriginal){
        rlo = Math.min(rlo, rectOriginal.rlo);
        rhi = Math.max(rhi, rectOriginal.rhi);
        clo = Math.min(clo, rectOriginal.clo);
        chi = Math.max(chi, rectOriginal.chi);
      }
      selectedRows.clear(); selectedCols.clear();
      for(let r=rlo;r<=rhi;r++) selectedRows.add(r);
      for(let c=clo;c<=chi;c++) selectedCols.add(c);
      scheduleRender();
    });

    window.addEventListener('mouseup', (e)=>{
      if(isCmdDrag){ endCmdDrag(); return; }
      if(!isRectSelecting) return;
      isRectSelecting = false;
      rectEndRow = rowFromClientY(e.clientY);
      rectEndCol = colFromClientXLocal(e.clientX);
      // finalize selection and set anchors (apply union if rectOriginal present)
      let rlo = Math.max(0, Math.min(rectStartRow, rectEndRow));
      let rhi = Math.min(rowCount-1, Math.max(rectStartRow, rectEndRow));
      let clo = Math.max(0, Math.min(rectStartCol, rectEndCol));
      let chi = Math.min(maxSeqLen-1, Math.max(rectStartCol, rectEndCol));
      if(rectOriginal){
        rlo = Math.min(rlo, rectOriginal.rlo);
        rhi = Math.max(rhi, rectOriginal.rhi);
        clo = Math.min(clo, rectOriginal.clo);
        chi = Math.max(chi, rectOriginal.chi);
      }
      selectedRows.clear(); selectedCols.clear();
      for(let r=rlo;r<=rhi;r++) selectedRows.add(r);
      for(let c=clo;c<=chi;c++) selectedCols.add(c);
      anchorRow = rhi; anchorCol = chi;
      rectOriginal = null;
      scheduleRender();
    });
  }

  // sync vertical scrolling: when right scrolls, update left; when left scrolls, update right
  let scrollingProgrammatic = false;
  // Attach scroll handler to the canonical alignment scroller (scroller).
  if(scroller){
    scroller.addEventListener('scroll', ()=>{
      if(!scrollingProgrammatic){
        scrollingProgrammatic = true;
        // mirror vertical scroll to left if it's a different element (keeps legacy logic working)
        try{ if(leftScroll && leftScroll !== scroller){ leftScroll.scrollTop = scroller.scrollTop; } }catch(e){}
        // header horizontal move is handled in drawHeader via transform
        scheduleRender();
        // ensure canvas CSS sizes stay in sync with the current viewport height
        try{
          const vh = scroller.clientHeight || window.innerHeight;
          if(seqCanvas) seqCanvas.style.height = vh + 'px';
          if(labelCanvas) labelCanvas.style.height = vh + 'px';
        }catch(e){}
        // small timeout to release flag
        setTimeout(()=>{ scrollingProgrammatic = false; }, 0);
        // ensure scroll positions are within bounds
        clampScrollPositions();
      }
    });
  }

  // when the right horizontally scrolls we only need to redraw header and sequences
  // re-enable snapping to integer character after scrolling stops (direction-aware)
  let snapTimeout = null;
  let scrollStartLeft = 0;
  let snapEnabled = snapToggle ? !!snapToggle.checked : true;
  if(snapToggle){
    snapToggle.addEventListener('change', ()=>{ snapEnabled = !!snapToggle.checked; });
  }

  // marker toggle (visual alignment aid)
  let markerEnabled = markerToggle ? !!markerToggle.checked : false;
  if(markerToggle){
    markerToggle.addEventListener('change', ()=>{ markerEnabled = !!markerToggle.checked; scheduleRender(); });
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
  window.addEventListener('keydown', (ke)=>{
    try{
      // Command-A: select all columns in the alignment (Cmd+A on macOS). Prevents browser select-all.
      if(ke.metaKey && (ke.key === 'a' || ke.code === 'KeyA')){
        try{ ke.preventDefault(); ke.stopImmediatePropagation(); }catch(_){ }
        // clear row/rect selection and select all columns
        selectedRows.clear();
        clearRectSelection();
        selectedCols.clear();
        for(let c=0;c<maxSeqLen;c++) selectedCols.add(c);
        anchorCol = Math.max(0, maxSeqLen - 1);
        scheduleRender();
        return;
      }
      // Mask edit shortcuts: Alt + '+' to set selected columns to expanded ('1'),
      // Alt + '-' to set selected columns to compressed ('0').
  // Use Command (meta) as the modifier for mask edits (Cmd + '=' / Cmd + '-') per user request.
  // Note: some browsers may still reserve Cmd+Plus/Minus for zoom; we call preventDefault() to try to stop it.
  const mod = ke.metaKey;
  // Accept several possible key reports for '+' to be robust across layouts and OSes.
  const isPlus = (ke.key === '+') || (ke.key === '=') || (ke.code === 'Equal') || ke.code === 'NumpadAdd';
      const isMinus = (ke.key === '-') || ke.code === 'Minus' || ke.code === 'NumpadSubtract';
      if(mod && isPlus){
        // try to prevent default browser zoom (may still be honored by some browsers), and stop propagation
        try{ ke.preventDefault(); ke.stopImmediatePropagation(); }catch(_){ }
        setMaskBitsForCols(selectedCols, '1');
        return;
      }
      if(mod && isMinus){
        try{ ke.preventDefault(); ke.stopImmediatePropagation(); }catch(_){ }
        setMaskBitsForCols(selectedCols, '0');
        return;
      }
      if(ke.code === 'Space' || ke.key === ' '){
        const ae = document.activeElement;
        // prevent default page scroll when space is used as modifier and focus is on relevant elements
        if(ae === document.body || ae === seqCanvas || ae === labelCanvas || ae === headerCanvas){
          ke.preventDefault();
        }
        isSpaceDown = true;
        updateSpaceCursor();
      }
    }catch(_){ }
  });
  window.addEventListener('keyup', (ke)=>{ if(ke.code === 'Space' || ke.key === ' '){ isSpaceDown = false; updateSpaceCursor(); } });
  window.addEventListener('blur', ()=>{ isSpaceDown = false; updateSpaceCursor(); });
  if(scroller){
    scroller.addEventListener('mousedown', (e)=>{
      // Only start panning if Space key is held during mousedown
      if(!isSpaceDown) return;
      isCmdDrag = true;
      dragStartX = e.clientX;
      dragStartY = e.clientY;
      dragStartScrollLeft = scroller.scrollLeft;
      dragStartScrollTop = scroller.scrollTop;
  try{ if(seqCanvas) seqCanvas.style.cursor = 'grabbing'; document.body.style.userSelect = 'none'; }catch(_){ }
      e.preventDefault();
    });

    window.addEventListener('mousemove', (e)=>{
      if(!isCmdDrag) return;
      // if mouse button released or space key released, end drag
      if(!e.buttons || !isSpaceDown){ endCmdDrag(); return; }
      const dx = e.clientX - dragStartX;
      const dy = e.clientY - dragStartY;
      // invert drag to pan content (drag right -> scroll left)
      const targetLeft = Math.max(0, Math.round(dragStartScrollLeft - dx));
      const targetTop = Math.max(0, Math.round(dragStartScrollTop - dy));
      if(scroller){ scroller.scrollLeft = targetLeft; scroller.scrollTop = targetTop; }
      scheduleRender();
    });

    window.addEventListener('mouseup', ()=>{ endCmdDrag(); });
    // also cancel on blur (e.g., switching apps)
    window.addEventListener('blur', ()=>{ endCmdDrag(); });
  }

  function snapScrollToChar(startLeft){
    const cur = scroller ? scroller.scrollLeft : 0;
    if(!colOffsets || colOffsets.length < 2){
      // fallback to old behaviour
      let target;
      if(cur > startLeft) target = Math.ceil(cur / CHAR_WIDTH) * CHAR_WIDTH;
      else if(cur < startLeft) target = Math.floor(cur / CHAR_WIDTH) * CHAR_WIDTH;
      else target = Math.round(cur / CHAR_WIDTH) * CHAR_WIDTH;
      if(target !== cur){ scrollingProgrammatic = true; if(scroller) scroller.scrollLeft = target; scheduleRender(); setTimeout(()=>{ scrollingProgrammatic = false; }, 20); }
      return;
    }
    // determine snap direction and pick column boundary accordingly
    let target = cur;
    if(cur > startLeft){
      const idx = colIndexFromOffset(cur);
      target = colOffsets[Math.min(maxSeqLen, idx + 1)];
    } else if(cur < startLeft){
      const idx = colIndexFromOffset(cur);
      target = colOffsets[idx];
    } else {
      const idx = colIndexFromOffset(cur);
      const leftB = colOffsets[idx];
      const rightB = colOffsets[idx+1] || leftB + CHAR_WIDTH;
      target = (cur - leftB) < (rightB - cur) ? leftB : rightB;
    }
    if(target !== cur){
      scrollingProgrammatic = true;
      if(scroller) scroller.scrollLeft = target;
      scheduleRender();
      setTimeout(()=>{ scrollingProgrammatic = false; }, 20);
    }
  }

  if(scroller){
    scroller.addEventListener('scroll', ()=>{
      // schedule render immediately so header follows
      scheduleRender();
      // throttle diagnostic logging while user scrolls
      if(window.__diagScrollTimeout) clearTimeout(window.__diagScrollTimeout);
      window.__diagScrollTimeout = setTimeout(()=>{ logLayoutDiagnostics('scroll'); }, 50);
      // if snapping disabled, do nothing else
      if(!snapEnabled) return;
      // record scroll start position when a new scroll sequence begins
      if(snapTimeout === null){
        scrollStartLeft = scroller.scrollLeft;
      }
      // debounce snapping until user stops scrolling
      if(snapTimeout) clearTimeout(snapTimeout);
      snapTimeout = setTimeout(()=>{ snapScrollToChar(scrollStartLeft); snapTimeout = null; }, 60);
    });
  }

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
  }catch(e){
    console.error('Initialization error', e);
    try{ setStatus('INIT ERROR: ' + (e && e.message ? e.message : String(e))); }catch(_){}
    // rethrow so errors appear in console as well
    throw e;
  }

})();