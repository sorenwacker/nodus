/**
 * Shared markdown rendering configuration
 * Single source of truth for marked.js setup
 */
import { marked } from 'marked'

// Configure marked once at module load
marked.use({
  gfm: true,
  breaks: true,
  async: false,
  renderer: {
    code({ text, lang }: { text: string; lang?: string }) {
      // Trim all leading/trailing whitespace from code block
      const trimmedCode = text.trim()
      const langClass = lang ? ` class="language-${lang}"` : ''
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
