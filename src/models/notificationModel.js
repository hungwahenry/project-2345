// src/models/notificationModel.js
const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  type: {
    type: String,
    enum: ['reaction', 'comment', 'reply', 'mention', 'system'],
    required: true
  },
  actorId: {
    type: mongoose.Schema.ObjectId,
    ref: 'User'
  },
  actorUsername: {
    type: String
  },
  contentRef: {
    type: {
      type: String,
      enum: ['post', 'comment'],
      required: true
    },
    id: {
      type: mongoose.Schema.ObjectId,
      required: true,
      refPath: 'contentRef.type'
    }
  },
  message: {
    type: String,
    required: true
  },
  read: {
    type: Boolean,
    default: false
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  actionable: {
    type: Boolean,
    default: true
  },
  actionLink: String,
  actionLabel: String
});

// Index for efficient queries
notificationSchema.index({ userId: 1, read: 1, createdAt: -1 });

const Notification = mongoose.model('Notification', notificationSchema);

module.exports = Notification;