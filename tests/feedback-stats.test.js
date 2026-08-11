const feedbackRepository = require('../src/modules/feedback/repository/feedback.repository');
const {
  resolveSingleImageData,
  resolveImageCollectionData,
} = require('../src/modules/menu/utils/image-response');

describe('feedback repository & menu image response helpers', () => {
  describe('feedback repository methods exist', () => {
    it('exposes getStats as a function', () => {
      expect(typeof feedbackRepository.getStats).toBe('function');
    });
  });

  describe('menu image response helpers', () => {
    it('builds a public FileAsset URL for object id strings', () => {
      const imageData = resolveSingleImageData({
        image: '6a421b0c03d39206c382def0',
        imageFilename: 'default-menu-item.jpg',
        legacyBasePath: '/img/menu',
      });
      expect(imageData.url).toBe('/api/v1/files/6a421b0c03d39206c382def0/content');
      expect(imageData.id).toBe('6a421b0c03d39206c382def0');
    });

    it('falls back to the static menu filename when image is missing', () => {
      const imageData = resolveSingleImageData({
        image: null,
        imageFilename: 'default-menu-item.jpg',
        legacyBasePath: '/img/menu',
      });
      expect(imageData.url).toBe('/img/menu/default-menu-item.jpg');
      expect(imageData.filename).toBe('default-menu-item.jpg');
    });

    it('preserves absolute origin for public menu responses', () => {
      const imageData = resolveSingleImageData({
        image: null,
        imageFilename: 'menu-merchant-1.jpeg',
        legacyBasePath: '/img/menu',
        origin: 'http://localhost:4000',
      });
      expect(imageData.url).toBe('http://localhost:4000/img/menu/menu-merchant-1.jpeg');
    });

    it('maps mixed image collections to usable URLs', () => {
      const imagesData = resolveImageCollectionData(
        [
          '6a421b0c03d39206c382def0',
          { _id: '6a421b0c03d39206c382def1' },
          'legacy-menu.jpeg',
        ],
        { legacyBasePath: '/img/menu' }
      );
      expect(imagesData).toHaveLength(3);
      expect(imagesData[0].url).toBe('/api/v1/files/6a421b0c03d39206c382def0/content');
      expect(imagesData[1].url).toBe('/api/v1/files/6a421b0c03d39206c382def1/content');
      expect(imagesData[2].url).toBe('/img/menu/legacy-menu.jpeg');
    });
  });
});
