# Efficiency measurements

The Hack2skill screenshot reported efficiency 80 and code quality 86. Its private scoring implementation and diagnostic feedback are unavailable, so these changes target measured engineering costs rather than claiming to reproduce the evaluator's grade.

## Original submitted build

Measured from the original production artifacts with Node 24.18.0 and gzip:

| JavaScript          | Raw bytes | Gzip bytes |
| ------------------- | --------: | ---------: |
| Initial application |   370,490 |    114,301 |
| Lazy-loaded office  |   962,911 |    269,500 |

`pnpm perf:bundle` fails this build against a 90 KiB initial-JavaScript budget. New builds use Vite's manifest to count the entry and all of its static imports, so splitting a dependency into a static vendor chunk cannot conceal its loading cost. Optional dynamic imports are reported by normal build output and are not counted as initial code.

## Original data-processing baseline

`pnpm perf:data` exercises 500-row tables and 200 independent investigations on the same machine. Timings are informational, not flaky pass/fail tests.

| Operation                           | Original timing |
| ----------------------------------- | --------------: |
| Duplicate grouping, median          |         1.25 ms |
| Case detection, median              |         2.85 ms |
| Group count, median                 |         0.30 ms |
| Create 200 investigations           |        548.8 ms |
| Read 200 investigations             |         7.64 ms |
| Edit 200 independent investigations |      1,068.8 ms |

The original memory store cloned all investigations for each mutation. Independent edits therefore scaled with unrelated stored data. The optimized store should clone only its target resource and retain atomic mutation behavior. Regression tests cover isolation, source immutability, failed persistence and same-resource serialization.

## Verification commands

```sh
pnpm check
pnpm perf:data
pnpm test:e2e
pnpm test:a11y
```

The same fixtures, runtime and build settings must be used for before/after comparisons. Record final measured results here after integration.
