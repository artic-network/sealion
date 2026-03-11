<p align="center">
  <img width="128" height="128" alt="sealion" src="https://github.com/user-attachments/assets/2463492a-ce36-45aa-b9a4-53dfa1991601" />
</p>

# Sealion — Genomic Alignment Viewer

**Sealion** is a fast, interactive viewer for large multiple sequence alignments, built for genomic epidemiology workflows. It runs entirely in the browser as a webapp and is also available as a native desktop application for macOS, Windows, and Linux.

---

## Using the webapp

The easiest way to use Sealion is directly in your browser — no installation required.

**Open the webapp:** [https://artic-network.github.io/sealion](https://artic-network.github.io/sealion)

### Loading an alignment

Drag and drop a FASTA file onto the viewer window, or use **File → Open alignment**. Sealion accepts:

- FASTA (`.fasta`, `.fa`, `.fna`, `.ffn`, `.faa`, `.frn`)

### Loading a reference genome

Click **Load reference** (the green button) to load a GenBank (`.gb`) or JSON reference genome file. Once loaded, Sealion can:

- Display annotated CDS features in the overview minimap
- Colour sequences relative to the reference
- Navigate between sites that differ from the reference

---

## Interface overview

| Region | Description |
|--------|-------------|
| **Toolbar** | Controls for font size, colour scheme, column collapse/expand, colouring, plot type, overview layers, sort, search, tags, and bookmarks |
| **Labels panel** | Sequence names; click to select, drag to reorder |
| **Alignment canvas** | Main sequence view with scrolling and zooming |
| **Header** | Column positions and consensus sequence |
| **Overview minimap** | Compressed view of the whole alignment with genome structure, variable sites, and a sliding-window plot |
| **Plot strip** | Per-column entropy or differences-from-reference bar chart |

---

## Key features

### Colour schemes
Use the **Colour** menu to choose from several nucleotide or amino acid colour schemes. Select **Colour differences only** to highlight only sites that differ from the reference or consensus — identical sites fade to grey.

### Plot strip
The **Plot** menu switches between:
- **Conservation (entropy)** — high bar = conserved site (Fire colour palette)
- **Differences from reference** — high bar = many sequences differ (Ocean colour palette)
- **Hide plot** / **Show plot** — toggle the strip on/off

### Overview minimap layers
The **Overview** menu toggles individual layers of the minimap:
- **Genome structure** — CDS feature bars colour-coded by reading frame (click a CDS to select those columns; double-click to zoom)
- **Compressed sites** — tick marks for masked/collapsed columns
- **Variable sites** — tick marks at each polymorphic site, coloured by the consensus nucleotide/amino acid
- **Plot line** — sliding-window average of the active plot, scaled to fill the height

### Column collapse
Select columns and press **Collapse** (or `Ctrl/⌘ −`) to compress uninformative regions. Collapsed columns are shown as narrow markers. Toggle their visibility with `Ctrl/⌘ H`.

### Sort sequences
The **Sort** menu sorts sequences by name, tag, date, length, similarity to reference, or other metadata fields parsed from FASTA headers.

### Tags and bookmarks
- **Tags** — assign colour labels to selected sequences via the **Tags** menu
- **Bookmarks** — mark specific alignment columns for quick reference via the **Bookmark** menu

### Selection and copy
- Click and drag on the alignment to select a rectangular region
- `Ctrl/⌘ A` to select all columns
- `Ctrl/⌘ C` to copy selected sequences as FASTA to the clipboard
- `Shift+Ctrl/⌘ C` to copy sequence names only

### Keyboard shortcuts

| Action | macOS | Windows / Linux |
|--------|-------|-----------------|
| Navigate | ← → ↑ ↓ | ← → ↑ ↓ |
| Page scroll | ⌥ + ← → ↑ ↓ | Alt + ← → ↑ ↓ |
| Jump to edges | ⇧ + ← → ↑ ↓ | Shift + ← → ↑ ↓ |
| Next/prev difference | ⌘ > / ⌘ < | Ctrl > / Ctrl < |
| Colour differences only | ⌘ D | Ctrl D |
| Toggle hide mode | ⌘ H | Ctrl H |
| Collapse columns | ⌘ − | Ctrl − |
| Expand columns | ⌘ = | Ctrl = |
| Reset / change font size | ⌘ 0 / ⌥⌘ ± | Ctrl 0 / Alt+Ctrl ± |
| Select all columns | ⌘ A | Ctrl A |
| Copy as FASTA | ⌘ C | Ctrl C |
| Copy labels | ⇧⌘ C | Shift+Ctrl C |
| Move sequences up/down | ⌘ ↑ / ⌘ ↓ | Ctrl ↑ / Ctrl ↓ |
| Drag sequences | ⌥⌘ + drag label | Alt+Ctrl + drag label |
| Search next / prev | ⌘ G / ⇧ Enter | Ctrl G / Shift Enter |
| Pan view | Space + drag | Space + drag |

---

## Desktop application

The Sealion desktop app is built with [Tauri](https://tauri.app/) and provides native performance with direct file system access.

### Download

Pre-built installers for the latest release are available on the [GitHub Releases page](https://github.com/artic-network/sealion/releases).

| Platform | File |
|----------|------|
| **macOS — Apple Silicon** (M1/M2/M3/M4) | `Sealion_x.x.x_aarch64.dmg` |
| **macOS — Intel** (x86-64) | `Sealion_x.x.x_x64.dmg` |
| **Windows** | `Sealion_x.x.x_x64-setup.exe` |
| **Linux** (Debian/Ubuntu) | `sealion_x.x.x_amd64.deb` |
| **Linux** (AppImage) | `sealion_x.x.x_amd64.AppImage` |

If you are unsure which Mac build to use: click the Apple menu → **About This Mac**. If the Chip line reads **Apple M…** download the Apple Silicon build; if it reads **Intel** download the Intel build.

### macOS installation

1. Download the `.dmg` for your Mac's processor (see above).
2. Open the `.dmg` and drag **Sealion.app** into your **Applications** folder.
3. Launch Sealion from Applications. The app is code-signed and notarised by Apple, so macOS will open it without any security warnings.

FASTA files can be opened by double-clicking them in Finder once Sealion is installed.

### Windows installation

1. Download the `.exe` installer from the Releases page.
2. Run the installer and follow the prompts.
3. Windows SmartScreen may display a warning for unsigned executables. Click **More info → Run anyway**.

### Linux installation

**Debian/Ubuntu (`.deb`):**
```bash
sudo dpkg -i sealion_x.x.x_amd64.deb
```

**AppImage:**
```bash
chmod +x sealion_x.x.x_amd64.AppImage
./sealion_x.x.x_amd64.AppImage
```

---

## Building from source

Requirements: [Rust](https://www.rust-lang.org/) (stable) and [Node.js](https://nodejs.org/) (≥ 18).

```bash
# Clone the repository
git clone https://github.com/artic-network/sealion.git
cd sealion

# Install JavaScript dependencies
npm install

# Run in development mode (opens a native window)
npm run dev

# Build a release installer for the current platform
npm run build
```

Built installers are placed in `src-tauri/target/release/bundle/`.

---

## About

Sealion was designed and developed by **Andrew Rambaut** at the University of Edinburgh as part of the [ARTIC Network](https://artic.network/) project.

- **Source code:** [github.com/artic-network/sealion](https://github.com/artic-network/sealion)
- **Issues & feature requests:** [github.com/artic-network/sealion/issues](https://github.com/artic-network/sealion/issues)
- **ARTIC Network:** [artic.network](https://artic.network/)

## Licence

Sealion is open-source software. See [LICENSE](LICENSE) for details.
