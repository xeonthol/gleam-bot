const EnhancedTwitter = require('./enhanced-twitter');

async function handleTwitterAuth(page, account) {
  utils.log('🔐 Handling Twitter authentication...', 'process');
  
  try {
    // Coba enhanced auth dulu
    const enhancedTwitter = new EnhancedTwitter(account);
    const enhancedInitialized = await enhancedTwitter.initialize();
    
    if (enhancedInitialized) {
      utils.log('✅ Enhanced Twitter auth successful', 'success');
      page.enhancedTwitter = enhancedTwitter; // Simpan untuk nanti
      return true;
    }
    
    // Fallback ke traditional OAuth
    utils.log('🔄 Falling back to traditional OAuth', 'warning');
    return await handleTraditionalOAuth(page);
    
  } catch (error) {
    utils.log(`❌ Twitter auth error: ${error.message}`, 'error');
    return false;
  }
}
