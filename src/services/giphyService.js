// src/services/giphyService.js
const axios = require('axios');
const config = require('../config/config');

/**
 * Search for GIFs using Giphy API
 * @param {String} query - Search query
 * @param {Number} limit - Maximum number of results to return
 * @param {Number} offset - Pagination offset
 * @returns {Promise<Object>} Search results
 */
exports.searchGifs = async (query, limit = 20, offset = 0) => {
  try {
    const response = await axios.get('https://api.giphy.com/v1/gifs/search', {
      params: {
        api_key: config.giphy.apiKey,
        q: query,
        limit,
        offset,
        rating: config.giphy.contentRating || 'pg-13'
      }
    });

    return {
      gifs: response.data.data.map(gif => ({
        id: gif.id,
        url: gif.images.fixed_height.url,
        previewUrl: gif.images.fixed_height_small.url,
        width: parseInt(gif.images.fixed_height.width),
        height: parseInt(gif.images.fixed_height.height)
      })),
      pagination: response.data.pagination,
      total: response.data.pagination.total_count
    };
  } catch (error) {
    console.error('Giphy API error:', error);
    throw error;
  }
};

/**
 * Get trending GIFs from Giphy API
 * @param {Number} limit - Maximum number of results to return
 * @returns {Promise<Object>} Trending GIFs
 */
exports.getTrendingGifs = async (limit = 20) => {
  try {
    const response = await axios.get('https://api.giphy.com/v1/gifs/trending', {
      params: {
        api_key: config.giphy.apiKey,
        limit,
        rating: config.giphy.contentRating || 'pg-13'
      }
    });

    return {
      gifs: response.data.data.map(gif => ({
        id: gif.id,
        url: gif.images.fixed_height.url,
        previewUrl: gif.images.fixed_height_small.url,
        width: parseInt(gif.images.fixed_height.width),
        height: parseInt(gif.images.fixed_height.height)
      })),
      pagination: response.data.pagination
    };
  } catch (error) {
    console.error('Giphy API error:', error);
    throw error;
  }
};

/**
 * Get GIF by ID from Giphy API
 * @param {String} gifId - Giphy GIF ID
 * @returns {Promise<Object>} GIF details
 */
exports.getGifById = async (gifId) => {
  try {
    const response = await axios.get(`https://api.giphy.com/v1/gifs/${gifId}`, {
      params: {
        api_key: config.giphy.apiKey
      }
    });

    const gif = response.data.data;
    return {
      id: gif.id,
      url: gif.images.fixed_height.url,
      originalUrl: gif.images.original.url,
      previewUrl: gif.images.fixed_height_small.url,
      width: parseInt(gif.images.fixed_height.width),
      height: parseInt(gif.images.fixed_height.height),
      title: gif.title
    };
  } catch (error) {
    console.error('Giphy API error:', error);
    throw error;
  }
};