---
title: Nodus - Local-First Knowledge Graph
hide:
  - navigation
  - toc
---

<style>
.md-main__inner {
  margin: 0;
  max-width: none;
}
.md-content__inner {
  margin: 0;
  padding: 0;
}
.hero {
  background: linear-gradient(135deg, var(--md-primary-fg-color) 0%, #1a365d 100%);
  color: white;
  padding: 6rem 2rem;
  text-align: center;
}
.hero h1 {
  font-size: 3.5rem;
  font-weight: 700;
  margin: 0 0 1rem 0;
  color: white;
}
.hero .tagline {
  font-size: 1.5rem;
  opacity: 0.9;
  margin-bottom: 2rem;
  max-width: 600px;
  margin-left: auto;
  margin-right: auto;
}
.hero .buttons {
  display: flex;
  gap: 1rem;
  justify-content: center;
  flex-wrap: wrap;
}
.hero .btn {
  padding: 1rem 2rem;
  border-radius: 8px;
  text-decoration: none;
  font-weight: 600;
  font-size: 1.1rem;
  transition: transform 0.2s, box-shadow 0.2s;
}
.hero .btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0,0,0,0.3);
}
.hero .btn-primary {
  background: white;
  color: var(--md-primary-fg-color);
}
.hero .btn-secondary {
  background: transparent;
  color: white;
  border: 2px solid white;
}
.features {
  padding: 5rem 2rem;
  max-width: 1200px;
  margin: 0 auto;
}
.features h2 {
  text-align: center;
  font-size: 2.5rem;
  margin-bottom: 3rem;
}
.feature-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 2rem;
}
.feature-card {
  padding: 2rem;
  border-radius: 12px;
  background: var(--md-code-bg-color);
  border: 1px solid var(--md-default-fg-color--lightest);
}
.feature-card h3 {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-top: 0;
}
.feature-card .icon {
  font-size: 1.5rem;
}
.feature-card p {
  color: var(--md-default-fg-color--light);
  margin-bottom: 0;
}
.screenshot-section {
  background: var(--md-code-bg-color);
  padding: 5rem 2rem;
  text-align: center;
}
.screenshot-section h2 {
  font-size: 2.5rem;
  margin-bottom: 1rem;
}
.screenshot-section .subtitle {
  color: var(--md-default-fg-color--light);
  font-size: 1.2rem;
  margin-bottom: 3rem;
}
.screenshot-placeholder {
  max-width: 1000px;
  margin: 0 auto;
  background: var(--md-default-bg-color);
  border-radius: 12px;
  border: 1px solid var(--md-default-fg-color--lightest);
  padding: 3rem;
  color: var(--md-default-fg-color--light);
}
.comparison {
  padding: 5rem 2rem;
  max-width: 1000px;
  margin: 0 auto;
}
.comparison h2 {
  text-align: center;
  font-size: 2.5rem;
  margin-bottom: 1rem;
}
.comparison .subtitle {
  text-align: center;
  color: var(--md-default-fg-color--light);
  margin-bottom: 3rem;
}
.comparison table {
  width: 100%;
}
.cta {
  background: linear-gradient(135deg, var(--md-primary-fg-color) 0%, #1a365d 100%);
  color: white;
  padding: 5rem 2rem;
  text-align: center;
}
.cta h2 {
  font-size: 2.5rem;
  margin-bottom: 1rem;
  color: white;
}
.cta p {
  font-size: 1.2rem;
  opacity: 0.9;
  margin-bottom: 2rem;
}
.cta .btn {
  padding: 1rem 2.5rem;
  border-radius: 8px;
  text-decoration: none;
  font-weight: 600;
  font-size: 1.1rem;
  background: white;
  color: var(--md-primary-fg-color);
  display: inline-block;
}
.footer-note {
  padding: 2rem;
  text-align: center;
  color: var(--md-default-fg-color--light);
  font-size: 0.9rem;
}
</style>

<div class="hero">
  <h1>Nodus</h1>
  <p class="tagline">Local-first knowledge graph with EU sovereignty. Canvas-based visual thinking where your data stays yours.</p>
  <div class="buttons">
    <a href="downloads/" class="btn btn-primary">Download Now</a>
    <a href="https://github.com/sorenwacker/nodus" class="btn btn-secondary">View on GitHub</a>
  </div>
</div>

<div class="features">
  <h2>Everything in One Place</h2>
  <div class="feature-grid">
    <div class="feature-card">
      <h3><span class="icon">&#x1F3A8;</span> Single Canvas</h3>
      <p>The document and whiteboard are the same thing. No embeds, no context switching. Connect ideas visually with arrows and relationships.</p>
    </div>
    <div class="feature-card">
      <h3><span class="icon">&#x222B;</span> Native Typst Math</h3>
      <p>Sub-second math rendering with modern Typst syntax. Write equations naturally without 90-second LaTeX compile times.</p>
    </div>
    <div class="feature-card">
      <h3><span class="icon">&#x1F4C2;</span> Obsidian Bridge</h3>
      <p>Bi-directional sync with your Obsidian vault. Your markdown files stay compatible. Use both tools together.</p>
    </div>
    <div class="feature-card">
      <h3><span class="icon">&#x1F512;</span> Local-First</h3>
      <p>Your data never leaves your device unless you choose to sync. No cloud required. Full offline functionality.</p>
    </div>
    <div class="feature-card">
      <h3><span class="icon">&#x1F9E0;</span> LLM Integration</h3>
      <p>Connect local models via Ollama or cloud providers. Smart organization, semantic connections, and AI-assisted research.</p>
    </div>
    <div class="feature-card">
      <h3><span class="icon">&#x1F4E4;</span> Export Anywhere</h3>
      <p>Export to PDF, Typst source, or Markdown. Your knowledge is never locked in. Take it anywhere.</p>
    </div>
  </div>
</div>

<div class="screenshot-section">
  <h2>Visual Knowledge Work</h2>
  <p class="subtitle">Research, notes, and diagrams on one infinite canvas</p>
  <div class="screenshot-placeholder">
    <p>Canvas screenshot coming soon</p>
    <p style="font-size: 0.9rem; margin-top: 1rem;">Drag nodes, draw connections, organize spatially. Zoom out for overview, zoom in for details.</p>
  </div>
</div>

<div class="comparison">
  <h2>Why Nodus?</h2>
  <p class="subtitle">Built for researchers and knowledge workers who value sovereignty</p>

  | Feature | Nodus | Notion | Miro | Obsidian |
  |---------|-------|--------|------|----------|
  | Local-first | Yes | No | No | Yes |
  | Visual canvas | Primary | Embed only | Yes | Separate |
  | Math support | Typst (fast) | LaTeX (slow) | Limited | LaTeX |
  | Offline mode | Full | Partial | No | Full |
  | Open source | Yes | No | No | Partial |
  | EU data | Local | US servers | US servers | Local |
</div>

<div class="cta">
  <h2>Ready to Think Visually?</h2>
  <p>Download Nodus for macOS, Windows, or Linux. Free and open source.</p>
  <a href="downloads/" class="btn">Download for Free</a>
</div>

<div class="footer-note">
  <p><strong>Disclaimer:</strong> This software is provided "as-is" without warranty. The author is not liable for data loss, API costs, or other damages.</p>
</div>
