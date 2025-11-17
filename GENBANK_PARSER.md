# GenBank Parser Utility

## Overview

The `parseGenBankFile()` utility function allows you to parse GenBank format files (`.gb`, `.gbk`) and convert them to the reference genome JSON format used by Sealion viewer. This eliminates the need to manually create JSON files for reference genomes.

## Function Signature

```javascript
SealionUtils.parseGenBankFile(genbankText)
```

### Parameters

- `genbankText` (string): The full text content of a GenBank file

### Returns

- `Object`: Reference genome object in JSON format
- `null`: If parsing fails

## Output Format

```javascript
{
  accession: "NC_002549",
  version: "NC_002549.1",
  definition: "Zaire ebolavirus isolate Ebola virus/H.sapiens-tc/COD/1976/Yambuku-Mayinga, complete genome",
  organism: "Zaire ebolavirus",
  isolate: "Ebola virus/H.sapiens-tc/COD/1976/Yambuku-Mayinga",
  length: 18959,
  sequence: "cggacacacaaaaagaaagaa...",
  cds: [
    {
      gene: "NP",
      product: "nucleoprotein",
      function: "encapsidation of genomic RNA",
      coordinates: "470..2689"
    },
    {
      gene: "VP35",
      product: "polymerase complex protein",
      function: "RNA-dependent RNA polymerase cofactor",
      coordinates: "3129..4151"
    },
    // ... more CDS features
  ]
}
```

## Parsed Fields

### Required Fields
- **accession**: GenBank accession number (e.g., "NC_002549")
- **sequence**: Complete nucleotide sequence

### Optional Fields
- **version**: Version identifier (e.g., "NC_002549.1")
- **definition**: Full description of the sequence
- **organism**: Organism name
- **isolate**: Specific isolate/strain name
- **length**: Sequence length in base pairs
- **cds**: Array of CDS (coding sequence) features

### CDS Feature Fields
Each CDS entry contains:
- **gene**: Gene symbol (e.g., "NP", "VP35")
- **product**: Protein product name
- **function**: Functional description
- **coordinates**: GenBank coordinate string (e.g., "470..2689" or "join(6039..6923,6923..8068)")

## Usage Examples

### Example 1: Load from File Input

```javascript
// HTML
<input type="file" id="genbankFile" accept=".gb,.gbk,.genbank">

// JavaScript
document.getElementById('genbankFile').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  
  const text = await file.text();
  const refGenome = SealionUtils.parseGenBankFile(text);
  
  if (refGenome) {
    // Add to alignment
    alignment.addReferenceGenome(refGenome);
    console.log(`Loaded reference: ${refGenome.accession}`);
    
    // Update UI
    updateReferenceDropdown();
  } else {
    console.error('Failed to parse GenBank file');
  }
});
```

### Example 2: Fetch from URL

```javascript
async function loadGenBankFromURL(url) {
  try {
    const response = await fetch(url);
    const text = await response.text();
    const refGenome = SealionUtils.parseGenBankFile(text);
    
    if (refGenome) {
      alignment.addReferenceGenome(refGenome);
      return refGenome;
    }
  } catch (e) {
    console.error('Error loading GenBank file:', e);
  }
  return null;
}

// Usage
loadGenBankFromURL('NC_002549_EBOV_1976.gb');
```

### Example 3: Save Parsed Data as JSON

```javascript
const file = document.getElementById('fileInput').files[0];
const text = await file.text();
const refGenome = SealionUtils.parseGenBankFile(text);

if (refGenome) {
  // Convert to JSON and download
  const json = JSON.stringify(refGenome, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = `${refGenome.accession}.json`;
  a.click();
  
  URL.revokeObjectURL(url);
}
```

## Integration with Sealion Viewer

The parsed reference genome object is fully compatible with the existing Sealion reference genome system:

```javascript
// After parsing
const refGenome = SealionUtils.parseGenBankFile(genbankText);

// Add to alignment (same as JSON loading)
alignment.addReferenceGenome(refGenome);

// Now you can:
// 1. Select it from the reference dropdown
// 2. View CDS annotations in the overview canvas
// 3. Double-click CDS bars to select regions
// 4. See tooltips with gene information
```

## Features Parsed

The parser extracts:

1. **Header Information**
   - LOCUS (length)
   - ACCESSION
   - VERSION
   - DEFINITION (supports multi-line)
   - SOURCE/ORGANISM
   - Isolate information

2. **CDS Features**
   - Simple locations: `470..2689`
   - Join locations: `join(6039..6923,6923..8068)`
   - Gene name (`/gene=`)
   - Product (`/product=`)
   - Function (`/function=` or `/note=`)

3. **Sequence**
   - Extracts complete sequence from ORIGIN section
   - Removes line numbers and whitespace
   - Validates presence

## Error Handling

The function returns `null` and logs errors to console if:
- Input is not a valid string
- No accession number found
- No sequence found
- File format is invalid

Always check the return value:

```javascript
const refGenome = SealionUtils.parseGenBankFile(text);
if (!refGenome) {
  alert('Failed to parse GenBank file. Please check the console for errors.');
  return;
}
```

## Testing

Use the included test page:
1. Open `test_genbank_parser.html` in your browser
2. Select a GenBank file (e.g., `NC_002549_EBOV_1976.gb`)
3. Click "Parse GenBank File"
4. View the parsed information
5. Download as JSON if needed

## Supported GenBank Format

The parser supports standard GenBank format as defined by NCBI:
- Standard header fields (LOCUS, ACCESSION, VERSION, etc.)
- FEATURES table with CDS entries
- ORIGIN section with sequence data
- Multi-line field continuations
- Standard qualifiers (/gene, /product, /function, /note)

## Limitations

- Currently only parses CDS features (not other feature types)
- Multi-line qualifier values must be on consecutive lines
- Assumes standard NCBI GenBank format

## Future Enhancements

Potential improvements:
- Parse additional feature types (gene, mRNA, regulatory elements)
- Support for more complex location strings (complement, etc.)
- Parse additional metadata fields
- Validation of coordinate ranges
- Support for EMBL format

## See Also

- `NC_002549_EBOV_1976.gb` - Example GenBank file
- `NC_002549_EBOV_1976.json` - Example output format
- `test_genbank_parser.html` - Interactive testing tool
