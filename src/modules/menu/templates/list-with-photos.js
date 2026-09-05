/**
 * @file src/modules/menu/templates/list-with-photos.js
 * @description List with photos template - Detailed items with images
 * 
 * Features:
 * - Large photos for each item
 * - Vertical list layout
 * - Descriptions displayed
 * - Premium presentation
 */

const {
  escapeHtml,
  getQrMarkup,
  buildFontFaces,
  buildMenuItems,
} = require('./template-helpers');

async function renderListWithPhotosTemplate(settings) {
  const normalized = settings;
  const { colors, fonts, branding, categories, items, qrCodeData, title, subtitle } = normalized;

  const categoryMarkup = (categories.length ? categories : [{ name: 'Menu', items }])
    .map((category) => {
      const name = escapeHtml(category.name || 'Category');
      const itemsMarkup = buildMenuItems(category.items || [], 'list-with-photos');
      return `
        <section class="category">
          <h3>${name}</h3>
          <div class="list-with-photos">${itemsMarkup}</div>
        </section>
      `;
    })
    .join('');

  const qrMarkup = await getQrMarkup(qrCodeData);
  const pageTitle = escapeHtml(title || branding.name || 'Menu');
  const pageSubtitle = escapeHtml(subtitle || 'Our finest selections');

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
          font-family: '${fonts.body.family}', sans-serif;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }

        .page {
          padding: 40px;
          background: var(--background);
        }

        h1 {
          margin: 0 0 6px;
          font-size: 36px;
          color: var(--primary);
          font-family: '${fonts.heading.family}', serif;
        }

        .subtitle {
          margin: 0 0 24px;
          font-size: 14px;
          color: #666;
        }

        .category {
          margin-bottom: 32px;
        }

        .category h3 {
          font-size: 24px;
          margin: 0 0 20px;
          color: var(--primary);
          border-bottom: 2px solid var(--accent);
          padding-bottom: 10px;
        }

        .list-with-photos {
          display: flex;
          flex-direction: column;
          gap: 24px;
        }

        .menu-item {
          display: flex;
          gap: 16px;
          padding: 16px;
          border: 1px solid var(--border);
          border-radius: 8px;
          background: white;
        }

        .menu-item .thumb {
          width: 120px;
          height: 120px;
          flex: 0 0 120px;
          border-radius: 8px;
          overflow: hidden;
          background: #f3f4f6;
        }

        .menu-item .thumb img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .menu-item-copy {
          flex: 1;
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
          font-size: 18px;
          font-weight: 600;
          color: var(--primary);
        }

        .menu-item-header strong {
          color: var(--accent);
          font-size: 16px;
          white-space: nowrap;
        }

        .menu-item p {
          margin: 6px 0;
          font-size: 13px;
          color: #4b5563;
          line-height: 1.5;
        }

        .tags {
          display: flex;
          gap: 8px;
          margin-top: 8px;
        }

        .tags span {
          background: rgba(245, 158, 11, 0.1);
          color: var(--primary);
          padding: 4px 8px;
          border-radius: 4px;
          font-size: 11px;
          font-weight: 600;
        }

        .qr-section {
          margin-top: 40px;
          text-align: center;
          padding-top: 24px;
          border-top: 2px solid var(--border);
        }

        .qr-box {
          width: 140px;
          height: 140px;
          margin: 0 auto 12px;
          border: 1px solid var(--border);
        }
      </style>
    </head>
    <body>
      <div class="page">
        <h1>${pageTitle}</h1>
        <p class="subtitle">${pageSubtitle}</p>

        ${categoryMarkup}

        ${qrMarkup ? `<div class="qr-section">${qrMarkup}</div>` : ''}
      </div>
    </body>
  </html>`;
}

module.exports = renderListWithPhotosTemplate;
