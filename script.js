// script.js - virtualized alignment canvas renderer
// Expects `alignment` to be provided by alignment.js (loaded before this script in index.html)

(function(){

  const __statusEl = document.getElementById('init-status');
  // Feature flag: show a centered translucent status box during initialization
  const USE_CENTER_STATUS = true;
  let __centerStatusEl = null;
  let __centerStatusText = null;
  function ensureCenterStatus(){
    if(!USE_CENTER_STATUS) return null;
    if(__centerStatusEl) return __centerStatusEl;
    try{
      __centerStatusEl = document.getElementById('center-status');
      if(!__centerStatusEl){
        __centerStatusEl = document.createElement('div');
        __centerStatusEl.id = 'center-status';
        __centerStatusEl.setAttribute('role','status');
        __centerStatusEl.setAttribute('aria-live','polite');

        const spinner = document.createElement('div');
        spinner.className = 'center-spinner';
        const txt = document.createElement('div');
        txt.className = 'center-status-text';
        txt.textContent = '';
        __centerStatusText = txt;

        __centerStatusEl.appendChild(spinner);
        __centerStatusEl.appendChild(txt);
        document.body.appendChild(__centerStatusEl);
      } else {
        __centerStatusText = __centerStatusEl.querySelector('.center-status-text') || __centerStatusText;
      }
    }catch(e){ __centerStatusEl = null; }
    return __centerStatusEl;
  }
  function setStatus(msg){
    try{
      // clear any existing auto-clear timer whenever status changes
      try{ if(typeof statusAutoClearTimer !== 'undefined' && statusAutoClearTimer){ clearTimeout(statusAutoClearTimer); statusAutoClearTimer = null; } }catch(_){ }
      if(USE_CENTER_STATUS){
        const el = ensureCenterStatus();
        if(el){
          if(msg){
            if(__centerStatusText) __centerStatusText.textContent = msg;
            el.classList.add('visible');
            // Auto-clear the initial 'checking alignment data...' message after a short timeout
            try{
              if(msg === 'checking alignment data...'){
                statusAutoClearTimer = setTimeout(()=>{
                  try{ setStatus(null); console.warn('Initialization status auto-cleared after timeout — check console for errors.'); }catch(_){ }
                }, 5000);
              }
            }catch(_){ }
          } else {
            el.classList.remove('visible');
          }
          return;
        }
      }
      // fallback to inline status element if present
      if(__statusEl) __statusEl.textContent = msg || '';
    }catch(e){}
  }

  // Note: scheduling is now handled by SealionViewer; older safeScheduleRender
  // helper removed in favor of direct, guarded calls to `viewer.scheduleRender()`.


    // Button to set the consensus sequence as the reference and clear any selected row
    const diffConsensusBtn = document.getElementById('diff-consensus-btn');
    if(diffConsensusBtn){
          diffConsensusBtn.addEventListener('click', ()=>{
        try{
          // compute or reuse consensus
          const cons = (window && window.consensusSequence) ? window.consensusSequence : alignment.computeConsensusSequence();
          if(!cons){ console.warn('No consensus available to set as reference'); return; }
          try{ window.reference = String(cons); }catch(_){ reference = String(cons); }
          // clear any selected row (user asked to clear the previously selected row)
          viewer.clearSelectionSets();
          // refresh reference state (will set refIndex if any row exactly matches consensus)
          // note: we intentionally do NOT auto-select any matching row when the reference
          // is the consensus; rows that happen to equal the consensus should be treated
          // the same as other sequences (no special highlight).
          refreshRefStr();
          // enable reference colouring so effect is visible
          refModeEnabled = true;
          try{ window.refModeEnabled = true; }catch(_){ }
          if(viewer){ try{ viewer.refModeEnabled = true; }catch(_){ } }
          console.info('Set reference to consensus');
          viewer.scheduleRender();
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

  // prefer the single scroll root when present — we'll override these below if needed
  let leftScroll = document.getElementById('left-scroll');
  let rightScroll = document.getElementById('right-scroll');
  const seqSpacer = document.getElementById('seq-spacer');
  const leftSpacer = document.getElementById('left-spacer');
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
  // Re-query DOM at attach time to pick up any canvases/spacers the viewer
  // may have created during its construction. Fall back to viewer-held
  // refs when available. This avoids passing stale `null` variables that
  // were captured earlier when the DOM didn't yet include the canvases.
  const realHeaderCanvas = document.getElementById('header-canvas') || (viewer && viewer.headerCanvas) || null;
  const realSeqCanvas = document.getElementById('seq-canvas') || (viewer && viewer.seqCanvas) || null;
  const realLabelCanvas = document.getElementById('labels-canvas') || (viewer && viewer.labelCanvas) || null;
  const realConsensusCanvas = document.getElementById('consensus-canvas') || (viewer && viewer.consensusCanvas) || null;
  const realOverviewCanvas = document.getElementById('overview-canvas') || (viewer && viewer.overviewCanvas) || null;
  const realLabelsHeaderCanvas = document.getElementById('labels-header-canvas') || (viewer && viewer.labelsHeaderCanvas) || null;
  const realSeqSpacer = document.getElementById('seq-spacer') || (viewer && viewer.seqSpacer) || seqSpacer || null;
  const realLeftSpacer = document.getElementById('left-spacer') || (viewer && viewer.leftSpacer) || leftSpacer || null;
  const realLeftScroll = document.getElementById('left-scroll') || (viewer && viewer.leftScroll) || leftScroll || null;
  const realLabelDivider = document.getElementById('label-divider') || (viewer && viewer.labelDivider) || null;

  viewer.attachInteractionHandlers({
    headerCanvas: realHeaderCanvas,
    seqCanvas: realSeqCanvas,
    labelCanvas: realLabelCanvas,
    consensusCanvas: realConsensusCanvas,
    overviewCanvas: realOverviewCanvas,
    labelsHeaderCanvas: realLabelsHeaderCanvas,
    labelDivider: realLabelDivider,
    scroller: scroller,
    seqSpacer: realSeqSpacer,
    leftSpacer: realLeftSpacer,
    leftScroll: realLeftScroll,
    callbacks: {
      setColSelectionToRange: function(a,b){ const lo = Math.max(0, Math.min(a,b)); const hi = Math.min(maxSeqLen-1, Math.max(a,b)); const cols = []; for(let c=lo;c<=hi;c++) cols.push(c); viewer.setSelectedCols(cols); },
      addRangeToColSelection: function(a,b){ const lo = Math.max(0, Math.min(a,b)); const hi = Math.min(maxSeqLen-1, Math.max(a,b)); const cur = new Set(viewer.getSelectedCols()); for(let c=lo;c<=hi;c++) cur.add(c); viewer.setSelectedCols(Array.from(cur)); },
      setSelectionToRange: function(a,b){ const lo = Math.max(0, Math.min(a,b)); const hi = Math.min(rowCount-1, Math.max(a,b)); const rows = []; for(let r=lo;r<=hi;r++) rows.push(r); viewer.setSelectedRows(rows); viewer.scheduleRender(); },
      addRangeToSelection: function(a,b){ const lo = Math.max(0, Math.min(a,b)); const hi = Math.min(rowCount-1, Math.max(a,b)); const cur = new Set(viewer.getSelectedRows()); for(let r=lo;r<=hi;r++) cur.add(r); viewer.setSelectedRows(Array.from(cur)); viewer.scheduleRender(); },
      clearRectSelection: function(){ viewer.clearRectSelection(); },
      clearSelectionSets: function(){ viewer.clearSelectionSets(); },
      updateRectSelection: function(r0,r1,c0,c1,orig){ viewer.updateRectSelection(r0,r1,c0,c1,orig); },
      finalizeRectSelection: function(r0,r1,c0,c1,orig){ viewer.finalizeRectSelection(r0,r1,c0,c1,orig); }
    }
  });
        } catch (e) {
          console.error('Failed to attach interaction handlers to SealionViewer', e);
        }
        // Force an initial geometry build and draw so instance-driven scheduling
        // has concrete colOffsets and canvas backings on first paint. Avoid
        // referencing local variables that may still be in the TDZ by only
        // consulting `viewer` or `window` globals here.
        try{
          const _CHAR_WIDTH = getViewerProp('CHAR_WIDTH', 12, 'charWidth');
          const _EXPANDED_RIGHT_PAD = getViewerProp('EXPANDED_RIGHT_PAD', 2);
          const _REDUCED_COL_WIDTH = getViewerProp('REDUCED_COL_WIDTH', 1);
          // Don't reference local `maskEnabled`/`maskStr` directly (they are
          // declared later in this file). Prefer window globals if present.
          const _maskEnabled = (typeof window !== 'undefined' && typeof window.maskEnabled !== 'undefined') ? window.maskEnabled : true;
          // maxSeqLen was declared earlier in this file before ensureViewer() is
          // first invoked; if not present fallback to any viewer-derived value.
          let _maxSeqLen = 0;
          try{ if(typeof maxSeqLen !== 'undefined') _maxSeqLen = maxSeqLen; }catch(_){ /* ignore TDZ */ }
          if(!_maxSeqLen){ try{ if(viewer && viewer.colOffsets && viewer.colOffsets.length) _maxSeqLen = Math.max(0, viewer.colOffsets.length - 1); }catch(_){ } }
          // prefer explicit window.maskStr or window.mask if available; otherwise default to all '1's
          const _maskStr = (typeof window !== 'undefined' && typeof window.maskStr !== 'undefined') ? window.maskStr : ((typeof window !== 'undefined' && typeof window.mask !== 'undefined') ? window.mask : '1'.repeat(Math.max(0,_maxSeqLen)));
          const initial = viewer.buildColOffsetsFor(_maskEnabled, { maxSeqLen: _maxSeqLen, CHAR_WIDTH: _CHAR_WIDTH, EXPANDED_RIGHT_PAD: _EXPANDED_RIGHT_PAD, REDUCED_COL_WIDTH: _REDUCED_COL_WIDTH, maskStr: _maskStr });
          viewer.colOffsets = initial;
          viewer.setCanvasCSSSizes();
          viewer.resizeBackings();
          const _font = getViewerProp('FONT', '14px monospace'); const _rowH = getViewerProp('ROW_HEIGHT', 20); viewer.measureTextVerticalOffset({ FONT: _font, ROW_HEIGHT: _rowH });
          viewer.scheduleRender();
          // Hide any initialization overlay now that the viewer was created
          try{ setStatus(null); }catch(_){ }
        }catch(e){ console.warn('ensureViewer: initial build/render failed', e); }
        return viewer;
    }
    // SealionViewer not available yet — try again shortly
    setTimeout(ensureViewer, 200);
    return null;
  }
  const searchInput = document.getElementById('search-input');
  const searchNextBtn = document.getElementById('search-next');
  
  // divider element for resizing the labels column
  const labelDivider = document.getElementById('label-divider');
  const maskToggle = document.getElementById('mask-toggle');
  const colourAllBtn = document.getElementById('colour-all-btn');
  const colourDiffBtn = document.getElementById('colour-diff-btn');

  // Visual constants (fonts, sizes, colors) are provided by the SealionViewer
  // instance and its `DEFAULTS`. Use `getViewerProp(name, fallback)` to read
  // values. Local fallbacks are intentionally removed to centralize config.

  const rows = alignment.getSequences();
  const rowCount = alignment.getSequenceCount();
  const maxSeqLen = alignment.getMaxSeqLen();

  
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
  // Mask compression is always enabled; start with a mask of all '1's (no actual compression)
  let maskEnabled = true;
  let refModeEnabled = false;

    // Apply constant mask button
    const applyConstantMaskBtn = document.getElementById('apply-constant-mask-btn');
    if(applyConstantMaskBtn){
      applyConstantMaskBtn.addEventListener('click', ()=>{
        try{
          if(!viewer){
            console.error('Viewer not available');
            return;
          }
          
          const cm = alignment.computeConstantMask();
          if(!cm){
            console.warn('computeConstantMask returned no mask');
            return;
          }
          
          // Get current mask from viewer
          let currentMask = viewer.maskStr || (typeof window.mask !== 'undefined' ? String(window.mask) : null);
          if(!currentMask || currentMask.length < cm.length){
            currentMask = '1'.repeat(cm.length);
          }
          
          // AND the new mask with the current mask (collapse if either says to collapse)
          const newMask = andMasks(currentMask, String(cm));
          
          // Update the mask in viewer and window
          try{ 
            window.mask = newMask; 
            window.maskStr = newMask; 
            viewer.maskStr = newMask; 
          }catch(_){ }
          
          console.info('apply-constant-mask: applied with AND (length=' + newMask.length + ')');
          
          // Trigger the mask transition with current maskEnabled state
          if(typeof viewer.startMaskTransition === 'function'){
            viewer.startMaskTransition(!!viewer.maskEnabled);
          }
        }catch(e){ console.warn('apply-constant-mask failed', e); }
      });
    }
  
  // Colour all sites button
  if(colourAllBtn){
    colourAllBtn.addEventListener('click', ()=>{
      refModeEnabled = false;
      try{ window.refModeEnabled = false; }catch(_){ }
      if(viewer){ try{ viewer.refModeEnabled = false; }catch(_){ } }
      console.info('Colour mode: all sites');
      viewer.scheduleRender();
    });
  }

  // Colour differences only button
  if(colourDiffBtn){
    colourDiffBtn.addEventListener('click', ()=>{
      // Check if a reference is set, if not, set consensus as reference
      const hasReference = !!(window && window.reference);
      if(!hasReference){
        console.info('No reference set, using consensus');
        const cons = (window && window.consensusSequence) ? window.consensusSequence : alignment.computeConsensusSequence();
        if(cons){
          try{ window.reference = String(cons); }catch(_){ reference = String(cons); }
        } else {
          console.warn('No consensus available to set as reference');
        }
      }
      
      refModeEnabled = true;
      refreshRefStr();
      try{ window.refModeEnabled = true; }catch(_){ }
      if(viewer){ try{ viewer.refModeEnabled = true; }catch(_){ } }
      console.info('Colour mode: differences only');
      viewer.scheduleRender();
    });
  }

  // Sort by original order button
  const sortOriginalBtn = document.getElementById('sort-original-btn');
  if(sortOriginalBtn){
    sortOriginalBtn.addEventListener('click', ()=>{
      alignment.orderByOriginalIndex();
      viewer.alignment = alignment;
      viewer.cancelRender();
      viewer.scheduleRender();
    });
  }

  // Sort by label button
  const sortLabelBtn = document.getElementById('sort-label-btn');
  if(sortLabelBtn){
    sortLabelBtn.addEventListener('click', ()=>{
      alignment.orderByLabel();
      viewer.alignment = alignment;
      viewer.cancelRender();
      viewer.scheduleRender();
    });
  }

  // Sort by selected column button
  const sortColumnBtn = document.getElementById('sort-column-btn');
  if(sortColumnBtn){
    sortColumnBtn.addEventListener('click', ()=>{
      // Get selected columns
      let selectedCols = viewer.getSelectedCols();
      
      // Convert Set to Array
      selectedCols = Array.from(selectedCols);
      
      if(selectedCols.length === 0){
        alert('No column selected. Please select a column first by clicking on a column in the alignment.');
        return;
      }
      
      // Use the first selected column for sorting
      const siteIndex = selectedCols[0];
      
      alignment.orderBySite(siteIndex);
      viewer.alignment = alignment;
      viewer.cancelRender();
      viewer.scheduleRender();
    });
  }

  // Sort by label (reverse) button
  const sortLabelReverseBtn = document.getElementById('sort-label-reverse-btn');
  if(sortLabelReverseBtn){
    sortLabelReverseBtn.addEventListener('click', ()=>{
      alignment.orderByLabel(true);
      viewer.alignment = alignment;
      viewer.cancelRender();
      viewer.scheduleRender();
    });
  }

  // Sort by selected column (reverse) button
  const sortColumnReverseBtn = document.getElementById('sort-column-reverse-btn');
  if(sortColumnReverseBtn){
    sortColumnReverseBtn.addEventListener('click', ()=>{
      // Get selected columns
      let selectedCols = viewer.getSelectedCols();
      
      // Convert Set to Array
      selectedCols = Array.from(selectedCols);
      
      if(selectedCols.length === 0){
        alert('No column selected. Please select a column first by clicking on a column in the alignment.');
        return;
      }
      
      // Use the first selected column for sorting
      const siteIndex = selectedCols[0];
      
      alignment.orderBySite(siteIndex, true);
      viewer.alignment = alignment;
      viewer.cancelRender();
      viewer.scheduleRender();
    });
  }

  // Sort by start position button
  const sortStartPosBtn = document.getElementById('sort-start-pos-btn');
  if(sortStartPosBtn){
    sortStartPosBtn.addEventListener('click', ()=>{
      alignment.orderByStartPos();
      viewer.alignment = alignment;
      viewer.cancelRender();
      viewer.scheduleRender();
    });
  }

  // Sort by start position (reverse) button
  const sortStartPosReverseBtn = document.getElementById('sort-start-pos-reverse-btn');
  if(sortStartPosReverseBtn){
    sortStartPosReverseBtn.addEventListener('click', ()=>{
      alignment.orderByStartPos(true);
      viewer.alignment = alignment;
      viewer.cancelRender();
      viewer.scheduleRender();
    });
  }

  // Sort by sequence length button
  const sortSeqLengthBtn = document.getElementById('sort-seq-length-btn');
  if(sortSeqLengthBtn){
    sortSeqLengthBtn.addEventListener('click', ()=>{
      alignment.orderBySeqLength();
      viewer.alignment = alignment;
      viewer.cancelRender();
      viewer.scheduleRender();
    });
  }

  // Sort by sequence length (reverse) button
  const sortSeqLengthReverseBtn = document.getElementById('sort-seq-length-reverse-btn');
  if(sortSeqLengthReverseBtn){
    sortSeqLengthReverseBtn.addEventListener('click', ()=>{
      alignment.orderBySeqLength(true);
      viewer.alignment = alignment;
      viewer.cancelRender();
      viewer.scheduleRender();
    });
  }



  // Wire up the new apply buttons
  const applyConstantAmbiguousBtn = document.getElementById('apply-constant-ambiguous-btn');
  if(applyConstantAmbiguousBtn){
    applyConstantAmbiguousBtn.addEventListener('click', ()=>{
      const cm = alignment.computeConstantMaskAllowN();
      if(!cm){
        console.warn('computeConstantMaskAllowN returned no mask');
        return;
      }
      
      // Get current mask from viewer
      let currentMask = viewer.maskStr || (typeof window.mask !== 'undefined' ? String(window.mask) : null);
      if(!currentMask || currentMask.length < cm.length){
        currentMask = '1'.repeat(cm.length);
      }
      
      // AND the new mask with the current mask (collapse if either says to collapse)
      const newMask = andMasks(currentMask, String(cm));
      
      // Update the mask in viewer and window
      try{ 
        window.mask = newMask; 
        window.maskStr = newMask; 
        viewer.maskStr = newMask; 
      }catch(_){ }
      
      console.info('apply-constant-ambiguous: applied with AND (length=' + newMask.length + ')');
      
      // Trigger the mask transition with current maskEnabled state
      viewer.startMaskTransition(!!viewer.maskEnabled);
    });
  }

  const applyConstantGappedBtn = document.getElementById('apply-constant-gapped-btn');
  if(applyConstantGappedBtn){
    applyConstantGappedBtn.addEventListener('click', ()=>{
      const cm = alignment.computeConstantMaskAllowNAndGaps();
      if(!cm){
        console.warn('computeConstantMaskAllowNAndGaps returned no mask');
        return;
      }
      
      // Get current mask from viewer
      let currentMask = viewer.maskStr || (typeof window.mask !== 'undefined' ? String(window.mask) : null);
      if(!currentMask || currentMask.length < cm.length){
        currentMask = '1'.repeat(cm.length);
      }
      
      // AND the new mask with the current mask (collapse if either says to collapse)
      const newMask = andMasks(currentMask, String(cm));
        
      // Update the mask in viewer and window
      try{ 
        window.mask = newMask; 
        window.maskStr = newMask; 
        viewer.maskStr = newMask; 
      }catch(_){ }
      
      console.info('apply-constant-gapped: applied with AND (length=' + newMask.length + ')');
      
      // Trigger the mask transition with current maskEnabled state
      viewer.startMaskTransition(!!viewer.maskEnabled);
    });
  }

  // Wire up expand all button
  const expandAllBtn = document.getElementById('expand-all-btn');
  if(expandAllBtn){
    expandAllBtn.addEventListener('click', ()=>{
      console.info('Expand all button clicked');
      
      // Create a set of all column indices
      const seqLen = viewer.maxSeqLen || (rows && rows[0] && rows[0].sequence ? rows[0].sequence.length : 0);
      const allCols = new Set();
      for(let i = 0; i < seqLen; i++){
        allCols.add(i);
      }
      
      // Use setMaskBitsForCols to expand all columns
      viewer.setMaskBitsForCols(allCols, '1');
      console.info('expand-all: expanded all ' + seqLen + ' sites');
    });
  }

  // Wire up collapse all button
  const collapseAllBtn = document.getElementById('collapse-all-btn');
  if(collapseAllBtn){
    collapseAllBtn.addEventListener('click', ()=>{
      console.info('Collapse all button clicked');
      
      // Create a set of all column indices
      const seqLen = viewer.maxSeqLen || (rows && rows[0] && rows[0].sequence ? rows[0].sequence.length : 0);
      const allCols = new Set();
      for(let i = 0; i < seqLen; i++){
        allCols.add(i);
      }
      
      // Use setMaskBitsForCols to collapse all columns
      viewer.setMaskBitsForCols(allCols, '0');
      console.info('collapse-all: collapsed all ' + seqLen + ' sites');
    });
  }

    // Button to set the currently selected sequence as the reference
    const setRefBtn = document.getElementById('set-ref-btn');
    if(setRefBtn){
      setRefBtn.addEventListener('click', ()=>{
        try{
          // prefer viewer.anchorRow if available, else first selected row, else top visible row (0)
          let idx = null;
          if(viewer.anchorRow !== undefined && viewer.anchorRow !== null) idx = viewer.anchorRow;
          if(idx === null){ const s = viewer.getSelectedRows(); if(s && s.size > 0) idx = Array.from(s)[0]; else idx = 0; }
          idx = Math.max(0, Math.min(rowCount - 1, idx));
          const seq = (rows[idx] && rows[idx].sequence) ? rows[idx].sequence : null;
          if(!seq){ console.warn('No sequence available at selected row to use as reference'); return; }
          try{ window.reference = String(seq); }catch(_){ reference = String(seq); }
          refreshRefStr();
          // Ensure the chosen row is used as the reference index (avoid matching the first identical sequence elsewhere)
          try{ refIndex = idx; window.__refIndex = refIndex; }catch(_){ }
          // enable reference colouring so effect is visible
          refModeEnabled = true;
          try{ window.refModeEnabled = true; }catch(_){ }
          if(viewer){ try{ viewer.refModeEnabled = true; }catch(_){ } }
          console.info('Set reference to row', idx);
          viewer.scheduleRender();
        }catch(e){ console.warn('set-ref failed', e); }
      });
    }

    // Font size controls: increase/decrease text (labels and nucleotides)
    const fontIncreaseBtn = document.getElementById('font-increase-btn');
    const fontDecreaseBtn = document.getElementById('font-decrease-btn');
    console.info('Font buttons found:', { increase: !!fontIncreaseBtn, decrease: !!fontDecreaseBtn });
    
    if(fontIncreaseBtn) {
      fontIncreaseBtn.addEventListener('click', ()=> {
        console.info('Increase button clicked');
        viewer.updateFontSize(1);
      });
    }
    if(fontDecreaseBtn) {
      fontDecreaseBtn.addEventListener('click', ()=> {
        console.info('Decrease button clicked');
        viewer.updateFontSize(-1);
      });
    }
    
    // Keyboard shortcuts
    window.addEventListener('keydown', (e)=>{
      // Cmd+0 (or Ctrl+0) to reset font size
      if((e.metaKey || e.ctrlKey) && e.key === '0'){
        e.preventDefault();
        console.info('Reset font size shortcut triggered (Cmd+0)');
        viewer.resetFontSize();
      }
      // Cmd+G (or Ctrl+G) to search next
      if((e.metaKey || e.ctrlKey) && e.key === 'g'){
        e.preventDefault();
        if(viewer && viewer.searchMatches && viewer.searchMatches.length > 0){
          viewer.nextMatch();
        }
      }
    });

    // Column collapse/expand controls
    const collapseColumnsBtn = document.getElementById('collapse-columns-btn');
    const expandColumnsBtn = document.getElementById('expand-columns-btn');
    console.info('Column buttons found:', { collapse: !!collapseColumnsBtn, expand: !!expandColumnsBtn });
    
    if(collapseColumnsBtn) {
      collapseColumnsBtn.addEventListener('click', ()=> {
        console.info('Collapse columns button clicked');
        viewer.setMaskBitsForCols(viewer.selectedCols || new Set(), '0');
      });
    }
    
    if(expandColumnsBtn) {
      expandColumnsBtn.addEventListener('click', ()=> {
        console.info('Expand columns button clicked');
        viewer.setMaskBitsForCols(viewer.selectedCols || new Set(), '1');
      });
    }

    // Search functionality
    if(searchInput){
      searchInput.addEventListener('keydown', (e)=>{
        if(e.key === 'Enter'){
          e.preventDefault();
            
          const query = searchInput.value.trim();
          if(!query){
            return;
          }
          
          if(e.shiftKey){
            // Shift+Enter goes to previous match
            viewer.previousMatch();
          } else {
            // Enter performs search or goes to next match
            if(viewer.searchMatches && viewer.searchMatches.length > 0){
              // Already have matches, go to next
              viewer.nextMatch();
            } else {
              // No matches yet, perform search
              viewer.performSearch(query);
            }
          }
        }
      });
      
      // Clear search results when input changes
      searchInput.addEventListener('input', ()=>{
            viewer.searchMatches = [];
            viewer.currentMatchIndex = -1;
      });
    }
    
    if(searchNextBtn){
      searchNextBtn.addEventListener('click', ()=>{
        try{
          if(!viewer){
            console.warn('Viewer not available for search');
            return;
          }
          
          const query = searchInput ? searchInput.value.trim() : '';
          
          if(viewer.searchMatches && viewer.searchMatches.length > 0){
            // Already have matches, go to next
            if(typeof viewer.nextMatch === 'function'){
              viewer.nextMatch();
            } else {
              console.warn('Viewer nextMatch method not available');
            }
          } else if(query){
            // No matches yet but have a query, perform search
            if(typeof viewer.performSearch === 'function'){
              viewer.performSearch(query);
            } else {
              console.warn('Viewer performSearch method not available');
            }
          }
        }catch(e){ console.warn('Search next button failed', e); }
      });
    }

    // Help button - load and display instructions
    const helpBtn = document.getElementById('help-btn');
    if(helpBtn){
      helpBtn.addEventListener('click', async ()=>{
        try{
          const helpModal = document.getElementById('helpModal');
          const helpContent = document.getElementById('help-content');
          
          if(!helpModal || !helpContent) return;
          
          // Show the modal
          const modal = new bootstrap.Modal(helpModal);
          modal.show();
          
          // Load the markdown content if not already loaded
          if(helpContent.querySelector('.spinner-border')){
            try{
              const response = await fetch('instructions.md');
              const markdown = await response.text();
              
              // Convert markdown to HTML (basic conversion)
              let html = markdown
                // Headers
                .replace(/^### (.*$)/gim, '<h4>$1</h4>')
                .replace(/^## (.*$)/gim, '<h3>$1</h3>')
                .replace(/^# (.*$)/gim, '<h2>$1</h2>')
                // Bold
                .replace(/\*\*(.*?)\*\*/gim, '<strong>$1</strong>')
                // Italic
                .replace(/\*(.*?)\*/gim, '<em>$1</em>')
                // Code inline
                .replace(/`([^`]+)`/gim, '<code>$1</code>')
                // Lists
                .replace(/^\- (.*$)/gim, '<li>$1</li>')
                .replace(/^(\d+)\. (.*$)/gim, '<li>$2</li>')
                // Paragraphs
                .replace(/\n\n/g, '</p><p>')
                // Line breaks
                .replace(/\n/g, '<br>');
              
              // Wrap in paragraph tags
              html = '<p>' + html + '</p>';
              
              // Clean up list formatting
              html = html.replace(/(<li>.*?<\/li>)/gis, (match) => {
                return '<ul>' + match.replace(/<br>/g, '') + '</ul>';
              });
              
              // Clean up consecutive ul tags
              html = html.replace(/<\/ul><ul>/g, '');
              
              helpContent.innerHTML = html;
            }catch(e){
              helpContent.innerHTML = '<div class="alert alert-warning">Failed to load help content. Please see instructions.md in the repository.</div>';
              console.error('Failed to load help content', e);
            }
          }
        }catch(e){ console.warn('Help button failed', e); }
      });
    }

  // Populate local maskStr from utils
  try{ maskStr = (window && window.refreshMaskStr) ? window.refreshMaskStr() : '1'.repeat(maxSeqLen); }catch(_){ maskStr = '1'.repeat(maxSeqLen); }

  // initial sizing + measure
  viewer.measureCharWidth(getViewerProp('FONT', ''), { apply: true, maskEnabled: !!maskEnabled });
  viewer.measureRowHeightFromFonts({ apply: true });
  viewer.setCanvasCSSSizes();
  // give the spacer a moment to size (if DOM still settling) then measure real width and backings
  requestAnimationFrame(()=>{
    try{
      viewer.measureCharWidthFromReal();
      viewer.measureRowHeightFromFonts({ apply: true });
      viewer.setCanvasCSSSizes();
      viewer.measureTextVerticalOffset();
      viewer.scheduleBackingResize();
    }catch(e){
      console.error('Initialization rAF handler failed', e);
    }finally{
      // initialization complete (successful or not): hide the status overlay if present
      try{ setStatus(null); }catch(_){ }
    }
  });

  // reflow handler: when the spacer's width might change (e.g., charset measurement), recompute
  let resizeDebounce;
  const observer = new ResizeObserver(()=>{
    clearTimeout(resizeDebounce);
    resizeDebounce = setTimeout(()=>{
      viewer.measureCharWidthFromReal();
      viewer.setCanvasCSSSizes();
      viewer.measureTextVerticalOffset();
      viewer.scheduleBackingResize();
    }, 50);
  });
  if(scroller) observer.observe(scroller);

  // Snapping and scroll handling are delegated to the SealionViewer instance.

  // on window resize recompute backings
  window.addEventListener('resize', ()=>{
    viewer.setCanvasCSSSizes();
    viewer.scheduleBackingResize();
  });

  // compute and expose constantMask at initialization
  try{ const cm = alignment.computeConstantMask(); window.constantMask = cm; }catch(_){ }
  try{ const cam = alignment.computeConstantMaskAllowN(); window.constantAmbiguousMask = cam; }catch(_){ }
  try{ const cgm = alignment.computeConstantMaskAllowNAndGaps(); window.constantGappedMask = cgm; }catch(_){ }
  try{ const cons = alignment.computeConsensusSequence(); window.consensusSequence = cons; }catch(_){ }
  // all initialization completed
  setStatus('initialized');

}

)();