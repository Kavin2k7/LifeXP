# LifeXP test scripts

`api-smoke.mjs` is an integration smoke test that uses Node's built-in `fetch` and `assert`; no extra test package is required. Run it against an initialized test database and a running API:

```powershell
node tests\api-smoke.mjs
```

The script creates two persistent test users. Do not point it at production data. Browser-only TXT/CSV parsing, drag-and-drop, responsive behavior, and full game interaction are covered by the manual browser checks in the root README.
