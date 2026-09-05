const puppeteer = require('puppeteer');
const path = require('path');
const QRCode = require('qrcode');
const AppError = require('../../../../utils/appError');

// Filesystem directory where font .woff2 files are stored for self-hosting
const fontsDir = path.join(__dirname, '../../../../assets/fonts');

const PAPER_SIZES = {
  a4: { width: 210, height: 297 },
  a5: { width: 148, height: 210 },
  letter: { width: 216, height: 279 },
  legal: { width: 216, height: 356 },
  tabloid: { width: 279, height: 432 },
};

const mmToPx = (mm) => ((mm / 25.4) * 96);

const escapeHtml = (value = '') =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

const getQrMarkup = async (qrCodeData) => {
  if (!qrCodeData) return '';

  const encoded = typeof qrCodeData === 'string' ? qrCodeData : qrCodeData.data || '';
  if (!encoded) return '';

  try {
    const dataUrl = await QRCode.toDataURL(String(encoded), {
      errorCorrectionLevel: 'H',
      type: 'image/png',
      margin: 1,
      scale: 6,
    });

    return `
      <div class="qr-card">
        <div class="qr-box" aria-label="QR code"><img src="${dataUrl}" alt="QR code" style="width:100%;height:100%;object-fit:contain;border-radius:4px" /></div>
        <span class="qr-text">Scan to open menu</span>
      </div>
    `;
  } catch (err) {
    try {
      console.warn('menu-pdf.qrcode_failed', err.message || err);
    } catch (ignore) {}
    return '';
  }
};

const normalizeSettings = (settings = {}) => {
  if (!settings || typeof settings !== 'object') {
    throw new AppError('Invalid menu settings payload', 400);
  }

  const normalized = {
    ...settings,
    templateId: settings.templateId || 'default-menu',
    paperSize: settings.paperSize || 'a4',
    orientation: settings.orientation || 'portrait',
    colors: {
      primary: settings.colors?.primary || '#1f2937',
      secondary: settings.colors?.secondary || '#0f172a',
      accent: settings.colors?.accent || '#f59e0b',
      background: settings.colors?.background || '#ffffff',
      text: settings.colors?.text || '#111827',
      border: settings.colors?.border || '#e5e7eb',
      ...settings.colors,
    },
    fonts: {
      heading: {
        family: settings.fonts?.heading?.family || 'Noto Sans',
        size: settings.fonts?.heading?.size || 24,
        weight: settings.fonts?.heading?.weight || 700,
      },
      body: {
        family: settings.fonts?.body?.family || 'Noto Sans',
        size: settings.fonts?.body?.size || 14,
        weight: settings.fonts?.body?.weight || 400,
      },
      accent: {
        family: settings.fonts?.accent?.family || 'Noto Sans Ethiopic',
        size: settings.fonts?.accent?.size || 18,
        weight: settings.fonts?.accent?.weight || 600,
      },
      ...settings.fonts,
    },
    branding: {
      name: settings.branding?.name || 'Restaurant Menu',
      logoUrl: settings.branding?.logoUrl || '',
      coverImageUrl: settings.branding?.coverImageUrl || '',
      phone: settings.branding?.phone || '',
      location: settings.branding?.location || '',
      accent: settings.branding?.accent || '#f59e0b',
      ...settings.branding,
    },
    margins: {
      top: settings.margins?.top ?? settings.margin?.top ?? 12,
      right: settings.margins?.right ?? settings.margin?.right ?? 12,
      bottom: settings.margins?.bottom ?? settings.margin?.bottom ?? 12,
      left: settings.margins?.left ?? settings.margin?.left ?? 12,
    },
    categories: Array.isArray(settings.categories) ? settings.categories : [],
    items: Array.isArray(settings.items) ? settings.items : [],
  };

  return normalized;
};

const resolvePaperDimensions = (paperSize, orientation) => {
  const resolved =
    typeof paperSize === 'string' ? PAPER_SIZES[paperSize] || PAPER_SIZES.a4 : paperSize || PAPER_SIZES.a4;

  if (!resolved || !resolved.width || !resolved.height) {
    throw new AppError('Unsupported paper size or invalid paper dimensions', 400);
  }

  const widthMm = orientation === 'landscape' ? resolved.height : resolved.width;
  const heightMm = orientation === 'landscape' ? resolved.width : resolved.height;

  return {
    widthMm,
    heightMm,
    widthPx: mmToPx(widthMm),
    heightPx: mmToPx(heightMm),
  };
};

const buildMenuItems = (items = [], layout = 'grid-2col') => {
  if (!items.length) {
    return '<div class="empty-state">No menu items available.</div>';
  }

  return items
    .map((item) => {
      const name = escapeHtml(item.name || 'Menu item');
      const description = escapeHtml(item.description || '');
      const price = item.price ?? item.unitPrice ?? 0;
      const priceText = Number(price) ? `${Number(price).toFixed(2)}` : '—';
      const tags = Array.isArray(item.tags) ? item.tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join('') : '';

      // layout-specific renderings
      if (layout === 'list-with-photos') {
        const thumb = item.photoUrl ? `<div class="thumb"><img src="${escapeHtml(item.photoUrl)}" style="width:100%;height:100%;object-fit:cover" /></div>` : `<div class="thumb"></div>`;
        return `
          <article class="menu-item">
            ${thumb}
            <div class="menu-item-copy">
              <div class="menu-item-header">
                <h4>${name}</h4>
                <strong>${priceText}</strong>
              </div>
              ${description ? `<p>${description}</p>` : ''}
              ${tags ? `<div class="tags">${tags}</div>` : ''}
            </div>
          </article>
        `;
      }

      if (layout === 'compact-price-list') {
        return `
          <article class="menu-item compact-item-row">
            <div class="compact-item">
              <span class="name">${name}</span>
              <span class="dots" aria-hidden="true"></span>
              <strong class="price">${priceText}</strong>
            </div>
            ${description ? `<p>${description}</p>` : ''}
          </article>
        `;
      }

      // default: grid-2col
      return `
        <article class="menu-item">
          <div class="menu-item-copy">
            <div class="menu-item-header">
              <h4>${name}</h4>
              <strong>${priceText}</strong>
            </div>
            ${description ? `<p>${description}</p>` : ''}
            ${tags ? `<div class="tags">${tags}</div>` : ''}
          </div>
        </article>
      `;
    })
    .join('');
};

const buildCategories = (categories = []) => {
  if (!categories.length) {
    return '';
  }

  return categories
    .map((category) => {
      const name = escapeHtml(category.name || 'Category');
      const layout = (category.layout || 'grid-2col');
      const layoutClass = layout === 'list-with-photos' ? 'list-with-photos' : layout === 'compact-price-list' ? 'compact-price-list' : 'grid-2col';
      const items = buildMenuItems(category.items || [], layout);

      // backgroundTint: accept hex or keywords 'subtle'|'card'|'none'
      const bg = category.backgroundTint || 'none';
      const bgClass = typeof bg === 'string' && bg.startsWith('#') ? '' : bg === 'subtle' ? 'bg-subtle' : bg === 'card' ? 'bg-card' : bg === 'none' ? 'bg-none' : '';
      const bgStyle = typeof bg === 'string' && bg.startsWith('#') ? `style="background:${escapeHtml(bg)}"` : '';

      // divider style
      const divider = category.dividerStyle || 'line';
      const dividerClass = divider === 'none' ? 'divider-none' : divider === 'dashed' ? 'divider-dashed' : 'divider-line';

      // density
      const density = category.density || 'normal';
      const densityClass = density === 'compact' ? 'density-compact' : density === 'relaxed' ? 'density-relaxed' : 'density-normal';

      return `
        <section class="category ${bgClass} ${dividerClass} ${densityClass}" ${bgStyle}>
          <h3>${name}</h3>
          <div class="${layoutClass}">${items}</div>
        </section>
      `;
    })
    .join('');
};

const renderMenuHtml = async (settings) => {
  const normalized = normalizeSettings(settings);
  const { colors, fonts, branding, categories, items, qrCodeData } = normalized;
  const categoryMarkup = buildCategories(categories.length ? categories : [{ name: 'Menu', items }]);
  const qrMarkup = await getQrMarkup(qrCodeData);
  const title = escapeHtml(normalized.title || branding.name || 'Restaurant Menu');
  const subtitle = escapeHtml(normalized.subtitle || 'Freshly prepared dishes & beverages');

  // Build file:// URLs for local fonts (convert backslashes to forward slashes)
  const notoSansReg = `file://${path.join(fontsDir, 'NotoSans-Regular.woff2').replace(/\\/g, '/')}`;
  const notoSansBold = `file://${path.join(fontsDir, 'NotoSans-Bold.woff2').replace(/\\/g, '/')}`;
  const notoEthiopicReg = `file://${path.join(fontsDir, 'NotoSansEthiopic-Regular.woff2').replace(/\\/g, '/')}`;
  const notoEthiopicBold = `file://${path.join(fontsDir, 'NotoSansEthiopic-Bold.woff2').replace(/\\/g, '/')}`;

  return `<!DOCTYPE html>
  <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>${title}</title>
      <style>
        /* Self-hosted fonts (place .woff2 files under assets/fonts) */
        @font-face {
          font-family: 'Noto Sans';
          font-style: normal;
          font-weight: 400;
          src: url('${notoSansReg}') format('woff2');
          font-display: swap;
        }
        @font-face {
          font-family: 'Noto Sans';
          font-style: normal;
          font-weight: 700;
          src: url('${notoSansBold}') format('woff2');
          font-display: swap;
        }
        @font-face {
          font-family: 'Noto Sans Ethiopic';
          font-style: normal;
          font-weight: 400;
          src: url('${notoEthiopicReg}') format('woff2');
          font-display: swap;
        }
        @font-face {
          font-family: 'Noto Sans Ethiopic';
          font-style: normal;
          font-weight: 700;
          src: url('${notoEthiopicBold}') format('woff2');
          font-display: swap;
        }

        :root {
          --primary: ${colors.primary};
          --secondary: ${colors.secondary};
          --accent: ${colors.accent};
          --background: ${colors.background};
          --text: ${colors.text};
          --border: ${colors.border};
          --heading-font: '${fonts.heading.family}', 'Noto Sans', sans-serif;
          --body-font: '${fonts.body.family}', 'Noto Sans', sans-serif;
          --ethiopic-font: 'Noto Sans Ethiopic', 'Noto Sans', sans-serif;
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

        /* Background tint keywords */
        .category.bg-subtle { background: rgba(15,23,42,0.02); }
        .category.bg-card { background: #ffffff; box-shadow: 0 1px 0 rgba(0,0,0,0.02); border: 1px solid var(--border); }
        .category.bg-none { background: transparent; box-shadow: none; border: none; padding: 0; }

        /* Divider styles for heading */ 
        .category.divider-line h3 { border-bottom: 1px solid var(--border); padding-bottom: 8px; }
        .category.divider-dashed h3 { border-bottom: 1px dashed var(--border); padding-bottom: 8px; }
        .category.divider-none h3 { border-bottom: none; padding-bottom: 0; margin-bottom: 8px; }

        /* Density controls */
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

        /* Layout variants for category item lists */
        .grid-2col {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px 18px;
        }

        .list-with-photos {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .list-with-photos .menu-item {
          display: flex;
          gap: 12px;
          align-items: flex-start;
        }
        .list-with-photos .menu-item .thumb {
          width: 84px;
          height: 84px;
          flex: 0 0 84px;
          border-radius: 8px;
          overflow: hidden;
          background: #f3f4f6;
        }
        .list-with-photos .menu-item .menu-item-copy { flex: 1; }

        .compact-price-list {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .compact-price-list .compact-item {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .compact-price-list .compact-item .name { white-space: nowrap; font-weight: 600; }
        .compact-price-list .compact-item .dots { flex: 1; border-bottom: 1px dotted var(--border); margin: 0 8px; height: 0; }
        .compact-price-list .compact-item .price { white-space: nowrap; }

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
          font-family: var(--body-font);
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
          word-break: break-all;
          padding: 10px;
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
              <h1>${title}</h1>
              <p>${subtitle}</p>
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
            <h2>${escapeHtml(normalized.title || branding.name || 'Menu')}</h2>
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
};

class MenuPdfService {
  static browser = null;

  static async getBrowser() {
    if (this.browser && this.browser.isConnected()) {
      return this.browser;
    }

    const browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-web-security',
      ],
    });

    this.browser = browser;
    return browser;
  }

  static async renderMenuPdf(settings, options = {}) {
    if (!settings || typeof settings !== 'object') {
      throw new AppError('Menu settings are required to render a PDF', 400);
    }

    const normalized = normalizeSettings(settings);
    const { widthPx, heightPx, widthMm, heightMm } = resolvePaperDimensions(
      normalized.paperSize,
      normalized.orientation
    );

    const browser = await this.getBrowser();
    let page;

    try {
      page = await browser.newPage();
      await page.setViewport({
        width: Math.ceil(widthPx) + 120,
        height: Math.ceil(heightPx) + 120,
        deviceScaleFactor: 1,
      });

      const html = await renderMenuHtml(normalized);
      await page.setContent(html, { waitUntil: 'networkidle0' });
      await page.evaluate(async () => {
        if (document.fonts && typeof document.fonts.ready !== 'undefined') {
          await document.fonts.ready;
        }
      });

      const margins = normalized.margins || {};
      const pdfBuffer = await page.pdf({
        width: `${widthPx}px`,
        height: `${heightPx}px`,
        printBackground: true,
        preferCSSPageSize: false,
        landscape: normalized.orientation === 'landscape',
        margin: {
          top: `${(margins.top ?? 12) * 3.78}px`,
          right: `${(margins.right ?? 12) * 3.78}px`,
          bottom: `${(margins.bottom ?? 12) * 3.78}px`,
          left: `${(margins.left ?? 12) * 3.78}px`,
        },
      });

      if (!pdfBuffer || pdfBuffer.length === 0) {
        throw new AppError('PDF generation returned no bytes', 500);
      }

      return {
        buffer: pdfBuffer,
        widthMm,
        heightMm,
      };
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }

      if (error.message && error.message.includes('timeout')) {
        throw new AppError('PDF render timed out while generating the menu preview', 504);
      }

      if (error.message && error.message.includes('Failed to launch')) {
        throw new AppError('Failed to launch Chromium for PDF rendering', 500);
      }

      throw new AppError(`PDF rendering failed: ${error.message || 'Unknown error'}`, 500);
    } finally {
      if (page && typeof page.close === 'function') {
        await page.close();
      }
    }
  }
}

module.exports = {
  MenuPdfService,
  renderMenuHtml,
  normalizeSettings,
  resolvePaperDimensions,
};
