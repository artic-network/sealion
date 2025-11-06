#!/usr/bin/env python3
"""
Simple headless smoke check: read local files and assert expected JS symbols exist.
Run from repo root (this script assumes files are at their committed paths).
Exits with code 0 on success, 2 on failure.
"""
import sys
from pathlib import Path

root = Path(__file__).resolve().parents[1]
index = root / 'index.html'
script = root / 'script.js'
sealion = root / 'sealion' / 'sealion.js'
# Some checkers place the viewer file at the repo root as `sealion.js`.
if not sealion.exists():
    alt = root / 'sealion.js'
    if alt.exists():
        sealion = alt

checks = []

# helper
def read(p):
    try:
        return p.read_text(encoding='utf8')
    except Exception as e:
        return None

print('Repo root:', root)

index_text = read(index)
script_text = read(script)
sealion_text = read(sealion)

if index_text is None:
    print('MISSING', index)
    sys.exit(2)
if script_text is None:
    print('MISSING', script)
    sys.exit(2)
if sealion_text is None:
    print('MISSING', sealion)
    sys.exit(2)

ok = True

# 1) index.html should reference alignment.js, sealion/sealion.js (or sealion.js), and script.js in that order
print('\n[1] Checking script order in index.html...')
order_targets = ['alignment.js', 'sealion/sealion.js', 'sealion.js', 'script.js']
found = [i for i,t in enumerate(order_targets) if t in index_text]
if not found:
    print('  WARNING: none of the expected script names found in index.html; check file includes')
    ok = False
else:
    # prefer the sequence alignment.js -> sealion -> script.js
    a = index_text.find('alignment.js')
    b = index_text.find('sealion')
    c = index_text.find('script.js')
    print('  positions: alignment.js=', a, 'sealion=', b, 'script.js=', c)
    if a == -1 or b == -1 or c == -1:
        print('  MISSING one or more expected script references in index.html')
        ok = False
    else:
        if not (a < b < c):
            print('  Order appears unexpected (alignment -> sealion -> script expected)')
            ok = False
        else:
            print('  OK: script order looks good')

# 2) sealion file should expose window.SealionViewer
print('\n[2] Checking sealion exports and methods...')
if 'window.SealionViewer' in sealion_text:
    print('  OK: window.SealionViewer present')
else:
    print('  MISSING: window.SealionViewer')
    ok = False

# 3) sealion should contain setMaskBitsForCols and startMaskTransition implementations
for sym in ('setMaskBitsForCols(', 'startMaskTransition('):
    if sym in sealion_text:
        print(f'  OK: {sym.strip("(")} found in sealion.js')
    else:
        print(f'  MISSING: {sym.strip("(")} not found in sealion.js')
        ok = False

# 4) script.js should delegate to viewer for mask methods
print('\n[3] Checking script.js delegations...')
# look for viewer delegation patterns
delegation_patterns = [
    'v.setMaskBitsForCols',
    'viewer.setMaskBitsForCols',
    'v.startMaskTransition',
    'viewer.startMaskTransition',
    "if(v && typeof v.setMaskBitsForCols",
    "if(v && typeof v.startMaskTransition",
]
found_any = False
for p in delegation_patterns:
    if p in script_text:
        print('  OK: delegation pattern found:', p)
        found_any = True
found_any2 = ('startMaskTransition(' in script_text and 'maskAnimRequest' not in script_text[:2000])
if not found_any:
    print('  WARNING: no explicit delegation patterns found; script.js may still contain fallback logic')
    # don't mark as fail yet; just warn

# 5) sanity: script.js still contains legacy fallback startMaskTransition function (it may, that's ok)
if 'function startMaskTransition' in script_text:
    print('  NOTE: script.js still defines startMaskTransition (fallback present)')

# 6) ensure colOffsets builder exists in viewer and script
print('\n[4] colOffsets builders...')
if 'buildColOffsetsFor' in sealion_text:
    print('  OK: buildColOffsetsFor present in sealion.js')
else:
    print('  MISSING: buildColOffsetsFor in sealion.js')
    ok = False
if 'buildColOffsetsFor' in script_text or 'buildColOffsets' in script_text:
    print('  OK: colOffsets builder present in script.js (legacy)')
else:
    print('  WARNING: script.js may have removed legacy colOffsets builder')

# 7) quick grep for viewer usage in script
print('\n[5] viewer usage occurrences in script.js...')
uses = [m.start() for m in __import__('re').finditer('viewer', script_text)]
print('  viewer occurrences:', len(uses))

# Summary
print('\nSUMMARY:')
if ok:
    print('  PASS: basic headless checks OK')
    sys.exit(0)
else:
    print('  FAIL: one or more checks failed (see messages above)')
    sys.exit(2)
