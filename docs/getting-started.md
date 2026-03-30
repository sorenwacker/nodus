# Getting Started

## Installation

### macOS
1. Download `Nodus_x.x.x_universal.dmg` from [Releases](https://github.com/sorenwacker/nodus/releases)
2. Open the DMG and drag Nodus to Applications
3. First launch: Right-click and select "Open" to bypass Gatekeeper

### Windows
1. Download `Nodus_x.x.x_x64-setup.exe` from [Releases](https://github.com/sorenwacker/nodus/releases)
2. Run the installer
3. If SmartScreen warns, click "More info" then "Run anyway"

### Linux
1. Download `Nodus_x.x.x_amd64.AppImage` from [Releases](https://github.com/sorenwacker/nodus/releases)
2. Make executable: `chmod +x Nodus_*.AppImage`
3. Run: `./Nodus_*.AppImage`

Or install the `.deb` package:
```bash
sudo dpkg -i Nodus_x.x.x_amd64.deb
```

## First Steps

### Creating Your First Node
1. Double-click anywhere on the canvas to create a new node
2. Type a title and press Enter
3. Add content using Markdown syntax

### Connecting Nodes
1. Hover over a node to see connection handles
2. Drag from one handle to another node
3. Select edge type: related, cites, supports, contradicts

### Using Typst Math
Wrap math expressions in dollar signs:
- Inline: `$x^2 + y^2 = z^2$`
- Block: `$$integral_0^1 f(x) dif x$$`

See [Typst Math Reference](typst-math-reference.md) for syntax.

### Importing an Obsidian Vault
1. Open Settings (gear icon)
2. Go to "Workspaces"
3. Click "Import Vault"
4. Select your Obsidian vault folder

## Keyboard Shortcuts

| Action | Shortcut |
|--------|----------|
| New node | Double-click or `N` |
| Delete selected | `Backspace` or `Delete` |
| Select all | `Cmd/Ctrl + A` |
| Undo | `Cmd/Ctrl + Z` |
| Redo | `Cmd/Ctrl + Shift + Z` |
| Zoom in | `Cmd/Ctrl + =` |
| Zoom out | `Cmd/Ctrl + -` |
| Fit to screen | `Cmd/Ctrl + 0` |
| Search | `Cmd/Ctrl + F` |
