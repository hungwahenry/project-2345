// src/models/reportModel.js
const mongoose = require('mongoose');

const reportSchema = new mongoose.Schema({
  contentType: {
    type: String,
    enum: ['post', 'comment', 'user'],
    required: true
  },
  contentId: {
    type: mongoose.Schema.ObjectId,
    required: true,
    refPath: 'contentType'
  },
  reporterId: {
    type: mongoose.Schema.ObjectId,
    ref: 'User',
    required: true
  },
  reason: {
    type: String,
    required: true,
    enum: [
      'harassment',
      'spam',
      'inappropriate',
      'violence',
      'misinformation',
      'copyright',
      'other'
    ]
  },
  details: {
    type: String,
    maxlength: 500
  },
  status: {
    type: String,
    enum: ['pending', 'reviewed', 'actioned', 'dismissed'],
    default: 'pending'
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  reviewedAt: Date,
  reviewedBy: {
    type: mongoose.Schema.ObjectId,
    ref: 'User'
  },
  actionTaken: String
});

// Compound index for efficiently retrieving reports by status
reportSchema.index({ status: 1, createdAt: -1 });

// Ensure a user can only report a specific content once
reportSchema.index({ contentType: 1, contentId: 1, reporterId: 1 }, { unique: true });

const Report = mongoose.model('Report', reportSchema);

module.exports = Report;