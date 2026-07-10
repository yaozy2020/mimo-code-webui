# Testing

Run the full verification gate before release:

```bash
npm run verify
```

Optional browser smoke checks require a running WebUI:

```bash
npm run smoke:browser
npm run smoke:browser:system
```

Browser smoke scripts are runtime diagnostics, not the primary regression suite.

The browser smoke check verifies that the app shell, start screen, or auth prompt renders without browser console errors. `SMOKE_SESSION_ID` is reserved for a future URL-addressable session regression; current builds log a warning and skip that assertion because sessions are selected through app state rather than a stable route.
