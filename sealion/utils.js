// sealion/utils.js
// Small utilities extracted from script.js to centralize pure helpers.
// These are safe, viewer-independent functions used during the staged migration.
(function(exports){
  // Normalize and return a mask string of length `maxSeqLen`.
  // Uses window.alignment and window.mask when called without arguments for
  // backwards compatibility; callers may pass explicit args.
  function refreshMaskStr(rows, maxSeqLen, mask){
    try{
      const _rows = rows || (window && window.alignment) || [];
      const _max = (typeof maxSeqLen === 'number') ? Math.max(0, maxSeqLen) : Math.max(0, ...(_rows.map(r=> (r && r.sequence) ? r.sequence.length : 0)));
      let s = (typeof mask !== 'undefined') ? mask : (window ? window.mask : null);
      if(s){
        s = String(s || '');
        if(s.length < _max){ s = s + '1'.repeat(Math.max(0, _max - s.length)); }
        else if(s.length > _max){ s = s.slice(0, _max); }
      } else {
        s = '1'.repeat(_max);
      }
      try{ if(window) window.mask = s; }catch(_){ }
      try{ if(window) window.__maskStr = s; }catch(_){ }
      return s;
    }catch(e){
      const fallback = '1'.repeat(Math.max(0, (maxSeqLen || 0)));
      try{ if(window) window.mask = fallback; }catch(_){ }
      try{ if(window) window.__maskStr = fallback; }catch(_){ }
      return fallback;
    }
  }

  // Compute reference string and index. Returns { refStr, refIndex }.
  // Uses window.alignment, window.reference and window.consensusSequence when
  // called without explicit args for backwards compatibility.
  function refreshRefStr(rows, reference, maxSeqLen, consensusSequence){
    try{
      const _rows = rows || (window && window.alignment) || [];
      const _max = (typeof maxSeqLen === 'number') ? Math.max(0, maxSeqLen) : Math.max(0, ...(_rows.map(r=> (r && r.sequence) ? r.sequence.length : 0)));
      const _ref = (typeof reference !== 'undefined') ? reference : (window ? window.reference : null);
      let refStr = null;
      if(typeof _ref !== 'undefined' && _ref){
        const s = String(_ref);
        if(s.length >= _max) refStr = s; else refStr = null;
      } else {
        refStr = null;
      }
      let refIndex = null;
      try{
        if(refStr && Array.isArray(_rows)){
          const idx = _rows.findIndex(r => (r && r.sequence) ? String(r.sequence) === refStr : false);
          refIndex = (idx >= 0) ? idx : null;
        } else {
          refIndex = null;
        }
      }catch(_){ refIndex = null; }
      try{ const cons = (typeof consensusSequence !== 'undefined') ? consensusSequence : (window ? window.consensusSequence : null); if(refStr && cons && String(refStr) === String(cons)) refIndex = null; }catch(_){ }
      try{ if(window) window.__refStr = refStr; }catch(_){ }
      try{ if(window) window.__refIndex = refIndex; }catch(_){ }
      return { refStr: refStr, refIndex: refIndex };
    }catch(e){
      try{ if(window) window.__refStr = null; }catch(_){ }
      try{ if(window) window.__refIndex = null; }catch(_){ }
      return { refStr: null, refIndex: null };
    }
  }

  // Expose both as properties on window.SealionUtils and also as globals for
  // simple backwards compatibility (script.js historically called these by name).
  exports = exports || window.SealionUtils || {};
  exports.refreshMaskStr = refreshMaskStr;
  exports.refreshRefStr = refreshRefStr;
  // Compute a mask that marks constant sites (0) vs variable sites (1).
  // rows: array of objects with `.sequence` string property. maxSeqLen: integer.
  function computeConstantMask(rows, maxSeqLen){
    try{
      const _rows = rows || (window && window.alignment) || [];
      const _max = (typeof maxSeqLen === 'number') ? Math.max(0, maxSeqLen) : Math.max(0, ...(_rows.map(r=> (r && r.sequence) ? r.sequence.length : 0)));
      const out = new Array(Math.max(0, _max));
      for(let c=0;c<_max;c++){
        let first = null;
        let constant = true;
        for(let r=0;r<_rows.length;r++){
          const seq = (_rows[r] && _rows[r].sequence) ? _rows[r].sequence : '';
          const ch = seq.charAt(c) || '';
          if(first === null) first = ch;
          else if(ch !== first){ constant = false; break; }
        }
        out[c] = constant ? '0' : '1';
      }
      const mask = out.join('');
      try{ if(window) window.constantMask = String(mask); }catch(_){ }
      return mask;
    }catch(e){ try{ if(window) window.constantMask = '1'.repeat(Math.max(0, (maxSeqLen||0))); }catch(_){ } return '1'.repeat(Math.max(0, (maxSeqLen||0))); }
  }

  // Compute consensus sequence: most frequent base per column. Ties/empty -> 'N'.
  function computeConsensusSequence(rows, maxSeqLen){
    try{
      const _rows = rows || (window && window.alignment) || [];
      const _max = (typeof maxSeqLen === 'number') ? Math.max(0, maxSeqLen) : Math.max(0, ...(_rows.map(r=> (r && r.sequence) ? r.sequence.length : 0)));
      const out = new Array(Math.max(0, _max));
      for(let c=0;c<_max;c++){
        const counts = new Map();
        for(let r=0;r<_rows.length;r++){
          const seq = (_rows[r] && _rows[r].sequence) ? _rows[r].sequence : '';
          const ch = (seq.charAt(c) || '').toUpperCase();
          const prev = counts.get(ch) || 0;
          counts.set(ch, prev + 1);
        }
        let best = ''; let bestCount = -1;
        const preferred = ['A','C','G','T'];
        for(const b of preferred){ const cnt = counts.get(b) || 0; if(cnt > bestCount){ best = b; bestCount = cnt; } }
        if(bestCount <= 0){
          for(const [k,v] of counts.entries()){ if(!k) continue; if(v > bestCount){ best = k; bestCount = v; } }
        }
        if(!best || best === '') best = 'N';
        out[c] = best;
      }
      const cons = out.join('');
      try{ if(window) window.consensusSequence = cons; }catch(_){ }
      return cons;
    }catch(e){ try{ if(window) window.consensusSequence = 'N'.repeat(Math.max(0, (maxSeqLen||0))); }catch(_){ } return 'N'.repeat(Math.max(0, (maxSeqLen||0))); }
  }

  // Compute constant mask treating 'N' as ambiguous wildcard
  function computeConstantMaskAllowN(rows, maxSeqLen){
    try{
      const _rows = rows || (window && window.alignment) || [];
      const _max = (typeof maxSeqLen === 'number') ? Math.max(0, maxSeqLen) : Math.max(0, ...(_rows.map(r=> (r && r.sequence) ? r.sequence.length : 0)));
      const out = new Array(Math.max(0, _max));
      for(let c=0;c<_max;c++){
        let firstNonAmbig = null;
        let constant = true;
        for(let r=0;r<_rows.length;r++){
          const seq = (_rows[r] && _rows[r].sequence) ? _rows[r].sequence : '';
          const ch = (seq.charAt(c) || '').toUpperCase();
          if(ch === 'N' || ch === '') continue;
          if(firstNonAmbig === null) firstNonAmbig = ch;
          else if(ch !== firstNonAmbig){ constant = false; break; }
        }
        out[c] = constant ? '0' : '1';
      }
      const mask = out.join('');
      try{ if(window) window.constantAmbiguousMask = String(mask); }catch(_){ }
      return mask;
    }catch(e){ try{ if(window) window.constantAmbiguousMask = '1'.repeat(Math.max(0, (maxSeqLen||0))); }catch(_){ } return '1'.repeat(Math.max(0, (maxSeqLen||0))); }
  }

  // Compute constant mask treating 'N' and '-' (gap) as ambiguous
  function computeConstantMaskAllowNAndGaps(rows, maxSeqLen){
    try{
      const _rows = rows || (window && window.alignment) || [];
      const _max = (typeof maxSeqLen === 'number') ? Math.max(0, maxSeqLen) : Math.max(0, ...(_rows.map(r=> (r && r.sequence) ? r.sequence.length : 0)));
      const out = new Array(Math.max(0, _max));
      for(let c=0;c<_max;c++){
        let firstNonAmbig = null;
        let constant = true;
        for(let r=0;r<_rows.length;r++){
          const seq = (_rows[r] && _rows[r].sequence) ? _rows[r].sequence : '';
          const ch = (seq.charAt(c) || '').toUpperCase();
          if(ch === 'N' || ch === '-' || ch === '') continue;
          if(firstNonAmbig === null) firstNonAmbig = ch;
          else if(ch !== firstNonAmbig){ constant = false; break; }
        }
        out[c] = constant ? '0' : '1';
      }
      const mask = out.join('');
      try{ if(window) window.constantGappedMask = String(mask); }catch(_){ }
      return mask;
    }catch(e){ try{ if(window) window.constantGappedMask = '1'.repeat(Math.max(0, (maxSeqLen||0))); }catch(_){ } return '1'.repeat(Math.max(0, (maxSeqLen||0))); }
  }

  // expose new utilities
  exports.computeConstantMask = computeConstantMask;
  exports.computeConsensusSequence = computeConsensusSequence;
  exports.computeConstantMaskAllowN = computeConstantMaskAllowN;
  exports.computeConstantMaskAllowNAndGaps = computeConstantMaskAllowNAndGaps;
  try{ if(window) { window.SealionUtils = window.SealionUtils || {}; window.SealionUtils.computeConstantMask = computeConstantMask; window.SealionUtils.computeConsensusSequence = computeConsensusSequence; window.SealionUtils.computeConstantMaskAllowN = computeConstantMaskAllowN; window.SealionUtils.computeConstantMaskAllowNAndGaps = computeConstantMaskAllowNAndGaps; } }catch(_){ }
  // attach globals for backward compatibility
  try{ if(window){ window.computeConstantMask = computeConstantMask; window.computeConsensusSequence = computeConsensusSequence; window.computeConstantMaskAllowN = computeConstantMaskAllowN; window.computeConstantMaskAllowNAndGaps = computeConstantMaskAllowNAndGaps; } }catch(_){ }
  // attach to window.SealionUtils
  try{ if(window) window.SealionUtils = window.SealionUtils || {}; window.SealionUtils.refreshMaskStr = refreshMaskStr; window.SealionUtils.refreshRefStr = refreshRefStr; }catch(_){ }
  // attach globals (so unqualified calls like `refreshMaskStr()` in script.js will find them)
  try{ if(window) { window.refreshMaskStr = refreshMaskStr; window.refreshRefStr = function(){ const r = refreshRefStr(); return r; }; } }catch(_){ }

})(window.SealionUtils);
