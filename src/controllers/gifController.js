// src/controllers/gifController.js
const giphyService = require('../services/giphyService');

/**
 * Search for GIFs
 * @route GET /api/gifs/search
 */
exports.searchGifs = async (req, res) => {
  try {
    const { q, limit = 20, offset = 0 } = req.query;
    
    if (!q || q.trim() === '') {
      return res.status(400).json({
        success: false,
        data: null,
        message: 'Search query is required',
        error: {
          code: 'GIF_001',
          details: 'A search term must be provided'
        },
        meta: {}
      });
    }
    
    const results = await giphyService.searchGifs(
      q.trim(),
      parseInt(limit),
      parseInt(offset)
    );
    
    res.status(200).json({
      success: true,
      data: { 
        gifs: results.gifs,
        total: results.total 
      },
      message: 'GIFs retrieved successfully',
      error: null,
      meta: {
        pagination: {
          offset: parseInt(offset),
          limit: parseInt(limit),
          total: results.total,
          count: results.gifs.length
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      data: null,
      message: 'Failed to search GIFs',
      error: {
        code: 'SERVER_001',
        details: error.message
      },
      meta: {}
    });
  }
};

/**
 * Get trending GIFs
 * @route GET /api/gifs/trending
 */
exports.getTrendingGifs = async (req, res) => {
  try {
    const { limit = 20 } = req.query;
    
    const results = await giphyService.getTrendingGifs(parseInt(limit));
    
    res.status(200).json({
      success: true,
      data: { gifs: results.gifs },
      message: 'Trending GIFs retrieved successfully',
      error: null,
      meta: {
        count: results.gifs.length
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      data: null,
      message: 'Failed to retrieve trending GIFs',
      error: {
        code: 'SERVER_001',
        details: error.message
      },
      meta: {}
    });
  }
};

/**
 * Get GIF by ID
 * @route GET /api/gifs/:id
 */
exports.getGifById = async (req, res) => {
  try {
    const { id } = req.params;
    
    const gif = await giphyService.getGifById(id);
    
    res.status(200).json({
      success: true,
      data: { gif },
      message: 'GIF retrieved successfully',
      error: null,
      meta: {}
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      data: null,
      message: 'Failed to retrieve GIF',
      error: {
        code: 'SERVER_001',
        details: error.message
      },
      meta: {}
    });
  }
};