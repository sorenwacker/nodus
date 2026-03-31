/**
 * Markdown templates for default workspace content
 * Supports multiple languages
 */

export type SupportedLocale = 'en' | 'de' | 'fr' | 'es' | 'it'

interface StarterTemplates {
  gettingStarted: string
  importingFiles: string
  mathReference: string
  mermaidDemo: string
  researchIdea: string
  quickNote: string
  counterpoint: string
  evidence: string
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

## Drag and Drop (No LLM required)
- **Markdown files** (.md) become nodes directly
- **BibTeX files** (.bib) create citation nodes
- **Folders** import all markdown files inside
- **Ontologies** (.ttl, .rdf, .owl) create linked nodes

## PDF Import (Requires LLM)
- **PDF files** extract text using AI
- Enable LLM in Settings > LLM to use this feature
- Supports text extraction and annotation parsing

## Import Vault
Use **File > Import Vault** to import an Obsidian vault or markdown folder.

## Supported Formats
| Format | LLM Required | Result |
|--------|--------------|--------|
| .md | No | Note node with content |
| .bib | No | Citation nodes |
| .ttl/.owl | No | Ontology nodes |
| .pdf | Yes | Note with extracted text |

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

    mermaidDemo: `# Mermaid Diagrams

Nodus supports Mermaid diagrams for flowcharts, sequences, and more.

## Flowchart

\`\`\`mermaid
graph TD
    A[Start] --> B{Decision}
    B -->|Yes| C[Action 1]
    B -->|No| D[Action 2]
    C --> E[End]
    D --> E
\`\`\`

## Sequence Diagram

\`\`\`mermaid
sequenceDiagram
    User->>App: Request
    App->>Database: Query
    Database-->>App: Result
    App-->>User: Response
\`\`\`

## Class Diagram

\`\`\`mermaid
classDiagram
    Node <|-- NoteNode
    Node <|-- CitationNode
    Node : +id
    Node : +title
    NoteNode : +content
    CitationNode : +authors
\`\`\`

See [mermaid.js.org](https://mermaid.js.org/syntax/flowchart.html) for full syntax.`,

    researchIdea: `# Research Hypothesis

This node demonstrates a **colored node** with a research idea.

## Hypothesis

Knowledge graphs with visual interfaces improve information retention compared to linear note-taking.

## Next Steps

- Review existing literature
- Design experiment methodology`,

    quickNote: `A quick capture without a formal title.

Just jot down thoughts here.`,

    counterpoint: `## Alternative Perspective

Not all users benefit from visual approaches. Some prefer:

- Linear text documents
- Hierarchical outlines
- Simple lists

This demonstrates **contradicts** edge type (orange).`,

    evidence: `## Supporting Data

Studies show spatial memory aids recall:

- Method of loci (memory palace)
- Mind mapping effectiveness
- Visual learner preferences

This node shows the **supports** edge type (green).`,
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

## Drag and Drop (Kein LLM erforderlich)
- **Markdown-Dateien** (.md) werden direkt zu Knoten
- **BibTeX-Dateien** (.bib) erstellen Zitationsknoten
- **Ordner** importieren alle Markdown-Dateien
- **Ontologien** (.ttl, .rdf, .owl) erstellen verknupfte Knoten

## PDF-Import (LLM erforderlich)
- **PDF-Dateien** extrahieren Text mit KI
- Aktiviere LLM unter Einstellungen > LLM
- Unterstutzt Textextraktion und Anmerkungen

## Vault importieren
Verwende **Datei > Vault importieren** fur Obsidian-Vaults oder Markdown-Ordner.

## Unterstutzte Formate
| Format | LLM erforderlich | Ergebnis |
|--------|------------------|----------|
| .md | Nein | Notizknoten mit Inhalt |
| .bib | Nein | Zitationsknoten |
| .ttl/.owl | Nein | Ontologie-Knoten |
| .pdf | Ja | Notiz mit extrahiertem Text |

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

    mermaidDemo: `# Mermaid-Diagramme

Nodus unterstutzt Mermaid-Diagramme fur Flussdiagramme, Sequenzen und mehr.

## Flussdiagramm

\`\`\`mermaid
graph TD
    A[Start] --> B{Entscheidung}
    B -->|Ja| C[Aktion 1]
    B -->|Nein| D[Aktion 2]
    C --> E[Ende]
    D --> E
\`\`\`

## Sequenzdiagramm

\`\`\`mermaid
sequenceDiagram
    Benutzer->>App: Anfrage
    App->>Datenbank: Abfrage
    Datenbank-->>App: Ergebnis
    App-->>Benutzer: Antwort
\`\`\`

Siehe [mermaid.js.org](https://mermaid.js.org/syntax/flowchart.html) fur vollstandige Syntax.`,

    researchIdea: `# Forschungshypothese

Dieser Knoten zeigt einen **farbigen Knoten** mit einer Forschungsidee.

## Hypothese

Wissensgraphen mit visuellen Interfaces verbessern die Informationsspeicherung im Vergleich zu linearem Notieren.

## Nachste Schritte

- Bestehende Literatur prufen
- Experimentmethodik entwerfen`,

    quickNote: `Eine schnelle Notiz ohne formellen Titel.

Hier einfach Gedanken notieren.`,

    counterpoint: `## Alternative Perspektive

Nicht alle Benutzer profitieren von visuellen Ansatzen. Manche bevorzugen:

- Lineare Textdokumente
- Hierarchische Gliederungen
- Einfache Listen

Dies zeigt den **contradicts** Kantentyp (orange).`,

    evidence: `## Unterstutzende Daten

Studien zeigen, dass raumliches Gedachtnis die Erinnerung unterstutzt:

- Loci-Methode (Gedachtnispalast)
- Effektivitat von Mind-Mapping
- Praferenzen visueller Lerner

Dieser Knoten zeigt den **supports** Kantentyp (grun).`,
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

## Glisser-deposer (Sans LLM)
- **Fichiers Markdown** (.md) deviennent des noeuds directement
- **Fichiers BibTeX** (.bib) creent des noeuds de citation
- **Dossiers** importent tous les fichiers markdown
- **Ontologies** (.ttl, .rdf, .owl) creent des noeuds lies

## Import PDF (LLM requis)
- **Fichiers PDF** extraient le texte avec l'IA
- Activez LLM dans Parametres > LLM
- Supporte l'extraction de texte et annotations

## Importer un vault
Utilisez **Fichier > Importer Vault** pour les vaults Obsidian ou dossiers markdown.

## Formats supportes
| Format | LLM requis | Resultat |
|--------|------------|----------|
| .md | Non | Noeud note avec contenu |
| .bib | Non | Noeuds de citation |
| .ttl/.owl | Non | Noeuds d'ontologie |
| .pdf | Oui | Note avec texte extrait |

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

    mermaidDemo: `# Diagrammes Mermaid

Nodus supporte les diagrammes Mermaid pour les organigrammes, sequences et plus.

## Organigramme

\`\`\`mermaid
graph TD
    A[Debut] --> B{Decision}
    B -->|Oui| C[Action 1]
    B -->|Non| D[Action 2]
    C --> E[Fin]
    D --> E
\`\`\`

## Diagramme de sequence

\`\`\`mermaid
sequenceDiagram
    Utilisateur->>App: Requete
    App->>Base: Requete
    Base-->>App: Resultat
    App-->>Utilisateur: Reponse
\`\`\`

Voir [mermaid.js.org](https://mermaid.js.org/syntax/flowchart.html) pour la syntaxe complete.`,

    researchIdea: `# Hypothese de Recherche

Ce noeud demontre un **noeud colore** avec une idee de recherche.

## Hypothese

Les graphes de connaissances avec interfaces visuelles ameliorent la retention d'information comparee a la prise de notes lineaire.

## Prochaines Etapes

- Examiner la litterature existante
- Concevoir la methodologie experimentale`,

    quickNote: `Une capture rapide sans titre formel.

Notez simplement vos pensees ici.`,

    counterpoint: `## Perspective Alternative

Tous les utilisateurs ne beneficient pas des approches visuelles. Certains preferent:

- Documents textuels lineaires
- Plans hierarchiques
- Listes simples

Ceci demontre le type de connexion **contradicts** (orange).`,

    evidence: `## Donnees de Support

Les etudes montrent que la memoire spatiale aide la memorisation:

- Methode des loci (palais de la memoire)
- Efficacite du mind mapping
- Preferences des apprenants visuels

Ce noeud montre le type de connexion **supports** (vert).`,
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

## Arrastrar y soltar (Sin LLM)
- **Archivos Markdown** (.md) se convierten en nodos directamente
- **Archivos BibTeX** (.bib) crean nodos de citas
- **Carpetas** importan todos los archivos markdown
- **Ontologias** (.ttl, .rdf, .owl) crean nodos enlazados

## Importar PDF (Requiere LLM)
- **Archivos PDF** extraen texto usando IA
- Activa LLM en Ajustes > LLM
- Soporta extraccion de texto y anotaciones

## Importar Vault
Usa **Archivo > Importar Vault** para vaults de Obsidian o carpetas markdown.

## Formatos soportados
| Formato | LLM requerido | Resultado |
|---------|---------------|-----------|
| .md | No | Nodo nota con contenido |
| .bib | No | Nodos de citas |
| .ttl/.owl | No | Nodos de ontologia |
| .pdf | Si | Nota con texto extraido |

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

    mermaidDemo: `# Diagramas Mermaid

Nodus soporta diagramas Mermaid para diagramas de flujo, secuencias y mas.

## Diagrama de flujo

\`\`\`mermaid
graph TD
    A[Inicio] --> B{Decision}
    B -->|Si| C[Accion 1]
    B -->|No| D[Accion 2]
    C --> E[Fin]
    D --> E
\`\`\`

## Diagrama de secuencia

\`\`\`mermaid
sequenceDiagram
    Usuario->>App: Solicitud
    App->>Base: Consulta
    Base-->>App: Resultado
    App-->>Usuario: Respuesta
\`\`\`

Ver [mermaid.js.org](https://mermaid.js.org/syntax/flowchart.html) para sintaxis completa.`,

    researchIdea: `# Hipotesis de Investigacion

Este nodo demuestra un **nodo coloreado** con una idea de investigacion.

## Hipotesis

Los grafos de conocimiento con interfaces visuales mejoran la retencion de informacion comparada con la toma de notas lineal.

## Proximos Pasos

- Revisar literatura existente
- Disenar metodologia experimental`,

    quickNote: `Una captura rapida sin titulo formal.

Simplemente anota pensamientos aqui.`,

    counterpoint: `## Perspectiva Alternativa

No todos los usuarios se benefician de enfoques visuales. Algunos prefieren:

- Documentos de texto lineales
- Esquemas jerarquicos
- Listas simples

Esto demuestra el tipo de conexion **contradicts** (naranja).`,

    evidence: `## Datos de Apoyo

Estudios muestran que la memoria espacial ayuda al recuerdo:

- Metodo de loci (palacio de la memoria)
- Efectividad del mapeo mental
- Preferencias de aprendices visuales

Este nodo muestra el tipo de conexion **supports** (verde).`,
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

## Trascina e rilascia (Senza LLM)
- **File Markdown** (.md) diventano nodi direttamente
- **File BibTeX** (.bib) creano nodi di citazione
- **Cartelle** importano tutti i file markdown
- **Ontologie** (.ttl, .rdf, .owl) creano nodi collegati

## Importa PDF (Richiede LLM)
- **File PDF** estraggono testo usando IA
- Attiva LLM in Impostazioni > LLM
- Supporta estrazione testo e annotazioni

## Importa Vault
Usa **File > Importa Vault** per vault Obsidian o cartelle markdown.

## Formati supportati
| Formato | LLM richiesto | Risultato |
|---------|---------------|-----------|
| .md | No | Nodo nota con contenuto |
| .bib | No | Nodi di citazione |
| .ttl/.owl | No | Nodi ontologia |
| .pdf | Si | Nota con testo estratto |

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

    mermaidDemo: `# Diagrammi Mermaid

Nodus supporta i diagrammi Mermaid per diagrammi di flusso, sequenze e altro.

## Diagramma di flusso

\`\`\`mermaid
graph TD
    A[Inizio] --> B{Decisione}
    B -->|Si| C[Azione 1]
    B -->|No| D[Azione 2]
    C --> E[Fine]
    D --> E
\`\`\`

## Diagramma di sequenza

\`\`\`mermaid
sequenceDiagram
    Utente->>App: Richiesta
    App->>Database: Query
    Database-->>App: Risultato
    App-->>Utente: Risposta
\`\`\`

Vedi [mermaid.js.org](https://mermaid.js.org/syntax/flowchart.html) per la sintassi completa.`,

    researchIdea: `# Ipotesi di Ricerca

Questo nodo dimostra un **nodo colorato** con un'idea di ricerca.

## Ipotesi

I grafi di conoscenza con interfacce visive migliorano la ritenzione delle informazioni rispetto alla presa di appunti lineare.

## Prossimi Passi

- Esaminare la letteratura esistente
- Progettare la metodologia sperimentale`,

    quickNote: `Una cattura rapida senza titolo formale.

Annota semplicemente i pensieri qui.`,

    counterpoint: `## Prospettiva Alternativa

Non tutti gli utenti beneficiano degli approcci visivi. Alcuni preferiscono:

- Documenti di testo lineari
- Schemi gerarchici
- Liste semplici

Questo dimostra il tipo di connessione **contradicts** (arancione).`,

    evidence: `## Dati di Supporto

Gli studi mostrano che la memoria spaziale aiuta il richiamo:

- Metodo dei loci (palazzo della memoria)
- Efficacia del mind mapping
- Preferenze degli apprendisti visivi

Questo nodo mostra il tipo di connessione **supports** (verde).`,
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
 * Starter node title keys - some nodes intentionally have empty titles
 */
export type StarterTitleKey = keyof StarterTemplates

export interface StarterTitles {
  gettingStarted: string
  importingFiles: string
  mathReference: string
  mermaidDemo: string
  researchIdea: string
  quickNote: string  // Empty title - demonstrates untitled node
  counterpoint: string
  evidence: string
}

/**
 * Get localized node titles
 */
export function getStarterTitles(locale: string): StarterTitles {
  const titles: Record<SupportedLocale, StarterTitles> = {
    en: {
      gettingStarted: 'Getting Started',
      importingFiles: 'Importing Files',
      mathReference: 'Typst Math Reference',
      mermaidDemo: 'Mermaid Diagrams',
      researchIdea: 'Research Hypothesis',
      quickNote: '',  // Untitled node
      counterpoint: 'Alternative View',
      evidence: 'Supporting Evidence',
    },
    de: {
      gettingStarted: 'Erste Schritte mit Nodus',
      importingFiles: 'Dateien importieren',
      mathReference: 'Typst Mathe-Referenz',
      mermaidDemo: 'Mermaid-Diagramme',
      researchIdea: 'Forschungshypothese',
      quickNote: '',
      counterpoint: 'Alternative Sicht',
      evidence: 'Unterstutzende Belege',
    },
    fr: {
      gettingStarted: 'Premiers pas avec Nodus',
      importingFiles: 'Importer des fichiers',
      mathReference: 'Reference Typst Math',
      mermaidDemo: 'Diagrammes Mermaid',
      researchIdea: 'Hypothese de Recherche',
      quickNote: '',
      counterpoint: 'Vue Alternative',
      evidence: 'Preuves de Support',
    },
    es: {
      gettingStarted: 'Primeros pasos con Nodus',
      importingFiles: 'Importar archivos',
      mathReference: 'Referencia Typst Math',
      mermaidDemo: 'Diagramas Mermaid',
      researchIdea: 'Hipotesis de Investigacion',
      quickNote: '',
      counterpoint: 'Vista Alternativa',
      evidence: 'Evidencia de Apoyo',
    },
    it: {
      gettingStarted: 'Primi passi con Nodus',
      importingFiles: 'Importare file',
      mathReference: 'Riferimento Typst Math',
      mermaidDemo: 'Diagrammi Mermaid',
      researchIdea: 'Ipotesi di Ricerca',
      quickNote: '',
      counterpoint: 'Vista Alternativa',
      evidence: 'Prove di Supporto',
    },
  }
  const supported = locale as SupportedLocale
  return titles[supported] || titles.en
}

/**
 * Get starter node configurations (positions, sizes, and optional colors)
 */
export interface StarterNodeConfig {
  key: keyof StarterTemplates
  canvas_x: number
  canvas_y: number
  width: number
  height: number
  color_theme?: string | null  // Node background color
}

export function getStarterNodeConfigs(): StarterNodeConfig[] {
  return [
    // Main tutorial nodes (no color)
    { key: 'gettingStarted', canvas_x: 100, canvas_y: 100, width: 500, height: 600 },
    { key: 'importingFiles', canvas_x: 700, canvas_y: 100, width: 520, height: 720 },
    { key: 'mathReference', canvas_x: 100, canvas_y: 780, width: 560, height: 620 },
    { key: 'mermaidDemo', canvas_x: 700, canvas_y: 900, width: 520, height: 800 },
    // Colored example nodes
    { key: 'researchIdea', canvas_x: 1340, canvas_y: 100, width: 400, height: 320, color_theme: 'rgba(59, 130, 246, 0.18)' },  // blue
    { key: 'quickNote', canvas_x: 1340, canvas_y: 480, width: 300, height: 150, color_theme: 'rgba(234, 179, 8, 0.18)' },  // yellow (no title)
    { key: 'counterpoint', canvas_x: 1340, canvas_y: 700, width: 380, height: 280, color_theme: 'rgba(249, 115, 22, 0.18)' },  // orange
    { key: 'evidence', canvas_x: 1340, canvas_y: 1040, width: 380, height: 280, color_theme: 'rgba(34, 197, 94, 0.18)' },  // green
  ]
}

/**
 * Get starter edge configurations (connections between starter nodes)
 * Demonstrates all edge types and directed/undirected options
 */
export interface StarterEdgeConfig {
  sourceKey: keyof StarterTemplates
  targetKey: keyof StarterTemplates
  linkType: string  // related (gray), cites (blue), blocks (red), supports (green), contradicts (orange)
  label: string
  directed: boolean  // true = arrow, false = no arrow
}

export function getStarterEdgeConfigs(): StarterEdgeConfig[] {
  return [
    // Tutorial connections (undirected - bidirectional relationships)
    { sourceKey: 'gettingStarted', targetKey: 'importingFiles', linkType: 'related', label: 'see also', directed: false },
    { sourceKey: 'gettingStarted', targetKey: 'mathReference', linkType: 'related', label: '', directed: false },
    { sourceKey: 'gettingStarted', targetKey: 'mermaidDemo', linkType: 'related', label: 'diagrams', directed: false },

    // Directed edges showing information flow
    { sourceKey: 'importingFiles', targetKey: 'mathReference', linkType: 'cites', label: 'references', directed: true },  // blue arrow
    { sourceKey: 'mathReference', targetKey: 'mermaidDemo', linkType: 'cites', label: '', directed: true },  // blue arrow

    // Research example edges - demonstrating all link types
    { sourceKey: 'researchIdea', targetKey: 'evidence', linkType: 'supports', label: 'backed by', directed: true },  // green arrow
    { sourceKey: 'evidence', targetKey: 'researchIdea', linkType: 'supports', label: '', directed: true },  // green arrow back

    { sourceKey: 'counterpoint', targetKey: 'researchIdea', linkType: 'contradicts', label: 'challenges', directed: true },  // orange arrow
    { sourceKey: 'counterpoint', targetKey: 'evidence', linkType: 'blocks', label: 'disputes', directed: true },  // red arrow

    // Undirected association
    { sourceKey: 'quickNote', targetKey: 'researchIdea', linkType: 'related', label: '', directed: false },  // gray, no arrow

    // Cross-reference between tutorial and examples
    { sourceKey: 'gettingStarted', targetKey: 'researchIdea', linkType: 'cites', label: 'example', directed: true },  // blue arrow
  ]
}

// Legacy exports for backwards compatibility
export const TYPST_MATH_REFERENCE = templates.en.mathReference
export const GETTING_STARTED = templates.en.gettingStarted
export const IMPORTING_FILES = templates.en.importingFiles
export const MERMAID_DEMO = templates.en.mermaidDemo
export const RESEARCH_IDEA = templates.en.researchIdea
export const QUICK_NOTE = templates.en.quickNote
export const COUNTERPOINT = templates.en.counterpoint
export const EVIDENCE = templates.en.evidence
