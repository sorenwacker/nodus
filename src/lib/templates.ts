/**
 * Markdown templates for default workspace content
 */

export const TYPST_MATH_REFERENCE = `# Typst Math Reference

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

Full reference: [typst.app/docs/reference/math](https://typst.app/docs/reference/math/)`

export const GETTING_STARTED = `# Getting Started with Nodus

## Create Nodes
- **Double-click** on canvas to create a node
- **Drag files** onto canvas to import

## Connect Nodes
- **Cmd/Ctrl + click** on two nodes to connect them
- Or use right-click menu > "Link to..."

## Navigate
- **Scroll** to zoom in/out
- **Drag canvas** to pan
- **Cmd/Ctrl + F** to search

## Workspaces
- Create separate workspaces for different projects
- Import Obsidian vaults to sync with existing notes`
