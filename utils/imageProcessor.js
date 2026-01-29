// utils/imageProcessor.js
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

exports.processImage = async ({
  buffer,
  folder,
  filename,
  width = 800,
  height = 800,
  quality = 90,
}) => {
  const uploadPath = path.join('uploads', 'img', folder);

  if (!fs.existsSync(uploadPath)) {
    fs.mkdirSync(uploadPath, { recursive: true });
  }

  await sharp(buffer)
    .resize(width, height, {
      fit: 'cover',
      position: 'center',
    })
    .toFormat('jpeg')
    .jpeg({ quality })
    .toFile(path.join(uploadPath, filename));
};
