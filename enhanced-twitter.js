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
        this.xAuth = await ensureXSession({
          xCookie: this.account.xCookie,
          ua: process.env.USER_AGENT || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        });
        this.xActions = new XActions(this.xAuth);
        this.initialized = true;
        console.log('✅ Enhanced Twitter initialized');
        return true;
      }
    } catch (error) {
      console.log('❌ Enhanced Twitter init failed:', error.message);
    }
    return false;
  }

  async followUser(username) {
    if (!this.initialized) return false;
    
    try {
      return await this.xActions.doFromAction({
        type: 'follow',
        screenName: username
      }, { referer: 'https://x.com' }, console);
    } catch (error) {
      console.log('❌ Enhanced follow failed:', error.message);
      return false;
    }
  }

  async retweet(tweetUrl) {
    if (!this.initialized) return false;
    
    try {
      return await this.xActions.doFromAction({
        type: 'retweet',
        tweetUrl: tweetUrl
      }, { referer: 'https://x.com' }, console);
    } catch (error) {
      console.log('❌ Enhanced retweet failed:', error.message);
      return false;
    }
  }

  async likeTweet(tweetUrl) {
    if (!this.initialized) return false;
    
    try {
      return await this.xActions.doFromAction({
        type: 'like', 
        tweetUrl: tweetUrl
      }, { referer: 'https://x.com' }, console);
    } catch (error) {
      console.log('❌ Enhanced like failed:', error.message);
      return false;
    }
  }
}

module.exports = EnhancedTwitter;
