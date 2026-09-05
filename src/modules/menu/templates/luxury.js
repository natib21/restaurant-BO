/**
 * @file src/modules/menu/templates/luxury.js
 * @description Luxury template - Premium black & gold design
 * 
 * Features:
 * - Black and gold color scheme
 * - Elegant typography
 * - Premium spacing
 * - Item photos support
 */

const {
  escapeHtml,
  getQrMarkup,
  buildCategories,
  buildFontFaces,
} = require('./template-helpers');

async function renderLuxuryTemplate(settings) {
  const normalized = settings;
  const { colors, fonts, branding, categories, items, qrCodeData, title, subtitle } = normalized;

  // Override colors for luxury look
  const luxuryColors = {
    ...colors,
    primary: colors.primary === '#1f2937' ? '#000000' : colors.primary,
    accent: colors.accent === '#f59e0b' ? '#d4af37' : colors.accent, // Gold
  };

  const categoryMarkup = buildCategories(
    categories.length ? categories : [{ name: 'Menu', items }]
  );
  const qrMarkup = await getQrMarkup(qrCodeData);
  const pageTitle = escapeHtml(title || branding.name || 'Restaurant Menu');
  const pageSubtitle = escapeHtml(subtitle || 'Fine Cuisine');

  return `<!DOCTYPE html>
  <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>${pageTitle}</title>
      <style>
        /* Font faces */
        ${buildFontFaces()}

        :root {
          --primary: ${luxuryColors.primary};
          --accent: ${luxuryColors.accent};
          --background: ${luxuryColors.background};
          --text: ${luxuryColors.text};
          --border: ${luxuryColors.border};
          --heading-font: '${fonts.heading.family}', serif;
          --body-font: '${fonts.body.family}', sans-serif;
        }

        * { box-sizing: border-box; }

        body {
          margin: 0;
          background: var(--background);
          color: var(--text);
          font-family: var(--body-font);
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }

        .page {
          width: 100%;
          min-height: 100vh;
          padding: 48px;
          background: var(--background);
        }

        .header {
          text-align: center;
          border-bottom: 3px solid var(--accent);
          padding-bottom: 24px;
          margin-bottom: 48px;
        }

        h1 {
          margin: 0;
          font-family: var(--heading-font);
          font-size: 48px;
          color: var(--primary);
          letter-spacing: 2px;
        }

        .subtitle {
          margin: 12px 0 0;
          font-size: 14px;
          color: var(--accent);
          letter-spacing: 1px;
          text-transform: uppercase;
        }

        .category {
          margin-top: 48px;
          padding: 0;
        }

        .category h3 {
          font-size: 28px;
          margin: 0 0 24px;
          color: var(--primary);
          border-bottom: 2px solid var(--accent);
          padding-bottom: 12px;
          font-family: var(--heading-font);
          letter-spacing: 1px;
        }

        .grid-2col {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 36px;
        }

        .menu-item {
          padding: 24px;
          border: none;
          border-bottom: 1px solid var(--accent);
          background: transparent;
        }

        .menu-item:last-child {
          border-bottom: none;
        }

        .menu-item-header {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          gap: 12px;
          margin-bottom: 8px;
        }

        .menu-item-header h4 {
          font-size: 20px;
          margin: 0;
          font-family: var(--heading-font);
          color: var(--primary);
          letter-spacing: 0.5px;
        }

        .menu-item-header strong {
          color: var(--accent);
          font-size: 18px;
          white-space: nowrap;
        }

        .menu-item p {
          margin: 8px 0;
          color: #4b5563;
          font-size: 12px;
          line-height: 1.6;
          font-style: italic;
        }

        .tags {
          display: flex;
          gap: 8px;
          margin-top: 8px;
        }

        .tags span {
          font-size: 10px;
          color: var(--accent);
          border: 1px solid var(--accent);
          padding: 4px 8px;
          letter-spacing: 0.5px;
        }

        .qr-card {
          text-align: center;
          margin-top: 48px;
          padding-top: 24px;
          border-top: 2px solid var(--accent);
        }

        .qr-box {
          width: 120px;
          height: 120px;
          margin: 0 auto 12px;
          border: 2px solid var(--primary);
          background: white;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .qr-text {
          font-size: 11px;
          color: var(--primary);
          letter-spacing: 1px;
          text-transform: uppercase;
        }
      </style>
    </head>
    <body>
      <div class="page">
        <header class="header">
          <h1>${pageTitle}</h1>
          <p class="subtitle">${pageSubtitle}</p>
        </header>

        <main>
          ${categoryMarkup}
        </main>

        <div class="qr-card">
          ${qrMarkup}
        </div>
      </div>
    </body>
  </html>`;
}

module.exports = renderLuxuryTemplate;
