/**
 * @file src/modules/menu/templates/traditional.js
 * @description Traditional template - Classic restaurant menu style
 * 
 * Features:
 * - Serif fonts
 * - Classic layout
 * - Ornamental touches
 * - Vintage feel
 */

const {
  escapeHtml,
  getQrMarkup,
  buildCategories,
  buildFontFaces,
} = require('./template-helpers');

async function renderTraditionalTemplate(settings) {
  const normalized = settings;
  const { colors, fonts, branding, categories, items, qrCodeData, title, subtitle } = normalized;

  const categoryMarkup = buildCategories(
    categories.length ? categories : [{ name: 'Menu', items }]
  );
  const qrMarkup = await getQrMarkup(qrCodeData);
  const pageTitle = escapeHtml(title || branding.name || 'Menu');
  const pageSubtitle = escapeHtml(subtitle || 'Fine Dining');

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
          font-family: Georgia, serif;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }

        .page {
          padding: 44px;
          background: var(--background);
          border: 1px solid var(--border);
          margin: 8px;
        }

        .header {
          text-align: center;
          margin-bottom: 36px;
          border-bottom: 3px double var(--primary);
          padding-bottom: 20px;
        }

        h1 {
          margin: 0;
          font-size: 40px;
          color: var(--primary);
          letter-spacing: 2px;
          font-weight: normal;
        }

        .ornament {
          margin: 12px 0;
          text-align: center;
          font-size: 18px;
          color: var(--accent);
        }

        .subtitle {
          margin: 8px 0 0;
          font-size: 12px;
          color: var(--text);
          letter-spacing: 1px;
          font-style: italic;
        }

        .category {
          margin: 28px 0;
          page-break-inside: avoid;
        }

        .category h3 {
          font-size: 22px;
          margin: 24px 0 12px;
          color: var(--primary);
          text-align: center;
          border-bottom: 2px solid var(--accent);
          padding-bottom: 8px;
          font-weight: normal;
          letter-spacing: 1px;
        }

        .grid-2col {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 24px;
        }

        .menu-item {
          padding: 0;
          border: none;
          background: transparent;
          page-break-inside: avoid;
        }

        .menu-item-header {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          gap: 12px;
          margin-bottom: 4px;
        }

        .menu-item-header h4 {
          margin: 0;
          font-size: 15px;
          color: var(--primary);
          font-weight: normal;
        }

        .menu-item-header strong {
          color: var(--accent);
          font-size: 14px;
          font-weight: normal;
        }

        .menu-item p {
          margin: 4px 0;
          font-size: 11px;
          color: #4b5563;
          line-height: 1.5;
          font-style: italic;
        }

        .tags {
          display: none;
        }

        .qr-section {
          margin-top: 36px;
          padding-top: 20px;
          text-align: center;
          border-top: 3px double var(--primary);
        }

        .qr-box {
          width: 100px;
          height: 100px;
          margin: 0 auto 12px;
          border: 2px solid var(--primary);
        }

        .qr-text {
          font-size: 10px;
          color: var(--primary);
          font-style: italic;
        }

        .footer-ornament {
          text-align: center;
          margin-top: 20px;
          font-size: 16px;
          color: var(--accent);
        }
      </style>
    </head>
    <body>
      <div class="page">
        <div class="header">
          <div class="ornament">❖ ❖ ❖</div>
          <h1>${pageTitle}</h1>
          <p class="subtitle">${pageSubtitle}</p>
          <div class="ornament">❖ ❖ ❖</div>
        </div>

        ${categoryMarkup}

        ${qrMarkup ? `<div class="qr-section">${qrMarkup}<div class="footer-ornament">❖ ❖ ❖</div></div>` : ''}
      </div>
    </body>
  </html>`;
}

module.exports = renderTraditionalTemplate;
