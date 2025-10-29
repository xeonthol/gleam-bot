const EnhancedTwitter = require('./enhanced-twitter');

async function performTwitterActions(page, account) {
  const utils = require('./utils');
  utils.log('🐦 Performing Twitter actions...', 'process');
  
  try {
    // Try enhanced system first if available
    if (page.enhancedTwitter && page.enhancedTwitter.initialized) {
      utils.log('🚀 Using enhanced Twitter system for actions', 'success');
      return await performEnhancedTwitterActions(page.enhancedTwitter, account);
    }
    
    // Try to initialize enhanced system if we have cookies
    if (account.xCookie && !page.enhancedTwitter) {
      utils.log('🔄 Initializing enhanced Twitter system...', 'info');
      const enhancedTwitter = new EnhancedTwitter(account);
      const enhancedInitialized = await enhancedTwitter.initialize();
      
      if (enhancedInitialized) {
        utils.log('✅ Enhanced Twitter initialized for actions', 'success');
        return await performEnhancedTwitterActions(enhancedTwitter, account);
      }
    }
    
    // Fallback to traditional method
    utils.log('🔄 Falling back to traditional Twitter actions', 'warning');
    return await performTraditionalTwitterActions(page, account);
    
  } catch (error) {
    utils.log(`❌ Twitter actions error: ${error.message}`, 'error');
    return false;
  }
}

async function performEnhancedTwitterActions(enhancedTwitter, account) {
  const utils = require('./utils');
  
  try {
    // Follow the target user
    utils.log('👤 Following target user...', 'process');
    const followSuccess = await enhancedTwitter.followUser('uso_ppp');
    
    if (followSuccess) {
      utils.log('✅ Enhanced follow completed successfully', 'success');
      return true;
    } else {
      utils.log('❌ Enhanced follow failed', 'error');
      return false;
    }
    
  } catch (error) {
    utils.log(`❌ Enhanced Twitter actions error: ${error.message}`, 'error');
    return false;
  }
}

async function performTraditionalTwitterActions(page, account) {
  const utils = require('./utils');
  
  try {
    utils.log('🔍 Checking for Twitter page...', 'process');
    
    // Look for Twitter page in browser tabs
    const pages = await page.browser().pages();
    let twitterPage = null;
    
    for (const p of pages) {
      const url = p.url();
      if (url.includes('twitter.com') || url.includes('x.com')) {
        twitterPage = p;
        break;
      }
    }
    
    if (!twitterPage) {
      utils.log('⚠️ No Twitter page found for actions', 'warning');
      return false;
    }
    
    utils.log('✅ Twitter page found, performing actions...', 'success');
    
    // Basic follow action - this would need to be customized based on the actual Twitter UI
    try {
      // Wait for page to load
      await twitterPage.waitForTimeout(3000);
      
      // Try to find and click follow button
      // Note: This is a generic approach and might need adjustment
      const followButton = await twitterPage.$('div[role="button"] span:has-text("Follow")');
      if (followButton) {
        await followButton.click();
        utils.log('✅ Traditional follow action completed', 'success');
        await twitterPage.waitForTimeout(2000);
      } else {
        utils.log('⚠️ Follow button not found, might already be following', 'warning');
      }
      
      // Close Twitter page
      await twitterPage.close();
      return true;
      
    } catch (actionError) {
      utils.log(`❌ Traditional Twitter action error: ${actionError.message}`, 'error');
      await twitterPage.close();
      return false;
    }
    
  } catch (error) {
    utils.log(`❌ Traditional Twitter actions error: ${error.message}`, 'error');
    return false;
  }
}

module.exports = { performTwitterActions };
