const mongoose = require('mongoose');

const sizeSchema = mongoose.Schema({
  size: { type: String, required: true },
  price: { type: Number, required: true },
});
const menuSchema = mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Name Must Be State'],
    unique: true,
  },
  description: String,
  price: {
    type: Number,
    required: [true, 'Price Must be set'],
    default: 0,
  },
  available: {
    type: Boolean,
    required: [true, 'Availability Must Be Stated'],
    default: true,
  },
  ingredients: [String],
  category: String,
  image: {
    type: String,
    required: [true, 'Food Must Have An Image'],
  },
  prep_time: {
    type: String,
    required: [true, 'Time Must Be Included'],
    default: '20 min',
  },
  sizes: {
    type: [sizeSchema],
    required: true,
  },
  averageRating: {
    type: Number,
    default: 0,
  },
  createdAt: {
    type: Date,
    default: Date.now(),
  },
});

const Menu = mongoose.model('Menu', menuSchema);

module.exports = Menu;
