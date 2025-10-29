const { XAuth, ensureXSession } = require('./x-auth');
const { XActions } = require('./x-actions');

class EnhancedTwitter {
  constructor(account) {
    this.account = account;
    this.xAuth = null;
    this.xActions = null;
    this.initialized = false;
  }

  async initialize() {
    try {
      if (this.account.xCookie) {
        const utils = require('./utils');
        utils.log('🔐 Initializing enhanced Twitter system...', 'process');
        
        this.xAuth = await ensureXSession({
          xCookie: this.account.xCookie,
          ua: process.env.USER_AGENT || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        });
        
        this.xActions = new XActions(this.xAuth);
        this.initialized = true;
        
        utils.log('✅ Enhanced Twitter system initialized', 'success');
        return true;
      } else {
        const utils = require('./utils');
        utils.log('⚠️ No xCookie provided for enhanced Twitter', 'warning');
      }
    } catch (error) {
      const utils = require('./utils');
      utils.log(`❌ Enhanced Twitter initialization failed: ${error.message}`, 'error');
    }
    return false;
  }

  async followUser(username) {
    if (!this.initialized) {
      const utils = require('./utils');
      utils.log('❌ Enhanced Twitter not initialized', 'error');
      return false;
    }
    
    try {
      const utils = require('./utils');
      utils.log(`👤 Following @${username} via enhanced system...`, 'process');
      
      const result = await this.xActions.doFromAction({
        type: 'follow',
        screenName: username
      }, { referer: 'https://x.com' });
      
      if (result) {
        utils.log(`✅ Successfully followed @${username}`, 'success');
      } else {
        utils.log(`❌ Failed to follow @${username}`, 'error');
      }
      
      return result;
    } catch (error) {
      const utils = require('./utils');
      utils.log(`❌ Enhanced follow error: ${error.message}`, 'error');
      return false;
    }
  }

  async retweet(tweetUrl) {
    if (!this.initialized) return false;
    
    try {
      const utils = require('./utils');
      utils.log(`🔁 Retweeting via enhanced system...`, 'process');
      
      const result = await this.xActions.doFromAction({
        type: 'retweet',
        tweetUrl: tweetUrl
      }, { referer: 'https://x.com' });
      
      if (result) {
        utils.log('✅ Successfully retweeted', 'success');
      }
      
      return result;
    } catch (error) {
      const utils = require('./utils');
      utils.log(`❌ Enhanced retweet error: ${error.message}`, 'error');
      return false;
    }
  }

  async likeTweet(tweetUrl) {
    if (!this.initialized) return false;
    
    try {
      const utils = require('./utils');
      utils.log(`❤️ Liking tweet via enhanced system...`, 'process');
      
      const result = await this.xActions.doFromAction({
        type: 'like', 
        tweetUrl: tweetUrl
      }, { referer: 'https://x.com' });
      
      if (result) {
        utils.log('✅ Successfully liked tweet', 'success');
      }
      
      return result;
    } catch (error) {
      const utils = require('./utils');
      utils.log(`❌ Enhanced like error: ${error.message}`, 'error');
      return false;
    }
  }
}

module.exports = EnhancedTwitter;
