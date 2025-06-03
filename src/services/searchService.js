// src/services/searchService.js
const Post = require('../models/postModel');
const User = require('../models/userModel');

/**
 * Search posts
 * @param {String} query - Search query
 * @param {Object} options - Search options (pagination, etc.)
 * @param {Object} user - Current user (for filtering)
 * @returns {Promise<Object>} Search results
 */
exports.searchPosts = async (query, options = {}, user = null) => {
  try {
    const { 
      from = 0, 
      size = 15, 
      sortBy = 'relevance',
      language = null
    } = options;
    
    // Build search query
    let searchQuery = { $text: { $search: query }, visibility: 'public' };
    
    // Add language filter if specified
    if (language) {
      searchQuery.language = language;
    }
    
    // Add user filter if authenticated
    if (user && user.blockedUsers && user.blockedUsers.length > 0) {
      searchQuery.userId = { $nin: user.blockedUsers };
    }
    
    // Define sort options
    let sortOptions = {};
    if (sortBy === 'recent') {
      sortOptions = { createdAt: -1 };
    } else if (sortBy === 'engagement') {
      sortOptions = { engagementScore: -1 };
    } else {
      // Default relevance sorting with recency boost
      sortOptions = { 
        score: { $meta: "textScore" },
        createdAt: -1 
      };
    }
    
    // Execute search
    const totalCount = await Post.countDocuments(searchQuery);
    
    let posts;
    if (sortBy === 'relevance') {
      posts = await Post.find(searchQuery, { score: { $meta: "textScore" } })
        .sort(sortOptions)
        .skip(parseInt(from))
        .limit(parseInt(size))
        .lean();
    } else {
      posts = await Post.find(searchQuery)
        .sort(sortOptions)
        .skip(parseInt(from))
        .limit(parseInt(size))
        .lean();
    }
    
    return {
      results: posts,
      total: totalCount,
      hasMore: posts.length === parseInt(size)
    };
  } catch (error) {
    console.error('Post search error:', error);
    throw error;
  }
};

/**
 * Search users
 * @param {String} query - Search query
 * @param {Object} options - Search options (pagination, etc.)
 * @returns {Promise<Object>} Search results
 */
exports.searchUsers = async (query, options = {}) => {
  try {
    const { from = 0, size = 15 } = options;
    
    // Execute search
    const totalCount = await User.countDocuments({
      $text: { $search: query },
      isActive: true
    });
    
    const users = await User.find(
      { $text: { $search: query }, isActive: true },
      { score: { $meta: "textScore" }, 
        username: 1, 
        avatarUrl: 1, 
        createdAt: 1,
        activityMetrics: 1
      }
    )
    .sort({ score: { $meta: "textScore" } })
    .skip(parseInt(from))
    .limit(parseInt(size))
    .lean();
    
    return {
      results: users,
      total: totalCount,
      hasMore: users.length === parseInt(size)
    };
  } catch (error) {
    console.error('User search error:', error);
    throw error;
  }
};

/**
 * Search hashtags
 * @param {String} query - Search query
 * @param {Object} options - Search options
 * @returns {Promise<Object>} Search results
 */
exports.searchHashtags = async (query, options = {}) => {
  try {
    const { size = 10 } = options;
    
    // MongoDB aggregation to find matching hashtags and their counts
    const hashtags = await Post.aggregate([
      { $match: { visibility: 'public' } },
      { $unwind: '$hashtags' },
      { $match: { hashtags: new RegExp(query, 'i') } },
      { $group: { _id: '$hashtags', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: parseInt(size) },
      { $project: { hashtag: '$_id', count: 1, _id: 0 } }
    ]);
    
    return {
      results: hashtags,
      total: hashtags.length
    };
  } catch (error) {
    console.error('Hashtag search error:', error);
    throw error;
  }
};

/**
 * Get trending hashtags
 * @param {Object} options - Options (timeframe, limit)
 * @returns {Promise<Array>} Trending hashtags
 */
exports.getTrendingHashtags = async (options = {}) => {
  try {
    const { timeframe = '24h', limit = 10 } = options;
    
    // Calculate timeframe
    const now = new Date();
    let startTime;
    
    if (timeframe === '24h') {
      startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    } else if (timeframe === '7d') {
      startTime = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    } else {
      startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000); // Default to 24h
    }
    
    // Aggregate hashtags in posts from the given timeframe
    const hashtags = await Post.aggregate([
      { 
        $match: { 
          visibility: 'public',
          createdAt: { $gte: startTime }
        } 
      },
      { $unwind: '$hashtags' },
      { $group: { _id: '$hashtags', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: parseInt(limit) },
      { $project: { hashtag: '$_id', count: 1, _id: 0 } }
    ]);
    
    return hashtags;
  } catch (error) {
    console.error('Error getting trending hashtags:', error);
    throw error;
  }
};