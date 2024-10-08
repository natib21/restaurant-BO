const mongoose = require('mongoose');
const slugify = require('slugify');

const sizeSchema = mongoose.Schema({
  size: {
    type: String,
    required: true,
    enum: {
      values: ['small', 'medium', 'large'],
      message: 'Size is either: small,medium or large',
    },
  },
  price: { type: Number, required: true },
});
const menuSchema = mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Menu Item Must Have Name'],
    unique: true,
    trim: true,
  },
  slug: String,
  description: {
    type: String,
    trim: true,
  },
  price: {
    type: Number,
    required: [true, 'Menu Item Must Have Price'],
    default: 0,
  },
  available: {
    type: Boolean,
    required: [true, 'Availability Must Be Stated'],
    default: true,
  },
  isSpecial: {
    type: Boolean,
    default: false,
  },
  specialOfferDetails: {
    type: String,
    trim: true,
  },
  ingredients: [String],
  category: String,
  image: {
    type: String,
    required: [true, 'Menu Item Must Have Image'],
  },
  prep_time: {
    type: String,
    required: [true, 'Menu Item Must Have include time'],
    default: '20 min',
  },
  sizes: {
    type: [sizeSchema],
    required: true,
  },
  averageRating: {
    type: Number,
    default: 0,
    min: [1, 'Ratting Must Be above 1.0 '],
    max: [5, 'Ratting Must Be below 5.0 '],
  },
  ratingQuantity: {
    type: Number,
    default: 0,
  },
  createdAt: {
    type: Date,
    default: Date.now(),
    select: false,
  },
});

menuSchema.pre('save', function (next) {
  this.slug = slugify(this.name, { lower: true });
  next();
});

const Menu = mongoose.model('Menu', menuSchema);

module.exports = Menu;
