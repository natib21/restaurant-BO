const mongoose = require("mongoose");

const merchantSchema = new mongoose.Schema({
  businessName: {
    type: String,
    required: [true, "Business name is required"],
    trim: true,
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
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
  },
  phone: {
    type: String,
    required: true,
    unique: true,
  },
  address: {
    street: String,
    city: String,
    state: String,
    postalCode: String,
    country: { type: String, default: "Ethiopia" }, // adapt to your target
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
  openingHours: {
    type: Map,
    of: String, 
    // e.g. { monday: "9:00-22:00", tuesday: "9:00-22:00", ... }
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
