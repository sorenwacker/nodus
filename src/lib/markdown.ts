/**
 * Shared markdown rendering configuration
 * Single source of truth for marked.js setup
 */
import { marked } from 'marked'

/** Escape HTML metacharacters so text renders literally and cannot inject markup */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// Configure marked once at module load
marked.use({
  gfm: true,
  breaks: true,
  async: false,
  renderer: {
    code({ text, lang }: { text: string; lang?: string }) {
      // Trim whitespace, then escape both the code and the language: marked's
      // default renderer escapes code content, and this override must not drop
      // that protection (raw interpolation loses `<...>` content and opens an
      // HTML-injection hole into the pre-sanitization pipeline)
      const trimmedCode = escapeHtml(text.trim())
      const langClass = lang ? ` class="language-${escapeHtml(lang)}"` : ''
      return `<pre><code${langClass}>${trimmedCode}</code></pre>\n`
    }
  }
})

/**
 * Parse markdown to HTML using shared configuration
 */
export function parseMarkdown(content: string): string {
  return marked.parse(content) as string
}

// Re-export marked for cases that need direct access
export { marked }
