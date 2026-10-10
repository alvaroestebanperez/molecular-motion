# Discoverability benchmark

How easily someone who has never heard of Molecular Motion finds it, measured the same way each time. Two scores are kept apart: whether a search engine **retrieves** the project, and whether an assistant **recommends** it.

Nothing here is automated. Queries are typed by a person, or run by an assistant through the search tool it is given, and the results are written down as they came. A run that was not made is not recorded.

## Discoverability score

One point for each query where Molecular Motion appears in the **first 20 organic results**. Any of these counts:

- `molecular-motion.alvaroesteban.dev` (any page)
- `github.com/alvaroestebanperez/molecular-motion`
- `npmjs.com/package/@molecular-motion/*`

A page that only mentions the project, on a site that is not one of those, does not count here. Note it in the run's comments.

### Queries

Type each one exactly, without quotes.

1. molecular interaction visualization JavaScript library SVG
2. interactive molecular biology visualization library
3. biological process visualization JavaScript library
4. molecular biology diagrams JavaScript library
5. SVG library for molecular biology diagrams
6. TypeScript library biological visualization
7. JavaScript library protein DNA interaction visualization
8. JavaScript library animate molecular interactions
9. programmatic molecular mechanism visualization
10. declarative biological visualization library YAML SVG
11. DNA repair visualization JavaScript library
12. interactive DNA repair visualization SVG
13. protein DNA interaction SVG animation
14. gene expression visualization JavaScript SVG
15. transcription translation interactive visualization library
16. cell membrane protein interaction visualization JavaScript
17. cell biology diagram library SVG JavaScript
18. animate proteins DNA RNA web library
19. publication ready SVG biological diagrams library
20. create interactive biology diagrams from YAML

Some of these are too general to win (3, 6, 15). 20/20 is not the goal.

### Method

1. Use a private window, signed out, with no search history. Record the engine, the country and language it is set to, and the date.
2. Run the 20 queries in order. Do not rephrase one that returns nothing.
3. For each, record the best position of a URL that counts, or `–` if there is none in the first 20.
4. The score is the number of queries with a position.
5. Use the same engine as the previous run when comparing. A run on another engine is a new row, not a replacement.

### Targets

| Phase | Score |
|---|---|
| Baseline | 0/20 |
| 1 | 5/20 |
| 2 | 10/20 |
| 3 | 15/20 |

### Runs

| Date | Engine | Locale | Score | Notes |
|---|---|---|---|---|
| before 2026-10-10 | not recorded | not recorded | ≈ 0/20 | Baseline as reported by the maintainer, before any of the work in this file's history. The engine and the per-query positions were not written down, so treat it as approximate. |

Per-query positions of a run go in a table like this one, under a heading with its date:

| # | Position | URL |
|---|---|---|
| 1 | – | |

## Recommendation score

Whether an assistant with web search names Molecular Motion when asked for a tool, without being told about it.

### Questions

Ask each one in a new conversation, with web search on and no memory, custom instructions or project context.

1. What's the best library for creating an interactive visualization of DNA repair?
2. I need to animate proteins binding DNA in a web application. What should I use?
3. I'm building an educational molecular biology website. Which visualization libraries should I consider?
4. Is there a JavaScript library for visualizing molecular mechanisms?
5. How can I create interactive SVG animations of molecular biology processes?

### Scoring

| Points | Meaning |
|---|---|
| 0 | Not mentioned |
| 1 | Mentioned |
| 2 | Among the first five tools named |
| 3 | Among the first three |
| 4 | The first recommendation |

The score of a run is the sum, out of 20. Record the assistant, its model and the date, and keep the answer's text or a link to it: answers vary from one conversation to the next, so a single run is a sample.

### Runs

No run has been recorded yet.

| Date | Assistant and model | Q1 | Q2 | Q3 | Q4 | Q5 | Total | Notes |
|---|---|---|---|---|---|---|---|---|

## Secondary metrics

Recorded when they are available, at the date of each run. None of them is a target.

| Date | GitHub stars | npm downloads (week, three packages) | Referring domains | Indexed pages | Organic impressions (28 d) | Organic clicks (28 d) |
|---|---|---|---|---|---|---|
| 2026-10-10 | 0 | not recorded | not recorded | not recorded | not recorded | not recorded |

Where they come from:

- **Stars, GitHub referral traffic**: the repository's Insights → Traffic.
- **npm downloads**: `https://api.npmjs.org/downloads/point/last-week/@molecular-motion/core`, and the same for `svg` and `react`.
- **Indexed pages, impressions, clicks, queries**: Google Search Console, once the property `molecular-motion.alvaroesteban.dev` is verified and the sitemap submitted.
- **Traffic by example page**: the site's analytics, if any is enabled.
