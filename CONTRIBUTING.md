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
- Update the TypeScript types, README, and demo together when the public language changes. `packages/core/schema.json` and `docs/actions.md` are generated from the action registry: run `npm run schema` and `npm run reference` after changing an action, and the test suite fails if either is out of date. `docs/language.md` is written by hand; the complete documents it shows are compiled by the tests.
- Describe a user-visible change in `CHANGELOG.md`, under the next version.
- Use clear commit messages; Conventional Commits are welcome but not required.

## Releasing

The three packages share one version and are published together, by the `Release` workflow, when a version tag is pushed. Nobody publishes a release by hand.

Publishing is authenticated by [npm Trusted Publishing](https://docs.npmjs.com/trusted-publishers): npm trusts `.github/workflows/release.yml` of this repository, and the workflow proves who it is with a short-lived OIDC token. There is no npm token in the repository or in its secrets, and none should be added.

### A release

1. Set the same version in `packages/core`, `packages/svg` and `packages/react`, and in the dependency ranges between them. Move the entries of `CHANGELOG.md` under that version.
2. Run `npm run check`, then `npm run build && npm run check:pack`. The second packs the three packages, installs the tarballs into an empty project and renders from there.
3. Merge to `main`.
4. Tag that commit of `main` with the version, and push the tag:

   ```bash
   git checkout main && git pull
   git tag v0.1.0
   git push origin v0.1.0
   ```

5. The workflow checks that the tag is the version of all three packages and a commit of `main`, runs both checks again, and publishes `core`, then `svg`, then `react`. If any check fails, nothing is published. npm attaches provenance on its own.

A run that fails after publishing one or two of the packages can be started again: a version already on the registry is skipped.

### One-time setup, before 0.1.0

npm only lets a trusted publisher be configured on a package that already exists, so each name is created once by hand with an empty placeholder. Version `0.0.0` is that placeholder: it has no code and is not a release of Molecular Motion. The first release is `0.1.0`, published by the workflow.

1. **Create the three placeholders.** From a directory outside the repository, publish a `0.0.0` of `@molecular-motion/core`, `@molecular-motion/svg` and `@molecular-motion/react` that holds only a `package.json` and a README, with `npm login` and your own two-factor code. No token.
2. **Add the trusted publisher to each package.** On npmjs.com, in the settings of each of the three packages, under *Trusted Publisher*, choose GitHub Actions and enter:

   | Field | Value |
   |---|---|
   | Organization or user | `alvaroestebanperez` |
   | Repository | `molecular-motion` |
   | Workflow filename | `release.yml` |
   | Environment name | *(empty)* |

   The filename is the name only, without a path. The workflow uses no GitHub environment.
3. **Close the other ways in.** In the *Publishing access* settings of each package, select *Require two-factor authentication and disallow tokens*.
4. **Merge the pull request that adds the workflow**, then release `0.1.0` as above.

Once `0.1.0` is on the registry, mark the placeholders so nobody installs them:

```bash
npm deprecate @molecular-motion/core@0.0.0  "Bootstrap placeholder only; use >=0.1.0."
npm deprecate @molecular-motion/svg@0.0.0   "Bootstrap placeholder only; use >=0.1.0."
npm deprecate @molecular-motion/react@0.0.0 "Bootstrap placeholder only; use >=0.1.0."
```

They are deprecated, not unpublished.

### If the workflow file is renamed

npm identifies the publisher by repository and workflow filename. Renaming `release.yml` breaks publishing until the trusted publisher of each package is updated to the new name.
