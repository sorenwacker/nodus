# Features

## Canvas

### Infinite Canvas
Pan and zoom freely across an infinite workspace. Semantic zooming adjusts detail level:

- **Zoomed in**: Full content, edit handles, detailed view
- **Zoomed out**: Titles only, collapsed cards for performance

Edge labels have their own zoom threshold (Settings > Appearance): below it, labels are hidden to reduce clutter in the zoomed-out view.

### Node Types

| Type | Description |
|------|-------------|
| **Note** | General purpose markdown notes |
| **Citation** | Academic references with DOI support |
| **Comment** | Annotations and commentary |
| **Character** | Entity node for people/characters |
| **Location** | Entity node for places |
| **Term** | Entity node for definitions/concepts |
| **Item** | Entity node for objects/artifacts |
| **Tag** | Created automatically for a `#hashtag` when tag nodes are enabled |
| **Citation stub** | Placeholder created while a citation's metadata is still being fetched |

### Tags
Hashtags in node content become node tags:

- `#tag` tokens are extracted whenever content is set: on node creation and on every content edit, from any interface (canvas editor, MCP tools, LLM agent)
- Loading a workspace scans every node's body as well, so content that arrived before tags were extracted, or that another editor wrote into the vault, is tagged like anything else. The pass writes only the nodes whose tags changed, so a workspace already current costs no writes
- A `#tag` in the text always creates its tag node and the edge to it. Whether those are drawn is a separate, view-only question answered by the tag filter, which never creates or destroys anything
- Deleting a `#tag` from the text withdraws it: the tag leaves the node, its edge is deleted, and the tag node goes too once the last note using it lets go
- A tag added by hand from a card's chips was never in the text, so an edit never withdraws it. Only a tag the previous body carried and the new one does not is taken away
- A node's tags appear as chips at the bottom of its card; on a selected node, chips gain a remove button and a "+ #" chip adds tags directly
- Tag nodes and their edges are a toggleable canvas layer: the edge-filter cluster on the canvas (bottom left, beside the content it filters) switches manual, storyline, wikilink, and tag layers
- With tag nodes enabled in settings, each tag becomes a tag node connected to the notes that use it
- Loading a workspace connects any node whose tags have no edges, so tags that arrived without them - from the body scan, or from an agent setting a node's tags over MCP - are shown like any other. An existing connection is never duplicated, so a connected workspace costs nothing
- Settings > Canvas > Repair Tag Nodes merges tag nodes that duplicate each other and restores a missing # prefix, left behind by an earlier lookup that compared a bare name against a title stored with its hash

YAML frontmatter at the top of a note (Open Knowledge Format metadata) is treated as structured node metadata, never as text:

- The block is hidden from rendered cards, and all editors (inline, fullscreen, preview panel) show only the body — the metadata header survives every edit untouched
- Its fields surface as chips on the node card: tags, the date (or date range), and the OKF lifecycle `status` when it is `draft` or `deprecated` (`stable` is the silent default)
- Click the date chip (or the "+ Set date" chip on a selected node) to set or change the node's `date` and `date_end` in place — no YAML editing needed
- Title and tags from frontmatter also feed the node record during vault sync

### Frames
Group related nodes visually. Frames act as containers that can be moved together with all contained nodes.

### Selection & Multi-Select
- Click to select single node
- Shift+Click to add to selection
- Lasso selection for multiple nodes
- Bulk operations on selection

### Fullscreen Editor
Open any node in a fullscreen split-view editor for focused writing:

- **Trigger**: Cmd+Click (Mac) or Ctrl+Click (Windows/Linux) on any node
- **Split view**: Markdown editor on left, live preview on right
- **Auto-save**: Changes save automatically with 500ms debounce
- **Keyboard shortcuts**:
  - `Escape` - Save and close
  - `Cmd/Ctrl+S` - Save immediately
- **Features**:
  - Title editing in header
  - Wikilink autocomplete (type `[[` to trigger)
  - Mermaid diagram preview
  - "Zoom to Node" button to locate node on canvas

---

## Connections

### Edge Types

| Type | Color | Use Case |
|------|-------|----------|
| Related | Gray | General association |
| Cites | Blue | Academic citation |
| Supports | Green | Supporting evidence |
| Contradicts | Orange | Opposing viewpoint |
| Blocks | Red | Dependency or blocker |

### Wikilink Edges
Writing `[[link]]` in a node's content creates a wikilink edge to the referenced node:

- Edges are created whenever content is set: on node creation and on every content edit, from any interface (canvas editor, MCP tools, LLM agent, vault import)
- Links resolve by note title, by relative path (`[[folder/note]]`), and with section anchors (`[[note#section]]`)
- A pair already connected by a manual edge does not receive a parallel wikilink edge
- Removing the link removes the wikilink edge; manual edges are kept

### Edge Routing
Multiple routing styles for visual clarity:

- **Orthogonal** - 90-degree angles, clean diagrams
- **Curved** - Bezier curves, organic flow
- **Straight** - Direct lines
- **Hyperbolic** - Smooth curves avoiding nodes

### Neighbor Highlighting
When selecting a node, connected neighbors are highlighted for context. The highlight holds in every theme and at every zoom level, including the collapsed cards shown when zoomed out; above the LOD threshold, where cards are drawn as circles, neighbors carry the same highlight as a ring.

### Neighborhood View
Focus on a specific node and its connections:
- Toggle neighborhood mode to hide unrelated nodes
- Adjust depth (1-5 hops) to control how far connections extend
- Useful for exploring dense graphs

---

## Storylines

Create linear narratives through your knowledge graph:

- Order nodes into a sequence
- Navigate through storyline in reader mode
- Export storylines as documents
- Color-code storyline edges

### Anchored notes and comments

A note about a passage sits at that passage. Write a `[[wikilink]]` where it belongs, and while reading that node at full width the linked node opens as a callout at exactly that point. Narrower reader widths keep links inline, because a callout needs the room.

- Expansion goes one level deep: links inside an expanded note stay links.
- A link to a node that does not exist stays an inline link, marked as missing.
- Creating a comment writes such a link into the text it comments on, so the comment travels with the passage rather than with a position in the sequence.

To read one node on its own, right-click it on the canvas and choose **Read node**. It opens in the same reader the storylines use, at full width, with its anchored notes expanded.

### Agent log

The chat panel shows the conversation; the log shows what the agent did and anything that failed. Open it with the **Log** button in the status bar at the bottom of the canvas, next to the node and edge counts. The button is present whenever the AI is enabled, so errors have a known place to be even before anything goes wrong.

### Watching a PDF import work

Dropping a PDF creates its node immediately, and the AI cleanup that follows is visible rather than opaque:

- The cleaned text **streams into the node as it is generated**. With the Ollama provider each token appears as the model produces it (updates are throttled to keep the canvas smooth); providers without streaming support fall back to updating the node as each section completes.
- The node currently being written carries a **pulsing outline** so it is findable on a busy canvas. The pulse stops and the outline disappears the moment processing ends, whether it finished or was aborted.
- The status line still names the section being cleaned, which remains the only progress signal for multi-section documents on non-streaming providers.

### Reading a long node

A node card shows the beginning of its content and marks where the text continues. Cards are a few hundred pixels tall, and a node holding an imported paper can carry tens of kilobytes, so rendering all of it into the card would cost several dropped frames on every click.

To read the whole document, open the node: **Cmd/Ctrl+click** for the fullscreen view, or right-click and choose **Read node** for the reader. Both render the full text.

### Bringing a vault to OKF

Nodus stores notes in Open Knowledge Format (OKF v0.2): Markdown with YAML frontmatter, readable by Obsidian. Files Nodus creates carry that frontmatter already; files that predate Nodus usually do not.

To add it to an existing vault, open **Settings > Workspaces**, select the workspace, and choose **Check files** under OKF frontmatter. Nodus reports how many files would gain frontmatter, how many already have it, and how many nodes have no file, and writes nothing until you confirm.

The backfill only adds a frontmatter block above the existing text. Bodies, `[[wikilinks]]` and `#tags` are untouched, and a file that already has frontmatter is left alone rather than merged into, so fields you set by hand cannot be lost.

### Expanding a PDF into a graph

When a dropped PDF has structure - several sections or a bibliography - Nodus offers to expand it after the document imports. The single node stays either way; the dialog chooses what is added:

- **Sections as nodes.** One node per heading, connected along the document outline, grouped in a frame named after the paper.
- **References as citation nodes.** Each bibliography entry becomes a citation node, cited by the paper.
- **Verify against Semantic Scholar.** Each reference is marked `verified`, `not_found`, or `not_checked` in its frontmatter. A reference is only marked not found when the service answered; if the service is unreachable, the state is not checked - an outage never invalidates your bibliography.
- **Add references to Zotero.** Shown when the Zotero integration is configured; nothing is written to Zotero without this choice.
- **Extract claims with the AI.** One model pass per section; claims become nodes linked to their section as supporting or contradicting. Sections the model fails on are skipped and counted, and the structural graph is never held up by the model.

### Importing PDF highlights

Drop a PDF that you have already annotated and Nodus offers its highlights for import.

1. Drop the PDF onto the canvas. The document is imported as a node as usual.
2. If the file carries highlights, a picker lists them with their page number, colour and any comment you wrote.
3. Choose the ones worth keeping and confirm. Each becomes a node holding the passage and your comment, linked back to the document node.

Highlights already imported from that file are marked as such and are not imported again, so re-dropping an updated PDF brings in only what is new.

A highlight can only be imported when the PDF stores the highlighted text alongside the annotation. Zotero and Adobe Acrobat do this; macOS Preview records only the marked region, so highlights made there appear in the picker as unavailable. This is a limitation of what the file contains, not of the file being unreadable.

### Exporting a document

Turn work on the canvas into a document in two formats:

- **PDF** - compiled in the application, ready to send
- **Typst source** - to keep editing outside Nodus

Two ways in:

1. In the storyline reader, choose **Export**. The document follows the storyline order, so the sequence you arranged is the sequence in the document.
2. Select nodes on the canvas, right-click, and choose **Export selection**. Nodes are ordered top to bottom, left to right.

The dialog collects a title, an optional author, the paper size, and whether to append a list of the connections between the exported nodes. Choose where to save with the system dialog. If a PDF fails to compile, the dialog says so and writes nothing, so a broken file never lands on disk.

Nodes with Typst math export as math, not as source text, since the same engine renders both on the canvas and in the document.

### Learning the edge gestures

The edge gestures are not visible on screen, so a short coach runs once after onboarding. It teaches three of them in turn - the right edge for storylines, a dwell at the bottom edge for timelines, the left edge for the agent - and moves on only when you actually perform the gesture it is asking for. Skip it at any time; it does not come back.

To see it again, open Settings > General and choose "Replay gesture tour".

### Storyline Panel
Moving between graph and storylines works in steps along the screen edges: each push of the pointer against the right edge goes one step deeper into storylines, each push against the left edge steps back toward the graph.

Each edge is active only at a handle in the middle of that edge, marked on screen. Pushing the border anywhere else - reaching for another window, the dock or the desktop - does nothing, so panels open when you aim for them and not while you work.

- Push right once: the storyline overview slides open on the right
- Push right again: the reader opens at half the window, keeping the graph visible, with the last-read storyline (the first storyline initially)
- Push right a third time: the reader expands to the full window
- Push left: each push steps back down — full reader to half, half to the overview (or the timelines view, if the reader was opened from there), overview to the plain graph
- Open layers stay open while you work in them; only a left-edge push or the toolbar book button steps back
- While a layer is open, stepping deeper requires pressing the pointer against the very edge of the window, so using the panel near the border does not skip ahead
- The reader's left handle still resizes it freely between steps

In the overview:

- Clicking a storyline row opens it in reader mode; the chevron on the row expands its ordered nodes inline instead
- Drag a storyline row to reorder storylines — the same drag used for reordering nodes within a storyline; the order persists and the timelines lanes follow it
- Several storylines can have their item lists expanded at once
- The overview shortens above an open timelines sheet instead of overlapping it
- Storyline titles wrap to at most two lines instead of being truncated
- Drag the separator between panel and canvas to set the panel width; the width persists across sessions
- Drag nodes from the canvas onto a storyline section to add them to that storyline

### Timelines
Timelines live along the bottom of the window: dwelling the pointer at the bottom edge for a second (or the timelines button in the storyline overview) slides up a sheet showing all storylines; the graph stays visible above it, and it can be open alongside the overview and beneath a shortened reader:

- Every storyline is a horizontal lane in its color; its nodes are beads in order
- A node states its point in time with a `date:` frontmatter field — `date: 20 BC`, `date: 1969-07-20`, `date: 1969-07-20 14:30`, `date: 1500`. Only dated nodes are placed (BC dates and minute-precision timestamps supported); nodes without a date do not appear on the axis
- Large empty stretches between clusters of events are abbreviated: the axis breaks (marked with a double slash) instead of wasting space, and each segment labels itself at its own level of detail
- A node spanning time (an era, a long work) adds `date_end:` and is drawn as a bar from start to end instead of a bead
- The from/to fields in the sheet's header fix the axis range (same date formats); either side left empty fits automatically, and the chosen range persists. Axis labels adapt to the span: years, months, days, or clock times for narratives playing out within hours
- Nodes shared between storylines are joined by dashed connectors, and graph edges between timeline nodes are drawn as arcs
- Dated nodes outside every storyline appear in a gray "Unassigned" lane, so the timeline covers every dated node in the workspace
- Marks carry the node's own color when set, falling back to the lane's storyline color
- Hovering a bead or bar shows the same hover preview as the canvas
- The sheet stays open alongside the storyline overview and the reader (the reader sits above it)
- Clicking a lane or bead opens that storyline in the reader; a left-edge push or the close button slides the sheet away

---

## Math with Typst

Native Typst integration for fast mathematical typesetting:

- **Sub-second rendering** - No LaTeX compile times
- **Modern syntax** - Cleaner than LaTeX
- **Inline and block** - Both supported

### Examples

Inline math: `$x^2 + y^2 = z^2$`

Block math:
```
$$
integral_0^infinity e^(-x^2) dif x = sqrt(pi)/2
$$
```

See [Typst Math Reference](typst-math-reference.md) for complete syntax.

---

## Obsidian Integration

### Vault Import
Import existing Obsidian vaults:

- Markdown content preserved
- Wiki-links `[[link]]` converted to edges
- Folder structure respected
- Automatic force-directed layout

### Bi-directional Sync
Changes sync between Nodus and your vault folder:

- Edit in Nodus → updates Obsidian vault
- Edit in Obsidian → updates Nodus canvas
- File watcher detects external changes
- With sync disabled, edits change only the Nodus database; vault files are never written

### Workspace Separation
Each imported vault becomes a separate workspace, keeping projects organized.

---

## Citation Management

### Zotero Integration
Connect to your local Zotero database:

- Browse and import collections
- DOI extraction and linking
- Create citation nodes with metadata

### Semantic Scholar Integration
Fetch citations for papers with DOIs:

- Right-click citation nodes and select "Fetch Citations"
- Automatically creates nodes for referenced papers
- Builds citation network on your canvas

### BibTeX Import
Import `.bib` files directly to create citation nodes with:

- Author, title, year
- DOI links
- Journal/conference info

---

## LLM Integration

Connect AI assistants for research help:

### Supported Providers

| Provider | Type | Notes |
|----------|------|-------|
| Ollama | Local | Privacy-first, no data leaves device |
| OpenAI | Cloud | GPT-4, GPT-3.5 |
| Anthropic | Cloud | Claude models |
| OpenAI-compatible | Cloud | Any compatible API |

### Agent Features

- Research assistance
- Content summarization
- Smart node connections
- Task automation

### Ask AI on the canvas vs. on a node

Two scopes keep AI actions predictable:

- **Agent panel** on the canvas's left edge runs the graph agent, which can create
  and edit nodes, add edges, and lay out the graph. It is a chat: prompts and full
  answers stay in a transcript, each answer listing the tools it used, and a line
  above the input names the nodes going into the context (the current selection, or
  the whole graph when nothing is selected). Fold it away with the toggle in the
  canvas's top-left corner, or reveal it with a left-edge push; drag its inner edge
  to resize it.
- **Node "Ask" bar** (in the node preview) runs the node agent, which only edits
  the current note. It never creates new nodes.

### Plan-first approval

The graph agent always works in two phases:

1. **Plan.** It researches and reads the graph only; it cannot create, edit,
   delete, or connect nodes in this phase. It then proposes a plan.
2. **Execute.** The plan opens in an approval dialog that states, up front, what
   it will create versus edit (for example, "create 7 new nodes, edit 2"). Each
   step is labeled with its action and lists the affected node titles. Nothing is
   written to the graph until you approve.

This makes node creation predictable: the agent never adds a node you did not see
listed and approve.

---

## Layout Algorithms

Automatic arrangement of nodes:

| Algorithm | Best For |
|-----------|----------|
| Force-directed | General graphs, organic layout |
| Grid | Structured content |
| Hierarchical | Trees and DAGs |

---

## Export Options

### Typst Export
Export canvas as Typst document for further editing.

### PDF Generation
Generate PDFs directly using Typst compilation.

### Markdown Export
Export nodes as standard Markdown files.

### Open Knowledge Format Export
Export a workspace as an [Open Knowledge Format](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md) (OKF v0.2) bundle so AI agents and other OKF consumers can read it without Nodus:

- Every node with content becomes a Markdown concept document with YAML frontmatter: `type` (from the node type), `title`, `tags`, and `generated` provenance
- Documents are grouped into subdirectories by node type (`notes/`, `citations/`, ...)
- A root `index.md` declares `okf_version: "0.2"` and lists all documents by section with descriptions
- Wikilinks are rewritten to bundle-relative Markdown links in the exported copy; unresolvable links are left unchanged
- The export writes to a folder you choose; the workspace and its vault files are not modified

Files that Nodus itself creates in a vault (via "create file for node" or the export-to-files action) also carry OKF frontmatter, unless the content already starts with its own frontmatter block. Existing vault files are never rewritten to add frontmatter.

---

## Data Storage

### Local-First Architecture
All data stored on your device:

- **SQLite** - Metadata, positions, connections
- **Markdown files** - Content (Obsidian-compatible)
- **No cloud required** - Works fully offline

### Privacy
- No telemetry
- No data collection
- Your data stays yours

---

## Keyboard Shortcuts

| Action | macOS | Windows/Linux |
|--------|-------|---------------|
| New node | Double-click | Double-click |
| Delete | `Backspace` | `Delete` |
| Select all | `Cmd+A` | `Ctrl+A` |
| Undo | `Cmd+Z` | `Ctrl+Z` |
| Redo | `Cmd+Shift+Z` | `Ctrl+Shift+Z` |
| Zoom in | `Cmd+=` | `Ctrl+=` |
| Zoom out | `Cmd+-` | `Ctrl+-` |
| Fit view | `F` | `F` |
| Layout | `L` | `L` |
| Neighborhood view | `N` | `N` |
| Reset node sizes | `Shift+R` | `Shift+R` |
| Help | `?` | `?` |
| Fullscreen edit | `Cmd+Click` | `Ctrl+Click` |
| Find in node | `Cmd+F` | `Ctrl+F` |
| Settings | `Cmd+,` | `Ctrl+,` |

Press `?` on the canvas for the full list.

---

## Themes

| Theme | Description |
|-------|-------------|
| **Light** | Clean, bright interface |
| **Dark** | Easy on the eyes |
| **Pitch Black** | OLED-optimized, true black background |
| **Cyber** | Neon cyan/magenta aesthetic |

Node colors can be customized individually.
