# Development Preferences

## General

- Use UV for Python
- Use YYMMDD date format
- No emojis in READMEs, scripts, or commit messages
- Commit messages: short, single line, no mention of AI assistance

## Code Quality

- No file should exceed 1000 lines
- Remove dead code
- Apply standard software design patterns where appropriate
- Names (functions, classes, variables) must accurately reflect what they implement — no aspirational naming

## Linting and Formatting

- Use `ruff` for linting and formatting Python code
- Run `ruff check` and `ruff format` before committing
- Fix all linting errors — do not suppress warnings without justification

## Git

- Maintain a `.gitignore` appropriate for the project (e.g., Python, Node, IDE files)
- At minimum, ignore: virtual environments, `__pycache__`, `.env`, build/dist artifacts, OS files (`.DS_Store`, `Thumbs.db`), and IDE/editor directories (`.vscode`, `.idea`)
- Review `.gitignore` when adding new tools or dependencies to the project
- Do not commit generated or temporary files

## Documentation

- Stay scientifically objective — no overstatements or filler
- Use precise technical terms for the concepts involved so readers can learn from the docs
- No duplicated topics across docs

## Workflow

This project follows **document-driven** and **test-driven** development.

1. Update documentation to describe the intended behavior (confirm with user first)
2. Write or update tests accordingly (`pytest` for Python)
3. Implement the changes
4. Validate that all tests pass

Prefer unit and integration tests over manual testing. Commit regularly with reasonable scopes and ensure all necessary files are included.

