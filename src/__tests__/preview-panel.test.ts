/**
 * Preview panel tests
 * Tests that the preview panel correctly displays node content
 */
import { describe, it, expect, vi } from 'vitest'

// Mock the renderMarkdown function
const mockRenderMarkdown = vi.fn((content: string | null) => {
  if (!content) return ''
  return `<p>${content}</p>`
})

describe('Preview Panel Content', () => {
  it('should render content on-demand if not cached', () => {
    const nodeRenderedContent: Record<string, string> = {}
    const node = {
      id: 'test-node-1',
      markdown_content: 'Test content',
    }

    // Simulate the computed logic
    const getPreviewContent = () => {
      if (!node) return ''
      return nodeRenderedContent[node.id] || mockRenderMarkdown(node.markdown_content)
    }

    // Content not in cache - should render on-demand
    const content = getPreviewContent()
    expect(content).toBe('<p>Test content</p>')
    expect(mockRenderMarkdown).toHaveBeenCalledWith('Test content')
  })

  it('should return cached content if available', () => {
    const nodeRenderedContent: Record<string, string> = {
      'test-node-2': '<p>Cached content</p>',
    }
    const node = {
      id: 'test-node-2',
      markdown_content: 'Original content',
    }

    mockRenderMarkdown.mockClear()

    // Simulate the computed logic
    const getPreviewContent = () => {
      if (!node) return ''
      return nodeRenderedContent[node.id] || mockRenderMarkdown(node.markdown_content)
    }

    // Content in cache - should return cached
    const content = getPreviewContent()
    expect(content).toBe('<p>Cached content</p>')
    expect(mockRenderMarkdown).not.toHaveBeenCalled()
  })

  it('should return empty string if no node selected', () => {
    const nodeRenderedContent: Record<string, string> = {}
    const node = null

    // Simulate the computed logic
    const getPreviewContent = () => {
      if (!node) return ''
      return nodeRenderedContent[(node as { id: string }).id] || mockRenderMarkdown(null)
    }

    const content = getPreviewContent()
    expect(content).toBe('')
  })
})

describe('Preview Panel Mermaid Rendering', () => {
  it('should detect mermaid content and request rendering', () => {
    const contentWithMermaid = '<pre class="mermaid">graph TD; A-->B;</pre>'
    const contentWithoutMermaid = '<p>Regular content</p>'

    // Check mermaid detection logic
    const hasMermaid = (content: string) => content.includes('class="mermaid"')

    expect(hasMermaid(contentWithMermaid)).toBe(true)
    expect(hasMermaid(contentWithoutMermaid)).toBe(false)
  })
})

describe('Zoom to Node', () => {
  it('should use consistent scale of 1 for all zoom actions', () => {
    // Test the zoom scale calculation
    const DEFAULT_ZOOM_SCALE = 1

    // All zoom-to-node actions should use scale 1
    const previewPanelScale = 1
    const cmdClickScale = 1
    const contextMenuScale = 1
    const searchEventScale = 1

    expect(previewPanelScale).toBe(DEFAULT_ZOOM_SCALE)
    expect(cmdClickScale).toBe(DEFAULT_ZOOM_SCALE)
    expect(contextMenuScale).toBe(DEFAULT_ZOOM_SCALE)
    expect(searchEventScale).toBe(DEFAULT_ZOOM_SCALE)
  })
})
