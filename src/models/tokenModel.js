// src/models/tokenModel.js
const mongoose = require('mongoose');

const tokenSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.ObjectId,
    ref: 'User',
    required: true
  },
  token: {
    type: String,
    required: true
  },
  type: {
    type: String,
    enum: ['access', 'refresh'],
    required: true
  },
  expiresAt: {
    type: Date,
    required: true
  },
  deviceInfo: String,
  ipAddress: String,
  isRevoked: {
    type: Boolean,
    default: false
  }
});

const Token = mongoose.model('Token', tokenSchema);

module.exports = Token;