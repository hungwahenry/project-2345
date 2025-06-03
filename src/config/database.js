// src/config/database.js
const mongoose = require('mongoose');
const config = require('./config');

const connectDB = async () => {
    try {
      if (!config.mongodb.uri) {
        throw new Error("MongoDB URI is not defined in .env");
      }
  
      await mongoose.connect(config.mongodb.uri, config.mongodb.options);
      console.log('✅ MongoDB connected successfully');
    } catch (error) {
      console.error('❌ MongoDB connection error:', error);
      process.exit(1);
    }
  };  

module.exports = connectDB;