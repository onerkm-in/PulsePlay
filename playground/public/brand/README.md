# Brand assets — drop your logo here

This folder is the single **drop-path** for PulsePlay's brand artwork. Files in
`public/` are served at the site root and copied verbatim into the production
build (`dist/`), so whatever you drop here is picked up automatically by:

- the **PulsePlay web app** (dev server + production build), and
- the **desktop EXE enabler** (it bundles `playground/dist`, so it inherits these
  files with no extra config).

No build wiring to touch — just replace the file with the same name.

## Files

| File | Where it shows | Replace it to change… |
|------|----------------|------------------------|
| `logo.svg` | App top-bar, next to the "PulsePlay" wordmark | the in-app brand logo |
| `favicon.svg` | Browser tab icon (web app **and** the EXE's browser window) | the browser/tab icon |

Both are **placeholders** today (the brand mark) — the real logo is a
work-in-progress. Drop the final artwork in with the SAME filenames and it goes
live everywhere.

## Tips

- **SVG preferred** (crisp at any size); PNG works too. Keep `logo.svg` roughly
  square so the header lockup stays aligned — or replace it with a full
  horizontal lockup and hide the wordmark `<h1>` in `playground/src/App.tsx`.
- The header logo renders at ~30px; the favicon at the browser's icon size.
- The favicon is referenced from `playground/index.html` as `/brand/favicon.svg`
  (allowed by the page CSP `img-src 'self'`).

## Not covered here

The desktop **EXE's own binary icon** (the `.exe` file icon in Explorer/taskbar)
is set during packaging, not from this folder. The "browser icon" consistency
this folder provides is the favicon shown when the EXE opens the app in a browser.
