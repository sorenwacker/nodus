/**
 * HTML sanitization utilities using DOMPurify
 * Prevents XSS attacks from user-controlled content
 */
import DOMPurify from 'dompurify'

// Configure DOMPurify for SVG content (allows SVG elements)
// Mermaid uses foreignObject with HTML divs for text rendering
// Must be permissive to support all Mermaid diagram types
const svgConfig: DOMPurify.Config = {
  ADD_TAGS: [
    // Core SVG elements
    'svg', 'g', 'defs', 'symbol', 'use', 'switch',
    'path', 'line', 'polyline', 'polygon', 'rect', 'circle', 'ellipse',
    'text', 'tspan', 'textPath',
    'marker', 'clipPath', 'mask', 'pattern',
    'linearGradient', 'radialGradient', 'stop',
    'filter', 'feGaussianBlur', 'feOffset', 'feBlend', 'feColorMatrix',
    'feMerge', 'feMergeNode', 'feFlood', 'feComposite',
    // Mermaid-specific
    'foreignObject',
    // HTML inside foreignObject
    'div', 'span', 'p', 'br', 'b', 'i', 'em', 'strong',
  ],
  ADD_ATTR: [
    // SVG namespace
    'xmlns', 'xmlns:xlink', 'xlink:href', 'href',
    // Positioning
    'x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'rx', 'ry',
    'width', 'height', 'viewBox', 'preserveAspectRatio',
    // Path/shape
    'd', 'points', 'transform', 'pathLength',
    // Styling
    'fill', 'stroke', 'stroke-width', 'stroke-dasharray',
    'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit',
    'opacity', 'fill-opacity', 'stroke-opacity', 'fill-rule',
    // Text
    'dominant-baseline', 'text-anchor', 'alignment-baseline',
    'font-size', 'font-family', 'font-weight', 'font-style',
    'letter-spacing', 'dy', 'dx',
    // Marker/clip/filter
    'marker-start', 'marker-mid', 'marker-end',
    'clip-path', 'mask', 'filter',
    'markerWidth', 'markerHeight', 'refX', 'refY', 'orient',
    'gradientUnits', 'gradientTransform', 'offset', 'stop-color', 'stop-opacity',
    // References
    'id', 'class', 'style',
    // foreignObject
    'requiredExtensions',
  ],
  // Allow style attribute with CSS
  ALLOW_UNKNOWN_PROTOCOLS: false,
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
 * Sanitize SVG content (from Typst, etc.)
 */
export function sanitizeSvg(svg: string): string {
  return DOMPurify.sanitize(svg, svgConfig)
}

/**
 * Sanitize Mermaid SVG output
 * Mermaid uses foreignObject with HTML for text rendering which DOMPurify strips.
 * Since Mermaid has its own security model (securityLevel config), we do minimal
 * sanitization - just remove script tags and event handlers.
 */
export function sanitizeMermaidSvg(svg: string): string {
  // Remove script tags
  let sanitized = svg.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
  // Remove event handlers (onclick, onerror, etc.)
  sanitized = sanitized.replace(/\s*on\w+\s*=\s*["'][^"']*["']/gi, '')
  return sanitized
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
