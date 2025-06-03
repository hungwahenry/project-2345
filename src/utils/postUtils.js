// src/utils/postUtils.js
/**
 * Extract hashtags from post content
 * @param {String} content - Post content
 * @returns {Array} Array of hashtags
 */
const extractHashtags = (content) => {
    const hashtagRegex = /#(\w+)/g;
    const hashtags = [];
    let match;
    
    while ((match = hashtagRegex.exec(content)) !== null) {
      hashtags.push(match[1].toLowerCase());
    }
    
    // Filter out duplicates
    return [...new Set(hashtags)];
  };
  
  /**
   * Check if content contains sensitive keywords
   * @param {String} content - Post or comment content
   * @param {Array} keywords - List of sensitive keywords
   * @returns {Boolean} True if content contains sensitive keywords
   */
  const containsSensitiveContent = (content, keywords) => {
    if (!keywords || keywords.length === 0) return false;
    
    const contentLower = content.toLowerCase();
    return keywords.some(keyword => contentLower.includes(keyword.toLowerCase()));
  };
  
  /**
   * Detect language of content (simplified version)
   * @param {String} content - Post or comment content
   * @returns {String} Detected language code
   */
  const detectLanguage = (content) => {
    // In a real implementation, this would use a language detection library
    // For now, we'll return English as default
    return 'en';
  };
  
  /**
   * Filter posts based on user preferences
   * @param {Array} posts - Array of posts
   * @param {Object} user - User object
   * @returns {Array} Filtered posts
   */
  const filterPostsForUser = (posts, user) => {
    if (!user) return posts.filter(post => post.visibility === 'public');
    
    return posts.filter(post => {
      // Filter out posts from blocked users
      if (user.blockedUsers.some(id => id.toString() === post.userId.toString())) {
        return false;
      }
      
      // Filter out posts with sensitive content if user has that setting
      if (user.settings.contentFilters.contentFiltering) {
        if (post.contentWarning && !user.settings.contentFilters.showSensitiveContent) {
          return false;
        }
        
        if (user.keywordFilters && user.keywordFilters.length > 0) {
          if (containsSensitiveContent(post.content, user.keywordFilters)) {
            return false;
          }
        }
      }
      
      // Filter out moderated or deleted posts
      if (post.visibility !== 'public') {
        return false;
      }
      
      return true;
    });
  };
  
  module.exports = {
    extractHashtags,
    containsSensitiveContent,
    detectLanguage,
    filterPostsForUser
  };