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
