/**
 * HTML sanitization utilities using DOMPurify
 * Prevents XSS attacks from user-controlled content
 */
import DOMPurify from 'dompurify'

// Configure DOMPurify for SVG content (allows SVG elements)
const svgConfig: DOMPurify.Config = {
  USE_PROFILES: { svg: true, svgFilters: true },
  ADD_TAGS: ['use'],
  ADD_ATTR: ['xmlns', 'xmlns:xlink', 'xlink:href', 'viewBox', 'preserveAspectRatio'],
}

// Configure DOMPurify for HTML content (markdown rendered)
const htmlConfig: DOMPurify.Config = {
  USE_PROFILES: { html: true },
  ALLOWED_TAGS: [
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'p', 'br', 'hr',
    'ul', 'ol', 'li',
    'blockquote', 'pre', 'code',
    'a', 'strong', 'em', 'b', 'i', 'u', 's', 'del', 'ins', 'mark',
    'span', 'div',
    'table', 'thead', 'tbody', 'tr', 'th', 'td',
    'img',
    'sup', 'sub',
  ],
  ALLOWED_ATTR: [
    'href', 'target', 'rel', 'class', 'id', 'style',
    'src', 'alt', 'title', 'width', 'height',
    'data-math', 'data-mermaid',
    'colspan', 'rowspan',
  ],
  ALLOW_DATA_ATTR: true,
}

/**
 * Sanitize SVG content (from Typst, Mermaid, etc.)
 */
export function sanitizeSvg(svg: string): string {
  return DOMPurify.sanitize(svg, svgConfig)
}

/**
 * Sanitize HTML content (from markdown rendering)
 */
export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, htmlConfig)
}

/**
 * Escape text for safe display (no HTML interpretation)
 */
export function escapeText(text: string): string {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}
