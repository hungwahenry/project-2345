// src/models/commentModel.js
const mongoose = require('mongoose');

const commentSchema = new mongoose.Schema({
  postId: {
    type: mongoose.Schema.ObjectId,
    ref: 'Post',
    required: true
  },
  userId: {
    type: mongoose.Schema.ObjectId,
    ref: 'User',
    required: true
  },
  username: {
    type: String,
    required: true
  },
  content: {
    type: String,
    maxlength: 500
  },
  gifUrl: String,
  gifId: String, // Add this to store the Giphy ID
  parentId: {
    type: mongoose.Schema.ObjectId,
    ref: 'Comment',
    default: null
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  },
  reactions: {
    "❤️": {
      type: Number,
      default: 0
    },
    "👍": {
      type: Number,
      default: 0
    },
    "😂": {
      type: Number,
      default: 0
    },
    "😮": {
      type: Number,
      default: 0
    },
    "🙌": {
      type: Number,
      default: 0
    }
  },
  reactionUsers: {
    "❤️": [{
      type: mongoose.Schema.ObjectId,
      ref: 'User'
    }],
    "👍": [{
      type: mongoose.Schema.ObjectId,
      ref: 'User'
    }],
    "😂": [{
      type: mongoose.Schema.ObjectId,
      ref: 'User'
    }],
    "😮": [{
      type: mongoose.Schema.ObjectId,
      ref: 'User'
    }],
    "🙌": [{
      type: mongoose.Schema.ObjectId,
      ref: 'User'
    }]
  },
  isModerated: {
    type: Boolean,
    default: false
  },
  moderationReason: String,
  visibility: {
    type: String,
    enum: ['public', 'moderated', 'deleted'],
    default: 'public'
  }
});

// Update timestamps on content change
commentSchema.pre('save', function(next) {
  if (this.isModified('content') || this.isModified('gifUrl')) {
    this.updatedAt = Date.now();
  }
  next();
});

// Validate that either content or gifUrl is provided
commentSchema.pre('validate', function(next) {
  if ((!this.content || this.content.trim() === '') && !this.gifUrl) {
    this.invalidate('content', 'Comment must contain either text content or a GIF');
  }
  next();
});

const Comment = mongoose.model('Comment', commentSchema);

module.exports = Comment;