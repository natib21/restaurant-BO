Menu PDF Rendering
==================

This document explains how to run the menu PDF rendering endpoint that uses Puppeteer (Chromium).

Endpoint
--------
- POST /api/v1/menu/render-pdf
- Protected: requires authentication (JWT)
- Accepts JSON body with `settings` or menu fields (templateId, paperSize, orientation, colors, fonts, categories/items, branding, qrCodeData, margins)
- Returns: `application/pdf` attachment

Installation
------------
The server uses `puppeteer` to run headless Chromium. Install dependencies:

```bash
npm install
# or, to add puppeteer if not already present
npm install puppeteer --save
```

Docker / Production Notes
-------------------------
- Puppeteer requires a Linux environment with necessary libraries. If deploying in Docker, use an image that includes Chromium dependencies, for example `node:20-bullseye-slim` with the following packages installed:

```dockerfile
RUN apt-get update && apt-get install -y \
  ca-certificates fonts-noto-core fonts-noto-extra fonts-noto-cjk libnss3 \
  libxss1 libasound2 libatk1.0-0 libatk-bridge2.0-0 libx11-xcb1 libgtk-3-0 \
  libxcomposite1 libxdamage1 libxrandr2 libgbm1 libpangocairo-1.0-0 \
  libgdk-pixbuf2.0-0
```

- Alternatively, use the official Puppeteer Docker images or a pre-built Chromium layer.
- Ensure the container runs with `--no-sandbox` args in production only if you understand the security implications. The service uses `--no-sandbox` for compatibility with many container runtimes.

Fonts and Multilingual Support
-----------------------------
- The PDF rendering template requests `Noto Sans` and `Noto Sans Ethiopic` to correctly render Amharic / Ge'ez scripts.
- To guarantee correct glyph rendering in headless Chromium, install system-wide Noto fonts in the container, e.g. `fonts-noto` or `fonts-noto-core`.

Timeouts & Resource Usage
-------------------------
- Rendering large menus may take several seconds and consumes memory. Monitor memory usage and consider running rendering as a job queue if high concurrency expected.
- The service reuses a single Chromium instance per process and closes pages after each request to reduce overhead.

Troubleshooting
---------------
- `Failed to launch Chromium`: ensure system libraries are installed in the container or host.
- Missing glyphs for Ethiopic script: install `fonts-noto-ethiopic` or `fonts-noto-extra` on the host/container.

Security
--------
- The route is protected by existing authentication middleware. Do not expose it publicly without proper RBAC.

Contact
-------
- Ask the maintainers for further help integrating a specific HTML template or for queueing large jobs.
