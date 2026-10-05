# Contributing to Molecular Motion

Thank you for helping make molecular mechanisms easier to communicate, inspect, and reuse.

## Before opening an issue

- Search existing issues and discussions.
- For scientific corrections, include a primary source or review supporting the change.
- For new actions or actor types, describe the biological concept independently of its visual treatment.

## Local development

Requirements: Node.js 20 or newer and npm 10 or newer.

```bash
git clone https://github.com/alvaroestebanperez/molecular-motion.git
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
- Update the TypeScript types, README, and demo together when the public language changes. `packages/core/schema.json` is generated from the action registry: run `npm run schema` after changing an action, and the test suite fails if it is out of date.
- Describe a user-visible change in `CHANGELOG.md`, under the next version.
- Use clear commit messages; Conventional Commits are welcome but not required.

## Releasing

The three packages share one version and are published together.

1. Set the same version in `packages/core`, `packages/svg` and `packages/react`, and in the dependency ranges between them. Move the entries of `CHANGELOG.md` under that version.
2. Run `npm run check`, then `npm run build && npm run check:pack`. The second packs the three packages, installs the tarballs into an empty project and renders from there.
3. Merge to `main`, then push a tag named after the version: `v0.1.0` for `0.1.0`.

The tag starts the release workflow, which runs both checks again and publishes to npm. It needs the repository secret `NPM_TOKEN`, an npm token allowed to publish under the `@molecular-motion` scope.
