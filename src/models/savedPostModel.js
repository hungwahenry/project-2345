// src/models/savedPostModel.js
const mongoose = require('mongoose');

const savedPostSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.ObjectId,
    ref: 'User',
    required: true
  },
  postId: {
    type: mongoose.Schema.ObjectId,
    ref: 'Post',
    required: true
  },
  savedAt: {
    type: Date,
    default: Date.now
  }
});

// Compound index to ensure a user can only save a post once
savedPostSchema.index({ userId: 1, postId: 1 }, { unique: true });

const SavedPost = mongoose.model('SavedPost', savedPostSchema);

module.exports = SavedPost;