// scripts/seedCategories.js
require('dotenv').config();
const mongoose = require('mongoose');

// Connect to database
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => {
  console.log('Connected to MongoDB');
  seedCategories();
}).catch(err => {
  console.error('MongoDB connection error:', err);
  process.exit(1);
});

async function seedCategories() {
  try {
    // Make sure we have Category model
    const Category = require('../src/models/categoryModel');
    
    // Initial categories (these match what was hardcoded before)
    const initialCategories = [
      { 
        slug: 'tech', 
        name: 'Technology', 
        description: 'Latest tech trends and news',
        hashtags: ['tech', 'technology', 'coding', 'programming'],
        displayOrder: 1
      },
      { 
        slug: 'creative', 
        name: 'Creative', 
        description: 'Art, writing, music, and creative endeavors',
        hashtags: ['art', 'music', 'writing', 'creative'],
        displayOrder: 2
      },
      { 
        slug: 'discussion', 
        name: 'Discussion', 
        description: 'Thoughtful conversations and debates',
        hashtags: ['discussion', 'debate', 'thoughts', 'opinion'],
        displayOrder: 3
      },
      { 
        slug: 'humor', 
        name: 'Humor', 
        description: 'Jokes, memes, and funny content',
        hashtags: ['funny', 'joke', 'meme', 'humor'],
        displayOrder: 4
      },
      { 
        slug: 'news', 
        name: 'News', 
        description: 'Current events and headlines',
        hashtags: ['news', 'current', 'events', 'update'],
        displayOrder: 5
      },
      { 
        slug: 'personal', 
        name: 'Personal', 
        description: 'Life experiences and stories',
        hashtags: ['personal', 'life', 'story', 'experience'],
        displayOrder: 6
      },
      { 
        slug: 'questions', 
        name: 'Questions', 
        description: 'Seeking answers and advice',
        hashtags: ['question', 'help', 'advice', 'query'],
        displayOrder: 7
      },
      { 
        slug: 'random', 
        name: 'Random', 
        description: 'Miscellaneous content that defies categorization',
        hashtags: [],
        displayOrder: 8
      }
    ];
    
    // Count existing categories
    const count = await Category.countDocuments();
    
    if (count === 0) {
      // Insert all categories
      await Category.insertMany(initialCategories);
      console.log(`${initialCategories.length} categories seeded successfully`);
    } else {
      console.log(`Database already has ${count} categories. No seeding necessary.`);
    }
    
    // Close the connection
    mongoose.connection.close();
    console.log('MongoDB connection closed');
  } catch (error) {
    console.error('Error seeding categories:', error);
    mongoose.connection.close();
    process.exit(1);
  }
}