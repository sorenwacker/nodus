/**
 * Markdown templates for default workspace content
 */

export const TYPST_MATH_REFERENCE = `# Typst Math Reference

Nodus supports Typst math syntax for equations.

| Symbol | Syntax |
|--------|--------|
| Arrow over letter | $arrow(x)$ |
| Hat over letter | $hat(x)$ |
| Bar over letter | $overline(x)$ |
| Subscript | $x_1$ or $x_(i+1)$ |
| Superscript | $x^2$ or $x^(n+1)$ |
| Fraction | $a/b$ or $frac(a, b)$ |
| Square root | $sqrt(x)$ |
| Greek letters | $alpha, beta, gamma$ |

Use \`$...$\` for inline and \`$$...$$\` for display math.

See also: [[Getting Started]]

Full reference: [typst.app/docs/reference/math](https://typst.app/docs/reference/math/)`

export const GETTING_STARTED = `# Getting Started with Nodus

## Create Nodes
- **Double-click** on canvas to create a node
- Or use [[Importing Files]] to bring in existing content

## Connect Nodes
- **Cmd/Ctrl + click** on two nodes to connect them
- Use \`[[wikilinks]]\` in text to auto-link nodes
- Right-click menu > "Link to..."

## Navigate
- **Scroll** to zoom in/out
- **Drag canvas** to pan
- **Cmd/Ctrl + F** to search

## Learn More
- [[Typst Math Reference]] for equations
- [[Importing Files]] for bulk import`

export const IMPORTING_FILES = `# Importing Files

## Drag and Drop
- **Markdown files** (.md) become nodes directly
- **PDF files** extract text and annotations
- **BibTeX files** (.bib) create citation nodes
- **Folders** import all markdown files inside

## Import Vault
Use **File > Import Vault** to import an entire Obsidian vault or folder of markdown files.

Options:
- Keep files synced (edits update the original)
- Copy content only (no file link)

## Supported Formats
| Format | Result |
|--------|--------|
| .md | Note node with content |
| .pdf | Note with extracted text |
| .bib | Citation nodes |
| .ttl/.owl | Ontology import |

See [[Getting Started]] for basic navigation.`
