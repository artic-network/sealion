// script.js - virtualized alignment canvas renderer
// Expects `alignment` to be provided by alignment.js (loaded before this script in index.html)

(function () {

  const __statusEl = document.getElementById('init-status');
  // Feature flag: show a centered translucent status box during initialization
  const USE_CENTER_STATUS = true;
  let __centerStatusEl = null;
  let __centerStatusText = null;
  function ensureCenterStatus() {
    if (!USE_CENTER_STATUS) return null;
    if (__centerStatusEl) return __centerStatusEl;
    try {
      __centerStatusEl = document.getElementById('center-status');
      if (!__centerStatusEl) {
        __centerStatusEl = document.createElement('div');
        __centerStatusEl.id = 'center-status';
        __centerStatusEl.setAttribute('role', 'status');
        __centerStatusEl.setAttribute('aria-live', 'polite');

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
    } catch (e) { __centerStatusEl = null; }
    return __centerStatusEl;
  }
  function setStatus(msg) {
    try {
      // clear any existing auto-clear timer whenever status changes
      try { if (typeof statusAutoClearTimer !== 'undefined' && statusAutoClearTimer) { clearTimeout(statusAutoClearTimer); statusAutoClearTimer = null; } } catch (_) { }
      if (USE_CENTER_STATUS) {
        const el = ensureCenterStatus();
        if (el) {
          if (msg) {
            if (__centerStatusText) __centerStatusText.textContent = msg;
            el.classList.add('visible');
            // Auto-clear the initial 'checking alignment data...' message after a short timeout
            try {
              if (msg === 'checking alignment data...') {
                statusAutoClearTimer = setTimeout(() => {
                  try { setStatus(null); console.warn('Initialization status auto-cleared after timeout — check console for errors.'); } catch (_) { }
                }, 5000);
              }
            } catch (_) { }
          } else {
            el.classList.remove('visible');
          }
          return;
        }
      }
      // fallback to inline status element if present
      if (__statusEl) __statusEl.textContent = msg || '';
    } catch (e) { }
  }

  // Start the initialization process
  initializeViewer();

  // Button to set the consensus sequence as the reference and clear any selected row
  const diffConsensusBtn = document.getElementById('diff-consensus-btn');
  if (diffConsensusBtn) {
    diffConsensusBtn.addEventListener('click', () => {
      try {
        if (!viewer || !viewer.alignment) { console.warn('Viewer not available'); return; }
        // compute or reuse consensus
        const cons = (window && window.consensusSequence) ? window.consensusSequence : viewer.alignment.computeConsensusSequence();
        if (!cons) { console.warn('No consensus available to set as reference'); return; }
        try { window.reference = String(cons); } catch (_) { reference = String(cons); }
        // clear any selected row (user asked to clear the previously selected row)
        viewer.clearSelectionSets();
        // refresh reference state (will set refIndex if any row exactly matches consensus)
        // note: we intentionally do NOT auto-select any matching row when the reference
        // is the consensus; rows that happen to equal the consensus should be treated
        // the same as other sequences (no special highlight).
        refreshRefStr();
        // enable reference colouring so effect is visible
        refModeEnabled = true;
        try { window.refModeEnabled = true; } catch (_) { }
        if (viewer) { try { viewer.refModeEnabled = true; } catch (_) { } }
        console.info('Set reference to consensus');
        viewer.scheduleRender();
      } catch (e) { console.warn('diff-consensus failed', e); }
    });
  }

  // Button to jump to next difference from reference
  const diffNextBtn = document.getElementById('diff-next-btn');
  if (diffNextBtn) {
    diffNextBtn.addEventListener('click', () => {
      try {
        if (!viewer || !viewer.alignment) { console.warn('Viewer not available'); return; }
        
        // Get reference string
        const refStr = (window && window.reference) ? String(window.reference) : null;
        if (!refStr) {
          console.warn('No reference set. Please set a reference first.');
          alert('No reference set. Please set a reference sequence first using "Set consensus as reference" or "Set selected as reference".');
          return;
        }
        
        // Call the viewer method
        if (typeof viewer.jumpToNextDifference === 'function') {
          viewer.jumpToNextDifference(refStr);
        } else {
          console.warn('jumpToNextDifference method not available on viewer');
        }
      } catch (e) { console.warn('diff-next failed', e); }
    });
  }

  // Button to jump to previous difference from reference
  const diffPrevBtn = document.getElementById('diff-prev-btn');
  if (diffPrevBtn) {
    diffPrevBtn.addEventListener('click', () => {
      try {
        if (!viewer || !viewer.alignment) { console.warn('Viewer not available'); return; }
        
        // Get reference string
        const refStr = (window && window.reference) ? String(window.reference) : null;
        if (!refStr) {
          console.warn('No reference set. Please set a reference first.');
          alert('No reference set. Please set a reference sequence first using "Set consensus as reference" or "Set selected as reference".');
          return;
        }
        
        // Call the viewer method
        if (typeof viewer.jumpToPreviousDifference === 'function') {
          viewer.jumpToPreviousDifference(refStr);
        } else {
          console.warn('jumpToPreviousDifference method not available on viewer');
        }
      } catch (e) { console.warn('diff-prev failed', e); }
    });
  }

  // viewer instance reference (will be created before data is loaded)
  let viewer = null;
  // alignment reference (will be set when data is loaded)
  let alignment = null;
  // Helper to prefer viewer-owned properties but fall back to local value.
  function getViewerProp(name, localVal, viewerKey) {
    try {
      const key = viewerKey || name;
      // Prefer explicit instance property (viewer[key]) if available
      if (viewer && typeof viewer[key] !== 'undefined') return viewer[key];
      // Then prefer the viewer's default constants if provided (single source of truth)
      if (viewer && viewer.DEFAULTS && typeof viewer.DEFAULTS[name] !== 'undefined') return viewer.DEFAULTS[name];
      // Then any global window override
      if (window && typeof window[name] !== 'undefined') return window[name];
      return localVal;
    } catch (_) { return localVal; }
  }

  // prefer the single scroll root when present — we'll override these below if needed
  let leftScroll = document.getElementById('left-scroll');
  let rightScroll = document.getElementById('right-scroll');
  const seqSpacer = document.getElementById('seq-spacer');
  const leftSpacer = document.getElementById('left-spacer');
  // the alignment scroll element is the authoritative scroller for both axes
  const alignScroll = document.getElementById('alignment-scroll');
  if (alignScroll) { leftScroll = alignScroll; rightScroll = alignScroll; }
  // canonical scroller used everywhere from now on
  const scroller = alignScroll || rightScroll || leftScroll || null;

  // Modern initialization flow:
  // 1. Wait for SealionViewer class to load
  // 2. Create viewer (empty, no data)
  // 3. Wait for alignment data to load
  // 4. Set data on viewer
  // 5. Complete initialization

  async function initializeViewer() {
    try {
      // Step 1: Wait for SealionViewer class
      setStatus('Loading viewer...');
      await waitForViewerClass();

      // Step 2: Create empty viewer instance (no data yet - will be loaded by user choice)
      setStatus('Creating viewer...');
      viewer = new window.SealionViewer('#sealion', null, window.SealionViewer.DEFAULTS);
      try { window.viewer = viewer; } catch (_) { }
      console.info('SealionViewer created (no data - waiting for user to load)');

      // Step 3: Show file upload modal immediately for user to choose data source
      setStatus(null); // Clear status
      if (fileModal) {
        // Reset modal state
        fileDropZone.style.display = 'block';
        fileLoading.style.display = 'none';
        fileError.style.display = 'none';
        if (fileUploadInput) fileUploadInput.value = '';
        
        fileModal.show();
        console.info('Showing file upload modal - waiting for user data choice');
      } else {
        console.warn('File modal not available, falling back to waiting for alignment');
        // Fallback to old behavior if modal not available
        alignment = await waitForAlignment();
        try { window.alignment = alignment; } catch (_) { }
        console.info('Alignment data loaded');
        viewer.setData(alignment);
        console.info('Viewer data set');
      }

      // NOTE: The rest of initialization (dark mode, custom names, etc.)
      // is deferred until after data is loaded via loadDataIntoViewer()

    } catch (e) {
      console.error('Failed to initialize viewer:', e);
      setStatus('Failed to load viewer: ' + e.message);
    }
  }

  // Helper function to complete viewer setup after data is loaded
  function loadDataIntoViewer(alignmentInstance) {
    try {
      // Set data on viewer
      setStatus('Initializing alignment view...');
      viewer.setData(alignmentInstance);
      console.info('Viewer data set');

      // Update global alignment reference
      alignment = alignmentInstance;
      try { window.alignment = alignmentInstance; } catch (_) { }

      // Get data dimensions
      const maxSeqLen = alignmentInstance.getMaxSeqLen();
      const rowCount = alignmentInstance.getSequenceCount();
      window.maxSeqLen = maxSeqLen;
      window.rowCount = rowCount;

      // Reset mask string
      if (window.refreshMaskStr && typeof window.refreshMaskStr === 'function') {
        window.maskStr = window.refreshMaskStr();
      } else {
        window.maskStr = '1'.repeat(maxSeqLen);
      }

      // Load saved dark mode preference from localStorage
      try {
        const darkModePref = localStorage.getItem('sealion_dark_mode');
        if (darkModePref === 'true' && !viewer.darkMode) {
          viewer.toggleDarkMode();
          // Update button icon
          const darkModeBtn = document.getElementById('toggle-dark-mode-btn');
          if (darkModeBtn) {
            const icon = darkModeBtn.querySelector('i');
            if (icon) {
              icon.className = 'bi bi-sun-fill';
            }
          }
          console.info('Dark mode loaded from localStorage');
        }
      } catch (e) {
        console.warn('Failed to load dark mode preference:', e);
      }

      // Load saved custom names from localStorage
      if (typeof viewer.loadCustomNames === 'function') {
        viewer.loadCustomNames();
      }

      // Load saved nucleotide color scheme preference from localStorage
      try {
        if (typeof viewer.loadNucleotideColorScheme === 'function') {
          viewer.loadNucleotideColorScheme();
        }
      } catch (e) {
        console.warn('Failed to load nucleotide color scheme preference:', e);
      }

      // Load saved tags from localStorage
      if (typeof viewer.loadTags === 'function') {
        viewer.loadTags();
      }

      // Load saved bookmarks from localStorage
      if (typeof viewer.loadBookmarks === 'function') {
        viewer.loadBookmarks();
      }

      // Update UI with custom names
      updateTagAndBookmarkNames();

      // Populate labels-consensus-div with UI controls
      try {
        const labelsConsensusDiv = document.getElementById('labels-consensus-div') || (viewer && viewer.labelsConsensusDiv);
        if (labelsConsensusDiv && labelsConsensusDiv.children.length === 0) {
          // Add dropdown button group
          const btnGroup = document.createElement('div');
          btnGroup.className = 'btn-group';
          btnGroup.role = 'group';
          
          const dropdownBtn = document.createElement('button');
          dropdownBtn.className = 'btn btn-sm btn-outline-secondary dropdown-toggle';
          dropdownBtn.type = 'button';
          dropdownBtn.setAttribute('data-bs-toggle', 'dropdown');
          dropdownBtn.setAttribute('aria-expanded', 'false');
          dropdownBtn.style.padding = '0.125rem 0.5rem';
          dropdownBtn.style.fontSize = '0.75rem';
          dropdownBtn.style.lineHeight = '1.2';
          dropdownBtn.textContent = 'Consensus';
          
          const dropdownMenu = document.createElement('ul');
          dropdownMenu.className = 'dropdown-menu';
          
          const menuItem = document.createElement('li');
          const menuButton = document.createElement('button');
          menuButton.className = 'dropdown-item';
          menuButton.type = 'button';
          menuButton.textContent = 'Consensus';
          
          menuItem.appendChild(menuButton);
          dropdownMenu.appendChild(menuItem);
          btnGroup.appendChild(dropdownBtn);
          btnGroup.appendChild(dropdownMenu);
          labelsConsensusDiv.appendChild(btnGroup);
        }
      } catch (e) {
        console.warn('Failed to populate labels-consensus-div:', e);
      }

      // Attach interaction handlers
      try {
        // Query DOM for canvases created by viewer
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
            setColSelectionToRange: function (a, b) { const lo = Math.max(0, Math.min(a, b)); const hi = Math.min(maxSeqLen - 1, Math.max(a, b)); const cols = []; for (let c = lo; c <= hi; c++) cols.push(c); viewer.setSelectedCols(cols); },
            addRangeToColSelection: function (a, b) { const lo = Math.max(0, Math.min(a, b)); const hi = Math.min(maxSeqLen - 1, Math.max(a, b)); const cur = new Set(viewer.getSelectedCols()); for (let c = lo; c <= hi; c++) cur.add(c); viewer.setSelectedCols(Array.from(cur)); },
            setSelectionToRange: function (a, b) { const lo = Math.max(0, Math.min(a, b)); const hi = Math.min(rowCount - 1, Math.max(a, b)); const rows = []; for (let r = lo; r <= hi; r++) rows.push(r); viewer.setSelectedRows(rows); viewer.scheduleRender(); },
            addRangeToSelection: function (a, b) { const lo = Math.max(0, Math.min(a, b)); const hi = Math.min(rowCount - 1, Math.max(a, b)); const cur = new Set(viewer.getSelectedRows()); for (let r = lo; r <= hi; r++) cur.add(r); viewer.setSelectedRows(Array.from(cur)); viewer.scheduleRender(); },
            clearRectSelection: function () { viewer.clearRectSelection(); },
            clearSelectionSets: function () { viewer.clearSelectionSets(); },
            updateRectSelection: function (r0, r1, c0, c1, orig) { viewer.updateRectSelection(r0, r1, c0, c1, orig); },
            finalizeRectSelection: function (r0, r1, c0, c1, orig) { viewer.finalizeRectSelection(r0, r1, c0, c1, orig); }
          }
        });
      } catch (e) {
        console.error('Failed to attach interaction handlers to SealionViewer', e);
      }

      // Set up initial reference (consensus)
      setStatus('Computing consensus...');
      try {
        if (viewer && viewer.alignment) {
          const cons = viewer.alignment.computeConsensusSequence();
          window.consensusSequence = cons;
          if (cons) {
            try { window.reference = String(cons); } catch (_) { }
            if (window.refreshRefStr) window.refreshRefStr();
            console.info('Initialized with consensus as reference sequence');
          }
        }
      } catch (e) { console.warn('Failed to compute consensus', e); }

      // Complete initialization
      setStatus('Rendering...');
      viewer.scheduleRender();

      // Wait a moment for first render then hide status
      setTimeout(() => {
        setStatus(null);
        console.info('Data loaded and viewer initialized');
      }, 100);

    } catch (e) {
      console.error('Failed to load data into viewer:', e);
      setStatus('ERROR: Failed to load data - see console');
    }
  }

  // Helper: Wait for SealionViewer class to be available
  function waitForViewerClass() {
    return new Promise((resolve, reject) => {
      if (window.SealionViewer) {
        resolve();
        return;
      }
      let attempts = 0;
      const maxAttempts = 50; // 10 seconds
      const interval = setInterval(() => {
        attempts++;
        if (window.SealionViewer) {
          clearInterval(interval);
          resolve();
        } else if (attempts >= maxAttempts) {
          clearInterval(interval);
          reject(new Error('SealionViewer class failed to load'));
        }
      }, 200);
    });
  }

  // Helper: Wait for alignment data to be available
  function waitForAlignment() {
    return new Promise((resolve, reject) => {
      if (window.alignment) {
        resolve(window.alignment);
        return;
      }
      let attempts = 0;
      const maxAttempts = 50; // 10 seconds
      const interval = setInterval(() => {
        attempts++;
        if (window.alignment) {
          clearInterval(interval);
          resolve(window.alignment);
        } else if (attempts >= maxAttempts) {
          clearInterval(interval);
          reject(new Error('Alignment data failed to load'));
        }
      }, 200);
    });
  }
  const searchInput = document.getElementById('search-input');
  const searchNextBtn = document.getElementById('search-next');

  // divider element for resizing the labels column
  const labelDivider = document.getElementById('label-divider');
  const maskToggle = document.getElementById('mask-toggle');
  const colourAllBtn = document.getElementById('colour-all-btn');
  const colourDiffBtn = document.getElementById('colour-diff-btn');

  // mask string (should be provided by alignment.js). If absent we initialize to all '1's
  // so compression machinery is always enabled but starts uncompressed.
  // Evaluate and normalize lazily so global `mask` can be injected/edited at runtime.
  let maskStr = null;
  // Populate maskStr from utils (sealion/utils.js); fall back to all '1's if helper missing
  try { maskStr = (window && window.refreshMaskStr) ? window.refreshMaskStr() : '1'.repeat(maxSeqLen); } catch (_) { maskStr = '1'.repeat(maxSeqLen); }
  // reference handling: evaluate lazily and expose
  let refStr = null;
  let refIndex = null;
  // populate refStr/refIndex using utils (if available)
  try { const _r = (window && window.refreshRefStr) ? window.refreshRefStr() : { refStr: null, refIndex: null }; refStr = _r.refStr; refIndex = _r.refIndex; } catch (_) { refStr = null; refIndex = null; }
  // Mask compression is always enabled; start with a mask of all '1's (no actual compression)
  let maskEnabled = true;
  let refModeEnabled = false;

  // Apply constant mask button
  const applyConstantMaskBtn = document.getElementById('apply-constant-mask-btn');
  if (applyConstantMaskBtn) {
    applyConstantMaskBtn.addEventListener('click', () => {
      try {
        if (!viewer || !viewer.alignment) {
          console.error('Viewer not available');
          return;
        }

        const cm = viewer.alignment.computeConstantMask();
        if (!cm) {
          console.warn('computeConstantMask returned no mask');
          return;
        }

        // Get current mask from viewer
        let currentMask = viewer.maskStr || (typeof window.mask !== 'undefined' ? String(window.mask) : null);
        if (!currentMask || currentMask.length < cm.length) {
          currentMask = '1'.repeat(cm.length);
        }

        // AND the new mask with the current mask (collapse if either says to collapse)
        const newMask = andMasks(currentMask, String(cm));

        // Update the mask in viewer and window
        try {
          window.mask = newMask;
          window.maskStr = newMask;
          viewer.maskStr = newMask;
        } catch (_) { }

        console.info('apply-constant-mask: applied with AND (length=' + newMask.length + ')');

        // Trigger the mask transition with current maskEnabled state
        if (typeof viewer.startMaskTransition === 'function') {
          viewer.startMaskTransition(!!viewer.maskEnabled);
        }
      } catch (e) { console.warn('apply-constant-mask failed', e); }
    });
  }

  // Colour all sites button
  if (colourAllBtn) {
    colourAllBtn.addEventListener('click', () => {
      refModeEnabled = false;
      try { window.refModeEnabled = false; } catch (_) { }
      if (viewer) { try { viewer.refModeEnabled = false; } catch (_) { } }
      console.info('Colour mode: all sites');
      viewer.scheduleRender();
    });
  }

  // Colour differences only button
  if (colourDiffBtn) {
    colourDiffBtn.addEventListener('click', () => {
      // Check if a reference is set, if not, set consensus as reference
      const hasReference = !!(window && window.reference);
      if (!hasReference) {
        console.info('No reference set, using consensus');
        const cons = (window && window.consensusSequence) ? window.consensusSequence : (viewer && viewer.alignment ? viewer.alignment.computeConsensusSequence() : null);
        if (cons) {
          try { window.reference = String(cons); } catch (_) { reference = String(cons); }
        } else {
          console.warn('No consensus available to set as reference');
        }
      }

      refModeEnabled = true;
      refreshRefStr();
      try { window.refModeEnabled = true; } catch (_) { }
      if (viewer) { try { viewer.refModeEnabled = true; } catch (_) { } }
      console.info('Colour mode: differences only');
      viewer.scheduleRender();
    });
  }

  // Nucleotide color scheme buttons
  const nucleotideColorSchemeBtns = document.querySelectorAll('.nucleotide-color-scheme-btn');
  nucleotideColorSchemeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const scheme = btn.getAttribute('data-scheme');
      if (viewer && typeof viewer.setNucleotideColorScheme === 'function') {
        viewer.setNucleotideColorScheme(scheme);
        console.info(`Nucleotide color scheme changed to: ${scheme}`);
      }
    });
  });

  // Sort by original order button
  const sortOriginalBtn = document.getElementById('sort-original-btn');
  if (sortOriginalBtn) {
    sortOriginalBtn.addEventListener('click', () => {
      if (!viewer || !viewer.alignment) return;
      viewer.alignment.orderByOriginalIndex();
      viewer.cancelRender();
      viewer.scheduleRender();
    });
  }

  // Sort by label button
  const sortLabelBtn = document.getElementById('sort-label-btn');
  if (sortLabelBtn) {
    sortLabelBtn.addEventListener('click', () => {
      if (!viewer || !viewer.alignment) return;
      viewer.alignment.orderByLabel();
      viewer.cancelRender();
      viewer.scheduleRender();
    });
  }

  // Sort by selected column button
  const sortColumnBtn = document.getElementById('sort-column-btn');
  if (sortColumnBtn) {
    sortColumnBtn.addEventListener('click', () => {
      if (!viewer || !viewer.alignment) return;
      // Get selected columns
      let selectedCols = viewer.getSelectedCols();

      // Convert Set to Array
      selectedCols = Array.from(selectedCols);

      if (selectedCols.length === 0) {
        alert('No column selected. Please select a column first by clicking on a column in the alignment.');
        return;
      }

      // Use the first selected column for sorting
      const siteIndex = selectedCols[0];

      viewer.alignment.orderBySite(siteIndex);
      viewer.cancelRender();
      viewer.scheduleRender();
    });
  }

  // Sort by label (reverse) button
  const sortLabelReverseBtn = document.getElementById('sort-label-reverse-btn');
  if (sortLabelReverseBtn) {
    sortLabelReverseBtn.addEventListener('click', () => {
      if (!viewer || !viewer.alignment) return;
      viewer.alignment.orderByLabel(true);
      viewer.cancelRender();
      viewer.scheduleRender();
    });
  }

  // Sort by selected column (reverse) button
  const sortColumnReverseBtn = document.getElementById('sort-column-reverse-btn');
  if (sortColumnReverseBtn) {
    sortColumnBtn.addEventListener('click', () => {
      if (!viewer || !viewer.alignment) return;
      // Get selected columns
      let selectedCols = viewer.getSelectedCols();

      // Convert Set to Array
      selectedCols = Array.from(selectedCols);

      if (selectedCols.length === 0) {
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
  if (sortStartPosBtn) {
    sortStartPosBtn.addEventListener('click', () => {
      alignment.orderByStartPos();
      viewer.alignment = alignment;
      viewer.cancelRender();
      viewer.scheduleRender();
    });
  }

  // Sort by start position (reverse) button
  const sortStartPosReverseBtn = document.getElementById('sort-start-pos-reverse-btn');
  if (sortStartPosReverseBtn) {
    sortStartPosReverseBtn.addEventListener('click', () => {
      alignment.orderByStartPos(true);
      viewer.alignment = alignment;
      viewer.cancelRender();
      viewer.scheduleRender();
    });
  }

  // Sort by sequence length button
  const sortSeqLengthBtn = document.getElementById('sort-seq-length-btn');
  if (sortSeqLengthBtn) {
    sortSeqLengthBtn.addEventListener('click', () => {
      alignment.orderBySeqLength();
      viewer.alignment = alignment;
      viewer.cancelRender();
      viewer.scheduleRender();
    });
  }

  // Sort by sequence length (reverse) button
  const sortSeqLengthReverseBtn = document.getElementById('sort-seq-length-reverse-btn');
  if (sortSeqLengthReverseBtn) {
    sortSeqLengthReverseBtn.addEventListener('click', () => {
      if (!viewer || !viewer.alignment) return;
      viewer.alignment.orderBySeqLength(true);
      viewer.cancelRender();
      viewer.scheduleRender();
    });
  }

  // Sort by tags button
  const sortTagBtn = document.getElementById('sort-tag-btn');
  if (sortTagBtn) {
    sortTagBtn.addEventListener('click', () => {
      if (!viewer || !viewer.alignment) return;
      if (!viewer.labelTags || viewer.labelTags.size === 0) {
        console.info('No tags to sort by');
        return;
      }
      viewer.alignment.orderByTag(viewer.labelTags);
      viewer.cancelRender();
      viewer.scheduleRender();
    });
  }

  // Fix current order button
  const fixOrderBtn = document.getElementById('fix-order-btn');
  if (fixOrderBtn) {
    fixOrderBtn.addEventListener('click', () => {
      if (!viewer || !viewer.alignment) return;
      viewer.alignment.fixCurrentOrder();
      viewer.cancelRender();
      viewer.scheduleRender();
    });
  }



  // Wire up the new apply buttons
  const applyConstantAmbiguousBtn = document.getElementById('apply-constant-ambiguous-btn');
  if (applyConstantAmbiguousBtn) {
    applyConstantAmbiguousBtn.addEventListener('click', () => {
      if (!viewer || !viewer.alignment) return;
      const cm = viewer.alignment.computeConstantMaskAllowN();
      if (!cm) {
        console.warn('computeConstantMaskAllowN returned no mask');
        return;
      }

      // Get current mask from viewer
      let currentMask = viewer.maskStr || (typeof window.mask !== 'undefined' ? String(window.mask) : null);
      if (!currentMask || currentMask.length < cm.length) {
        currentMask = '1'.repeat(cm.length);
      }

      // AND the new mask with the current mask (collapse if either says to collapse)
      const newMask = andMasks(currentMask, String(cm));

      // Update the mask in viewer and window
      try {
        window.mask = newMask;
        window.maskStr = newMask;
        viewer.maskStr = newMask;
      } catch (_) { }

      console.info('apply-constant-ambiguous: applied with AND (length=' + newMask.length + ')');

      // Trigger the mask transition with current maskEnabled state
      viewer.startMaskTransition(!!viewer.maskEnabled);
    });
  }

  const applyConstantGappedBtn = document.getElementById('apply-constant-gapped-btn');
  if (applyConstantGappedBtn) {
    applyConstantGappedBtn.addEventListener('click', () => {
      if (!viewer || !viewer.alignment) return;
      const cm = viewer.alignment.computeConstantMaskAllowNAndGaps();
      if (!cm) {
        console.warn('computeConstantMaskAllowNAndGaps returned no mask');
        return;
      }

      // Get current mask from viewer
      let currentMask = viewer.maskStr || (typeof window.mask !== 'undefined' ? String(window.mask) : null);
      if (!currentMask || currentMask.length < cm.length) {
        currentMask = '1'.repeat(cm.length);
      }

      // AND the new mask with the current mask (collapse if either says to collapse)
      const newMask = andMasks(currentMask, String(cm));

      // Update the mask in viewer and window
      try {
        window.mask = newMask;
        window.maskStr = newMask;
        viewer.maskStr = newMask;
      } catch (_) { }

      console.info('apply-constant-gapped: applied with AND (length=' + newMask.length + ')');

      // Trigger the mask transition with current maskEnabled state
      viewer.startMaskTransition(!!viewer.maskEnabled);
    });
  }

  // Wire up expand all button
  const expandAllBtn = document.getElementById('expand-all-btn');
  if (expandAllBtn) {
    expandAllBtn.addEventListener('click', () => {
      console.info('Expand all button clicked');

      // Create a set of all column indices
      const seqLen = viewer.maxSeqLen || (rows && rows[0] && rows[0].sequence ? rows[0].sequence.length : 0);
      const allCols = new Set();
      for (let i = 0; i < seqLen; i++) {
        allCols.add(i);
      }

      // Use setMaskBitsForCols to expand all columns
      viewer.setMaskBitsForCols(allCols, '1');
      console.info('expand-all: expanded all ' + seqLen + ' sites');
    });
  }

  // Wire up collapse all button
  const collapseAllBtn = document.getElementById('collapse-all-btn');
  if (collapseAllBtn) {
    collapseAllBtn.addEventListener('click', () => {
      console.info('Collapse all button clicked');

      // Create a set of all column indices
      const seqLen = viewer.maxSeqLen || (rows && rows[0] && rows[0].sequence ? rows[0].sequence.length : 0);
      const allCols = new Set();
      for (let i = 0; i < seqLen; i++) {
        allCols.add(i);
      }

      // Use setMaskBitsForCols to collapse all columns
      viewer.setMaskBitsForCols(allCols, '0');
      console.info('collapse-all: collapsed all ' + seqLen + ' sites');
    });
  }

  // Button to set the currently selected sequence as the reference
  const setRefBtn = document.getElementById('set-ref-btn');
  if (setRefBtn) {
    setRefBtn.addEventListener('click', () => {
      try {
        // prefer viewer.anchorRow if available, else first selected row, else top visible row (0)
        let idx = null;
        if (viewer.anchorRow !== undefined && viewer.anchorRow !== null) idx = viewer.anchorRow;
        if (idx === null) { const s = viewer.getSelectedRows(); if (s && s.size > 0) idx = Array.from(s)[0]; else idx = 0; }
        idx = Math.max(0, Math.min(rowCount - 1, idx));
        const seq = (rows[idx] && rows[idx].sequence) ? rows[idx].sequence : null;
        if (!seq) { console.warn('No sequence available at selected row to use as reference'); return; }
        try { window.reference = String(seq); } catch (_) { reference = String(seq); }
        refreshRefStr();
        // Ensure the chosen row is used as the reference index (avoid matching the first identical sequence elsewhere)
        try { refIndex = idx; window.__refIndex = refIndex; } catch (_) { }
        // enable reference colouring so effect is visible
        refModeEnabled = true;
        try { window.refModeEnabled = true; } catch (_) { }
        if (viewer) { try { viewer.refModeEnabled = true; } catch (_) { } }
        console.info('Set reference to row', idx);
        viewer.scheduleRender();
      } catch (e) { console.warn('set-ref failed', e); }
    });
  }

  // Font size controls: increase/decrease text (labels and nucleotides)
  const fontIncreaseBtn = document.getElementById('font-increase-btn');
  const fontDecreaseBtn = document.getElementById('font-decrease-btn');
  console.info('Font buttons found:', { increase: !!fontIncreaseBtn, decrease: !!fontDecreaseBtn });

  if (fontIncreaseBtn) {
    fontIncreaseBtn.addEventListener('click', () => {
      console.info('Increase button clicked');
      viewer.updateFontSize(1);
    });
  }
  if (fontDecreaseBtn) {
    fontDecreaseBtn.addEventListener('click', () => {
      console.info('Decrease button clicked');
      viewer.updateFontSize(-1);
    });
  }

  // Dark mode toggle
  const toggleDarkModeBtn = document.getElementById('toggle-dark-mode-btn');
  console.info('Dark mode button found:', !!toggleDarkModeBtn);

  if (toggleDarkModeBtn) {
    toggleDarkModeBtn.addEventListener('click', (e) => {
      console.info('Dark mode toggle clicked - button event fired');
      e.preventDefault();
      e.stopPropagation();
      
      // Access viewer from window or the closure variable
      const v = window.viewer || viewer;
      console.info('Viewer found:', !!v);
      console.info('toggleDarkMode method exists:', v && typeof v.toggleDarkMode === 'function');
      
      if (v && typeof v.toggleDarkMode === 'function') {
        console.info('Calling toggleDarkMode...');
        v.toggleDarkMode();
        console.info('toggleDarkMode completed, darkMode is now:', v.darkMode);
        
        // Update button icon
        const icon = toggleDarkModeBtn.querySelector('i');
        if (icon) {
          if (v.darkMode) {
            icon.className = 'bi bi-sun-fill';
          } else {
            icon.className = 'bi bi-moon-fill';
          }
          console.info('Button icon updated to:', icon.className);
        }
      } else {
        console.error('Viewer not ready or toggleDarkMode method missing');
      }
    });
  }

  // Tag controls: tag selected labels with colors
  const tagColorBtns = document.querySelectorAll('.tag-color-btn');
  const clearSelectedTagsBtn = document.getElementById('clear-selected-tags-btn');
  const clearAllTagsBtn = document.getElementById('clear-all-tags-btn');
  console.info('Tag buttons found:', { 
    colorButtons: tagColorBtns.length, 
    clearSelected: !!clearSelectedTagsBtn, 
    clearAll: !!clearAllTagsBtn 
  });

  if (tagColorBtns.length > 0) {
    tagColorBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const tagIndex = parseInt(btn.getAttribute('data-tag-index'), 10);
        console.info(`Tag color ${tagIndex} clicked`);
        if (viewer && typeof viewer.tagSelectedLabels === 'function') {
          viewer.tagSelectedLabels(tagIndex);
        }
      });
    });
  }

  if (clearSelectedTagsBtn) {
    clearSelectedTagsBtn.addEventListener('click', () => {
      console.info('Clear selected tags clicked');
      if (viewer && typeof viewer.clearSelectedTags === 'function') {
        viewer.clearSelectedTags();
      }
    });
  }

  if (clearAllTagsBtn) {
    clearAllTagsBtn.addEventListener('click', () => {
      console.info('Clear all tags clicked');
      if (viewer && typeof viewer.clearAllTags === 'function') {
        viewer.clearAllTags();
      }
    });
  }

  // Bookmark controls: bookmark selected columns with colors
  const bookmarkColorBtns = document.querySelectorAll('.bookmark-color-btn');
  const clearSelectedBookmarksBtn = document.getElementById('clear-selected-bookmarks-btn');
  const clearAllBookmarksBtn = document.getElementById('clear-all-bookmarks-btn');
  console.info('Bookmark buttons found:', { 
    colorButtons: bookmarkColorBtns.length, 
    clearSelected: !!clearSelectedBookmarksBtn, 
    clearAll: !!clearAllBookmarksBtn 
  });

  if (bookmarkColorBtns.length > 0) {
    bookmarkColorBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const bookmarkIndex = parseInt(btn.getAttribute('data-bookmark-index'), 10);
        console.info(`Bookmark color ${bookmarkIndex} clicked`);
        if (viewer && typeof viewer.bookmarkSelectedColumns === 'function') {
          viewer.bookmarkSelectedColumns(bookmarkIndex);
        }
      });
    });
  }

  if (clearSelectedBookmarksBtn) {
    clearSelectedBookmarksBtn.addEventListener('click', () => {
      console.info('Clear selected bookmarks clicked');
      if (viewer && typeof viewer.clearSelectedBookmarks === 'function') {
        viewer.clearSelectedBookmarks();
      }
    });
  }

  if (clearAllBookmarksBtn) {
    clearAllBookmarksBtn.addEventListener('click', () => {
      console.info('Clear all bookmarks clicked');
      if (viewer && typeof viewer.clearAllBookmarks === 'function') {
        viewer.clearAllBookmarks();
      }
    });
  }

  // Reset tag names button
  const resetTagNamesBtn = document.getElementById('reset-tag-names-btn');
  if (resetTagNamesBtn) {
    resetTagNamesBtn.addEventListener('click', () => {
      console.info('Reset tag names clicked');
      const v = window.viewer || viewer;
      if (v && typeof v.resetTagNames === 'function') {
        v.resetTagNames();
        // Update UI with default names
        updateTagAndBookmarkNames();
      }
    });
  }

  // Reset bookmark names button
  const resetBookmarkNamesBtn = document.getElementById('reset-bookmark-names-btn');
  if (resetBookmarkNamesBtn) {
    resetBookmarkNamesBtn.addEventListener('click', () => {
      console.info('Reset bookmark names clicked');
      const v = window.viewer || viewer;
      if (v && typeof v.resetBookmarkNames === 'function') {
        v.resetBookmarkNames();
        // Update UI with default names
        updateTagAndBookmarkNames();
      }
    });
  }

  // Function to update tag and bookmark names in UI
  function updateTagAndBookmarkNames() {
    if (!viewer) return;
    
    // Update tag names
    const tagNameSpans = document.querySelectorAll('.tag-name-edit');
    tagNameSpans.forEach((span, index) => {
      if (viewer.TAG_NAMES && viewer.TAG_NAMES[index]) {
        span.textContent = viewer.TAG_NAMES[index];
      }
    });
    
    // Update bookmark names
    const bookmarkNameSpans = document.querySelectorAll('.bookmark-name-edit');
    bookmarkNameSpans.forEach((span, index) => {
      if (viewer.BOOKMARK_NAMES && viewer.BOOKMARK_NAMES[index]) {
        span.textContent = viewer.BOOKMARK_NAMES[index];
      }
    });
  }

  // Handle editing of tag names
  const tagNameSpans = document.querySelectorAll('.tag-name-edit');
  tagNameSpans.forEach((span, index) => {
    // Prevent button click when editing
    span.addEventListener('click', (e) => {
      e.stopPropagation();
    });
    
    // Save on blur
    span.addEventListener('blur', () => {
      const newName = span.textContent.trim();
      if (newName && viewer && typeof viewer.updateTagName === 'function') {
        viewer.updateTagName(index, newName);
      }
    });
    
    // Save on Enter key
    span.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        span.blur();
      }
    });
  });

  // Handle editing of bookmark names
  const bookmarkNameSpans = document.querySelectorAll('.bookmark-name-edit');
  bookmarkNameSpans.forEach((span, index) => {
    // Prevent button click when editing
    span.addEventListener('click', (e) => {
      e.stopPropagation();
    });
    
    // Save on blur
    span.addEventListener('blur', () => {
      const newName = span.textContent.trim();
      if (newName && viewer && typeof viewer.updateBookmarkName === 'function') {
        viewer.updateBookmarkName(index, newName);
      }
    });
    
    // Save on Enter key
    span.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        span.blur();
      }
    });
  });

  // Keyboard shortcuts
  window.addEventListener('keydown', (e) => {
    // Cmd+0 (or Ctrl+0) to reset font size
    if ((e.metaKey || e.ctrlKey) && e.key === '0') {
      e.preventDefault();
      console.info('Reset font size shortcut triggered (Cmd+0)');
      viewer.resetFontSize();
    }
    // Cmd+G (or Ctrl+G) to search next
    if ((e.metaKey || e.ctrlKey) && e.key === 'g') {
      e.preventDefault();
      if (viewer && viewer.searchMatches && viewer.searchMatches.length > 0) {
        viewer.nextMatch();
      }
    }
    // Cmd+D (or Ctrl+D) to toggle colour differences mode
    if ((e.metaKey || e.ctrlKey) && (e.key === 'd' || e.key === 'D')) {
      e.preventDefault();
      try {
        // Toggle refModeEnabled
        refModeEnabled = !refModeEnabled;
        try { window.refModeEnabled = refModeEnabled; } catch (_) { }
        if (viewer) { 
          try { viewer.refModeEnabled = refModeEnabled; } catch (_) { }
          try { viewer.invalidateOverviewCache(); } catch (_) { }
        }
        
        // If enabling and no reference is set, set consensus as reference
        if (refModeEnabled) {
          const hasReference = !!(window && window.reference);
          if (!hasReference) {
            console.info('No reference set, using consensus');
            const cons = (window && window.consensusSequence) ? window.consensusSequence : (viewer && viewer.alignment ? viewer.alignment.computeConsensusSequence() : null);
            if (cons) {
              try { window.reference = String(cons); } catch (_) { }
              if (window.refreshRefStr) window.refreshRefStr();
            }
          }
          console.info('Colour differences mode: ON');
        } else {
          console.info('Colour differences mode: OFF (colour all sites)');
        }
        
        if (viewer && typeof viewer.scheduleRender === 'function') {
          viewer.scheduleRender();
        }
      } catch (err) { console.warn('Cmd+D failed', err); }
    }
    // Cmd+H (or Ctrl+H) to toggle hide mode
    if ((e.metaKey || e.ctrlKey) && (e.key === 'h' || e.key === 'H')) {
      e.preventDefault();
      try {
        if (!viewer) return;
        if (typeof viewer.toggleHideMode === 'function') {
          viewer.toggleHideMode();
        }
      } catch (err) { console.warn('Cmd+H failed', err); }
    }
    // Shift+Cmd+C (or Shift+Ctrl+C) to copy just the labels
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === 'c' || e.key === 'C')) {
      const activeElement = document.activeElement;
      const isFilterBox = activeElement && activeElement.id === 'label-filter-box';
      const isTextInput = activeElement && (
        activeElement.tagName === 'INPUT' || 
        activeElement.tagName === 'TEXTAREA' || 
        activeElement.isContentEditable
      );
      
      // Check if text is selected in the filter box
      let filterBoxTextSelected = false;
      if (isFilterBox && activeElement.selectionStart !== undefined && activeElement.selectionEnd !== undefined) {
        filterBoxTextSelected = activeElement.selectionStart !== activeElement.selectionEnd;
      }
      
      if ((!isTextInput || (isFilterBox && !filterBoxTextSelected)) && viewer && viewer.alignment) {
        e.preventDefault();
        
        try {
          const selectedRows = viewer.getSelectedRows ? viewer.getSelectedRows() : new Set();
          
          // If no rows selected, use all sequences
          const rowIndices = selectedRows.size > 0 
            ? Array.from(selectedRows).sort((a, b) => a - b)
            : Array.from({ length: viewer.alignment.length }, (_, i) => i);
          
          if (rowIndices.length === 0) {
            console.info('No sequences available');
            return;
          }
          
          // Build label text (one per line)
          const labelText = rowIndices.map(rowIdx => {
            const seq = viewer.alignment[rowIdx];
            return seq ? (seq.label || seq.name || `sequence_${rowIdx}`) : '';
          }).join('\n');
          
          // Copy to clipboard
          navigator.clipboard.writeText(labelText).then(() => {
            console.info(`Copied ${rowIndices.length} label(s) to clipboard`);
          }).catch(err => {
            console.error('Failed to copy labels to clipboard:', err);
            // Fallback: try using execCommand
            const textArea = document.createElement('textarea');
            textArea.value = labelText;
            textArea.style.position = 'fixed';
            textArea.style.left = '-999999px';
            document.body.appendChild(textArea);
            textArea.select();
            try {
              document.execCommand('copy');
              console.info(`Copied ${rowIndices.length} label(s) to clipboard (fallback method)`);
            } catch (fallbackErr) {
              console.error('Fallback copy also failed:', fallbackErr);
            }
            document.body.removeChild(textArea);
          });
        } catch (err) {
          console.error('Shift+Cmd+C copy labels failed:', err);
        }
      }
    }
    // Cmd+C (or Ctrl+C) to copy selection as FASTA
    if ((e.metaKey || e.ctrlKey) && !e.shiftKey && (e.key === 'c' || e.key === 'C')) {
      // Only handle if we're not in a text input field, UNLESS it's the filter box
      // and the filter box text itself is not selected
      const activeElement = document.activeElement;
      const isFilterBox = activeElement && activeElement.id === 'label-filter-box';
      const isTextInput = activeElement && (
        activeElement.tagName === 'INPUT' || 
        activeElement.tagName === 'TEXTAREA' || 
        activeElement.isContentEditable
      );
      
      // Check if text is selected in the filter box
      let filterBoxTextSelected = false;
      if (isFilterBox && activeElement.selectionStart !== undefined && activeElement.selectionEnd !== undefined) {
        filterBoxTextSelected = activeElement.selectionStart !== activeElement.selectionEnd;
      }
      
      // Allow copy when:
      // - Not in a text input, OR
      // - In filter box but no text is selected (so copy sequences instead)
      if ((!isTextInput || (isFilterBox && !filterBoxTextSelected)) && viewer && viewer.alignment) {
        e.preventDefault();
        
        try {
          const selectedRows = viewer.getSelectedRows ? viewer.getSelectedRows() : new Set();
          const selectedCols = viewer.getSelectedCols ? viewer.getSelectedCols() : new Set();
          
          // If only columns are selected (no rows), use all sequences
          const rowIndices = selectedRows.size > 0 
            ? Array.from(selectedRows).sort((a, b) => a - b)
            : Array.from({ length: viewer.alignment.length }, (_, i) => i);
          
          if (rowIndices.length === 0) {
            console.info('No sequences available');
            return;
          }
          
          // Get sorted column indices if any are selected
          const colIndices = selectedCols.size > 0 
            ? Array.from(selectedCols).sort((a, b) => a - b)
            : null;
          
          // Build FASTA text
          let fastaText = '';
          for (const rowIdx of rowIndices) {
            const seq = viewer.alignment[rowIdx];
            if (!seq) continue;
            
            // Get label
            const label = seq.label || seq.name || `sequence_${rowIdx}`;
            fastaText += `>${label}\n`;
            
            // Get sequence - either selected columns or full sequence
            let sequence;
            if (colIndices && colIndices.length > 0) {
              // Extract only selected columns
              sequence = colIndices.map(colIdx => {
                return (seq.sequence && seq.sequence[colIdx]) ? seq.sequence[colIdx] : '';
              }).join('');
            } else {
              // Use full sequence
              sequence = seq.sequence || '';
            }
            
            // Add sequence as single line (no wrapping)
            fastaText += sequence + '\n';
          }
          
          // Copy to clipboard
          navigator.clipboard.writeText(fastaText).then(() => {
            const rowCount = rowIndices.length;
            const colCount = colIndices ? colIndices.length : (viewer.alignment[0]?.sequence?.length || 0);
            console.info(`Copied ${rowCount} sequence(s) with ${colCount} position(s) to clipboard as FASTA`);
          }).catch(err => {
            console.error('Failed to copy to clipboard:', err);
            // Fallback: try using execCommand
            const textArea = document.createElement('textarea');
            textArea.value = fastaText;
            textArea.style.position = 'fixed';
            textArea.style.left = '-999999px';
            document.body.appendChild(textArea);
            textArea.select();
            try {
              document.execCommand('copy');
              console.info(`Copied ${rowIndices.length} sequence(s) to clipboard as FASTA (fallback method)`);
            } catch (fallbackErr) {
              console.error('Fallback copy also failed:', fallbackErr);
            }
            document.body.removeChild(textArea);
          });
        } catch (err) {
          console.error('Cmd+C copy failed:', err);
        }
      }
    }
    // Cmd+> (or Ctrl+>) to jump to next difference
    if ((e.metaKey || e.ctrlKey) && (e.key === '>' || e.key === '.')) {
      e.preventDefault();
      try {
        if (!viewer || !viewer.alignment) return;
        const refStr = (window && window.reference) ? String(window.reference) : null;
        if (!refStr) {
          console.warn('No reference set for jump to next difference');
          return;
        }
        if (typeof viewer.jumpToNextDifference === 'function') {
          viewer.jumpToNextDifference(refStr);
        }
      } catch (err) { console.warn('Cmd+> failed', err); }
    }
    // Cmd+< (or Ctrl+<) to jump to previous difference
    if ((e.metaKey || e.ctrlKey) && (e.key === '<' || e.key === ',')) {
      e.preventDefault();
      try {
        if (!viewer || !viewer.alignment) return;
        const refStr = (window && window.reference) ? String(window.reference) : null;
        if (!refStr) {
          console.warn('No reference set for jump to previous difference');
          return;
        }
        if (typeof viewer.jumpToPreviousDifference === 'function') {
          viewer.jumpToPreviousDifference(refStr);
        }
      } catch (err) { console.warn('Cmd+< failed', err); }
    }
    // Shift+Left to scroll to leftmost extent
    if (e.shiftKey && e.key === 'ArrowLeft' && !e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      try {
        if (viewer && viewer.scroller) {
          viewer.scroller.scrollLeft = 0;
          console.info('Scrolled to left extent');
        }
      } catch (err) { console.warn('Shift+Left failed', err); }
    }
    // Shift+Right to scroll to rightmost extent
    if (e.shiftKey && e.key === 'ArrowRight' && !e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      try {
        if (viewer && viewer.scroller && viewer.colOffsets) {
          const totalWidth = viewer.colOffsets[viewer.colOffsets.length - 1] || 0;
          const maxScrollLeft = Math.max(0, totalWidth - viewer.scroller.clientWidth);
          viewer.scroller.scrollLeft = maxScrollLeft;
          console.info('Scrolled to right extent');
        }
      } catch (err) { console.warn('Shift+Right failed', err); }
    }
    // Shift+Up to scroll to top extent
    if (e.shiftKey && e.key === 'ArrowUp' && !e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      try {
        if (viewer && viewer.scroller) {
          viewer.scroller.scrollTop = 0;
          console.info('Scrolled to top extent');
        }
      } catch (err) { console.warn('Shift+Up failed', err); }
    }
    // Shift+Down to scroll to bottom extent
    if (e.shiftKey && e.key === 'ArrowDown' && !e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      try {
        if (viewer && viewer.scroller && viewer.alignment) {
          const ROW_HEIGHT = viewer.ROW_HEIGHT || (window && window.ROW_HEIGHT) || 20;
          const totalHeight = viewer.alignment.length * ROW_HEIGHT;
          const maxScrollTop = Math.max(0, totalHeight - viewer.scroller.clientHeight);
          viewer.scroller.scrollTop = maxScrollTop;
          console.info('Scrolled to bottom extent');
        }
      } catch (err) { console.warn('Shift+Down failed', err); }
    }
  });

  // Column collapse/expand controls
  const collapseColumnsBtn = document.getElementById('collapse-columns-btn');
  const expandColumnsBtn = document.getElementById('expand-columns-btn');
  const toggleHideModeBtn = document.getElementById('toggle-hide-mode-btn');
  console.info('Column buttons found:', { collapse: !!collapseColumnsBtn, expand: !!expandColumnsBtn, toggleHide: !!toggleHideModeBtn });

  if (collapseColumnsBtn) {
    collapseColumnsBtn.addEventListener('click', () => {
      console.info('Collapse columns button clicked');
      viewer.setMaskBitsForCols(viewer.selectedCols || new Set(), '0');
    });
  }

  if (expandColumnsBtn) {
    expandColumnsBtn.addEventListener('click', () => {
      console.info('Expand columns button clicked');
      viewer.setMaskBitsForCols(viewer.selectedCols || new Set(), '1');
    });
  }

  if (toggleHideModeBtn) {
    toggleHideModeBtn.addEventListener('click', () => {
      console.info('Toggle hide mode button clicked');
      if (viewer && typeof viewer.toggleHideMode === 'function') {
        viewer.toggleHideMode();
      }
    });
  }

  // Search functionality
  if (searchInput) {
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();

        const query = searchInput.value.trim();
        if (!query) {
          return;
        }

        if (e.shiftKey) {
          // Shift+Enter goes to previous match
          viewer.previousMatch();
        } else {
          // Enter performs search or goes to next match
          if (viewer.searchMatches && viewer.searchMatches.length > 0) {
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
    searchInput.addEventListener('input', () => {
      viewer.searchMatches = [];
      viewer.currentMatchIndex = -1;
    });
  }

  if (searchNextBtn) {
    searchNextBtn.addEventListener('click', () => {
      try {
        if (!viewer) {
          console.warn('Viewer not available for search');
          return;
        }

        const query = searchInput ? searchInput.value.trim() : '';

        if (viewer.searchMatches && viewer.searchMatches.length > 0) {
          // Already have matches, go to next
          if (typeof viewer.nextMatch === 'function') {
            viewer.nextMatch();
          } else {
            console.warn('Viewer nextMatch method not available');
          }
        } else if (query) {
          // No matches yet but have a query, perform search
          if (typeof viewer.performSearch === 'function') {
            viewer.performSearch(query);
          } else {
            console.warn('Viewer performSearch method not available');
          }
        }
      } catch (e) { console.warn('Search next button failed', e); }
    });
  }

  // Help button - load and display instructions
  const helpBtn = document.getElementById('help-btn');
  if (helpBtn) {
    helpBtn.addEventListener('click', async () => {
      try {
        const helpModal = document.getElementById('helpModal');
        const helpContent = document.getElementById('help-content');

        if (!helpModal || !helpContent) return;

        // Show the modal
        const modal = new bootstrap.Modal(helpModal);
        modal.show();

        // Load the markdown content if not already loaded
        if (helpContent.querySelector('.spinner-border')) {
          try {
            const response = await fetch('instructions.md');
            const markdown = await response.text();

            // Use marked.js to convert markdown to HTML if available
            if (typeof marked !== 'undefined') {
              // Configure marked for GFM (GitHub Flavored Markdown) with tables
              marked.setOptions({
                gfm: true,
                breaks: true,
                headerIds: true,
                mangle: false
              });
              
              const html = marked.parse(markdown);
              helpContent.innerHTML = html;
            } else {
              // Fallback to basic conversion if marked.js is not available
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
            }
          } catch (e) {
            helpContent.innerHTML = '<div class="alert alert-warning">Failed to load help content. Please see instructions.md in the repository.</div>';
            console.error('Failed to load help content', e);
          }
        }
      } catch (e) { console.warn('Help button failed', e); }
    });
  }

  // About button functionality
  const aboutBtn = document.getElementById('about-btn');
  if (aboutBtn) {
    aboutBtn.addEventListener('click', async () => {
      try {
        const aboutModal = document.getElementById('aboutModal');
        const aboutContent = document.getElementById('about-content');

        if (!aboutModal || !aboutContent) return;

        // Show the modal
        const modal = new bootstrap.Modal(aboutModal);
        modal.show();

        // Load the markdown content if not already loaded
        if (aboutContent.querySelector('.spinner-border')) {
          try {
            const response = await fetch('about.md');
            const markdown = await response.text();

            // Use marked.js to convert markdown to HTML if available
            if (typeof marked !== 'undefined') {
              // Configure marked for GFM (GitHub Flavored Markdown)
              marked.setOptions({
                gfm: true,
                breaks: true,
                headerIds: true,
                mangle: false
              });
              
              const html = marked.parse(markdown);
              aboutContent.innerHTML = html;
            } else {
              // Fallback to basic conversion if marked.js is not available
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
                // Links
                .replace(/\[([^\]]+)\]\(([^)]+)\)/gim, '<a href="$2" target="_blank">$1</a>')
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

              aboutContent.innerHTML = html;
            }
          } catch (error) {
            console.error('Error loading about.md:', error);
            aboutContent.innerHTML = '<div class="alert alert-danger">Failed to load about information.</div>';
          }
        }
      } catch (error) {
        console.error('Error showing about modal:', error);
      }
    });
  }

  // Export button functionality
  const exportBtn = document.getElementById('export-btn');
  if (exportBtn) {
    exportBtn.addEventListener('click', () => {
      try {
        if (!viewer || !viewer.alignment) {
          console.warn('No alignment data to export');
          return;
        }

        const selectedRows = viewer.getSelectedRows ? viewer.getSelectedRows() : new Set();
        const selectedCols = viewer.getSelectedCols ? viewer.getSelectedCols() : new Set();
        
        // If only columns are selected (no rows), use all sequences
        const rowIndices = selectedRows.size > 0 
          ? Array.from(selectedRows).sort((a, b) => a - b)
          : Array.from({ length: viewer.alignment.length }, (_, i) => i);
        
        if (rowIndices.length === 0) {
          console.warn('No sequences to export');
          return;
        }
        
        // Get sorted column indices if any are selected
        const colIndices = selectedCols.size > 0 
          ? Array.from(selectedCols).sort((a, b) => a - b)
          : null;
        
        // Build FASTA text
        let fastaText = '';
        for (const rowIdx of rowIndices) {
          const seq = viewer.alignment[rowIdx];
          if (!seq) continue;
          
          // Get label
          const label = seq.label || seq.name || `sequence_${rowIdx}`;
          fastaText += `>${label}\n`;
          
          // Get sequence - either selected columns or full sequence
          let sequence;
          if (colIndices && colIndices.length > 0) {
            // Extract only selected columns
            sequence = colIndices.map(colIdx => {
              return (seq.sequence && seq.sequence[colIdx]) ? seq.sequence[colIdx] : '';
            }).join('');
          } else {
            // Use full sequence
            sequence = seq.sequence || '';
          }
          
          // Add sequence as single line (no wrapping)
          fastaText += sequence + '\n';
        }
        
        // Create a blob and download it
        const blob = new Blob([fastaText], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        
        // Generate filename with timestamp
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
        const rowCount = rowIndices.length;
        const colCount = colIndices ? colIndices.length : 'all';
        a.download = `alignment_${rowCount}seqs_${colCount}sites_${timestamp}.fasta`;
        
        // Trigger download
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        const exportColCount = colIndices ? colIndices.length : (viewer.alignment[0]?.sequence?.length || 0);
        console.info(`Exported ${rowCount} sequence(s) with ${exportColCount} position(s) as FASTA file`);
        
      } catch (error) {
        console.error('Export failed:', error);
      }
    });
  }

  // File upload modal functionality
  const openFileBtn = document.getElementById('open-file-btn');
  const fileUploadModal = document.getElementById('fileUploadModal');
  const fileDropZone = document.getElementById('file-drop-zone');
  const fileUploadInput = document.getElementById('file-upload-input');
  const fileSelectBtn = document.getElementById('file-select-btn');
  const fileLoading = document.getElementById('file-loading');
  const fileError = document.getElementById('file-error');
  const fileErrorText = document.getElementById('file-error-text');
  
  let fileModal = null;
  
  if (openFileBtn && fileUploadModal) {
    try {
      fileModal = new bootstrap.Modal(fileUploadModal);
      
      // Function to parse FASTA file
      function parseFasta(text) {
        const sequences = [];
        const lines = text.split('\n');
        let currentLabel = null;
        let currentSequence = '';
        
        for (let line of lines) {
          line = line.trim();
          if (line.startsWith('>')) {
            // Save previous sequence if exists
            if (currentLabel !== null) {
              sequences.push({
                label: currentLabel,
                sequence: currentSequence.toUpperCase()
              });
            }
            // Start new sequence
            currentLabel = line.substring(1).trim();
            currentSequence = '';
          } else if (line.length > 0) {
            currentSequence += line;
          }
        }
        
        // Save last sequence
        if (currentLabel !== null) {
          sequences.push({
            label: currentLabel,
            sequence: currentSequence.toUpperCase()
          });
        }
        
        return sequences;
      }
      
      // Function to handle file upload
      async function handleFileUpload(file) {
        try {
          // Validate file type
          const validExtensions = ['.fasta', '.fa', '.fna', '.ffn', '.faa', '.frn'];
          const fileName = file.name.toLowerCase();
          const isValid = validExtensions.some(ext => fileName.endsWith(ext));
          
          if (!isValid) {
            fileErrorText.textContent = 'Invalid file type. Please select a FASTA file (.fasta, .fa, .fna, etc.)';
            fileError.style.display = 'block';
            return;
          }
          
          // Show loading state
          fileDropZone.style.display = 'none';
          fileError.style.display = 'none';
          fileLoading.style.display = 'block';
          
          // Read file
          const text = await file.text();
          
          // Parse FASTA
          const newAlignment = parseFasta(text);
          
          if (newAlignment.length === 0) {
            throw new Error('No sequences found in file');
          }
          
          console.log(`Loaded ${newAlignment.length} sequences from ${file.name}`);
          
          // Wrap the parsed sequences in an Alignment class instance
          let alignmentInstance;
          try {
            alignmentInstance = new Alignment(newAlignment);
          } catch (e) {
            throw new Error('Failed to create Alignment instance: ' + e.message);
          }
          
          // Update global alignment variable
          window.alignment = alignmentInstance;
          
          // Update viewer with new data
          if (viewer && typeof viewer.setData === 'function') {
            // Reset viewer state when loading new file (if properties exist)
            if (viewer.selectedRows && typeof viewer.selectedRows.clear === 'function') {
              viewer.selectedRows.clear();
            }
            if (viewer.selectedCols && typeof viewer.selectedCols.clear === 'function') {
              viewer.selectedCols.clear();
            }
            if (viewer.labelTags && typeof viewer.labelTags.clear === 'function') {
              viewer.labelTags.clear();
            }
            if (viewer.siteBookmarks && typeof viewer.siteBookmarks.clear === 'function') {
              viewer.siteBookmarks.clear();
            }
            window.refRow = null;
            
            // Rebuild column offsets
            const newMaxSeqLen = Math.max(...newAlignment.map(s => s.sequence.length));
            window.maskStr = '1'.repeat(newMaxSeqLen);
            
            if (typeof viewer.buildColOffsetsFor === 'function') {
              viewer.colOffsets = viewer.buildColOffsetsFor(viewer.maskEnabled, {
                maxSeqLen: newMaxSeqLen,
                CHAR_WIDTH: viewer.charWidth,
                EXPANDED_RIGHT_PAD: viewer.EXPANDED_RIGHT_PAD || 2,
                REDUCED_COL_WIDTH: viewer.REDUCED_COL_WIDTH || 1,
                HIDDEN_MARKER_WIDTH: viewer.HIDDEN_MARKER_WIDTH || 4,
                hideMode: viewer.hideMode || false,
                maskStr: window.maskStr
              });
            }
            
            // Update canvas sizes
            if (typeof viewer.setCanvasCSSSizes === 'function') {
              viewer.setCanvasCSSSizes();
            }
            if (typeof viewer.resizeBackings === 'function') {
              viewer.resizeBackings();
            }
            
            // Invalidate overview cache
            if (viewer._overviewCacheInvalid !== undefined) {
              viewer._overviewCacheInvalid = true;
            }
            
            // Reset scroll position
            if (viewer.scroller) {
              viewer.scroller.scrollTop = 0;
              viewer.scroller.scrollLeft = 0;
            }
            
            console.info('File loaded successfully:', file.name);
            
            // Close modal
            fileModal.hide();
            
            // Load data using shared function
            loadDataIntoViewer(alignmentInstance);
            
          } else {
            throw new Error('Viewer not available');
          }
          
        } catch (error) {
          console.error('Error loading file:', error);
          fileErrorText.textContent = error.message || 'Failed to load file. Please check the file format.';
          fileError.style.display = 'block';
          fileLoading.style.display = 'none';
          fileDropZone.style.display = 'block';
        }
      }
      
      // Function to load example data (ebov.js)
      async function loadExampleData() {
        try {
          // Show loading state
          fileDropZone.style.display = 'none';
          fileError.style.display = 'none';
          fileLoading.style.display = 'block';
          
          // Check if ebov_alignment data is available
          if (!window.ebov_alignment || !Array.isArray(window.ebov_alignment)) {
            throw new Error('Example data not available. Make sure ebov.js is loaded.');
          }
          
          console.log(`Loading ${window.ebov_alignment.length} example sequences from ebov.js`);
          
          // Wrap the example data in an Alignment class instance
          let alignmentInstance;
          try {
            alignmentInstance = new Alignment(window.ebov_alignment);
          } catch (e) {
            throw new Error('Failed to create Alignment instance: ' + e.message);
          }
          
          // Update global alignment variable
          window.alignment = alignmentInstance;
          
          // Close modal first
          fileModal.hide();
          
          // Load the data into the viewer using the shared function
          loadDataIntoViewer(alignmentInstance);
          
          console.info('Example data loaded successfully');
          
        } catch (error) {
          console.error('Error loading example data:', error);
          fileErrorText.textContent = error.message || 'Failed to load example data.';
          fileError.style.display = 'block';
          fileLoading.style.display = 'none';
          fileDropZone.style.display = 'block';
        }
      }
      
      // Open file button click handler
      openFileBtn.addEventListener('click', () => {
        try {
          // Reset modal state
          fileDropZone.style.display = 'block';
          fileLoading.style.display = 'none';
          fileError.style.display = 'none';
          fileUploadInput.value = '';
          
          fileModal.show();
        } catch (e) {
          console.warn('Failed to open file upload modal', e);
        }
      });
      
      // Command-O keyboard shortcut
      document.addEventListener('keydown', (e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === 'o') {
          e.preventDefault();
          openFileBtn.click();
        }
      });
      
      // File select button
      if (fileSelectBtn && fileUploadInput) {
        fileSelectBtn.addEventListener('click', () => {
          fileUploadInput.click();
        });
      }
      
      // Load example data button
      const loadExampleBtn = document.getElementById('load-example-btn');
      if (loadExampleBtn) {
        loadExampleBtn.addEventListener('click', () => {
          loadExampleData();
        });
      }
      
      // File input change handler
      if (fileUploadInput) {
        fileUploadInput.addEventListener('change', (e) => {
          if (e.target.files && e.target.files.length > 0) {
            handleFileUpload(e.target.files[0]);
          }
        });
      }
      
      // Drag and drop handlers
      if (fileDropZone) {
        // Prevent default drag behaviors
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
          fileDropZone.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
          }, false);
        });
        
        // Highlight drop zone when dragging over
        ['dragenter', 'dragover'].forEach(eventName => {
          fileDropZone.addEventListener(eventName, () => {
            fileDropZone.classList.add('drag-over');
          }, false);
        });
        
        ['dragleave', 'drop'].forEach(eventName => {
          fileDropZone.addEventListener(eventName, () => {
            fileDropZone.classList.remove('drag-over');
          }, false);
        });
        
        // Handle dropped files
        fileDropZone.addEventListener('drop', (e) => {
          const files = e.dataTransfer.files;
          if (files.length > 0) {
            handleFileUpload(files[0]);
          }
        }, false);
        
        // Click on drop zone to select file
        fileDropZone.addEventListener('click', (e) => {
          // Don't trigger if clicking on the buttons or their children
          const loadExampleBtn = document.getElementById('load-example-btn');
          if (e.target === fileSelectBtn || fileSelectBtn.contains(e.target)) {
            return;
          }
          if (loadExampleBtn && (e.target === loadExampleBtn || loadExampleBtn.contains(e.target))) {
            return;
          }
          if (fileUploadInput) fileUploadInput.click();
        });
      }
      
    } catch (e) {
      console.warn('Failed to initialize file upload modal', e);
    }
  }

  // Populate local maskStr from utils
  try { maskStr = (window && window.refreshMaskStr) ? window.refreshMaskStr() : '1'.repeat(maxSeqLen); } catch (_) { maskStr = '1'.repeat(maxSeqLen); }

  // initial sizing + measure (only if viewer is ready)
  if (viewer) {
    viewer.measureCharWidth(getViewerProp('FONT', ''), { apply: true, maskEnabled: !!maskEnabled });
    viewer.measureRowHeightFromFonts({ apply: true });
    viewer.setCanvasCSSSizes();
  }
  // give the spacer a moment to size (if DOM still settling) then measure real width and backings
  requestAnimationFrame(() => {
    try {
      if (!viewer) return;
      viewer.measureCharWidthFromReal();
      viewer.measureRowHeightFromFonts({ apply: true });
      viewer.setCanvasCSSSizes();
      viewer.measureTextVerticalOffset();
      viewer.scheduleBackingResize();
    } catch (e) {
      console.error('Initialization rAF handler failed', e);
    } finally {
      // initialization complete (successful or not): hide the status overlay if present
      try { setStatus(null); } catch (_) { }
    }
  });

  // reflow handler: when the spacer's width might change (e.g., charset measurement), recompute
  let resizeDebounce;
  const observer = new ResizeObserver(() => {
    clearTimeout(resizeDebounce);
    resizeDebounce = setTimeout(() => {
      if (!viewer) return;
      viewer.measureCharWidthFromReal();
      viewer.setCanvasCSSSizes();
      viewer.measureTextVerticalOffset();
      viewer.scheduleBackingResize();
    }, 50);
  });
  if (scroller) observer.observe(scroller);

  // Snapping and scroll handling are delegated to the SealionViewer instance.

  // on window resize recompute backings
  window.addEventListener('resize', () => {
    if (!viewer) return;
    viewer.setCanvasCSSSizes();
    viewer.scheduleBackingResize();
  });

  // Compute and expose masks (these will be used by buttons after initialization)
  // This runs after viewer and alignment are set up
  setTimeout(() => {
    try {
      if (viewer && viewer.alignment) {
        const cm = viewer.alignment.computeConstantMask();
        window.constantMask = cm;
      }
    } catch (_) { }
    try {
      if (viewer && viewer.alignment) {
        const cam = viewer.alignment.computeConstantMaskAllowN();
        window.constantAmbiguousMask = cam;
      }
    } catch (_) { }
    try {
      if (viewer && viewer.alignment) {
        const cgm = viewer.alignment.computeConstantMaskAllowNAndGaps();
        window.constantGappedMask = cgm;
      }
    } catch (_) { }
  }, 500);

}

)();