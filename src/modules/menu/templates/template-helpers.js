/**
 * @file src/modules/menu/templates/template-helpers.js
 * @description Shared utilities for all templates
 */

const QRCode = require('qrcode');
const path = require('path');

const fontsDir = path.join(__dirname, '../../../assets/fonts');

/**
 * Escape HTML to prevent XSS
 */
const escapeHtml = (value = '') =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

/**
 * Generate QR code markup
 */
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
        <div class="qr-box" aria-label="QR code">
          <img src="${dataUrl}" alt="QR code" style="width:100%;height:100%;object-fit:contain;border-radius:4px" />
        </div>
        <span class="qr-text">Scan to open menu</span>
      </div>
    `;
  } catch (err) {
    console.warn('QR code generation failed:', err.message);
    return '';
  }
};

/**
 * Build menu items HTML
 */
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
      const tags = Array.isArray(item.tags)
        ? item.tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join('')
        : '';

      // Different layouts
      if (layout === 'list-with-photos') {
        const thumb = item.photoUrl
          ? `<div class="thumb"><img src="${escapeHtml(item.photoUrl)}" style="width:100%;height:100%;object-fit:cover" /></div>`
          : `<div class="thumb"></div>`;
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

      // Default: grid-2col
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

/**
 * Build categories HTML
 */
const buildCategories = (categories = []) => {
  if (!categories.length) {
    return '';
  }

  return categories
    .map((category) => {
      const name = escapeHtml(category.name || 'Category');
      const layout = category.layout || 'grid-2col';
      const layoutClass = layout === 'list-with-photos' ? 'list-with-photos' : layout === 'compact-price-list' ? 'compact-price-list' : 'grid-2col';
      const items = buildMenuItems(category.items || [], layout);

      const bg = category.backgroundTint || 'none';
      const bgClass = typeof bg === 'string' && bg.startsWith('#') ? '' : bg === 'subtle' ? 'bg-subtle' : bg === 'card' ? 'bg-card' : bg === 'none' ? 'bg-none' : '';
      const bgStyle = typeof bg === 'string' && bg.startsWith('#') ? `style="background:${escapeHtml(bg)}"` : '';

      const divider = category.dividerStyle || 'line';
      const dividerClass = divider === 'none' ? 'divider-none' : divider === 'dashed' ? 'divider-dashed' : 'divider-line';

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

/**
 * Get font URLs (self-hosted)
 */
const getFontUrls = () => {
  const notoSansReg = `file://${path.join(fontsDir, 'NotoSans-Regular.woff2').replace(/\\/g, '/')}`;
  const notoSansBold = `file://${path.join(fontsDir, 'NotoSans-Bold.woff2').replace(/\\/g, '/')}`;
  const notoEthiopicReg = `file://${path.join(fontsDir, 'NotoSansEthiopic-Regular.woff2').replace(/\\/g, '/')}`;
  const notoEthiopicBold = `file://${path.join(fontsDir, 'NotoSansEthiopic-Bold.woff2').replace(/\\/g, '/')}`;

  return { notoSansReg, notoSansBold, notoEthiopicReg, notoEthiopicBold };
};

/**
 * Build font face CSS
 */
const buildFontFaces = () => {
  const { notoSansReg, notoSansBold, notoEthiopicReg, notoEthiopicBold } = getFontUrls();

  return `
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
  `;
};

module.exports = {
  escapeHtml,
  getQrMarkup,
  buildMenuItems,
  buildCategories,
  getFontUrls,
  buildFontFaces,
};
