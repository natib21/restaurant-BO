const mongoose = require('mongoose');
const slugify = require('slugify');

const sizeSchema = mongoose.Schema({
  size: {
    type: String,
    enum: {
      values: ['small', 'medium', 'large'],
      message: 'Size is either: small,medium or large',
    },
  },
  price: { type: Number },
});
const menuSchema = mongoose.Schema({
  name: {
    type: String,
<<<<<<< HEAD
    required: [true, 'Name Must Be State'],
    unique: true 
=======
    required: [true, 'Menu Item Must Have Name'],
    unique: true,
    trim: true,
  },
  slug: String,
  description: {
    type: String,
    trim: true,
>>>>>>> e9875a42fd4fb105e576b93c6a71c2b733fc6e82
  },
  price: {
    type: Number,
<<<<<<< HEAD
    required: [true, 'Price Must be set'],
=======
    required: [true, 'Menu Item Must Have Price'],
>>>>>>> e9875a42fd4fb105e576b93c6a71c2b733fc6e82
    default: 0,
  },
  available: {
    type: Boolean,
    required: [true, 'Availability Must Be Stated'],
    default: true,
<<<<<<< HEAD
  },
  ingredients: [String],
  categories: String,
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
=======
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
    default: 'defaultFood.jpg',
    required: [true, 'Menu Item Must Have Image'],
  },
  prep_time: {
    type: String,
    required: [true, 'Menu Item Must Have include time'],
    default: '20 min',
  },
  sizes: {
    type: [sizeSchema],
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
>>>>>>> e9875a42fd4fb105e576b93c6a71c2b733fc6e82
});

const Menu = mongoose.model('Menu', menuSchema);

module.exports = Menu;
