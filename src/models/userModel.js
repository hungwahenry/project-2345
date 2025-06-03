//src/models/userModel.js
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: [true, 'Username is required'],
    unique: true,
    lowercase: true,
    trim: true,
    validate: {
      validator: function(v) {
        return !/\s/.test(v); // No spaces allowed
      },
      message: 'Username cannot contain spaces'
    }
  },
email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    validate: {
      validator: function(v) {
        return /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/.test(v);
      },
      message: 'Please enter a valid email address'
    }
  },
  emailVerified: {
    type: Boolean,
    default: false
  },
  emailVerificationToken: {
    token: String,
    expiresAt: Date
  },
  passwordHash: {
    type: String,
    required: [true, 'Password is required']
  },
  avatarUrl: String,
  createdAt: {
    type: Date,
    default: Date.now
  },
  lastActive: Date,
  isActive: {
    type: Boolean,
    default: true
  },
  isAdmin: {
    type: Boolean,
    default: false
  },
  blockedUsers: [{
    type: mongoose.Schema.ObjectId,
    ref: 'User'
  }],
  keywordFilters: [String],
  accountRecoveryTokens: [{
    token: String,
    createdAt: Date,
    used: {
      type: Boolean,
      default: false
    }
  }],
  activeSessions: [{
    sessionId: String,
    deviceInfo: String,
    ipAddress: String,
    lastActive: Date
  }],
  settings: {
    notificationPreferences: {
      reactions: {
        type: Boolean,
        default: true
      },
      comments: {
        type: Boolean,
        default: true
      },
      mentions: {
        type: Boolean,
        default: true
      },
      system: {
        type: Boolean,
        default: true
      }
    },
    contentFilters: {
      contentFiltering: {
        type: Boolean,
        default: true
      },
      showSensitiveContent: {
        type: Boolean,
        default: false
      }
    },
    darkMode: {
      type: Boolean,
      default: false
    },
    dataCollection: {
      type: Boolean,
      default: true
    }
  },
  activityMetrics: {
    totalPosts: {
      type: Number,
      default: 0
    },
    totalComments: {
      type: Number,
      default: 0
    },
    totalReactionsGiven: {
      type: Number,
      default: 0
    },
    totalReactionsReceived: {
      type: Number,
      default: 0
    }
  },
  contentSettings: {
    defaultVisibility: {
      type: String,
      enum: ['public', 'limited'],
      default: 'public'
    },
    autoModeration: {
      type: Boolean,
      default: true
    }
  }
});

// Hash password before saving
userSchema.pre('save', async function(next) {
  // Only hash the password if it's modified or new
  if (!this.isModified('passwordHash')) return next();
  
  try {
    const salt = await bcrypt.genSalt(10);
    this.passwordHash = await bcrypt.hash(this.passwordHash, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Method to check if password is correct
userSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.passwordHash);
};

// Pre-save middleware to handle sanitization
userSchema.pre('save', function(next) {
  // Ensure keywordFilters are all lowercase for consistent matching
  if (this.isModified('keywordFilters')) {
    this.keywordFilters = this.keywordFilters.map(keyword => keyword.toLowerCase());
  }
  
  next();
});

userSchema.index(
    { username: 'text' },
    { name: "user_search_index" }
  );

const User = mongoose.model('User', userSchema);

module.exports = User;