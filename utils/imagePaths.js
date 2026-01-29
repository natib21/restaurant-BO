// utils/imagePaths.js
exports.buildImageName = ({ prefix, ownerId, name }) => {
  const safeName = (name || 'image').replace(/\s+/g, '_').toLowerCase();

  return `${prefix}-${ownerId}-${safeName}-${Date.now()}.jpeg`;
};
