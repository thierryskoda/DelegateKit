# E2E sweep

Batch-run E2E files one at a time with per-test logs and `results.tsv`.

```bash
npm run e2e:sweep -- others --fail-fast
npm run e2e:sweep -- scenarios --limit=5
```

Files in this folder:

- `e2e-sweep.ts`: batch run and `results.tsv` (`npm run e2e:sweep`)
- `e2e-sweep-scope.ts`: shared scope parsing
- `e2e-sweep-shared.ts`: shared CLI helpers and manifest writing
