# pdf.js (vendored)

- Source: `pdfjs-dist@4.10.38` (npm), `legacy/build/pdf.min.mjs` and `pdf.worker.min.mjs`, plus `cmaps/` and `standard_fonts/`.
- License: Apache-2.0 (see `LICENSE`; standard font licenses are in `standard_fonts/`).
- Used only by the administrator bulletin upload screen to turn a PDF into page images in the browser.
- Self-hosted so no external script is loaded and no build dependency has to be installed. Keep files unmodified; update by replacing them from a newer `pdfjs-dist` release.
