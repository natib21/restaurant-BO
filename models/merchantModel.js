const mongoose = require("mongoose");

const merchantSchema = new mongoose.Schema({
  businessName: {
    type: String,
    required: [true, "Business name is required"],
    trim: true,
    unique:true
  },
  legalName: {
    type: String,
    trim: true,
    default: "", // optional company registration name
  },
  ownerName: {
    type: String,
    trim: true,
  },
  phone: {
    type: String,
    required: true,
    unique: true,
  },
  location: {
    street: String,
    city: String,
    subCity: String,
    country: { type: String, default: "Ethiopia" },
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point',
      },
      coordinates: {
        type: [Number], // [longitude, latitude]
        required: true,
      },
    },
  cuisineType: {
    type: [String], // e.g. ["Italian", "Fast Food"]
    default: [],
  },
  logo: {
    type: String, // image URL
  },
  coverImage: {
    type: String, // for customer-facing app branding
  },
  
  subscriptionPlan: {
    type: String,
    enum: ["free", "basic", "pro", "enterprise"],
    default: "free",
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

const Merchant = mongoose.model("Merchant", merchantSchema);
module.exports = Merchant;
