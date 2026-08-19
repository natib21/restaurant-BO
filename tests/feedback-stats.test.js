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
      });
      expect(imageData.url).toBe('/api/v1/files/6a421b0c03d39206c382def0/content');
      expect(imageData.id).toBe('6a421b0c03d39206c382def0');
    });

    it('returns null when image is missing', () => {
      const imageData = resolveSingleImageData({
        image: null,
      });
      expect(imageData).toBe(null);
    });

    it('preserves absolute origin for public menu responses', () => {
      const imageData = resolveSingleImageData({
        image: '6a421b0c03d39206c382def0',
        origin: 'http://localhost:4000',
      });
      expect(imageData.url).toBe('http://localhost:4000/api/v1/files/6a421b0c03d39206c382def0/content');
    });

    it('maps image collections to FileAsset URLs', () => {
      const imagesData = resolveImageCollectionData(
        ['6a421b0c03d39206c382def0', { _id: '6a421b0c03d39206c382def1' }],
        { origin: 'http://localhost:4000' }
      );
      expect(imagesData).toHaveLength(2);
      expect(imagesData[0].url).toBe('http://localhost:4000/api/v1/files/6a421b0c03d39206c382def0/content');
      expect(imagesData[1].url).toBe('http://localhost:4000/api/v1/files/6a421b0c03d39206c382def1/content');
    });
  });
});
