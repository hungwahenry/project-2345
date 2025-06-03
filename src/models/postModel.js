// src/models/postModel.js
const mongoose = require('mongoose');

const postSchema = new mongoose.Schema({
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
    required: true,
    maxlength: 1000
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  },
  hashtags: [String],
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
  commentCount: {
    type: Number,
    default: 0
  },
  contentWarning: String,
  isModerated: {
    type: Boolean,
    default: false
  },
  moderationReason: String,
  visibility: {
    type: String,
    enum: ['public', 'moderated', 'deleted'],
    default: 'public'
  },
  impressionCount: {
    type: Number,
    default: 0
  },
  shareCount: {
    type: Number,
    default: 0
  },
  engagementScore: {
    type: Number,
    default: 0
  },
  language: {
    type: String,
    default: 'en'
  },
  geoTag: String,
  edits: [{
    timestamp: Date,
    reason: {
      type: String,
      enum: ['moderation', 'user-initiated']
    }
  }],
  saveCount: {
    type: Number,
    default: 0
  }
});

// Pre-save middleware to extract hashtags from content
postSchema.pre('save', function(next) {
  if (this.isModified('content')) {
    // Extract hashtags using regex
    const hashtagRegex = /#(\w+)/g;
    const hashtags = [];
    let match;
    
    while ((match = hashtagRegex.exec(this.content)) !== null) {
      hashtags.push(match[1].toLowerCase());
    }
    
    // Filter out duplicates
    this.hashtags = [...new Set(hashtags)];
    
    // Update updatedAt timestamp
    this.updatedAt = Date.now();
  }
  next();
});

// Methods to update engagement score
postSchema.methods.updateEngagementScore = function() {
  // Simple engagement score calculation
  const reactionTotal = 
    (this.reactions["❤️"] || 0) + 
    (this.reactions["👍"] || 0) + 
    (this.reactions["😂"] || 0) + 
    (this.reactions["😮"] || 0) + 
    (this.reactions["🙌"] || 0);
  
  const ageInHours = (Date.now() - this.createdAt) / (1000 * 60 * 60);
  const decayFactor = Math.exp(-ageInHours / 24); // 24-hour half-life
  
  this.engagementScore = (
    (reactionTotal * 1) + 
    ((this.commentCount || 0) * 2) + 
    ((this.shareCount || 0) * 3) + 
    ((this.impressionCount || 0) * 0.1)
  ) * decayFactor;
  
  return this.engagementScore;
};

postSchema.index(
    { content: 'text', hashtags: 'text', username: 'text' },
    {
      weights: {
        content: 3,
        hashtags: 10,
        username: 5
      },
      name: "post_search_index"
    }
  );
const Post = mongoose.model('Post', postSchema);

module.exports = Post;