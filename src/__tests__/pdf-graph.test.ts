/**
 * PDF as a graph (PRODUCT_DESIGN.md > PDF as a graph).
 *
 * A paper is already a structure; flattening it into one node discards exactly
 * what a graph tool is for. The structural parts here are deterministic and
 * must work with no model and no network.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  splitIntoSections,
  findReferencesSection,
  parseReferenceEntries,
  verificationFromLookup,
  planGraphImport,
  withVerification,
  dropPositionToLogical,
  fileNameFromPath,
} from '../lib/pdfGraph'

const PAPER = `# LCDB 2.0: Hyperparameter Learning Landscapes

Intro paragraph before any section.

## 1 General Information

Project title and keywords.

## 4 Scientific case

### 4.1 Summary

Machine learning research is compute-intensive.

### 4.2 The project

The central question is how learning curves behave.

## References

- Mohr, F., Viering, T. J. (2023). LCDB 1.0: An extensive learning curves database. ECML PKDD 2022.
- Yan, C., Mohr, F. (2025). LCDB 1.1: A database illustrating learning curves are ill-behaved. arXiv.
`

describe('splitting a paper into sections', () => {
  const sections = splitIntoSections(PAPER)

  it('makes one section per heading, keeping the hierarchy', () => {
    const titles = sections.map(s => s.title)
    expect(titles).toContain('1 General Information')
    expect(titles).toContain('4 Scientific case')
    expect(titles).toContain('4.1 Summary')

    const summary = sections.find(s => s.title === '4.1 Summary')!
    const parent = sections.find(s => s.title === '4 Scientific case')!
    expect(summary.parentIndex).toBe(sections.indexOf(parent))
  })

  it('keeps each section body with its section', () => {
    const scase = sections.find(s => s.title === '4.2 The project')!
    expect(scase.content).toContain('central question')
    // And not its sibling's text
    expect(scase.content).not.toContain('compute-intensive')
  })

  it('keeps preamble text before the first heading with the title section', () => {
    const root = sections[0]
    expect(root.content).toContain('Intro paragraph')
  })

  it('treats a document with no headings as a single section', () => {
    const flat = splitIntoSections('Just prose.\n\nMore prose.')
    expect(flat).toHaveLength(1)
    expect(flat[0].content).toContain('Just prose.')
  })
})

describe('finding and parsing references', () => {
  it('recognises the references section by its title', () => {
    const sections = splitIntoSections(PAPER)
    const refs = findReferencesSection(sections)
    expect(refs?.title).toBe('References')
  })

  it('parses one entry per reference with a usable title', () => {
    const sections = splitIntoSections(PAPER)
    const refs = findReferencesSection(sections)!
    const entries = parseReferenceEntries(refs.content)

    expect(entries).toHaveLength(2)
    expect(entries[0].title).toContain('LCDB 1.0')
    expect(entries[0].raw).toContain('Mohr')
    expect(entries[1].title).toContain('LCDB 1.1')
  })

  it('reads a DOI out of an entry when there is one', () => {
    const entries = parseReferenceEntries(
      '- Smith, J. (2020). A paper. Journal. https://doi.org/10.1234/abcd.5678\n'
    )
    expect(entries[0].doi).toBe('10.1234/abcd.5678')
  })

  it('finds nothing rather than guessing when no references section exists', () => {
    const sections = splitIntoSections('# Title\n\n## Methods\n\nText.')
    expect(findReferencesSection(sections)).toBeNull()
  })
})

describe('verification states', () => {
  // An outage must never mark a reference as missing: someone else's downtime
  // must not invalidate the user's bibliography
  it('is verified when the service found the paper', () => {
    expect(verificationFromLookup({ found: true }).state).toBe('verified')
  })

  it('is not_found when the service answered and has no match', () => {
    expect(verificationFromLookup({ found: false }).state).toBe('not_found')
  })

  it('is not_checked when the service could not be reached', () => {
    const v = verificationFromLookup({ error: 'network unreachable' })
    expect(v.state).toBe('not_checked')
    expect(v.detail).toContain('unreachable')
  })
})

describe('planning the graph', () => {
  const sections = splitIntoSections(PAPER)
  const refs = parseReferenceEntries(findReferencesSection(sections)!.content)

  it('plans one node per content section inside one frame', () => {
    const plan = planGraphImport(sections, refs, { x: 100, y: 200 })

    const titles = plan.nodes.map(n => n.title)
    expect(titles).toContain('1 General Information')
    // Level-3 subsections fold into their chapter instead of becoming nodes
    expect(titles).not.toContain('4.1 Summary')
    const chapter = plan.nodes.find(n => n.title === '4 Scientific case')!
    expect(chapter.content).toContain('compute-intensive')
    // The references section is not a content node; its entries become citations
    expect(titles).not.toContain('References')
    expect(plan.frameTitle).toContain('LCDB 2.0')
  })

  it('follows the document tree with edges', () => {
    const plan = planGraphImport(sections, refs, { x: 0, y: 0 })

    const root = plan.nodes.find(n => n.title.includes('LCDB 2.0'))!
    const chapter = plan.nodes.find(n => n.title === '4 Scientific case')!
    expect(plan.edges).toContainEqual(
      expect.objectContaining({ fromKey: root.key, toKey: chapter.key, linkType: 'related' })
    )
  })

  it('plans a citation node per reference, cited by the paper root', () => {
    const plan = planGraphImport(sections, refs, { x: 0, y: 0 })

    const citations = plan.nodes.filter(n => n.nodeType === 'citation')
    expect(citations).toHaveLength(2)
    const cites = plan.edges.filter(e => e.linkType === 'cites')
    expect(cites).toHaveLength(2)
    expect(cites.every(e => e.fromKey === plan.rootKey)).toBe(true)
  })

  it('lays sections and citations out without stacking them', () => {
    const plan = planGraphImport(sections, refs, { x: 0, y: 0 })

    const positions = new Set(plan.nodes.map(n => `${n.x},${n.y}`))
    expect(positions.size).toBe(plan.nodes.length)
  })

  it('records the verification state in the citation node content', () => {
    const plan = planGraphImport(sections, refs, { x: 0, y: 0 })
    const citation = plan.nodes.find(n => n.nodeType === 'citation')!

    const content = withVerification(citation.content, { state: 'not_checked', detail: 'offline' })
    expect(content).toContain('verification: not_checked')
  })
})

describe('graph import reachability', () => {
  const read = (p: string) =>
    readFileSync(resolve(__dirname, '..', p), 'utf-8')

  it('is offered from the drop pipeline and mounted on the canvas', () => {
    // Structure no interface offers is dead code, however correct
    expect(read('canvas/composables/util/usePdfDrop.ts')).toContain('onDocumentImported')
    const canvas = read('canvas/GraphCanvas.vue')
    expect(canvas).toContain('PdfGraphDialog')
    expect(canvas).toContain('offerGraph')
  })

  it('never stacks the graph dialog on the highlight picker', () => {
    const canvas = read('canvas/GraphCanvas.vue')
    const mount = canvas.slice(canvas.indexOf('<PdfGraphDialog'))
    expect(mount.slice(0, 400)).toContain('!pdfDrop.pendingHighlights.value')
  })

  it('writes nothing to Zotero unless that box was ticked', () => {
    const canvas = read('canvas/GraphCanvas.vue')
    const handler = canvas.slice(canvas.indexOf('async function handleGraphImport'))
    const zoteroCall = handler.indexOf('addNodesToZotero')
    const guard = handler.indexOf('choices.zotero')
    expect(guard).toBeGreaterThan(-1)
    expect(guard).toBeLessThan(zoteroCall)
  })
})

describe('section depth', () => {
  it('folds deep subsections into their parent node', () => {
    // A paper becomes its chapters, not every sub-subsection
    const deep = splitIntoSections(
      '# Paper\n\n## A Methods\n\nIntro.\n\n### A.1 Details\n\nFine print.\n\n#### A.1.1 Finer\n\nFinest.\n\n## B Results\n\nFindings.'
    )
    const plan = planGraphImport(deep, [], { x: 0, y: 0 })

    const titles = plan.nodes.map(n => n.title)
    expect(titles).toContain('A Methods')
    expect(titles).toContain('B Results')
    expect(titles).not.toContain('A.1 Details')
    expect(titles).not.toContain('A.1.1 Finer')

    // The folded text is kept, inside the parent, under its own heading
    const methods = plan.nodes.find(n => n.title === 'A Methods')!
    expect(methods.content).toContain('Intro.')
    expect(methods.content).toContain('A.1 Details')
    expect(methods.content).toContain('Fine print.')
    expect(methods.content).toContain('Finest.')
  })
})

describe('drop position', () => {
  // The drop event reports physical pixels on Windows and Linux but logical
  // pixels on macOS; the canvas works in logical pixels throughout
  // (PRODUCT_DESIGN.md > Drop position)
  it('leaves macOS positions unscaled', () => {
    expect(dropPositionToLogical({ x: 700, y: 400 }, 2, 'macos')).toEqual({ x: 700, y: 400 })
  })

  it('descales physical positions on Windows and Linux', () => {
    expect(dropPositionToLogical({ x: 1400, y: 800 }, 2, 'windows')).toEqual({ x: 700, y: 400 })
    expect(dropPositionToLogical({ x: 1400, y: 800 }, 2, 'linux')).toEqual({ x: 700, y: 400 })
  })

  it('is a no-op at scale factor 1 everywhere', () => {
    expect(dropPositionToLogical({ x: 500, y: 300 }, 1, 'linux')).toEqual({ x: 500, y: 300 })
  })
})

describe('file names across platforms', () => {
  // Windows separates path components with a backslash
  // (PRODUCT_DESIGN.md > File paths across platforms)
  it('reads the file name from a Windows path', () => {
    expect(fileNameFromPath('C:\\Users\\dana\\Documents\\paper.pdf')).toBe('paper.pdf')
  })

  it('reads the file name from a POSIX path', () => {
    expect(fileNameFromPath('/home/dana/documents/paper.pdf')).toBe('paper.pdf')
  })

  it('handles mixed separators and a bare name', () => {
    expect(fileNameFromPath('C:/Users\\dana/paper.pdf')).toBe('paper.pdf')
    expect(fileNameFromPath('paper.pdf')).toBe('paper.pdf')
  })
})
