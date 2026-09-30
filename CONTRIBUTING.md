# Contributing to Molecular Motion

Thank you for helping make molecular mechanisms easier to communicate, inspect, and reuse.

## Before opening an issue

- Search existing issues and discussions.
- For scientific corrections, include a primary source or review supporting the change.
- For new actions or actor types, describe the biological concept independently of its visual treatment.

## Local development

Requirements: Node.js 20 or newer and npm 10 or newer.

```bash
git clone https://github.com/alvaroesteban/molecular-motion.git
cd molecular-motion
npm install
npm run dev
```

Run the complete validation suite before submitting a pull request:

```bash
npm run check
```

## Project principles

1. Definitions express molecular biology; renderers decide how it looks.
2. The core package remains framework- and DOM-independent.
3. Stepping backward and forward must be deterministic.
4. Accessibility and reduced-motion behavior are part of every feature.
5. The schema evolves through explicit, documented versions.

## Pull requests

- Keep changes focused and add tests for new behavior.
- Update the JSON Schema, TypeScript types, README, and demo together when the public language changes.
- Add a changeset once the project begins publishing versioned packages.
- Use clear commit messages; Conventional Commits are welcome but not required.
