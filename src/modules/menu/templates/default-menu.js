/**
 * @file src/modules/menu/templates/default-menu.js
 * @description Default menu template - 2-column grid layout
 * 
 * This is the standard template with:
 * - 2-column grid layout
 * - Standard colors and fonts
 * - QR code support
 * - Category organization
 */

const {
  escapeHtml,
  getQrMarkup,
  buildCategories,
  buildFontFaces,
} = require('./template-helpers');

async function renderDefaultMenu(settings) {
  const normalized = settings;
  const { colors, fonts, branding, categories, items, qrCodeData, title, subtitle } = normalized;

  const categoryMarkup = buildCategories(
    categories.length ? categories : [{ name: 'Menu', items }]
  );
  const qrMarkup = await getQrMarkup(qrCodeData);
  const pageTitle = escapeHtml(title || branding.name || 'Restaurant Menu');
  const pageSubtitle = escapeHtml(subtitle || 'Freshly prepared dishes & beverages');

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
          --primary: ${colors.primary};
          --secondary: ${colors.secondary};
          --accent: ${colors.accent};
          --background: ${colors.background};
          --text: ${colors.text};
          --border: ${colors.border};
          --heading-font: '${fonts.heading.family}', 'Noto Sans', sans-serif;
          --body-font: '${fonts.body.family}', 'Noto Sans', sans-serif;
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
          padding: 36px;
          background: linear-gradient(180deg, #fff 0%, #fff 100%);
        }

        .header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 20px;
          border-bottom: 2px solid var(--border);
          padding-bottom: 18px;
          margin-bottom: 24px;
        }

        .brand {
          display: flex;
          align-items: center;
          gap: 16px;
        }

        .brand-mark {
          width: 56px;
          height: 56px;
          border-radius: 14px;
          background: linear-gradient(135deg, var(--primary) 0%, var(--accent) 100%);
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-weight: 800;
          font-size: 20px;
          font-family: var(--heading-font);
        }

        h1, h2, h3, h4 {
          margin: 0;
          font-family: var(--heading-font);
          color: var(--secondary);
        }

        .title-block h1 {
          font-size: ${fonts.heading.size}px;
          line-height: 1.2;
        }

        .title-block p {
          margin: 6px 0 0;
          color: #4b5563;
          font-size: ${fonts.body.size + 1}px;
        }

        .meta {
          display: flex;
          flex-direction: column;
          gap: 8px;
          text-align: right;
          font-size: 12px;
          color: #374151;
        }

        .summary {
          display: grid;
          grid-template-columns: 1.3fr 0.7fr;
          gap: 20px;
          margin-bottom: 24px;
        }

        .category {
          margin-top: 24px;
          padding: 12px;
          border-radius: 8px;
        }

        .category.bg-subtle { background: rgba(15,23,42,0.02); }
        .category.bg-card { background: #ffffff; box-shadow: 0 1px 0 rgba(0,0,0,0.02); border: 1px solid var(--border); }
        .category.bg-none { background: transparent; box-shadow: none; border: none; padding: 0; }

        .category.divider-line h3 { border-bottom: 1px solid var(--border); padding-bottom: 8px; }
        .category.divider-dashed h3 { border-bottom: 1px dashed var(--border); padding-bottom: 8px; }
        .category.divider-none h3 { border-bottom: none; padding-bottom: 0; margin-bottom: 8px; }

        .category.density-compact { padding: 6px; gap: 6px; --item-padding: 8px; --line-height: 1.1; }
        .category.density-normal { padding: 12px; gap: 12px; --item-padding: 14px; --line-height: 1.4; }
        .category.density-relaxed { padding: 18px; gap: 18px; --item-padding: 18px; --line-height: 1.7; }

        .menu-item { padding: var(--item-padding, 14px); line-height: var(--line-height, 1.5); }

        .category h3 {
          font-size: 22px;
          margin-bottom: 12px;
          border-bottom: 1px solid var(--border);
          padding-bottom: 8px;
        }

        .grid-2col {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px 18px;
        }

        .menu-item {
          border: 1px solid var(--border);
          border-radius: 12px;
          background: #fff;
          padding: 14px 16px;
        }

        .menu-item-header {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          gap: 12px;
        }

        .menu-item-header h4 {
          font-size: 18px;
          font-family: var(--heading-font);
        }

        .menu-item-header strong {
          color: var(--primary);
          font-size: 16px;
          white-space: nowrap;
        }

        .menu-item p {
          margin: 8px 0 10px;
          color: #4b5563;
          font-size: 12px;
          line-height: 1.5;
          font-family: var(--body-font);
        }

        .tags {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
        }

        .tags span {
          display: inline-block;
          background: rgba(245, 158, 11, 0.12);
          color: var(--secondary);
          border-radius: 999px;
          padding: 4px 8px;
          font-size: 10px;
          font-weight: 700;
        }

        .qr-card {
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 14px;
          text-align: center;
          background: #fafafa;
        }

        .qr-box {
          width: 150px;
          height: 150px;
          margin: 0 auto 8px;
          border: 1px solid var(--border);
          background: repeating-linear-gradient(45deg, #fff, #fff 8px, #f3f4f6 8px, #f3f4f6 16px);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 10px;
          color: #374151;
        }

        .qr-text {
          display: inline-block;
          font-size: 11px;
          color: #374151;
          font-weight: 600;
        }

        .empty-state {
          border: 1px dashed var(--border);
          border-radius: 10px;
          padding: 24px;
          text-align: center;
          color: #6b7280;
        }
      </style>
    </head>
    <body>
      <div class="page">
        <header class="header">
          <div class="brand">
            <div class="brand-mark">${escapeHtml((branding.name || 'R')[0].toUpperCase())}</div>
            <div class="title-block">
              <h1>${pageTitle}</h1>
              <p>${pageSubtitle}</p>
            </div>
          </div>

          <div class="meta">
            ${branding.phone ? `<span>Phone: ${escapeHtml(branding.phone)}</span>` : ''}
            ${branding.location ? `<span>Location: ${escapeHtml(branding.location)}</span>` : ''}
            ${branding.name ? `<span>Brand: ${escapeHtml(branding.name)}</span>` : ''}
          </div>
        </header>

        <div class="summary">
          <div>
            <h2>${escapeHtml(title || branding.name || 'Menu')}</h2>
            <p style="margin: 8px 0 0; color: #4b5563; font-size: 13px;">Prepared for dine-in, takeaway, and digital ordering.</p>
          </div>
          <div>${qrMarkup}</div>
        </div>

        <main>
          ${categoryMarkup}
        </main>
      </div>
    </body>
  </html>`;
}

module.exports = renderDefaultMenu;
