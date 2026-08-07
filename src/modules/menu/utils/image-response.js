const OBJECT_ID_REGEX = /^[a-f\d]{24}$/i;

function normalizeOrigin(origin = '') {
  return origin.endsWith('/') ? origin.slice(0, -1) : origin;
}

function buildFileAssetUrl(id, origin = '') {
  return `${normalizeOrigin(origin)}/api/v1/files/${id}/content`;
}

function buildStaticAssetUrl(basePath, filename, origin = '') {
  return `${normalizeOrigin(origin)}${basePath}/${filename}`;
}

function isPopulatedFileAsset(value) {
  return Boolean(value && typeof value === 'object' && value._id);
}

function isObjectIdLike(value) {
  return typeof value === 'string' && OBJECT_ID_REGEX.test(value);
}

function resolveSingleImageData({
  image,
  imageFilename,
  imageUrl,
  legacyBasePath,
  origin = '',
}) {
  if (isPopulatedFileAsset(image)) {
    return {
      id: String(image._id),
      url: buildFileAssetUrl(image._id, origin),
      originalName: image.originalName,
      mimeType: image.mimeType,
      sizeBytes: image.sizeBytes,
      createdAt: image.createdAt,
    };
  }

  if (image) {
    const imageValue = String(image);

    if (isObjectIdLike(imageValue)) {
      return {
        id: imageValue,
        url: buildFileAssetUrl(imageValue, origin),
      };
    }

    return {
      filename: imageValue,
      url: buildStaticAssetUrl(legacyBasePath, imageValue, origin),
    };
  }

  if (imageUrl) {
    return { url: imageUrl };
  }

  if (imageFilename) {
    return {
      filename: imageFilename,
      url: buildStaticAssetUrl(legacyBasePath, imageFilename, origin),
    };
  }

  return null;
}

function resolveImageCollectionData(images, { legacyBasePath, origin = '' }) {
  if (!Array.isArray(images) || images.length === 0) {
    return [];
  }

  return images.map((image) =>
    resolveSingleImageData({
      image,
      legacyBasePath,
      origin,
    })
  );
}

module.exports = {
  buildFileAssetUrl,
  buildStaticAssetUrl,
  resolveSingleImageData,
  resolveImageCollectionData,
};
