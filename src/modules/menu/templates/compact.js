/**
 * @file src/modules/menu/templates/compact.js
 * @description Compact template - Minimal, tight layout for space-constrained PDFs
 * 
 * Features:
 * - Minimal spacing
 * - Small fonts
 * - Compact grid
 * - Perfect for quick menus
 */

const {
  escapeHtml,
  getQrMarkup,
  buildCategories,
  buildFontFaces,
} = require('./template-helpers');

async function renderCompactTemplate(settings) {
  const normalized = settings;
  const { colors, fonts, branding, categories, items, qrCodeData, title } = normalized;

  const categoryMarkup = buildCategories(
    categories.length ? categories : [{ name: 'Menu', items }]
  );
  const qrMarkup = await getQrMarkup(qrCodeData);
  const pageTitle = escapeHtml(title || branding.name || 'Menu');

  return `<!DOCTYPE html>
  <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <title>${pageTitle}</title>
      <style>
        ${buildFontFaces()}

        :root {
          --primary: ${colors.primary};
          --accent: ${colors.accent};
          --background: ${colors.background};
          --text: ${colors.text};
          --border: ${colors.border};
        }

        * { box-sizing: border-box; }

        body {
          margin: 0;
          padding: 12px;
          background: var(--background);
          color: var(--text);
          font-family: '${fonts.body.family}', sans-serif;
          font-size: 11px;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }

        h1 {
          margin: 0 0 6px;
          font-size: 16px;
          color: var(--primary);
        }

        .category {
          margin-top: 12px;
          padding: 0;
        }

        .category h3 {
          font-size: 12px;
          margin: 0 0 6px;
          color: var(--primary);
          border-bottom: 1px solid var(--border);
          padding-bottom: 3px;
        }

        .grid-2col {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 6px;
        }

        .menu-item {
          padding: 6px;
          border: 1px solid var(--border);
          border-radius: 4px;
          background: white;
          font-size: 10px;
        }

        .menu-item-header {
          display: flex;
          justify-content: space-between;
          gap: 6px;
          margin-bottom: 3px;
        }

        .menu-item-header h4 {
          margin: 0;
          font-size: 10px;
          font-weight: 600;
          color: var(--primary);
        }

        .menu-item-header strong {
          color: var(--accent);
          font-size: 10px;
          white-space: nowrap;
        }

        .menu-item p {
          margin: 3px 0;
          font-size: 9px;
          color: #666;
          line-height: 1.2;
        }

        .qr-card {
          margin-top: 12px;
          text-align: center;
          font-size: 9px;
        }

        .qr-box {
          width: 80px;
          height: 80px;
          margin: 0 auto 6px;
          border: 1px solid var(--border);
        }
      </style>
    </head>
    <body>
      <h1>${pageTitle}</h1>
      ${categoryMarkup}
      ${qrMarkup}
    </body>
  </html>`;
}

module.exports = renderCompactTemplate;
