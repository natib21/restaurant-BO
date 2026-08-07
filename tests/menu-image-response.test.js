const {
  resolveSingleImageData,
  resolveImageCollectionData,
} = require('../src/modules/menu/utils/image-response');

describe('menu image response helpers', () => {
  it('builds a public FileAsset URL for object id strings', () => {
    const imageData = resolveSingleImageData({
      image: '6a421b0c03d39206c382def0',
      legacyBasePath: '/img/menu',
    });

    expect(imageData).toEqual({
      id: '6a421b0c03d39206c382def0',
      url: '/api/v1/files/6a421b0c03d39206c382def0/content',
    });
  });

  it('falls back to the static menu filename when image is missing', () => {
    const imageData = resolveSingleImageData({
      image: null,
      imageFilename: 'default-menu-item.jpg',
      legacyBasePath: '/img/menu',
    });

    expect(imageData).toEqual({
      filename: 'default-menu-item.jpg',
      url: '/img/menu/default-menu-item.jpg',
    });
  });

  it('preserves absolute origin for public menu responses', () => {
    const imageData = resolveSingleImageData({
      image: null,
      imageFilename: 'default-menu-item.jpg',
      legacyBasePath: '/img/menu',
      origin: 'https://example.com',
    });

    expect(imageData.url).toBe('https://example.com/img/menu/default-menu-item.jpg');
  });

  it('maps mixed image collections to usable URLs', () => {
    const imagesData = resolveImageCollectionData(
      [
        '6a421b0c03d39206c382def0',
        'legacy-item.jpg',
      ],
      { legacyBasePath: '/img/menu' }
    );

    expect(imagesData).toEqual([
      {
        id: '6a421b0c03d39206c382def0',
        url: '/api/v1/files/6a421b0c03d39206c382def0/content',
      },
      {
        filename: 'legacy-item.jpg',
        url: '/img/menu/legacy-item.jpg',
      },
    ]);
  });
});
