const mongoose = require('mongoose');

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
  spice_level: String,
  image: String,
  prep_time: {
    type: String,
    required: [true, 'Time Must Be Included'],
  },
});

const Menu = mongoose.model('Menu', menuSchema);

module.exports = Menu;
