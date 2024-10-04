const mongoose = require('mongoose');

const sizeSchema = mongoose.Schema({
  size: { type: String, required: true },
  price: { type: Number, required: true },
});
const menuSchema = mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Name Must Be State'],
  },
  description: String,
  price: {
    type: Number,
    required: [true, 'Price Must be set'],
  },
  available: {
    type: Boolean,
    required: [true, 'Availability Must Be Stated'],
  },
  ingredients: [String],
  categories: String,
  image: String,
  prep_time: {
    type: String,
    required: [true, 'Time Must Be Included'],
  },
  sizes: { type: [sizeSchema], required: true },
});

const Menu = mongoose.model('Menu', menuSchema);

module.exports = Menu;
