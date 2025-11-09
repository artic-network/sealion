# SealionViewer API Documentation

## Overview

The `SealionViewer` class is a comprehensive alignment visualization component that renders multiple sequence alignments with interactive features including selection, search, masking, and difference navigation.

## Constructor

### `new SealionViewer(containerOrSelector, alignment, options)`

Creates a new SealionViewer instance.

**Parameters:**
- `containerOrSelector` (String | HTMLElement): Either a DOM element or a CSS selector string (e.g., '#app' or 'app')
- `alignment` (Array): Array of alignment row objects with `label` and `sequence` properties
- `options` (Object, optional): Configuration options to override defaults (see `SealionViewer.DEFAULTS`)

**Example:**
```javascript
const viewer = new SealionViewer('#viewer-container', alignment, {
  FONT_SIZE: 16,
  ROW_HEIGHT: 24,
  maskEnabled: false
});
```

---

## Data Management

### `setData(alignment, opts)`

Updates the alignment data after construction and rebuilds the viewer.

**Parameters:**
- `alignment` (Array): New alignment data
- `opts` (Object, optional): Additional options
  - `maskStr` (String): Mask string to apply

**Returns:** void

**Description:** Rebuilds column offsets, updates canvas sizes, and schedules a render.

---

## Navigation & Search

### `performSearch(query)`

Searches for sequences by label or sequence content.

**Parameters:**
- `query` (String): Search query string

**Returns:** void

**Description:** Initializes search matches, selects and scrolls to the first match.

### `nextMatch()`

Navigates to the next search match (wraps around).

**Returns:** void

### `previousMatch()`

Navigates to the previous search match (wraps around).

**Returns:** void

### `findMatches(q)`

Finds all rows matching the query string.

**Parameters:**
- `q` (String): Query string to search for

**Returns:** Array<number> - Array of matching row indices

---

## Difference Navigation

### `findNextDifference(fromCol, refStr, selectedRows)`

Finds the next column with a difference from the reference sequence.

**Parameters:**
- `fromCol` (Number): Starting column index
- `refStr` (String): Reference sequence string
- `selectedRows` (Set<number>, optional): Set of row indices to check (checks all if not provided)

**Returns:** Number - Column index of next difference, or -1 if none found

**Description:** Ignores 'N' and '-' characters when comparing.

### `findPreviousDifference(fromCol, refStr, selectedRows)`

Finds the previous column with a difference from the reference sequence.

**Parameters:**
- `fromCol` (Number): Starting column index
- `refStr` (String): Reference sequence string
- `selectedRows` (Set<number>, optional): Set of row indices to check (checks all if not provided)

**Returns:** Number - Column index of previous difference, or -1 if none found

**Description:** Ignores 'N' and '-' characters when comparing.

### `jumpToNextDifference(refStr)`

Jumps to the next difference site: selects the column, centers it horizontally, and scrolls to the first row with a difference.

**Parameters:**
- `refStr` (String): Reference sequence string

**Returns:** void

**Description:** Only scrolls vertically when no rows are selected.

### `jumpToPreviousDifference(refStr)`

Jumps to the previous difference site: selects the column, centers it horizontally, and scrolls to the first row with a difference.

**Parameters:**
- `refStr` (String): Reference sequence string

**Returns:** void

**Description:** Only scrolls vertically when no rows are selected.

---

## Rendering

### `scheduleRender()`

Schedules a render on the next animation frame (debounced).

**Returns:** void

### `drawAll()`

Renders all viewer components (overview, header, consensus, labels, sequences).

**Returns:** void

### `cancelRender()`

Cancels any pending render.

**Returns:** void

---

## Canvas Management

### `setCanvasCSSSizes(opts)`

Updates CSS dimensions of all canvases.

**Parameters:**
- `opts` (Object, optional): Options including `LABEL_WIDTH`

**Returns:** void

### `resizeBackings(opts)`

Updates backing store (pixel) dimensions of all canvases.

**Parameters:**
- `opts` (Object, optional): Options including `LABEL_WIDTH`

**Returns:** void

### `scheduleBackingResize()`

Schedules a backing resize on the next animation frame (debounced).

**Returns:** void

### `enforceIntegerGeometry()`

Ensures all canvas geometry uses integer pixel values.

**Returns:** void

### `ensureCanvasBacking(canvas)`

Ensures a canvas has the correct backing store size.

**Parameters:**
- `canvas` (HTMLCanvasElement): Canvas to check

**Returns:** void

---

## Drawing Methods

### `drawOverview(canvas, visible, opts)`

Draws the overview visualization.

**Parameters:**
- `canvas` (HTMLCanvasElement): Target canvas
- `visible` (Object): Visible region information
- `opts` (Object): Drawing options

**Returns:** void

### `drawHeader(canvas, visible, opts)`

Draws the header ruler with position markers.

**Parameters:**
- `canvas` (HTMLCanvasElement): Target canvas
- `visible` (Object): Visible region information
- `opts` (Object): Drawing options including `selectedCols`

**Returns:** void

### `drawConsensus(canvas, visible, opts)`

Draws the consensus sequence row.

**Parameters:**
- `canvas` (HTMLCanvasElement): Target canvas
- `visible` (Object): Visible region information
- `opts` (Object): Drawing options

**Returns:** void

### `drawLabels(canvas, visible, opts)`

Draws the sequence labels.

**Parameters:**
- `canvas` (HTMLCanvasElement): Target canvas
- `visible` (Object): Visible region information
- `opts` (Object): Drawing options including `selectedRows`, `refIndex`

**Returns:** void

### `drawLabelsHeader(canvas, visible, opts)`

Draws the labels header area.

**Parameters:**
- `canvas` (HTMLCanvasElement): Target canvas
- `visible` (Object): Visible region information
- `opts` (Object): Drawing options

**Returns:** void

### `drawLabelsOutline(canvas, visible, opts)`

Draws the labels outline in the overview area.

**Parameters:**
- `canvas` (HTMLCanvasElement): Target canvas
- `visible` (Object): Visible region information
- `opts` (Object): Drawing options

**Returns:** void

### `drawLabelsConsensus(canvas, visible, opts)`

Draws the labels consensus area.

**Parameters:**
- `canvas` (HTMLCanvasElement): Target canvas
- `visible` (Object): Visible region information
- `opts` (Object): Drawing options

**Returns:** void

### `drawSequences(canvas, visible, opts)`

Draws the main sequence alignment view.

**Parameters:**
- `canvas` (HTMLCanvasElement): Target canvas
- `visible` (Object): Visible region information
- `opts` (Object): Drawing options including:
  - `selectedRows` (Set): Selected row indices
  - `selectedCols` (Set): Selected column indices
  - `refStr` (String): Reference sequence
  - `refModeEnabled` (Boolean): Whether to highlight differences
  - `maskEnabled` (Boolean): Whether masking is enabled

**Returns:** void

### `drawColumnSelectionOverlay(target, visible, opts)`

Draws column selection overlay.

**Parameters:**
- `target` (HTMLCanvasElement): Target canvas
- `visible` (Object): Visible region information
- `opts` (Object): Drawing options including `selectedCols`

**Returns:** void

---

## Font & Measurement

### `measureCharWidth(font, opts)`

Measures character width for a given font.

**Parameters:**
- `font` (String): CSS font string (e.g., '14px monospace')
- `opts` (Object, optional): Options
  - `apply` (Boolean): Whether to apply the measurement to instance properties

**Returns:** Number - Character width in CSS pixels

### `measureCharWidthFromReal(font)`

Measures character width by rendering to an actual canvas.

**Parameters:**
- `font` (String): CSS font string

**Returns:** Number - Character width in CSS pixels

### `measureTextVerticalOffset(opts)`

Measures vertical text offset for proper alignment.

**Parameters:**
- `opts` (Object, optional): Measurement options

**Returns:** void - Updates instance properties `seqTextVertOffset` and `labelTextVertOffset`

### `measureRowHeightFromFonts(opts)`

Measures row height based on current fonts.

**Parameters:**
- `opts` (Object, optional): Options
  - `apply` (Boolean): Whether to apply the measurement to instance properties

**Returns:** Number - Measured row height

### `updateFontSize(delta)`

Updates font size by a given delta.

**Parameters:**
- `delta` (Number): Font size change (positive to increase, negative to decrease)

**Returns:** void

**Description:** Updates fonts, remeasures, rebuilds geometry, and re-renders.

### `resetFontSize()`

Resets font sizes to their initial values.

**Returns:** void

---

## Column & Masking

### `buildColOffsets(numCols, colWidth)`

Builds a simple column offset array with uniform width.

**Parameters:**
- `numCols` (Number): Number of columns
- `colWidth` (Number): Width per column

**Returns:** Array<number> - Column offset positions

### `buildColOffsetsFor(maskEnabled, opts)`

Builds column offset array with masking support.

**Parameters:**
- `maskEnabled` (Boolean): Whether masking is enabled
- `opts` (Object): Options including:
  - `maxSeqLen` (Number): Maximum sequence length
  - `CHAR_WIDTH` (Number): Character width
  - `EXPANDED_RIGHT_PAD` (Number): Right padding for expanded columns
  - `REDUCED_COL_WIDTH` (Number): Width for collapsed columns
  - `maskStr` (String): Mask string

**Returns:** Array<number> - Column offset positions

### `setMaskBitsForCols(colsSet, bitChar)`

Updates mask bits for a set of columns and animates the transition.

**Parameters:**
- `colsSet` (Set<number> | Array<number>): Column indices to modify
- `bitChar` (String): Character to set ('0' or '1')

**Returns:** void

### `startMaskTransition(toEnabled)`

Animates transition between masked and unmasked column layouts.

**Parameters:**
- `toEnabled` (Boolean): Target mask state

**Returns:** void

---

## Masking Computations

### `computeConstantMask()`

Computes columns where all sequences have the same character.

**Returns:** String - Mask string ('1' for constant, '0' for variable)

### `computeConstantMaskAllowN()`

Computes constant mask allowing 'N' characters.

**Returns:** String - Mask string

### `computeConstantMaskAllowNAndGaps()`

Computes constant mask allowing 'N' and '-' characters.

**Returns:** String - Mask string

### `computeConsensusSequence()`

Computes consensus sequence from the alignment.

**Returns:** String - Consensus sequence

---

## Viewport & Geometry

### `computeVisible(scroller, opts)`

Computes the visible region based on scroll position.

**Parameters:**
- `scroller` (HTMLElement): Scroll container element
- `opts` (Object): Options including:
  - `ROW_HEIGHT` (Number): Row height
  - `BUFFER_ROWS` (Number): Buffer rows above/below
  - `BUFFER_COLS` (Number): Buffer columns left/right
  - `rowCount` (Number): Total number of rows

**Returns:** Object - Visible region with properties:
  - `rowLo`, `rowHi`: Visible row range
  - `colLo`, `colHi`: Visible column range
  - `cssLeft`: Left scroll position

### `colIndexFromCssOffset(cssX)`

Maps CSS pixel offset to column index.

**Parameters:**
- `cssX` (Number): CSS pixel x coordinate

**Returns:** Number - Column index

### `rowFromClientY(clientY, opts)`

Maps client Y coordinate to row index.

**Parameters:**
- `clientY` (Number): Client Y coordinate
- `opts` (Object, optional): Options including `labelCanvas`, `scroller`, `ROW_HEIGHT`, `rowCount`

**Returns:** Number - Row index

---

## Scrolling & Animation

### `animateScrollTo(targetLeft, targetTop, scroller, duration = 300)`

Animates scrolling to target position.

**Parameters:**
- `targetLeft` (Number): Target horizontal scroll position
- `targetTop` (Number): Target vertical scroll position
- `scroller` (HTMLElement): Scroll container
- `duration` (Number, optional): Animation duration in milliseconds (default: 300)

**Returns:** void

### `snapScrollToChar(startLeft, scroller)`

Snaps scroll position to nearest column boundary.

**Parameters:**
- `startLeft` (Number): Starting scroll position
- `scroller` (HTMLElement): Scroll container

**Returns:** void

---

## Interaction

### `attachInteractionHandlers(opts)`

Attaches mouse and keyboard event handlers to the viewer.

**Parameters:**
- `opts` (Object, optional): Handler options

**Returns:** void

**Description:** Sets up all interaction handlers including:
- Label column resizing
- Row and column selection
- Rectangular selection
- Overview navigation
- Keyboard shortcuts
- Scroll snapping

---

## Display State

### `refreshDPR()`

Refreshes device pixel ratio and schedules re-render.

**Returns:** void

**Description:** Call when display DPI changes or window moves between displays.

### `toggleHideMode()`

Toggles hide mode for collapsed columns.

**Returns:** void

**Description:** When hide mode is enabled, collapsed regions are reduced to near-zero width with a pale grey marker (4px wide) at the center of each collapsed region. This provides maximum space for viewing variable sites while maintaining visual context. Toggle with Cmd+H keyboard shortcut or the toolbar button.

---

## Default Configuration

### `SealionViewer.DEFAULTS`

Object containing default configuration values:

**Visual Settings:**
- `FONT_SIZE`: 14
- `FONT`: '14px monospace'
- `HEADER_FONT`: '12px sans-serif'
- `LABEL_WIDTH`: 260
- `ROW_HEIGHT`: 20
- `ROW_PADDING`: 6
- `HEADER_HEIGHT`: 30
- `OVERVIEW_HEIGHT`: 48
- `CONSENSUS_HEIGHT`: 20
- `CONSENSUS_TOP_PAD`: 4
- `CONSENSUS_BOTTOM_PAD`: 8

**Layout Settings:**
- `EXPANDED_RIGHT_PAD`: 2
- `REDUCED_COL_WIDTH`: 1
- `HIDDEN_MARKER_WIDTH`: 4
- `HIDDEN_MARKER_COLOR`: '#d0d0d0'
- `COMPRESSED_CELL_VPAD`: 2
- `BUFFER_ROWS`: 2
- `BUFFER_COLS`: 5
- `MASK_ANIM_MS`: 220

**Colors:**
- `BASE_COLORS`: Object with nucleotide colors
  - `A`: '#2ca02c' (green)
  - `C`: '#1f77b4' (blue)
  - `G`: '#d62728' (red)
  - `T`: '#ff7f0e' (orange)
- `DEFAULT_BASE_COLOR`: '#666'
- `PALE_REF_COLOR`: '#e6e6e6'
- `REF_ACCENT`: '#2b8cff'
- `OVERVIEW_BG`: '#f7f7f7'
- `HEADER_BG`: '#f3f3f3'
- `CONSENSUS_BG`: '#fafafa'
- `LABELS_BG`: '#f3f3f3'
- `SEQ_SELECTED_ROW`: '#cfe8ff'
- `SEQ_EVEN_ROW`: '#fff'
- `SEQ_ODD_ROW`: '#fafafa'
- `SEQ_COL_SELECTION`: 'rgba(0,120,200,0.9)'

**Behavior:**
- `maskEnabled`: true
- `snapEnabled`: true

---

## Instance Properties

The viewer exposes many properties that can be read or modified:

**DOM References:**
- `container`: Main container element
- `labelCanvas`, `seqCanvas`, `headerCanvas`, `consensusCanvas`, `overviewCanvas`: Canvas elements
- `scroller`: Scroll container element

**Alignment Data:**
- `alignment`: Current alignment array
- `colOffsets`: Column position offsets
- `maskStr`: Current mask string
- `maskEnabled`: Whether masking is active
- `hideMode`: Whether hide mode is enabled (collapsed regions shown as markers)

**Selection State:**
- `selectedRows`: Set of selected row indices
- `selectedCols`: Set of selected column indices
- `anchorRow`, `anchorCol`: Selection anchor points

**Reference & Display:**
- `refModeEnabled`: Whether to highlight differences from reference
- `charWidth`: Character width in pixels
- `ROW_HEIGHT`: Row height in pixels
- `LABEL_WIDTH`: Label column width

**Search State:**
- `searchMatches`: Array of search match row indices
- `currentMatchIndex`: Current search match index

---

## Usage Examples

### Basic Initialization
```javascript
const alignment = [
  { label: 'Seq1', sequence: 'ATCGATCG' },
  { label: 'Seq2', sequence: 'ATCGATCG' },
  { label: 'Seq3', sequence: 'ATCGTTCG' }
];

const viewer = new SealionViewer('#app', alignment);
```

### Updating Data
```javascript
viewer.setData(newAlignment);
```

### Search and Navigation
```javascript
viewer.performSearch('Seq1');
viewer.nextMatch();
viewer.previousMatch();
```

### Difference Navigation
```javascript
const refSequence = alignment[0].sequence;
viewer.jumpToNextDifference(refSequence);
viewer.jumpToPreviousDifference(refSequence);
```

### Font Size Control
```javascript
viewer.updateFontSize(2);  // Increase by 2px
viewer.updateFontSize(-2); // Decrease by 2px
viewer.resetFontSize();    // Reset to initial
```

### Masking
```javascript
// Compute constant sites
const mask = viewer.computeConstantMask();

// Enable masking
viewer.maskEnabled = true;
viewer.startMaskTransition(true);

// Collapse specific columns
viewer.setMaskBitsForCols([5, 10, 15], '0');

// Toggle hide mode
viewer.toggleHideMode(); // Collapsed regions shown as pale grey markers
```

### Custom Configuration
```javascript
const viewer = new SealionViewer('#app', alignment, {
  FONT_SIZE: 16,
  ROW_HEIGHT: 24,
  LABEL_WIDTH: 300,
  BASE_COLORS: {
    'A': '#00ff00',
    'C': '#0000ff',
    'G': '#ff0000',
    'T': '#ffff00'
  },
  maskEnabled: false
});
```

---

## Event Handling

The viewer handles the following interactions automatically when `attachInteractionHandlers()` is called:

**Mouse Events:**
- Click and drag on labels to select rows
- Click and drag on header/consensus to select columns
- Alt+Click and drag on sequences for rectangular selection
- Cmd+Click on sequences to pan/drag
- Click on overview to jump to position
- Drag on label divider to resize label column

**Keyboard Shortcuts:**
- Arrow keys: Scroll by character
- Alt+Arrow: Scroll by page
- Shift+Arrow: Jump to extents
- Cmd+A: Select all
- Cmd+Plus/Minus: Collapse/expand selected columns
- Cmd+Alt+Plus/Minus: Change font size
- Cmd+D: Toggle colour differences mode
- Cmd+H: Toggle hide mode (collapsed regions as markers)
- Space: Hold to enable panning mode

---

## Notes

- All coordinate systems use CSS pixels unless otherwise specified
- Canvas backing stores are automatically scaled for device pixel ratio
- Column offsets adapt based on masking state (collapsed vs expanded vs hidden)
- Hide mode reduces collapsed regions to near-zero width with 4px pale grey markers at region centers
- Difference navigation ignores 'N' and '-' characters
- Search is case-insensitive and searches both labels and sequences
- Animations use `requestAnimationFrame` for smooth performance
