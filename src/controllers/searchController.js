// src/controllers/searchController.js
const searchService = require('../services/searchService');
const Post = require('../models/postModel');
const { filterPostsForUser } = require('../utils/postUtils');

/**
 * Search posts
 * @route GET /api/search/posts
 */
exports.searchPosts = async (req, res) => {
  try {
    const { q, cursor, limit = 15, sortBy = 'relevance', language } = req.query;
    const user = req.user;
    
    if (!q || q.trim() === '') {
      return res.status(400).json({
        success: false,
        data: null,
        message: 'Search query is required',
        error: {
          code: 'SEARCH_001',
          details: 'A search term must be provided'
        },
        meta: {}
      });
    }
    
    // Convert cursor to 'from' parameter for pagination
    let from = 0;
    if (cursor) {
      from = parseInt(cursor);
    }
    
    const searchResults = await searchService.searchPosts(
      q.trim(),
      {
        from,
        size: parseInt(limit),
        sortBy,
        language
      },
      user
    );
    
    // Get the next cursor
    const nextCursor = from + searchResults.results.length;
    
    res.status(200).json({
      success: true,
      data: { results: searchResults.results },
      message: 'Search completed successfully',
      error: null,
      meta: {
        pagination: {
          nextCursor: searchResults.hasMore ? nextCursor.toString() : null,
          hasMore: searchResults.hasMore,
          total: searchResults.total
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      data: null,
      message: 'Search failed',
      error: {
        code: 'SERVER_001',
        details: error.message
      },
      meta: {}
    });
  }
};

/**
 * Search users
 * @route GET /api/search/users
 */
exports.searchUsers = async (req, res) => {
  try {
    const { q, cursor, limit = 15 } = req.query;
    
    if (!q || q.trim() === '') {
      return res.status(400).json({
        success: false,
        data: null,
        message: 'Search query is required',
        error: {
          code: 'SEARCH_001',
          details: 'A search term must be provided'
        },
        meta: {}
      });
    }
    
    // Convert cursor to 'from' parameter for pagination
    let from = 0;
    if (cursor) {
      from = parseInt(cursor);
    }
    
    const searchResults = await searchService.searchUsers(
      q.trim(),
      {
        from,
        size: parseInt(limit)
      }
    );
    
    // Get the next cursor
    const nextCursor = from + searchResults.results.length;
    
    res.status(200).json({
      success: true,
      data: { results: searchResults.results },
      message: 'Search completed successfully',
      error: null,
      meta: {
        pagination: {
          nextCursor: searchResults.hasMore ? nextCursor.toString() : null,
          hasMore: searchResults.hasMore,
          total: searchResults.total
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      data: null,
      message: 'Search failed',
      error: {
        code: 'SERVER_001',
        details: error.message
      },
      meta: {}
    });
  }
};

/**
 * Search hashtags
 * @route GET /api/search/hashtags
 */
exports.searchHashtags = async (req, res) => {
  try {
    const { q, limit = 10 } = req.query;
    
    if (!q || q.trim() === '') {
      return res.status(400).json({
        success: false,
        data: null,
        message: 'Search query is required',
        error: {
          code: 'SEARCH_001',
          details: 'A search term must be provided'
        },
        meta: {}
      });
    }
    
    const searchResults = await searchService.searchHashtags(
      q.trim(),
      { size: parseInt(limit) }
    );
    
    res.status(200).json({
      success: true,
      data: { results: searchResults.results },
      message: 'Search completed successfully',
      error: null,
      meta: {
        total: searchResults.total
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      data: null,
      message: 'Search failed',
      error: {
        code: 'SERVER_001',
        details: error.message
      },
      meta: {}
    });
  }
};

/**
 * Get trending hashtags
 * @route GET /api/trending/hashtags
 */
exports.getTrendingHashtags = async (req, res) => {
  try {
    const { timeframe = '24h', limit = 10 } = req.query;
    
    // Validate timeframe
    const validTimeframes = ['24h', '7d'];
    if (!validTimeframes.includes(timeframe)) {
      return res.status(400).json({
        success: false,
        data: null,
        message: 'Invalid timeframe',
        error: {
          code: 'SEARCH_002',
          details: 'Timeframe must be one of: 24h, 7d'
        },
        meta: {}
      });
    }
    
    const trendingHashtags = await searchService.getTrendingHashtags({
      timeframe,
      limit: parseInt(limit)
    });
    
    res.status(200).json({
      success: true,
      data: { hashtags: trendingHashtags },
      message: 'Trending hashtags retrieved successfully',
      error: null,
      meta: {
        timeframe
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      data: null,
      message: 'Failed to retrieve trending hashtags',
      error: {
        code: 'SERVER_001',
        details: error.message
      },
      meta: {}
    });
  }
};

/**
 * Get categories
 * @route GET /api/categories
 */
exports.getCategories = async (req, res) => {
    try {
      // Get categories from database instead of hardcoding
      const Category = require('../models/categoryModel');
      
      // Only get active categories for public API
      const categories = await Category.find({ isActive: true })
        .sort({ displayOrder: 1, name: 1 })
        .select('slug name description')
        .lean();
      
      // Transform to match the expected response format
      const formattedCategories = categories.map(category => ({
        id: category.slug,
        name: category.name,
        description: category.description
      }));
      
      res.status(200).json({
        success: true,
        data: { categories: formattedCategories },
        message: 'Categories retrieved successfully',
        error: null,
        meta: {}
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        data: null,
        message: 'Failed to retrieve categories',
        error: {
          code: 'SERVER_001',
          details: error.message
        },
        meta: {}
      });
    }
  };
  
  /**
   * Get posts by category
   * @route GET /api/categories/:id/posts
   */
  exports.getCategoryPosts = async (req, res) => {
    try {
      const { id } = req.params;
      const { cursor, limit = 15 } = req.query;
      const user = req.user;
      
      // Get category from database
      const Category = require('../models/categoryModel');
      const category = await Category.findOne({ slug: id, isActive: true });
      
      if (!category) {
        return res.status(404).json({
          success: false,
          data: null,
          message: 'Category not found',
          error: {
            code: 'SEARCH_003',
            details: 'The requested category does not exist'
          },
          meta: {}
        });
      }
      
      // Use hashtags from the database category
      const categoryHashtags = category.hashtags;
      
      // Base query
      let query = { 
        visibility: 'public'
      };
      
      // Add hashtag filter if applicable
      if (categoryHashtags && categoryHashtags.length > 0) {
        query.hashtags = { $in: categoryHashtags };
      }
      
      // Apply cursor-based pagination if cursor is provided
      if (cursor) {
        query._id = { $lt: cursor };
      }
      
      // Get posts
      const posts = await Post.find(query)
        .sort({ createdAt: -1 })
        .limit(parseInt(limit) + 1) // Get one extra to determine if there are more
        .lean();
      
      // Determine if there are more posts
      const hasMore = posts.length > parseInt(limit);
      
      // Remove the extra post if there are more
      if (hasMore) {
        posts.pop();
      }
      
      // Filter posts based on user preferences if authenticated
      const filteredPosts = user ? filterPostsForUser(posts, user) : posts;
      
      // Get the next cursor
      const nextCursor = filteredPosts.length > 0 
        ? filteredPosts[filteredPosts.length - 1]._id 
        : null;
      
      res.status(200).json({
        success: true,
        data: { posts: filteredPosts },
        message: 'Category posts retrieved successfully',
        error: null,
        meta: {
          pagination: {
            nextCursor: nextCursor,
            hasMore: hasMore
          },
          category: id
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        data: null,
        message: 'Failed to retrieve category posts',
        error: {
          code: 'SERVER_001',
          details: error.message
        },
        meta: {}
      });
    }
  };