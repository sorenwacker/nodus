---
title: Nodus - Visual Knowledge Graph
hide:
  - navigation
  - toc
---

<style>
@import url('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=IBM+Plex+Sans:wght@300;400;500&family=JetBrains+Mono:wght@400;500&display=swap');

/* ---------------------------------------------------------------------------
   Star chart: the page is drawn like an observatory plate. Deep ground, hairline
   coordinate grid, one amber signal against the night blue, and the product's
   own vocabulary - nodes and edges - used as ornament.
   --------------------------------------------------------------------------- */

:root {
  --plate: #070b14;
  --plate-raised: #0b1120;
  --ink: #e8f1ff;
  --ink-dim: #93a4bf;
  --ink-faint: #5b6b86;
  --rule: rgba(147, 164, 191, 0.18);
  --rule-soft: rgba(147, 164, 191, 0.08);
  --signal: #f2b155;
  --serif: 'Instrument Serif', Georgia, serif;
  --sans: 'IBM Plex Sans', system-ui, sans-serif;
  --mono: 'JetBrains Mono', ui-monospace, monospace;
  --gutter: clamp(1.25rem, 5vw, 5.5rem);
}

.md-main__inner { margin: 0; max-width: none; }
.md-content__inner { margin: 0; padding: 0; }
.md-content__inner::before { display: none; }

.plate {
  position: relative;
  background: var(--plate);
  color: var(--ink);
  font-family: var(--sans);
  font-weight: 300;
  overflow: hidden;
  isolation: isolate;
}

/* Coordinate grid and vignette: atmosphere, not decoration for its own sake */
.plate::before {
  content: '';
  position: absolute;
  inset: 0;
  background-image:
    repeating-linear-gradient(to right, var(--rule-soft) 0 1px, transparent 1px 96px),
    repeating-linear-gradient(to bottom, var(--rule-soft) 0 1px, transparent 1px 96px);
  mask-image: radial-gradient(ellipse 120% 80% at 50% 0%, #000 35%, transparent 78%);
  -webkit-mask-image: radial-gradient(ellipse 120% 80% at 50% 0%, #000 35%, transparent 78%);
  z-index: -2;
  pointer-events: none;
}

.plate::after {
  content: '';
  position: absolute;
  inset: 0;
  background: radial-gradient(ellipse 90% 60% at 15% -10%, rgba(96, 165, 250, 0.14), transparent 60%);
  z-index: -2;
  pointer-events: none;
}

/* --- Hero: wordmark against a drafting title block ------------------------ */

.chart-hero {
  display: grid;
  grid-template-columns: minmax(0, 1.35fr) minmax(0, 0.85fr);
  gap: clamp(2rem, 5vw, 4.5rem);
  align-items: end;
  padding: clamp(4rem, 11vw, 9rem) var(--gutter) clamp(3rem, 7vw, 6rem);
  border-bottom: 1px solid var(--rule);
  position: relative;
}

.kicker {
  font-family: var(--mono);
  font-size: 0.7rem;
  letter-spacing: 0.34em;
  text-transform: uppercase;
  color: var(--signal);
  margin: 0 0 1.6rem;
  opacity: 0;
  animation: rise 0.9s cubic-bezier(0.16, 1, 0.3, 1) 0.05s forwards;
}

.wordmark {
  font-family: var(--serif);
  font-weight: 400;
  font-size: clamp(4.2rem, 15vw, 11rem);
  line-height: 0.82;
  letter-spacing: -0.02em;
  margin: 0;
  color: var(--ink);
  opacity: 0;
  animation: rise 1s cubic-bezier(0.16, 1, 0.3, 1) 0.14s forwards;
}

.wordmark em {
  font-style: italic;
  color: var(--signal);
}

.lede {
  font-size: clamp(1.02rem, 1.9vw, 1.3rem);
  line-height: 1.55;
  color: var(--ink-dim);
  max-width: 34ch;
  margin: 1.9rem 0 2.6rem;
  opacity: 0;
  animation: rise 1s cubic-bezier(0.16, 1, 0.3, 1) 0.24s forwards;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.9rem;
  opacity: 0;
  animation: rise 1s cubic-bezier(0.16, 1, 0.3, 1) 0.34s forwards;
}

.act {
  font-family: var(--mono);
  font-size: 0.78rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  padding: 0.95rem 1.7rem;
  text-decoration: none;
  border: 1px solid var(--signal);
  color: var(--plate);
  background: var(--signal);
  transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.25s, background 0.25s, color 0.25s;
}

.act:hover {
  transform: translateY(-2px);
  box-shadow: 0 10px 30px -12px rgba(242, 177, 85, 0.7);
  color: var(--plate);
}

.act--ghost {
  background: transparent;
  color: var(--ink);
  border-color: var(--rule);
}

.act--ghost:hover {
  border-color: var(--ink-dim);
  color: var(--ink);
  box-shadow: none;
}

/* Title block, as on an engineering sheet */
.titleblock {
  border: 1px solid var(--rule);
  background: linear-gradient(180deg, rgba(11, 17, 32, 0.9), rgba(7, 11, 20, 0.9));
  padding: 1.4rem 1.5rem 1.1rem;
  opacity: 0;
  animation: rise 1s cubic-bezier(0.16, 1, 0.3, 1) 0.44s forwards;
}

.titleblock dl {
  margin: 0;
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.55rem 1.4rem;
  font-family: var(--mono);
  font-size: 0.74rem;
}

.titleblock dt {
  color: var(--ink-faint);
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.titleblock dd {
  margin: 0;
  color: var(--ink);
  text-align: right;
}

.constellation {
  display: block;
  width: 100%;
  height: auto;
  margin-top: 1.3rem;
  border-top: 1px solid var(--rule-soft);
  padding-top: 1.2rem;
}

.constellation .edge { stroke: var(--rule); stroke-width: 1; }
.constellation .node { fill: var(--ink-faint); }
.constellation .node--lit { fill: var(--signal); }
.constellation .pulse { transform-origin: center; transform-box: fill-box; animation: breathe 5.5s ease-in-out infinite; }

/* --- Index of capabilities: a branching list, not a card grid -------------- */

.section-mark {
  display: flex;
  align-items: baseline;
  gap: 1.1rem;
  padding: clamp(3.5rem, 7vw, 6rem) var(--gutter) 0;
  font-family: var(--mono);
  font-size: 0.7rem;
  letter-spacing: 0.3em;
  text-transform: uppercase;
  color: var(--ink-faint);
}

.section-mark::after {
  content: '';
  flex: 1;
  height: 1px;
  background: var(--rule);
}

.index {
  padding: 2.2rem var(--gutter) clamp(3rem, 7vw, 5rem);
}

.entry {
  display: grid;
  grid-template-columns: 4.2rem minmax(0, 1fr);
  gap: clamp(1rem, 3vw, 2.4rem);
  padding: 1.9rem 0;
  border-top: 1px solid var(--rule-soft);
  position: relative;
  transition: background 0.35s ease;
}

.entry:last-child { border-bottom: 1px solid var(--rule-soft); }

/* The branch: each entry sits a little further along its edge */
.entry:nth-child(2) { padding-left: clamp(0px, 2vw, 2rem); }
.entry:nth-child(3) { padding-left: clamp(0px, 4vw, 4rem); }
.entry:nth-child(4) { padding-left: clamp(0px, 3vw, 3rem); }
.entry:nth-child(5) { padding-left: clamp(0px, 5vw, 5rem); }
.entry:nth-child(6) { padding-left: clamp(0px, 1.5vw, 1.5rem); }

.entry:hover { background: linear-gradient(90deg, rgba(242, 177, 85, 0.045), transparent 55%); }

.entry-no {
  font-family: var(--mono);
  font-size: 0.74rem;
  color: var(--ink-faint);
  letter-spacing: 0.08em;
  padding-top: 0.55rem;
  position: relative;
  transition: color 0.3s ease;
}

.entry:hover .entry-no { color: var(--signal); }

.entry-no::after {
  content: '';
  position: absolute;
  right: -0.55rem;
  top: 0.85rem;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--ink-faint);
  transition: background 0.3s ease, box-shadow 0.3s ease, transform 0.3s ease;
}

.entry:hover .entry-no::after {
  background: var(--signal);
  box-shadow: 0 0 0 4px rgba(242, 177, 85, 0.14);
  transform: scale(1.15);
}

.entry h3 {
  font-family: var(--serif);
  font-weight: 400;
  font-size: clamp(1.55rem, 3.4vw, 2.3rem);
  line-height: 1.1;
  letter-spacing: -0.01em;
  margin: 0 0 0.55rem;
  color: var(--ink);
}

.entry p {
  margin: 0;
  max-width: 62ch;
  color: var(--ink-dim);
  font-size: 0.99rem;
  line-height: 1.62;
}

/* --- Plates: the screenshots, hung slightly off the grid ------------------- */

.plates {
  padding: 0 var(--gutter) clamp(3rem, 7vw, 5.5rem);
  columns: 2;
  column-gap: clamp(0.9rem, 2.2vw, 1.6rem);
}

.plates figure {
  break-inside: avoid;
  margin: 0 0 clamp(0.9rem, 2.2vw, 1.6rem);
  border: 1px solid var(--rule);
  background: var(--plate-raised);
  transition: border-color 0.3s ease, transform 0.4s cubic-bezier(0.16, 1, 0.3, 1);
}

.plates figure:hover {
  border-color: rgba(242, 177, 85, 0.5);
  transform: translateY(-3px);
}

.plates img {
  display: block;
  width: 100%;
  height: auto;
  cursor: zoom-in;
}

.plates figcaption {
  font-family: var(--mono);
  font-size: 0.66rem;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--ink-faint);
  padding: 0.6rem 0.8rem;
  border-top: 1px solid var(--rule-soft);
}

/* --- Closing block -------------------------------------------------------- */

.closing {
  margin: 0 var(--gutter) clamp(2.5rem, 6vw, 4.5rem);
  border: 1px solid var(--rule);
  padding: clamp(2.2rem, 5vw, 3.6rem);
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 1.8rem;
  align-items: center;
  background: linear-gradient(180deg, rgba(11, 17, 32, 0.92), rgba(7, 11, 20, 0.92));
}

.closing h2 {
  font-family: var(--serif);
  font-weight: 400;
  font-size: clamp(1.9rem, 4.4vw, 3rem);
  line-height: 1.06;
  margin: 0 0 0.6rem;
  color: var(--ink);
}

.closing p {
  margin: 0;
  color: var(--ink-dim);
  font-size: 0.98rem;
}

.colophon {
  margin: 0 var(--gutter) clamp(3rem, 6vw, 4.5rem);
  border-top: 1px solid var(--rule-soft);
}

.colophon p {
  font-family: var(--mono);
  font-size: 0.68rem;
  line-height: 1.9;
  letter-spacing: 0.04em;
  color: var(--ink-faint);
  max-width: 76ch;
  margin: 1.4rem 0 0;
}

/* --- Motion --------------------------------------------------------------- */

@keyframes rise {
  from { opacity: 0; transform: translateY(14px); }
  to   { opacity: 1; transform: translateY(0); }
}

@keyframes breathe {
  0%, 100% { opacity: 0.35; transform: scale(1); }
  50%      { opacity: 1; transform: scale(1.6); }
}

@media (prefers-reduced-motion: reduce) {
  .kicker, .wordmark, .lede, .actions, .titleblock { animation: none; opacity: 1; }
  .constellation .pulse { animation: none; }
  .act, .entry, .plates figure { transition: none; }
}

/* --- Narrow screens ------------------------------------------------------- */

@media (max-width: 900px) {
  .chart-hero { grid-template-columns: 1fr; align-items: start; }
  .titleblock { order: 2; }
  .plates { columns: 1; }
  .closing { grid-template-columns: 1fr; }
  .entry { grid-template-columns: 3rem minmax(0, 1fr); }
  .entry:nth-child(n) { padding-left: 0; }
}
</style>

<div class="plate">

<header class="chart-hero">
  <div>
    <p class="kicker">Local-first knowledge cartography</p>
    <h1 class="wordmark">Nod<em>us</em></h1>
    <p class="lede">The document and the whiteboard are the same surface. Draw your thinking as a graph, and keep every file on your own machine.</p>
    <div class="actions">
      <a class="act" href="downloads/">Download</a>
      <a class="act act--ghost" href="https://github.com/sorenwacker/nodus">Source</a>
    </div>
  </div>

  <aside class="titleblock">
    <dl>
      <dt>Platforms</dt><dd>macOS / Windows / Linux</dd>
      <dt>Storage</dt><dd>Markdown + SQLite</dd>
      <dt>Models</dt><dd>Ollama or cloud</dd>
      <dt>Licence</dt><dd>Open source</dd>
      <dt>Network</dt><dd>Optional</dd>
    </dl>
    <svg class="constellation" viewBox="0 0 320 120" role="img" aria-label="A small constellation of connected nodes">
      <line class="edge" x1="26" y1="88" x2="88" y2="46" />
      <line class="edge" x1="88" y1="46" x2="152" y2="70" />
      <line class="edge" x1="152" y1="70" x2="214" y2="30" />
      <line class="edge" x1="214" y1="30" x2="292" y2="62" />
      <line class="edge" x1="88" y1="46" x2="120" y2="18" />
      <line class="edge" x1="152" y1="70" x2="176" y2="104" />
      <circle class="node" cx="26" cy="88" r="3" />
      <circle class="node" cx="120" cy="18" r="2.5" />
      <circle class="node" cx="176" cy="104" r="2.5" />
      <circle class="node" cx="292" cy="62" r="3" />
      <circle class="node node--lit" cx="88" cy="46" r="3.5" />
      <circle class="node node--lit pulse" cx="152" cy="70" r="4" />
      <circle class="node" cx="214" cy="30" r="3" />
    </svg>
  </aside>
</header>

<p class="section-mark">Capabilities</p>

<section class="index">
  <article class="entry">
    <div class="entry-no">01</div>
    <div>
      <h3>Single canvas</h3>
      <p>The document and the whiteboard are one thing. No embeds, no context switching. Connect ideas visually with arrows and typed relationships.</p>
    </div>
  </article>
  <article class="entry">
    <div class="entry-no">02</div>
    <div>
      <h3>Native Typst maths</h3>
      <p>Sub-second rendering with modern Typst syntax. Write equations naturally, without waiting on a LaTeX toolchain.</p>
    </div>
  </article>
  <article class="entry">
    <div class="entry-no">03</div>
    <div>
      <h3>Obsidian bridge</h3>
      <p>Bi-directional sync with your vault. Your markdown files stay exactly as they are, so both tools keep working.</p>
    </div>
  </article>
  <article class="entry">
    <div class="entry-no">04</div>
    <div>
      <h3>Local-first</h3>
      <p>Your data never leaves the device unless you choose to move it. No cloud account, and the whole application works offline.</p>
    </div>
  </article>
  <article class="entry">
    <div class="entry-no">05</div>
    <div>
      <h3>Model integration</h3>
      <p>Run local models through Ollama or connect a cloud provider. The agent organises, connects and researches inside the graph you already have.</p>
    </div>
  </article>
  <article class="entry">
    <div class="entry-no">06</div>
    <div>
      <h3>Export anywhere</h3>
      <p>PDF, Typst source or plain Markdown. Nothing is locked in, because the files were yours to begin with.</p>
    </div>
  </article>
</section>

<p class="section-mark">Plates</p>

<section class="plates">
  <figure><img src="./assets/nodus-screenshot.png" alt="Nodus canvas view" onclick="openLightbox(this.src)"><figcaption>Fig. 01 - Canvas</figcaption></figure>
  <figure><img src="./assets/nodus-screenshot-2.png" alt="Nodus knowledge graph" onclick="openLightbox(this.src)"><figcaption>Fig. 02 - Graph</figcaption></figure>
  <figure><img src="./assets/nodus-screenshot-3.png" alt="Nodus connections" onclick="openLightbox(this.src)"><figcaption>Fig. 03 - Connections</figcaption></figure>
  <figure><img src="./assets/nodus-screenshot-4.png" alt="Nodus editing" onclick="openLightbox(this.src)"><figcaption>Fig. 04 - Editing</figcaption></figure>
  <figure><img src="./assets/nodus-screenshot-5.png" alt="Nodus themes" onclick="openLightbox(this.src)"><figcaption>Fig. 05 - Themes</figcaption></figure>
  <figure><img src="./assets/nodus-screenshot-6.png" alt="Nodus layout" onclick="openLightbox(this.src)"><figcaption>Fig. 06 - Layout</figcaption></figure>
  <figure><img src="./assets/nodus-screenshot-7.png" alt="Nodus overview" onclick="openLightbox(this.src)"><figcaption>Fig. 07 - Overview</figcaption></figure>
</section>

<section class="closing">
  <div>
    <h2>Start mapping</h2>
    <p>Free and open source, for macOS, Windows and Linux.</p>
  </div>
  <a class="act" href="downloads/">Download Nodus</a>
</section>

<section class="colophon">
  <p><strong>Disclaimer:</strong> this software is provided as-is, without warranty. The author is not liable for data loss, API costs or other damages.</p>
</section>

</div>
