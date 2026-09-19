const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email address'],
    },
    password: {
      type: String,
      required: true,
      minlength: 8,
      select: false,
    },
    role: {
      type: String,
      enum: ['user', 'admin'],
      default: 'user',
    },
    profile: {
      firstName: String,
      lastName: String,
      avatar: String,
      phone: String,
    },
    addresses: [
      {
        type: { type: String, enum: ['home', 'work', 'other'], default: 'home' },
        street: { type: String, required: true },
        city: { type: String, required: true },
        state: String,
        zipCode: String,
        country: { type: String, required: true },
        isDefault: { type: Boolean, default: false },
      },
    ],
    settings: {
      notifications: {
        email: { type: Boolean, default: true },
        sms: { type: Boolean, default: true },
        promotional: { type: Boolean, default: true },
        orderUpdates: { type: Boolean, default: true },
      },
    },
    refreshToken: { type: String, select: false },
    refreshTokenExpiry: { type: Date, select: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model('User', userSchema);
