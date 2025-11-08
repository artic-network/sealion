# Sealion Instructions

Sealion is an interactive alignment viewer for visualizing and analyzing nucleotide sequence alignments.

## Overview

The interface consists of:
- **Toolbar** - Controls for font size, column collapse/expand, coloring, sorting, and search
- **Alignment view** - Main canvas showing sequences with labels on the left
- **Header** - Position numbers and consensus sequence
- **Overview panel** - Minimap showing the entire alignment

## Navigation

### Mouse Controls

- **Click and drag** - Pan the alignment view
- **Scroll wheel** - Vertical scrolling through sequences
- **Shift + scroll wheel** - Horizontal scrolling through positions
- **Click on label** - Select a sequence
- **Cmd+click (Ctrl+click)** - Add/remove sequences from selection
- **Click on header** - Select a column
- **Click and drag on canvas** - Rectangle selection of cells
- **Drag label divider** - Resize the label column width

### Keyboard Shortcuts

- **Arrow keys** - Navigate through the alignment
- **Cmd+0** (Ctrl+0) - Reset font size to default
- **Cmd+G** (Ctrl+G) - Go to next search match
- **Cmd+-** (Ctrl+-) - Collapse selected columns
- **Cmd+=** (Ctrl+=) - Expand selected columns
- **Enter** - Perform search or go to next match
- **Shift+Enter** - Go to previous search match

## Toolbar Features

### Font Size Controls

- **Zoom In** <i class="bi bi-zoom-in"></i> - Increase font size for better readability
- **Zoom Out** <i class="bi bi-zoom-out"></i> - Decrease font size to see more at once
- **Cmd+0** - Reset to default font size

### Column Collapse/Expand

Compress or expand columns to focus on variable sites or save screen space.

- **Collapse** <i class="bi bi-arrows-collapse"></i> - Collapse selected columns to 1px width
- **Expand** <i class="bi bi-arrows-expand"></i> - Restore selected columns to full width

#### Collapse Presets

Use the dropdown menu to quickly collapse common patterns:

- **Constant sites** - Collapse all positions where all sequences have the same nucleotide (A, C, G, T, or U only)
- **Constant (allow N)** - Collapse constant sites, treating ambiguous 'N' as matching any nucleotide
- **Constant (allow N & -)** - Collapse constant sites, treating both 'N' and gap '-' as matching
- **Expand all** - Restore all columns to full width
- **Collapse all** - Collapse all columns to minimum width

**Note:** Collapse operations are cumulative. Each preset ANDs with the current mask, so sites already collapsed stay collapsed.

### Colour Controls

Control how nucleotides are colored in the alignment.

- **Colour all sites** - Show nucleotide colors at all positions
- **Colour differences only** - Show colors only where sequences differ from the reference
  - If no reference is set, the consensus sequence is used automatically
- **Set selected as reference** - Use the currently selected sequence as the reference for difference coloring
- **Set consensus as reference** - Use the consensus sequence (most common nucleotide at each position) as the reference

#### Color Scheme

- **A** - Green
- **C** - Blue  
- **G** - Yellow/Gold
- **T/U** - Red
- **N** - Gray (ambiguous)
- **-** - White/Light gray (gap)

### Sort Controls

Reorder sequences using various criteria:

- **Original order** - Restore the original input order
- **Sort by label (A→Z / Z→A)** - Alphabetical by sequence name
- **Sort by selected column (A→Z / Z→A)** - Alphabetical by nucleotide at the selected position
  - Select a column first by clicking on the header
- **Sort by start position (0→N / N→0)** - Order by where each sequence begins (useful for aligned reads)
- **Sort by sequence length (short→long / long→short)** - Order by total sequence length

### Search

Use the search box to find sequences by label name:

1. Type a query in the search box
2. Press **Enter** or click the search button to find matches
3. Press **Enter** again or **Cmd+G** to go to the next match
4. Press **Shift+Enter** to go to the previous match
5. The view will automatically scroll to show each match
6. Modifying the search query clears previous results

## Selection

### Row Selection (Sequences)

- **Click** a label to select that sequence
- **Cmd+click** (Ctrl+click) to add/remove from selection
- **Click and drag** on labels for range selection
- Selected sequences are highlighted and can be used for operations like "Set selected as reference"

### Column Selection (Positions)

- **Click** on the header to select a column
- **Cmd+click** to add/remove columns from selection
- Selected columns can be collapsed/expanded or used for sorting

### Rectangle Selection

- **Click and drag** on the alignment canvas to select a rectangular region
- Useful for selecting multiple sequences and positions at once

## Tips and Tricks

1. **Focus on variable sites**: Use "Constant sites" collapse preset to hide invariant positions and focus on differences

2. **Compare to reference**: Set a sequence as reference and use "Colour differences only" to quickly spot variations

3. **Find outliers**: Sort by selected column to group sequences with the same nucleotide at a position of interest

4. **Navigate large alignments**: Use the overview panel to jump to different regions quickly

5. **Adjust view density**: Decrease font size to see more sequences on screen, or increase to examine details

6. **Cumulative filtering**: Apply multiple collapse presets sequentially to refine which columns are visible

7. **Quick search**: Use Cmd+G to rapidly cycle through search results without using the mouse

## Technical Notes

- The viewer uses virtualized rendering to handle large alignments efficiently
- Column collapse is non-destructive - all data is preserved
- Selections and sort order are maintained when collapsing/expanding columns
- The consensus sequence is recalculated only when needed for performance

## Browser Compatibility

Sealion works best in modern browsers:
- Chrome/Edge (recommended)
- Firefox
- Safari

Requires JavaScript enabled and HTML5 canvas support.
