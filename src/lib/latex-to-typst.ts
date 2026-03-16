/**
 * LaTeX to Typst Math Converter
 * Converts common LaTeX math syntax to Typst format
 */

// Greek letters mapping
const greekLetters: Record<string, string> = {
  // Lowercase
  'alpha': 'alpha', 'beta': 'beta', 'gamma': 'gamma', 'delta': 'delta',
  'epsilon': 'epsilon', 'zeta': 'zeta', 'eta': 'eta', 'theta': 'theta',
  'iota': 'iota', 'kappa': 'kappa', 'lambda': 'lambda', 'mu': 'mu',
  'nu': 'nu', 'xi': 'xi', 'omicron': 'omicron', 'pi': 'pi',
  'rho': 'rho', 'sigma': 'sigma', 'tau': 'tau', 'upsilon': 'upsilon',
  'phi': 'phi', 'chi': 'chi', 'psi': 'psi', 'omega': 'omega',
  // Uppercase
  'Alpha': 'Alpha', 'Beta': 'Beta', 'Gamma': 'Gamma', 'Delta': 'Delta',
  'Epsilon': 'Epsilon', 'Zeta': 'Zeta', 'Eta': 'Eta', 'Theta': 'Theta',
  'Iota': 'Iota', 'Kappa': 'Kappa', 'Lambda': 'Lambda', 'Mu': 'Mu',
  'Nu': 'Nu', 'Xi': 'Xi', 'Omicron': 'Omicron', 'Pi': 'Pi',
  'Rho': 'Rho', 'Sigma': 'Sigma', 'Tau': 'Tau', 'Upsilon': 'Upsilon',
  'Phi': 'Phi', 'Chi': 'Chi', 'Psi': 'Psi', 'Omega': 'Omega',
  // Variants
  'varepsilon': 'epsilon.alt', 'vartheta': 'theta.alt', 'varphi': 'phi.alt',
  'varrho': 'rho.alt', 'varsigma': 'sigma.alt',
}

// Math operators and symbols
const mathSymbols: Record<string, string> = {
  // Operators
  'times': 'times', 'div': 'div', 'cdot': 'dot', 'pm': 'plus.minus',
  'mp': 'minus.plus', 'ast': 'ast', 'star': 'star', 'circ': 'compose',
  'bullet': 'bullet', 'oplus': 'plus.circle', 'otimes': 'times.circle',
  // Relations
  'leq': '<=', 'geq': '>=', 'neq': '!=', 'approx': 'approx',
  'equiv': 'equiv', 'sim': 'tilde', 'simeq': 'tilde.eq',
  'propto': 'prop', 'subset': 'subset', 'supset': 'supset',
  'subseteq': 'subset.eq', 'supseteq': 'supset.eq',
  'in': 'in', 'notin': 'in.not', 'ni': 'in.rev',
  // Arrows
  'rightarrow': '->', 'leftarrow': '<-', 'leftrightarrow': '<->',
  'Rightarrow': '=>', 'Leftarrow': '<=', 'Leftrightarrow': '<=>',
  'to': '->', 'gets': '<-', 'mapsto': '|->',
  'uparrow': 'arrow.t', 'downarrow': 'arrow.b',
  // Set theory
  'emptyset': 'nothing', 'varnothing': 'nothing',
  'cup': 'union', 'cap': 'sect', 'setminus': 'without',
  // Logic
  'land': 'and', 'lor': 'or', 'lnot': 'not', 'neg': 'not',
  'forall': 'forall', 'exists': 'exists', 'nexists': 'exists.not',
  // Misc
  'infty': 'infinity', 'partial': 'diff', 'nabla': 'nabla',
  'ell': 'ell', 'Re': 'Re', 'Im': 'Im',
  'aleph': 'aleph', 'hbar': 'planck.reduce',
  'degree': 'degree', 'angle': 'angle',
  // Dots
  'ldots': '...', 'cdots': 'dots.c', 'vdots': 'dots.v', 'ddots': 'dots.down',
  // Spacing (Typst handles spacing automatically, but we preserve intent)
  'quad': ' ', 'qquad': '  ', ',': ' ', ';': ' ', '!': '',
}

// Function names that should be upright
const mathFunctions = [
  'sin', 'cos', 'tan', 'cot', 'sec', 'csc',
  'arcsin', 'arccos', 'arctan', 'sinh', 'cosh', 'tanh',
  'exp', 'log', 'ln', 'lg', 'lim', 'max', 'min',
  'sup', 'inf', 'det', 'dim', 'ker', 'deg',
  'gcd', 'lcm', 'mod', 'arg', 'sgn',
]

// Accent commands
const accents: Record<string, string> = {
  'hat': 'hat', 'bar': 'macron', 'vec': 'arrow', 'dot': 'dot',
  'ddot': 'dot.double', 'tilde': 'tilde', 'widetilde': 'tilde',
  'widehat': 'hat', 'overline': 'overline', 'underline': 'underline',
}

/**
 * Convert LaTeX math to Typst math
 */
export function latexToTypst(latex: string): string {
  let result = latex

  // Remove \displaystyle, \textstyle etc (Typst handles this differently)
  result = result.replace(/\\(displaystyle|textstyle|scriptstyle|scriptscriptstyle)\s*/g, '')

  // Convert fractions: \frac{a}{b} -> (a)/(b)
  result = result.replace(/\\frac\s*\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}\s*\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g, '($1)/($2)')

  // Convert dfrac and tfrac the same way
  result = result.replace(/\\[dt]frac\s*\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}\s*\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g, '($1)/($2)')

  // Convert square roots: \sqrt{x} -> sqrt(x), \sqrt[n]{x} -> root(n, x)
  result = result.replace(/\\sqrt\[([^\]]+)\]\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g, 'root($1, $2)')
  result = result.replace(/\\sqrt\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g, 'sqrt($1)')

  // Convert subscripts and superscripts with braces
  // x_{sub} -> x_sub, x^{sup} -> x^sup (Typst uses same syntax but prefers no braces for single chars)
  result = result.replace(/\_\{([^{}]+)\}/g, '_($1)')
  result = result.replace(/\^\{([^{}]+)\}/g, '^($1)')

  // Convert sum, prod, int with limits
  // \sum_{i=0}^{n} -> sum_(i=0)^n
  result = result.replace(/\\sum/g, 'sum')
  result = result.replace(/\\prod/g, 'product')
  result = result.replace(/\\int/g, 'integral')
  result = result.replace(/\\iint/g, 'integral.double')
  result = result.replace(/\\iiint/g, 'integral.triple')
  result = result.replace(/\\oint/g, 'integral.cont')
  result = result.replace(/\\lim/g, 'lim')

  // Convert matrices
  // \begin{matrix}...\end{matrix} -> mat(...)
  result = result.replace(/\\begin\{(p|b|B|v|V)?matrix\}([\s\S]*?)\\end\{(p|b|B|v|V)?matrix\}/g, (_, delim, content) => {
    const rows = content.split('\\\\').map((row: string) =>
      row.split('&').map((cell: string) => cell.trim()).join(', ')
    ).join('; ')

    let delimStr = ''
    if (delim === 'p') delimStr = 'delim: "()"'
    else if (delim === 'b') delimStr = 'delim: "[]"'
    else if (delim === 'B') delimStr = 'delim: "{}"'
    else if (delim === 'v') delimStr = 'delim: "|"'
    else if (delim === 'V') delimStr = 'delim: "||"'

    return delimStr ? `mat(${delimStr}, ${rows})` : `mat(${rows})`
  })

  // Convert cases environment
  result = result.replace(/\\begin\{cases\}([\s\S]*?)\\end\{cases\}/g, (_, content) => {
    const rows = content.split('\\\\').map((row: string) => {
      const parts = row.split('&').map((p: string) => p.trim())
      return parts.join(' "if" ')
    }).join(', ')
    return `cases(${rows})`
  })

  // Convert align environment (simplified - just remove alignment markers)
  result = result.replace(/\\begin\{align\*?\}([\s\S]*?)\\end\{align\*?\}/g, (_, content) => {
    return content.replace(/&/g, '').replace(/\\\\/g, '\n')
  })

  // Convert equation environment
  result = result.replace(/\\begin\{equation\*?\}([\s\S]*?)\\end\{equation\*?\}/g, '$1')

  // Convert text in math: \text{word} -> "word"
  result = result.replace(/\\text\{([^{}]*)\}/g, '"$1"')
  result = result.replace(/\\mathrm\{([^{}]*)\}/g, 'upright($1)')
  result = result.replace(/\\mathbf\{([^{}]*)\}/g, 'bold($1)')
  result = result.replace(/\\mathit\{([^{}]*)\}/g, 'italic($1)')
  result = result.replace(/\\mathbb\{([^{}]*)\}/g, 'bb($1)')
  result = result.replace(/\\mathcal\{([^{}]*)\}/g, 'cal($1)')
  result = result.replace(/\\mathfrak\{([^{}]*)\}/g, 'frak($1)')

  // Convert Greek letters
  for (const [latex_cmd, typst_cmd] of Object.entries(greekLetters)) {
    result = result.replace(new RegExp(`\\\\${latex_cmd}(?![a-zA-Z])`, 'g'), typst_cmd)
  }

  // Convert math symbols
  for (const [latex_cmd, typst_cmd] of Object.entries(mathSymbols)) {
    result = result.replace(new RegExp(`\\\\${latex_cmd}(?![a-zA-Z])`, 'g'), typst_cmd)
  }

  // Convert function names
  for (const func of mathFunctions) {
    result = result.replace(new RegExp(`\\\\${func}(?![a-zA-Z])`, 'g'), func)
  }

  // Convert accents: \hat{x} -> hat(x)
  for (const [latex_cmd, typst_cmd] of Object.entries(accents)) {
    result = result.replace(new RegExp(`\\\\${latex_cmd}\\{([^{}]*)\\}`, 'g'), `${typst_cmd}($1)`)
  }

  // Convert delimiters
  result = result.replace(/\\left\(/g, '(')
  result = result.replace(/\\right\)/g, ')')
  result = result.replace(/\\left\[/g, '[')
  result = result.replace(/\\right\]/g, ']')
  result = result.replace(/\\left\\\{/g, '{')
  result = result.replace(/\\right\\\}/g, '}')
  result = result.replace(/\\left\|/g, '|')
  result = result.replace(/\\right\|/g, '|')
  result = result.replace(/\\left\\langle/g, 'angle.l')
  result = result.replace(/\\right\\rangle/g, 'angle.r')
  result = result.replace(/\\langle/g, 'angle.l')
  result = result.replace(/\\rangle/g, 'angle.r')
  result = result.replace(/\\left\./g, '')
  result = result.replace(/\\right\./g, '')

  // Convert binomial: \binom{n}{k} -> binom(n, k)
  result = result.replace(/\\binom\{([^{}]*)\}\{([^{}]*)\}/g, 'binom($1, $2)')

  // Convert over/under braces
  result = result.replace(/\\overbrace\{([^{}]*)\}\^?\{([^{}]*)\}/g, 'overbrace($1, $2)')
  result = result.replace(/\\underbrace\{([^{}]*)\}\_?\{([^{}]*)\}/g, 'underbrace($1, $2)')

  // Convert cancel
  result = result.replace(/\\cancel\{([^{}]*)\}/g, 'cancel($1)')

  // Clean up remaining backslashes for unknown commands (leave as-is with warning)
  // result = result.replace(/\\([a-zA-Z]+)/g, '$1') // Uncomment to strip unknown commands

  // Clean up extra whitespace
  result = result.replace(/\s+/g, ' ').trim()

  return result
}

/**
 * Check if a string contains LaTeX math
 */
export function hasLatexMath(content: string): boolean {
  // Check for common LaTeX patterns
  const latexPatterns = [
    /\\frac\{/,
    /\\sqrt/,
    /\\sum/,
    /\\int/,
    /\\alpha|\\beta|\\gamma|\\delta/,
    /\\begin\{/,
    /\\left[(\[{|]/,
    /\\\\/,  // Line breaks in math
  ]
  return latexPatterns.some(pattern => pattern.test(content))
}

/**
 * Convert LaTeX document to Typst
 * Handles both inline ($...$) and display ($$...$$) math
 */
export function convertLatexDocument(content: string): string {
  // Convert display math $$...$$ (keep as display)
  let result = content.replace(/\$\$([\s\S]*?)\$\$/g, (_, math) => {
    const converted = latexToTypst(math.trim())
    return `$ ${converted} $`
  })

  // Convert inline math $...$ (keep as inline)
  result = result.replace(/\$([^$]+)\$/g, (_, math) => {
    const converted = latexToTypst(math.trim())
    return `$${converted}$`
  })

  // Convert \[ ... \] display math
  result = result.replace(/\\\[([\s\S]*?)\\\]/g, (_, math) => {
    const converted = latexToTypst(math.trim())
    return `$ ${converted} $`
  })

  // Convert \( ... \) inline math
  result = result.replace(/\\\(([\s\S]*?)\\\)/g, (_, math) => {
    const converted = latexToTypst(math.trim())
    return `$${converted}$`
  })

  return result
}
