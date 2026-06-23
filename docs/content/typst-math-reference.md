# Typst math reference

Nodus renders mathematics with the Typst engine, not LaTeX. Write math inside
math delimiters: `$...$` for inline math and `$$...$$` for display (block) math.

## Syntax

| Symbol | Typst syntax |
|--------|--------------|
| Arrow over letter | $arrow(x)$ |
| Hat over letter | $hat(x)$ |
| Bar over letter | $overline(x)$ |
| Dot over letter | $dot(x)$ |
| Double dot | $dot.double(x)$ |
| Subscript | $x_1$ or $x_(i+1)$ |
| Superscript | $x^2$ or $x^(n+1)$ |
| Fraction | $a/b$ or $frac(a, b)$ |
| Square root | $sqrt(x)$ |
| Integral | $integral_0^1 f(x) dif x$ |
| Sum | $sum_(i=0)^n i$ |
| Greek letters | $alpha, beta, gamma, delta$ |
| Matrix | $mat(1, 2; 3, 4)$ |
| Column vector | $vec(x, y, z)$ |

## Formatting math with the agent

The node agent is instructed to write math in Typst syntax directly. Because
models default to LaTeX, the agent can also call the `format_math` tool to
reformat a note's math.

`format_math` is a language-model call: it sends the note content and the Typst
syntax reference above to the model and replaces the note with the converted
result. It handles arbitrary input notation rather than a fixed symbol set. If
the model returns nothing usable, the note is left unchanged so a failed call
never destroys content.
