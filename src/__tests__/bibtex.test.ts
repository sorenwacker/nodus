import { describe, it, expect } from 'vitest'
import {
  parseBibTeX,
  formatAuthors,
  citationToMarkdown,
  parseCslJson,
  parseReferences,
} from '../lib/bibtex'

describe('BibTeX Parser', () => {
  describe('parseBibTeX', () => {
    it('parses a simple article entry', () => {
      const bib = `
@article{einstein1905,
  author = {Albert Einstein},
  title = {On the Electrodynamics of Moving Bodies},
  journal = {Annalen der Physik},
  year = {1905},
  volume = {17},
  pages = {891--921}
}
      `
      const entries = parseBibTeX(bib)

      expect(entries).toHaveLength(1)
      expect(entries[0].type).toBe('article')
      expect(entries[0].key).toBe('einstein1905')
      expect(entries[0].author).toBe('Albert Einstein')
      expect(entries[0].title).toBe('On the Electrodynamics of Moving Bodies')
      expect(entries[0].year).toBe('1905')
    })

    it('parses multiple entries', () => {
      const bib = `
@book{knuth1997,
  author = {Donald E. Knuth},
  title = {The Art of Computer Programming},
  publisher = {Addison-Wesley},
  year = {1997}
}

@inproceedings{turing1950,
  author = {Alan Turing},
  title = {Computing Machinery and Intelligence},
  booktitle = {Mind},
  year = {1950}
}
      `
      const entries = parseBibTeX(bib)

      expect(entries).toHaveLength(2)
      expect(entries[0].type).toBe('book')
      expect(entries[1].type).toBe('inproceedings')
    })

    it('handles braced values with nested braces', () => {
      const bib = `
@article{test2024,
  title = {{The {ABC} of {XYZ}}},
  author = {Test Author}
}
      `
      const entries = parseBibTeX(bib)

      expect(entries[0].title).toBe('The ABC of XYZ')
    })

    it('handles LaTeX accents', () => {
      const bib = `
@article{muller2024,
  author = {M\\"uller, Hans},
  title = {Caf\\'e Culture}
}
      `
      const entries = parseBibTeX(bib)

      expect(entries[0].author).toBe('Müller, Hans')
      expect(entries[0].title).toBe('Café Culture')
    })

    it('handles DOI and URL fields', () => {
      const bib = `
@article{test2024,
  doi = {10.1234/example},
  url = {https://example.com/paper}
}
      `
      const entries = parseBibTeX(bib)

      expect(entries[0].doi).toBe('10.1234/example')
      expect(entries[0].url).toBe('https://example.com/paper')
    })
  })

  describe('formatAuthors', () => {
    it('formats "Last, First" to "First Last"', () => {
      const authors = formatAuthors('Einstein, Albert')
      expect(authors).toEqual(['Albert Einstein'])
    })

    it('handles multiple authors with "and"', () => {
      const authors = formatAuthors('Einstein, Albert and Bohr, Niels')
      expect(authors).toEqual(['Albert Einstein', 'Niels Bohr'])
    })

    it('handles "First Last" format', () => {
      const authors = formatAuthors('Albert Einstein')
      expect(authors).toEqual(['Albert Einstein'])
    })

    it('returns empty array for empty input', () => {
      expect(formatAuthors('')).toEqual([])
    })
  })

  describe('citationToMarkdown', () => {
    it('generates markdown for article', () => {
      const entry = {
        type: 'article',
        key: 'einstein1905',
        title: 'Special Relativity',
        author: 'Einstein, Albert',
        year: '1905',
        journal: 'Annalen der Physik',
        doi: '10.1234/test',
      }

      const md = citationToMarkdown(entry)

      expect(md).toContain('# Special Relativity')
      expect(md).toContain('**Albert Einstein** (1905)')
      expect(md).toContain('*Annalen der Physik*')
      expect(md).toContain('DOI: [10.1234/test]')
      expect(md).toContain('Citation key: einstein1905')
    })

    it('includes abstract when present', () => {
      const entry = {
        type: 'article',
        key: 'test',
        abstract: 'This is the abstract.',
      }

      const md = citationToMarkdown(entry)

      expect(md).toContain('## Abstract')
      expect(md).toContain('This is the abstract.')
    })
  })

  describe('parseCslJson', () => {
    it('parses CSL-JSON format', () => {
      const json = JSON.stringify([
        {
          id: 'einstein1905',
          type: 'article-journal',
          title: 'Special Relativity',
          author: [{ given: 'Albert', family: 'Einstein' }],
          issued: { 'date-parts': [[1905]] },
          'container-title': 'Annalen der Physik',
        },
      ])

      const entries = parseCslJson(json)

      expect(entries).toHaveLength(1)
      expect(entries[0].title).toBe('Special Relativity')
      expect(entries[0].author).toBe('Albert Einstein')
      expect(entries[0].year).toBe('1905')
    })

    it('returns empty array for invalid JSON', () => {
      expect(parseCslJson('invalid')).toEqual([])
    })

    it('preserves Zotero item key as zoteroKey', () => {
      const json = JSON.stringify([
        {
          id: 'ABCD1234',
          type: 'article-journal',
          title: 'Test Paper',
        },
      ])

      const entries = parseCslJson(json)

      expect(entries[0].zoteroKey).toBe('ABCD1234')
    })

    it('extracts collection names from Better BibTeX exports', () => {
      const json = JSON.stringify([
        {
          id: 'test2024',
          type: 'article-journal',
          title: 'Paper in Collection',
          collections: ['Machine Learning', 'Neural Networks'],
        },
      ])

      const entries = parseCslJson(json)

      expect(entries[0].collections).toEqual(['Machine Learning', 'Neural Networks'])
    })

    it('extracts attachments from Zotero exports', () => {
      const json = JSON.stringify([
        {
          id: 'withpdf2024',
          type: 'article-journal',
          title: 'Paper with PDF',
          attachments: [
            { path: '/path/to/file.pdf', title: 'Full Text' },
          ],
        },
      ])

      const entries = parseCslJson(json)

      expect(entries[0].attachments).toEqual(['/path/to/file.pdf'])
    })

    it('handles Better BibTeX citation-key field', () => {
      const json = JSON.stringify([
        {
          id: 'zotero-internal-id',
          'citation-key': 'einstein1905relativity',
          type: 'article-journal',
          title: 'Special Relativity',
        },
      ])

      const entries = parseCslJson(json)

      expect(entries[0].key).toBe('einstein1905relativity')
      expect(entries[0].zoteroKey).toBe('zotero-internal-id')
    })
  })

  describe('parseReferences', () => {
    it('auto-detects BibTeX format', () => {
      const bib = '@article{test, title = {Test}}'
      const entries = parseReferences(bib)

      expect(entries).toHaveLength(1)
      expect(entries[0].title).toBe('Test')
    })

    it('auto-detects CSL-JSON format', () => {
      const json = '[{"id": "test", "title": "Test"}]'
      const entries = parseReferences(json)

      expect(entries).toHaveLength(1)
      expect(entries[0].title).toBe('Test')
    })
  })
})
