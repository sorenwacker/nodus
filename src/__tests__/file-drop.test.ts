import { describe, it, expect, vi } from 'vitest'
import { parseReferences, citationToMarkdown, parseBibTeX, parseCslJson } from '../lib/bibtex'

// Mock Tauri APIs since they're not available in test environment
vi.mock('@tauri-apps/api/webview', () => ({
  getCurrentWebview: () => ({
    onDragDropEvent: vi.fn().mockResolvedValue(() => {}),
  }),
}))

vi.mock('../lib/tauri', () => ({
  readTextFile: vi.fn(),
}))

describe('File Drop Functionality', () => {
  describe('File type detection', () => {
    // Test the logic used in useFileDrop.ts
    function getFileType(path: string): 'pdf' | 'bibtex' | 'markdown' | 'unknown' {
      const lower = path.toLowerCase()
      if (lower.endsWith('.pdf')) return 'pdf'
      if (lower.endsWith('.bib')) return 'bibtex'
      if (lower.endsWith('.json')) return 'bibtex' // CSL-JSON
      if (lower.endsWith('.md') || lower.endsWith('.markdown')) return 'markdown'
      return 'unknown'
    }

    it('detects PDF files', () => {
      expect(getFileType('paper.pdf')).toBe('pdf')
      expect(getFileType('Paper.PDF')).toBe('pdf')
      expect(getFileType('/path/to/document.pdf')).toBe('pdf')
    })

    it('detects BibTeX files', () => {
      expect(getFileType('references.bib')).toBe('bibtex')
      expect(getFileType('Library.BIB')).toBe('bibtex')
      expect(getFileType('/path/to/zotero.bib')).toBe('bibtex')
    })

    it('detects CSL-JSON files', () => {
      expect(getFileType('citations.json')).toBe('bibtex')
      expect(getFileType('export.JSON')).toBe('bibtex')
    })

    it('detects Markdown files', () => {
      expect(getFileType('notes.md')).toBe('markdown')
      expect(getFileType('README.markdown')).toBe('markdown')
      expect(getFileType('Document.MD')).toBe('markdown')
    })

    it('returns unknown for unsupported files', () => {
      expect(getFileType('image.png')).toBe('unknown')
      expect(getFileType('document.docx')).toBe('unknown')
      expect(getFileType('data.csv')).toBe('unknown')
    })
  })

  describe('BibTeX import', () => {
    it('parses real-world Zotero export', () => {
      const zoteroExport = `
@article{smith2023,
  author = {Smith, John and Doe, Jane},
  title = {A Study of Knowledge Graphs},
  journal = {Journal of Computer Science},
  year = {2023},
  volume = {15},
  number = {3},
  pages = {123--145},
  doi = {10.1234/jcs.2023.001},
  abstract = {This paper presents a comprehensive study of knowledge graphs and their applications in modern computing.}
}

@inproceedings{jones2022,
  author = {Jones, Alice},
  title = {Neural Networks for Graph Analysis},
  booktitle = {Proceedings of ICML 2022},
  year = {2022},
  pages = {456--478}
}
      `
      const entries = parseBibTeX(zoteroExport)

      expect(entries).toHaveLength(2)
      expect(entries[0].key).toBe('smith2023')
      expect(entries[0].doi).toBe('10.1234/jcs.2023.001')
      expect(entries[1].type).toBe('inproceedings')
    })

    it('handles special characters in titles', () => {
      const bib = `
@article{test2024,
  title = {Machine Learning: A Survey of {AI} Techniques},
  author = {M\\"uller, Hans}
}
      `
      const entries = parseBibTeX(bib)

      expect(entries[0].title).toBe('Machine Learning: A Survey of AI Techniques')
      expect(entries[0].author).toBe('Müller, Hans') // LaTeX \" correctly converted to ü
    })
  })

  describe('CSL-JSON import', () => {
    it('parses Zotero CSL-JSON export', () => {
      const cslJson = JSON.stringify([
        {
          id: 'brown2021',
          type: 'article-journal',
          title: 'Deep Learning Fundamentals',
          author: [
            { given: 'Emily', family: 'Brown' },
            { given: 'Michael', family: 'Chen' }
          ],
          issued: { 'date-parts': [[2021, 6, 15]] },
          'container-title': 'Nature Machine Intelligence',
          volume: '3',
          page: '500-512',
          DOI: '10.1038/s42256-021-00001-x'
        }
      ])

      const entries = parseCslJson(cslJson)

      expect(entries).toHaveLength(1)
      expect(entries[0].key).toBe('brown2021')
      expect(entries[0].title).toBe('Deep Learning Fundamentals')
      expect(entries[0].author).toBe('Emily Brown and Michael Chen')
      expect(entries[0].year).toBe('2021')
    })
  })

  describe('Auto-format detection', () => {
    it('auto-detects BibTeX format', () => {
      const bib = '@article{test, title = {Test Title}}'
      const entries = parseReferences(bib)

      expect(entries).toHaveLength(1)
      expect(entries[0].title).toBe('Test Title')
    })

    it('auto-detects CSL-JSON format (array)', () => {
      const json = '[{"id": "test", "title": "Test Title"}]'
      const entries = parseReferences(json)

      expect(entries).toHaveLength(1)
      expect(entries[0].title).toBe('Test Title')
    })

    it('auto-detects CSL-JSON format (single object)', () => {
      const json = '{"id": "test", "title": "Test Title"}'
      const entries = parseReferences(json)

      expect(entries).toHaveLength(1)
      expect(entries[0].title).toBe('Test Title')
    })

    it('falls back to BibTeX for ambiguous content', () => {
      const content = 'Some random text that is neither format'
      const entries = parseReferences(content)

      expect(entries).toHaveLength(0)
    })
  })

  describe('Citation markdown generation', () => {
    it('generates complete markdown for article', () => {
      const entry = {
        type: 'article',
        key: 'test2024',
        title: 'Test Article',
        author: 'Smith, John and Doe, Jane',
        year: '2024',
        journal: 'Test Journal',
        volume: '10',
        number: '2',
        pages: '100-120',
        doi: '10.1234/test',
        abstract: 'This is the abstract.',
        keywords: 'machine learning, ai'
      }

      const md = citationToMarkdown(entry)

      expect(md).toContain('# Test Article')
      expect(md).toContain('**John Smith, Jane Doe** (2024)')
      expect(md).toContain('*Test Journal*')
      expect(md).toContain('Vol. 10')
      expect(md).toContain('No. 2')
      expect(md).toContain('pp. 100-120')
      expect(md).toContain('DOI: [10.1234/test](https://doi.org/10.1234/test)')
      expect(md).toContain('## Abstract')
      expect(md).toContain('This is the abstract.')
      expect(md).toContain('**Keywords:**')
      expect(md).toContain('Citation key: test2024')
    })

    it('handles minimal entry', () => {
      const entry = {
        type: 'misc',
        key: 'minimal'
      }

      const md = citationToMarkdown(entry)

      expect(md).toContain('Citation key: minimal')
      expect(md).not.toContain('undefined')
    })

    it('shows booktitle for conference papers', () => {
      const entry = {
        type: 'inproceedings',
        key: 'conf2024',
        title: 'Conference Paper',
        booktitle: 'ICML 2024'
      }

      const md = citationToMarkdown(entry)

      expect(md).toContain('In: *ICML 2024*')
    })
  })
})
