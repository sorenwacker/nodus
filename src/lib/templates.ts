/**
 * Markdown templates for default workspace content
 * Supports multiple languages
 */

export type SupportedLocale = 'en' | 'de' | 'fr' | 'es' | 'it'

interface StarterTemplates {
  gettingStarted: string
  importingFiles: string
  mathReference: string
}

const templates: Record<SupportedLocale, StarterTemplates> = {
  en: {
    gettingStarted: `# Getting Started with Nodus

## Create Nodes
- **Double-click** on canvas to create a node
- Or use [[Importing Files]] to bring in existing content

## Connect Nodes
- **Cmd/Ctrl + click** on two nodes to connect them
- Use \`[[wikilinks]]\` in text to auto-link nodes
- Right-click menu > "Link to..."

## Navigate
- **Scroll** to zoom in/out
- **Drag canvas** to pan
- **Cmd/Ctrl + F** to search

## Learn More
- [[Typst Math Reference]] for equations
- [[Importing Files]] for bulk import`,

    importingFiles: `# Importing Files

## Drag and Drop
- **Markdown files** (.md) become nodes directly
- **PDF files** extract text and annotations
- **BibTeX files** (.bib) create citation nodes
- **Folders** import all markdown files inside

## Import Vault
Use **File > Import Vault** to import an entire Obsidian vault or folder of markdown files.

Options:
- Keep files synced (edits update the original)
- Copy content only (no file link)

## Supported Formats
| Format | Result |
|--------|--------|
| .md | Note node with content |
| .pdf | Note with extracted text |
| .bib | Citation nodes |
| .ttl/.owl | Ontology import |

See [[Getting Started]] for basic navigation.`,

    mathReference: `# Typst Math Reference

Nodus supports Typst math syntax for equations.

| Symbol | Syntax |
|--------|--------|
| Arrow over letter | $arrow(x)$ |
| Hat over letter | $hat(x)$ |
| Bar over letter | $overline(x)$ |
| Subscript | $x_1$ or $x_(i+1)$ |
| Superscript | $x^2$ or $x^(n+1)$ |
| Fraction | $a/b$ or $frac(a, b)$ |
| Square root | $sqrt(x)$ |
| Greek letters | $alpha, beta, gamma$ |

Use \`$...$\` for inline and \`$$...$$\` for display math.

See also: [[Getting Started]]

Full reference: [typst.app/docs/reference/math](https://typst.app/docs/reference/math/)`,
  },

  de: {
    gettingStarted: `# Erste Schritte mit Nodus

## Knoten erstellen
- **Doppelklick** auf die Leinwand, um einen Knoten zu erstellen
- Oder verwende [[Dateien importieren]], um vorhandene Inhalte zu laden

## Knoten verbinden
- **Cmd/Ctrl + Klick** auf zwei Knoten, um sie zu verbinden
- Verwende \`[[Wikilinks]]\` im Text, um Knoten automatisch zu verlinken
- Rechtsklick-Menu > "Verlinken mit..."

## Navigieren
- **Scrollen** zum Zoomen
- **Leinwand ziehen** zum Schwenken
- **Cmd/Ctrl + F** zum Suchen

## Mehr erfahren
- [[Typst Mathe-Referenz]] fur Formeln
- [[Dateien importieren]] fur Massenimport`,

    importingFiles: `# Dateien importieren

## Drag and Drop
- **Markdown-Dateien** (.md) werden direkt zu Knoten
- **PDF-Dateien** extrahieren Text und Anmerkungen
- **BibTeX-Dateien** (.bib) erstellen Zitationsknoten
- **Ordner** importieren alle Markdown-Dateien

## Vault importieren
Verwende **Datei > Vault importieren**, um einen gesamten Obsidian-Vault oder Ordner mit Markdown-Dateien zu importieren.

Optionen:
- Dateien synchron halten (Anderungen aktualisieren das Original)
- Nur Inhalt kopieren (keine Dateiverknupfung)

## Unterstutzte Formate
| Format | Ergebnis |
|--------|----------|
| .md | Notizknoten mit Inhalt |
| .pdf | Notiz mit extrahiertem Text |
| .bib | Zitationsknoten |
| .ttl/.owl | Ontologie-Import |

Siehe [[Erste Schritte mit Nodus]] fur grundlegende Navigation.`,

    mathReference: `# Typst Mathe-Referenz

Nodus unterstutzt Typst-Mathe-Syntax fur Formeln.

| Symbol | Syntax |
|--------|--------|
| Pfeil uber Buchstabe | $arrow(x)$ |
| Dach uber Buchstabe | $hat(x)$ |
| Strich uber Buchstabe | $overline(x)$ |
| Tiefgestellt | $x_1$ oder $x_(i+1)$ |
| Hochgestellt | $x^2$ oder $x^(n+1)$ |
| Bruch | $a/b$ oder $frac(a, b)$ |
| Quadratwurzel | $sqrt(x)$ |
| Griechische Buchstaben | $alpha, beta, gamma$ |

Verwende \`$...$\` fur Inline- und \`$$...$$\` fur Block-Formeln.

Siehe auch: [[Erste Schritte mit Nodus]]

Vollstandige Referenz: [typst.app/docs/reference/math](https://typst.app/docs/reference/math/)`,
  },

  fr: {
    gettingStarted: `# Premiers pas avec Nodus

## Creer des noeuds
- **Double-clic** sur le canevas pour creer un noeud
- Ou utilisez [[Importer des fichiers]] pour charger du contenu existant

## Connecter des noeuds
- **Cmd/Ctrl + clic** sur deux noeuds pour les connecter
- Utilisez \`[[wikilinks]]\` dans le texte pour lier automatiquement
- Menu clic droit > "Lier a..."

## Naviguer
- **Defiler** pour zoomer
- **Glisser le canevas** pour se deplacer
- **Cmd/Ctrl + F** pour rechercher

## En savoir plus
- [[Reference Typst Math]] pour les equations
- [[Importer des fichiers]] pour l'import en masse`,

    importingFiles: `# Importer des fichiers

## Glisser-deposer
- **Fichiers Markdown** (.md) deviennent des noeuds directement
- **Fichiers PDF** extraient le texte et les annotations
- **Fichiers BibTeX** (.bib) creent des noeuds de citation
- **Dossiers** importent tous les fichiers markdown

## Importer un vault
Utilisez **Fichier > Importer Vault** pour importer un vault Obsidian entier.

Options:
- Garder les fichiers synchronises
- Copier le contenu uniquement

## Formats supportes
| Format | Resultat |
|--------|----------|
| .md | Noeud note avec contenu |
| .pdf | Note avec texte extrait |
| .bib | Noeuds de citation |
| .ttl/.owl | Import d'ontologie |

Voir [[Premiers pas avec Nodus]] pour la navigation de base.`,

    mathReference: `# Reference Typst Math

Nodus supporte la syntaxe Typst pour les equations.

| Symbole | Syntaxe |
|---------|---------|
| Fleche sur lettre | $arrow(x)$ |
| Chapeau sur lettre | $hat(x)$ |
| Barre sur lettre | $overline(x)$ |
| Indice | $x_1$ ou $x_(i+1)$ |
| Exposant | $x^2$ ou $x^(n+1)$ |
| Fraction | $a/b$ ou $frac(a, b)$ |
| Racine carree | $sqrt(x)$ |
| Lettres grecques | $alpha, beta, gamma$ |

Utilisez \`$...$\` pour inline et \`$$...$$\` pour les blocs.

Voir aussi: [[Premiers pas avec Nodus]]

Reference complete: [typst.app/docs/reference/math](https://typst.app/docs/reference/math/)`,
  },

  es: {
    gettingStarted: `# Primeros pasos con Nodus

## Crear nodos
- **Doble clic** en el lienzo para crear un nodo
- O usa [[Importar archivos]] para cargar contenido existente

## Conectar nodos
- **Cmd/Ctrl + clic** en dos nodos para conectarlos
- Usa \`[[wikilinks]]\` en el texto para enlazar automaticamente
- Menu clic derecho > "Enlazar a..."

## Navegar
- **Desplazar** para hacer zoom
- **Arrastrar lienzo** para moverse
- **Cmd/Ctrl + F** para buscar

## Mas informacion
- [[Referencia Typst Math]] para ecuaciones
- [[Importar archivos]] para importacion masiva`,

    importingFiles: `# Importar archivos

## Arrastrar y soltar
- **Archivos Markdown** (.md) se convierten en nodos directamente
- **Archivos PDF** extraen texto y anotaciones
- **Archivos BibTeX** (.bib) crean nodos de citas
- **Carpetas** importan todos los archivos markdown

## Importar Vault
Usa **Archivo > Importar Vault** para importar un vault de Obsidian completo.

Opciones:
- Mantener archivos sincronizados
- Copiar solo contenido

## Formatos soportados
| Formato | Resultado |
|---------|-----------|
| .md | Nodo nota con contenido |
| .pdf | Nota con texto extraido |
| .bib | Nodos de citas |
| .ttl/.owl | Importacion de ontologia |

Ver [[Primeros pasos con Nodus]] para navegacion basica.`,

    mathReference: `# Referencia Typst Math

Nodus soporta sintaxis Typst para ecuaciones.

| Simbolo | Sintaxis |
|---------|----------|
| Flecha sobre letra | $arrow(x)$ |
| Sombrero sobre letra | $hat(x)$ |
| Barra sobre letra | $overline(x)$ |
| Subindice | $x_1$ o $x_(i+1)$ |
| Superindice | $x^2$ o $x^(n+1)$ |
| Fraccion | $a/b$ o $frac(a, b)$ |
| Raiz cuadrada | $sqrt(x)$ |
| Letras griegas | $alpha, beta, gamma$ |

Usa \`$...$\` para inline y \`$$...$$\` para bloques.

Ver tambien: [[Primeros pasos con Nodus]]

Referencia completa: [typst.app/docs/reference/math](https://typst.app/docs/reference/math/)`,
  },

  it: {
    gettingStarted: `# Primi passi con Nodus

## Creare nodi
- **Doppio clic** sul canvas per creare un nodo
- Oppure usa [[Importare file]] per caricare contenuti esistenti

## Collegare nodi
- **Cmd/Ctrl + clic** su due nodi per collegarli
- Usa \`[[wikilinks]]\` nel testo per collegare automaticamente
- Menu clic destro > "Collega a..."

## Navigare
- **Scorrere** per zoomare
- **Trascinare il canvas** per spostarsi
- **Cmd/Ctrl + F** per cercare

## Scopri di piu
- [[Riferimento Typst Math]] per equazioni
- [[Importare file]] per importazione di massa`,

    importingFiles: `# Importare file

## Trascina e rilascia
- **File Markdown** (.md) diventano nodi direttamente
- **File PDF** estraggono testo e annotazioni
- **File BibTeX** (.bib) creano nodi di citazione
- **Cartelle** importano tutti i file markdown

## Importa Vault
Usa **File > Importa Vault** per importare un intero vault Obsidian.

Opzioni:
- Mantieni file sincronizzati
- Copia solo contenuto

## Formati supportati
| Formato | Risultato |
|---------|-----------|
| .md | Nodo nota con contenuto |
| .pdf | Nota con testo estratto |
| .bib | Nodi di citazione |
| .ttl/.owl | Importazione ontologia |

Vedi [[Primi passi con Nodus]] per la navigazione di base.`,

    mathReference: `# Riferimento Typst Math

Nodus supporta la sintassi Typst per equazioni.

| Simbolo | Sintassi |
|---------|----------|
| Freccia sopra lettera | $arrow(x)$ |
| Cappello sopra lettera | $hat(x)$ |
| Barra sopra lettera | $overline(x)$ |
| Pedice | $x_1$ o $x_(i+1)$ |
| Apice | $x^2$ o $x^(n+1)$ |
| Frazione | $a/b$ o $frac(a, b)$ |
| Radice quadrata | $sqrt(x)$ |
| Lettere greche | $alpha, beta, gamma$ |

Usa \`$...$\` per inline e \`$$...$$\` per blocchi.

Vedi anche: [[Primi passi con Nodus]]

Riferimento completo: [typst.app/docs/reference/math](https://typst.app/docs/reference/math/)`,
  },
}

/**
 * Get starter templates for a given locale
 */
export function getStarterTemplates(locale: string): StarterTemplates {
  const supported = locale as SupportedLocale
  return templates[supported] || templates.en
}

/**
 * Get localized node titles
 */
export function getStarterTitles(locale: string): { gettingStarted: string; importingFiles: string; mathReference: string } {
  const titles: Record<SupportedLocale, { gettingStarted: string; importingFiles: string; mathReference: string }> = {
    en: { gettingStarted: 'Getting Started', importingFiles: 'Importing Files', mathReference: 'Typst Math Reference' },
    de: { gettingStarted: 'Erste Schritte mit Nodus', importingFiles: 'Dateien importieren', mathReference: 'Typst Mathe-Referenz' },
    fr: { gettingStarted: 'Premiers pas avec Nodus', importingFiles: 'Importer des fichiers', mathReference: 'Reference Typst Math' },
    es: { gettingStarted: 'Primeros pasos con Nodus', importingFiles: 'Importar archivos', mathReference: 'Referencia Typst Math' },
    it: { gettingStarted: 'Primi passi con Nodus', importingFiles: 'Importare file', mathReference: 'Riferimento Typst Math' },
  }
  const supported = locale as SupportedLocale
  return titles[supported] || titles.en
}

// Legacy exports for backwards compatibility
export const TYPST_MATH_REFERENCE = templates.en.mathReference
export const GETTING_STARTED = templates.en.gettingStarted
export const IMPORTING_FILES = templates.en.importingFiles
