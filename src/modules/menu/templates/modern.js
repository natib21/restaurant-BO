/**
 * @file src/modules/menu/templates/modern.js
 * @description Modern template - Clean, contemporary design
 * 
 * Features:
 * - Flat design
 * - Bold colors
 * - Modern typography
 * - Minimal decorations
 */

const {
  escapeHtml,
  getQrMarkup,
  buildCategories,
  buildFontFaces,
} = require('./template-helpers');

async function renderModernTemplate(settings) {
  const normalized = settings;
  const { colors, fonts, branding, categories, items, qrCodeData, title, subtitle } = normalized;

  const categoryMarkup = buildCategories(
    categories.length ? categories : [{ name: 'Menu', items }]
  );
  const qrMarkup = await getQrMarkup(qrCodeData);
  const pageTitle = escapeHtml(title || branding.name || 'Menu');
  const pageSubtitle = escapeHtml(subtitle || 'Contemporary cuisine');

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
          background: var(--background);
          color: var(--text);
          font-family: '${fonts.body.family}', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }

        .page {
          padding: 36px;
          background: var(--background);
        }

        .header {
          margin-bottom: 32px;
        }

        h1 {
          margin: 0;
          font-size: 42px;
          font-weight: 700;
          color: var(--primary);
          letter-spacing: -0.5px;
          font-family: '${fonts.heading.family}', sans-serif;
        }

        .subtitle {
          margin: 8px 0 0;
          font-size: 14px;
          color: #666;
          font-weight: 500;
          letter-spacing: 0.5px;
        }

        .category {
          margin-bottom: 32px;
        }

        .category h3 {
          font-size: 20px;
          font-weight: 700;
          margin: 0 0 16px;
          color: var(--primary);
          text-transform: uppercase;
          letter-spacing: 1px;
          border-bottom: 3px solid var(--accent);
          padding-bottom: 8px;
        }

        .grid-2col {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 20px;
        }

        .menu-item {
          padding: 16px;
          background: white;
          border-radius: 8px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.08);
          border: none;
          transition: transform 0.2s;
        }

        .menu-item:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(0,0,0,0.12);
        }

        .menu-item-header {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          gap: 12px;
          margin-bottom: 8px;
        }

        .menu-item-header h4 {
          margin: 0;
          font-size: 16px;
          font-weight: 600;
          color: var(--primary);
          font-family: '${fonts.heading.family}', sans-serif;
        }

        .menu-item-header strong {
          color: var(--accent);
          font-size: 15px;
          white-space: nowrap;
          font-weight: 700;
        }

        .menu-item p {
          margin: 8px 0;
          font-size: 12px;
          color: #4b5563;
          line-height: 1.5;
        }

        .tags {
          display: flex;
          gap: 6px;
          margin-top: 8px;
          flex-wrap: wrap;
        }

        .tags span {
          background: var(--accent);
          color: white;
          padding: 4px 10px;
          border-radius: 999px;
          font-size: 10px;
          font-weight: 600;
          letter-spacing: 0.3px;
        }

        .qr-section {
          margin-top: 40px;
          padding-top: 24px;
          border-top: 1px solid var(--border);
          text-align: center;
        }

        .qr-box {
          width: 120px;
          height: 120px;
          margin: 0 auto 12px;
          border: 2px solid var(--primary);
          border-radius: 8px;
        }

        .qr-text {
          font-size: 11px;
          color: var(--primary);
          font-weight: 600;
          letter-spacing: 0.5px;
        }
      </style>
    </head>
    <body>
      <div class="page">
        <div class="header">
          <h1>${pageTitle}</h1>
          <p class="subtitle">${pageSubtitle}</p>
        </div>

        ${categoryMarkup}

        ${qrMarkup ? `<div class="qr-section">${qrMarkup}</div>` : ''}
      </div>
    </body>
  </html>`;
}

module.exports = renderModernTemplate;
