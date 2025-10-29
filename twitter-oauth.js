const EnhancedTwitter = require('./enhanced-twitter');

async function handleTwitterAuth(page, account) {
  const utils = require('./utils');
  utils.log('🔐 Handling Twitter authentication...', 'process');
  
  try {
    // Try enhanced cookie-based auth first
    if (account.xCookie) {
      utils.log('🚀 Trying enhanced Twitter auth with cookies...', 'info');
      const enhancedTwitter = new EnhancedTwitter(account);
      const enhancedInitialized = await enhancedTwitter.initialize();
      
      if (enhancedInitialized) {
        utils.log('✅ Enhanced Twitter auth successful', 'success');
        page.enhancedTwitter = enhancedTwitter;
        return true;
      } else {
        utils.log('⚠️ Enhanced auth failed, falling back...', 'warning');
      }
    }

    // Fallback to traditional OAuth
    utils.log('🔄 Using traditional OAuth method...', 'info');
    return await handleTraditionalOAuth(page);
    
  } catch (error) {
    utils.log(`❌ Twitter auth error: ${error.message}`, 'error');
    return false;
  }
}

async function handleTraditionalOAuth(page) {
  const utils = require('./utils');
  
  try {
    utils.log('🔍 Checking for Twitter OAuth popup...', 'process');
    
    // Wait for potential OAuth popup
    await utils.sleep(3000);
    
    // Check if we're already on Twitter or if popup opened
    const pages = await page.browser().pages();
    let twitterPage = null;
    
    for (const p of pages) {
      const url = p.url();
      if (url.includes('twitter.com') || url.includes('x.com')) {
        twitterPage = p;
        utils.log('✅ Twitter/X page detected', 'success');
        break;
      }
    }
    
    if (twitterPage && twitterPage !== page) {
      // OAuth popup opened
      utils.log('🪟 OAuth popup detected, handling...', 'process');
      
      try {
        // Wait for login page to load
        await twitterPage.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 });
        
        // Check if already logged in (redirected back to Gleam)
        const currentUrl = twitterPage.url();
        if (currentUrl.includes('gleam.io')) {
          utils.log('✅ Already authorized, returning to Gleam', 'success');
          await twitterPage.close();
          return true;
        }
        
        // If still on Twitter, might need manual intervention
        if (currentUrl.includes('twitter.com') || currentUrl.includes('x.com')) {
          utils.log('⚠️ Twitter page found but may need manual login', 'warning');
          await twitterPage.close();
          return false;
        }
        
      } catch (popupError) {
        utils.log(`❌ OAuth popup handling error: ${popupError.message}`, 'error');
        await twitterPage.close();
        return false;
      }
    } else {
      // No popup detected - might be already authorized
      utils.log('ℹ️ No OAuth popup found, might be already authorized', 'info');
      
      // Check if we're redirected to Twitter and back
      const currentUrl = page.url();
      if (currentUrl.includes('gleam.io')) {
        utils.log('✅ Already authorized', 'success');
        return true;
      }
    }
    
    return true;
    
  } catch (error) {
    utils.log(`❌ Traditional OAuth error: ${error.message}`, 'error');
    return false;
  }
}

module.exports = { handleTwitterAuth };
