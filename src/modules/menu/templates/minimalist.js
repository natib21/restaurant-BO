/**
 * @file src/modules/menu/templates/minimalist.js
 * @description Minimalist template - Ultra-simple black & white
 * 
 * Features:
 * - Black and white only
 * - No colors or graphics
 * - Text-focused
 * - Printer-friendly
 */

const {
  escapeHtml,
  buildFontFaces,
  buildMenuItems,
} = require('./template-helpers');

async function renderMinimalistTemplate(settings) {
  const normalized = settings;
  const { branding, categories, items, title } = normalized;

  const categoryMarkup = (categories.length ? categories : [{ name: 'Menu', items }])
    .map((category) => {
      const name = escapeHtml(category.name || 'Category');
      const itemsMarkup = buildMenuItems(category.items || [], 'compact-price-list');
      return `
        <section class="category">
          <h3>${name}</h3>
          ${itemsMarkup}
        </section>
      `;
    })
    .join('');

  const pageTitle = escapeHtml(title || branding.name || 'Menu');

  return `<!DOCTYPE html>
  <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <title>${pageTitle}</title>
      <style>
        ${buildFontFaces()}

        * { box-sizing: border-box; }

        body {
          margin: 0;
          padding: 20px;
          background: white;
          color: black;
          font-family: 'Courier New', monospace;
          font-size: 12px;
          line-height: 1.6;
        }

        h1 {
          margin: 0 0 20px;
          font-size: 20px;
          text-align: center;
          text-transform: uppercase;
          letter-spacing: 1px;
        }

        .category {
          margin: 20px 0;
        }

        .category h3 {
          margin: 16px 0 8px;
          font-size: 13px;
          text-transform: uppercase;
          border-bottom: 1px solid black;
          padding-bottom: 4px;
        }

        .compact-item-row {
          margin: 6px 0;
          display: flex;
          justify-content: space-between;
          align-items: baseline;
        }

        .compact-item {
          display: flex;
          width: 100%;
          align-items: baseline;
          gap: 4px;
        }

        .compact-item .name {
          font-weight: normal;
        }

        .compact-item .dots {
          flex: 1;
          border-bottom: 1px dotted black;
          margin: 0 4px;
          height: 0;
        }

        .compact-item .price {
          font-weight: bold;
          white-space: nowrap;
        }

        .menu-item p {
          margin: 2px 0 0 20px;
          font-size: 10px;
          font-style: italic;
        }

        .empty-state {
          text-align: center;
          padding: 20px;
          font-style: italic;
        }
      </style>
    </head>
    <body>
      <h1>${pageTitle}</h1>
      ${categoryMarkup}
    </body>
  </html>`;
}

module.exports = renderMinimalistTemplate;
