// scripts/createSuperAdmin.js
require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid'); // You may need to install this: npm install uuid

// Connect to database
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => {
  console.log('Connected to MongoDB');
  createSuperAdmin();
}).catch(err => {
  console.error('MongoDB connection error:', err);
  process.exit(1);
});

async function createSuperAdmin() {
  try {
    // Make sure we have User model
    const User = require('../src/models/userModel');
    
    // Generate a secure random password if none is provided
    const password = process.env.SUPER_ADMIN_PASSWORD || uuidv4().substring(0, 8);
    
    // Hash the password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);
    
    // Create or update the super admin
    const username = 'superadmin';
    
    // Check if superadmin already exists
    const existingAdmin = await User.findOne({ username });
    
    if (existingAdmin) {
      console.log('Super admin already exists, updating...');
      // Update directly to bypass the pre-save hook
      await User.updateOne(
        { _id: existingAdmin._id },
        { 
          $set: { 
            passwordHash: passwordHash,
            isAdmin: true,
            isActive: true 
          } 
        }
      );
      console.log('Super admin updated successfully');
    } else {
      // Create a new super admin without triggering the pre-save hook
      const adminData = {
        username,
        passwordHash,
        isAdmin: true,
        isActive: true,
        avatarUrl: `https://api.dicebear.com/6.x/thumbs/svg?seed=${username}`,
        lastActive: new Date(),
        createdAt: new Date(),
        settings: {
          notificationPreferences: {
            reactions: true,
            comments: true,
            mentions: true,
            system: true
          },
          contentFilters: {
            contentFiltering: true,
            showSensitiveContent: false
          },
          darkMode: true,
          dataCollection: true
        },
        activityMetrics: {
          totalPosts: 0,
          totalComments: 0,
          totalReactionsGiven: 0,
          totalReactionsReceived: 0
        },
        contentSettings: {
          defaultVisibility: 'public',
          autoModeration: true
        }
      };
      
      // Insert directly into the database to bypass middleware
      await User.collection.insertOne(adminData);
      console.log('Super admin created successfully');
    }
    
    // Display the credentials
    console.log('----------------------------------------');
    console.log('SUPER ADMIN CREDENTIALS:');
    console.log('Username:', username);
    console.log('Password:', password);
    console.log('----------------------------------------');
    console.log('SAVE THESE CREDENTIALS SECURELY!');
    
    // Close the connection
    mongoose.connection.close();
    console.log('MongoDB connection closed');
  } catch (error) {
    console.error('Error creating super admin:', error);
    mongoose.connection.close();
    process.exit(1);
  }
}