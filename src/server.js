//src/server.js
require('dotenv').config();
const http = require('http');
const app = require('./app');
const config = require('./config/config');
const connectDB = require('./config/database');
const { initializeWebSocket } = require('./websocket');
const mongoose = require('mongoose');

// Connect to database
connectDB().then(() => {
  console.log('MongoDB connected successfully');
  
  // Start server after DB connection
  startServer();
}).catch(err => {
  console.error('MongoDB connection error:', err);
  process.exit(1);
});

// Function to start server
const startServer = async () => {
  // Create HTTP server
  const server = http.createServer(app);

  // Initialize WebSocket
  const io = initializeWebSocket(server);

  // Make io accessible throughout the application
  app.set('io', io);

  // Start server
  server.listen(config.port, () => {
    console.log(`Lowercase API running on port ${config.port} in ${config.environment} mode`);
    console.log(`WebSocket server initialized`);
  });

  // Handle server shutdown
  const handleShutdown = async (signal) => {
    console.log(`${signal} received. Shutting down gracefully...`);
    
    server.close(() => {
      console.log('HTTP server closed');
      
      // Close database connection
      try {
        mongoose.connection.close();
        console.log('MongoDB connection closed');
      } catch (err) {
        console.error('Error closing MongoDB connection:', err);
      }
      
      console.log('Server shutdown complete');
      process.exit(0);
    });
    
    // Force shutdown after 10 seconds
    setTimeout(() => {
      console.error('Forcing shutdown after timeout');
      process.exit(1);
    }, 10000);
  };

  // Handle various shutdown signals
  process.on('SIGTERM', () => handleShutdown('SIGTERM'));
  process.on('SIGINT', () => handleShutdown('SIGINT'));

  // Handle unhandled promise rejections
  process.on('unhandledRejection', (err) => {
    console.log('UNHANDLED REJECTION! 💥');
    console.error(err.name, err.message);
    // Don't crash in production, but log the error
    if (config.environment === 'development') {
      server.close(() => {
        process.exit(1);
      });
    }
  });

  // Handle uncaught exceptions
  process.on('uncaughtException', (err) => {
    console.log('UNCAUGHT EXCEPTION! 💥');
    console.error(err.name, err.message);
    // Always crash on uncaught exceptions as the app state is unreliable
    server.close(() => {
      process.exit(1);
    });
  });
};