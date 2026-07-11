const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  username: { 
    type: String, 
    required: true, 
    unique: true 
  },
  email: { 
    type: String, 
    required: true, 
    unique: true 
  },
  password: { 
    type: String, 
    required: true,
    minlength: 1
  },
  role: { 
    type: String, 
    enum: ['user', 'admin'], 
    default: 'user' 
  },
  profile: {
    firstName: String,
    lastName: String,
    avatar: String,
    phone: String
  },
  addresses: [{
    type: { type: String, enum: ['home', 'work', 'other'] },
    street: String,
    city: String,
    state: String,
    zipCode: String,
    country: String,
    isDefault: Boolean
  }],
  wishlist: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Products' }],
  settings: {
    notifications: {
      email: { type: Boolean, default: true },
      sms: { type: Boolean, default: true },
      promotional: { type: Boolean, default: true },
      orderUpdates: { type: Boolean, default: true }
    }
  },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('User', userSchema);