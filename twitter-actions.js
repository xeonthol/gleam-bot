// Gleam Bot - Twitter Actions Module
// Auto Retweet with Quote + Tag Friends + Get Link

const utils = require('./utils');

// Find tweet URL from Gleam task
async function getTweetUrlFromGleam(page, taskIndex) {
  utils.log('🔍 Finding tweet URL from Gleam...', 'process');
  
  try {
    const entryMethodSelector = `.entry-method:nth-of-type(${taskIndex + 1})`;
    
    // Look for tweet URL in the task description or link
    const tweetUrl = await page.$eval(entryMethodSelector, (el) => {
      // Check for direct link to tweet
      const link = el.querySelector('a[href*="twitter.com"], a[href*="x.com"]');
      if (link) {
        return link.href;
      }
      
      // Check in text content
      const text = el.textContent;
      const urlMatch = text.match(/https?:\/\/(twitter\.com|x\.com)\/[^\s]+/);
      if (urlMatch) {
        return urlMatch[0];
      }
      
      return null;
    }).catch(() => null);
    
    if (tweetUrl) {
      utils.log(`✅ Found tweet URL: ${tweetUrl}`, 'success');
      return tweetUrl;
    } else {
      utils.log('⚠️ Tweet URL not found in task', 'warning');
      return null;
    }
    
  } catch (error) {
    utils.log(`❌ Error finding tweet URL: ${error.message}`, 'error');
    return null;
  }
}

// Retweet with quote on Twitter
async function retweetWithQuote(page, tweetUrl, quoteText, taggedFriends = []) {
  utils.log('🔄 Retweeting with quote...', 'process');
  
  try {
    // Navigate to the tweet
    await page.goto(tweetUrl, { waitUntil: 'networkidle2', timeout: 30000 });
    await utils.sleep(3000);
    
    // Find and click Retweet button
    const retweetButtonSelectors = [
      '[data-testid="retweet"]',
      'div[aria-label*="Retweet"]',
      'button[aria-label*="Retweet"]'
    ];
    
    let retweetClicked = false;
    for (const selector of retweetButtonSelectors) {
      if (await utils.elementExists(page, selector)) {
        await page.click(selector);
        retweetClicked = true;
        utils.log('✅ Clicked Retweet button', 'success');
        break;
      }
    }
    
    if (!retweetClicked) {
      throw new Error('Retweet button not found');
    }
    
    await utils.sleep(2000);
    
    // Click "Quote" option from the menu
    const quoteButtonSelectors = [
      '[data-testid="Dropdown"] a[role="menuitem"]:has-text("Quote")',
      'a[role="menuitem"]:has-text("Quote")',
      'div[role="menuitem"]:has-text("Quote")'
    ];
    
    let quoteClicked = false;
    for (const selector of quoteButtonSelectors) {
      try {
        const button = await page.$(selector);
        if (button) {
          await button.click();
          quoteClicked = true;
          utils.log('✅ Clicked Quote option', 'success');
          break;
        }
      } catch {}
    }
    
    if (!quoteClicked) {
      throw new Error('Quote option not found');
    }
    
    await utils.sleep(2000);
    
    // Type quote text with tagged friends
    const tweetBoxSelectors = [
      '[data-testid="tweetTextarea_0"]',
      'div[role="textbox"]',
      '[contenteditable="true"]'
    ];
    
    let tweetBoxFound = false;
    for (const selector of tweetBoxSelectors) {
      if (await utils.elementExists(page, selector)) {
        // Build full quote text with tags
        let fullQuoteText = quoteText;
        
        if (taggedFriends && taggedFriends.length > 0) {
          const tags = taggedFriends.map(friend => `@${friend.replace('@', '')}`).join(' ');
          fullQuoteText = `${quoteText} ${tags}`;
        }
        
        utils.log(`📝 Typing quote: "${fullQuoteText}"`, 'info');
        
        await page.click(selector);
        await utils.sleep(500);
        await page.type(selector, fullQuoteText, { delay: 50 });
        
        tweetBoxFound = true;
        break;
      }
    }
    
    if (!tweetBoxFound) {
      throw new Error('Tweet box not found');
    }
    
    await utils.sleep(2000);
    
    // Click Tweet button to post
    const tweetButtonSelectors = [
      '[data-testid="tweetButton"]',
      '[data-testid="tweetButtonInline"]',
      'div[role="button"]:has-text("Post")',
      'button:has-text("Post")'
    ];
    
    let tweetPosted = false;
    for (const selector of tweetButtonSelectors) {
      try {
        const button = await page.$(selector);
        if (button) {
          await button.click();
          tweetPosted = true;
          utils.log('✅ Posted quote tweet!', 'success');
          break;
        }
      } catch {}
    }
    
    if (!tweetPosted) {
      throw new Error('Tweet button not found');
    }
    
    // Wait for tweet to be posted
    await utils.sleep(5000);
    
    // Get the URL of the posted quote tweet
    // Twitter redirects to the new tweet after posting
    const currentUrl = page.url();
    
    if (currentUrl.includes('/status/')) {
      utils.log(`✅ Quote tweet posted: ${currentUrl}`, 'success');
      return currentUrl;
    } else {
      // Try to find the tweet in timeline
      utils.log('⚠️ Getting tweet URL from timeline...', 'warning');
      
      // Go to profile
      await page.goto('https://twitter.com/home', { waitUntil: 'networkidle2' });
      await utils.sleep(3000);
      
      // Find first tweet (latest one we just posted)
      const latestTweetUrl = await page.$eval(
        'article[data-testid="tweet"] a[href*="/status/"]',
        el => el.href
      ).catch(() => null);
      
      if (latestTweetUrl) {
        utils.log(`✅ Found tweet URL: ${latestTweetUrl}`, 'success');
        return latestTweetUrl;
      } else {
        throw new Error('Could not get tweet URL');
      }
    }
    
  } catch (error) {
    utils.log(`❌ Retweet error: ${error.message}`, 'error');
    return null;
  }
}

// Complete Twitter Retweet task with auto-submit link
async function completeTwitterRetweetTask(page, taskIndex, twitterCredentials, retweetConfig) {
  utils.log(`🔄 Completing Twitter Retweet task #${taskIndex + 1}...`, 'process');
  
  try {
    const entryMethodSelector = `.entry-method:nth-of-type(${taskIndex + 1})`;
    
    // Get tweet URL from Gleam task
    const tweetUrl = await getTweetUrlFromGleam(page, taskIndex);
    
    if (!tweetUrl) {
      throw new Error('Tweet URL not found in task');
    }
    
    // Click the task to trigger Twitter interaction
    await utils.safeClick(page, entryMethodSelector);
    await utils.sleep(2000);
    
    // Get all pages (in case popup/redirect)
    const browser = page.browser();
    let pages = await browser.pages();
    const twitterPage = pages[pages.length - 1];
    
    // Check if on Twitter page
    const isTwitterPage = twitterPage.url().includes('twitter.com') || 
                         twitterPage.url().includes('x.com');
    
    let workingPage = page;
    
    if (isTwitterPage && twitterPage !== page) {
      // Use the Twitter page
      workingPage = twitterPage;
      await workingPage.bringToFront();
    } else {
      // Open Twitter in new tab
      workingPage = await browser.newPage();
      await workingPage.goto('https://twitter.com', { waitUntil: 'networkidle2' });
      await utils.sleep(2000);
    }
    
    // Check if logged in
    const notLoggedIn = await workingPage.url().includes('/login') ||
                       await utils.elementExists(workingPage, 'a[href="/login"]');
    
    if (notLoggedIn) {
      utils.log('⚠️ Not logged in to Twitter, logging in...', 'warning');
      
      // Import twitter-oauth module
      const twitterOAuth = require('./twitter-oauth');
      await twitterOAuth.twitterLogin(workingPage, twitterCredentials);
      await utils.sleep(3000);
    }
    
    // Perform retweet with quote
    const quoteText = retweetConfig.quoteText || 'Trade $LIGHT on #KuCoin!';
    const taggedFriends = retweetConfig.taggedFriends || [];
    
    const quoteTweetUrl = await retweetWithQuote(
      workingPage, 
      tweetUrl, 
      quoteText, 
      taggedFriends
    );
    
    if (!quoteTweetUrl) {
      throw new Error('Failed to post quote tweet');
    }
    
    // Now submit the link back to Gleam
    await page.bringToFront();
    await utils.sleep(2000);
    
    utils.log('📝 Submitting quote tweet link to Gleam...', 'process');
    
    // Look for input field to submit link
    const linkInputSelectors = [
      'input[type="text"]',
      'input[type="url"]',
      'input[placeholder*="link"]',
      'input[placeholder*="URL"]',
      'textarea'
    ];
    
    let linkSubmitted = false;
    
    for (const selector of linkInputSelectors) {
      if (await utils.elementExists(page, selector)) {
        await utils.safeType(page, selector, quoteTweetUrl, { clear: true, delay: 100 });
        await utils.sleep(1000);
        
        // Click submit button
        const submitButtons = [
          'button[type="submit"]',
          'button:has-text("Submit")',
          'button:has-text("Continue")',
          '.submit-button'
        ];
        
        for (const btnSelector of submitButtons) {
          try {
            const btn = await page.$(btnSelector);
            if (btn) {
              await btn.click();
              linkSubmitted = true;
              break;
            }
          } catch {}
        }
        
        if (linkSubmitted) break;
      }
    }
    
    if (!linkSubmitted) {
      utils.log('⚠️ Could not submit link automatically', 'warning');
    } else {
      utils.log('✅ Quote tweet link submitted to Gleam!', 'success');
    }
    
    await utils.sleep(3000);
    
    // Close Twitter page if it's separate
    if (workingPage !== page) {
      await workingPage.close();
    }
    
    // Verify completion
    const taskCompleted = await page.$eval(
      entryMethodSelector,
      el => el.classList.contains('completed') || el.classList.contains('entered')
    ).catch(() => false);
    
    if (taskCompleted) {
      utils.log(`✅ Retweet task completed!`, 'success');
      return { success: true, quoteTweetUrl };
    } else {
      utils.log(`⚠️ Task status uncertain`, 'warning');
      return { success: true, quoteTweetUrl, uncertain: true };
    }
    
  } catch (error) {
    utils.log(`❌ Retweet task error: ${error.message}`, 'error');
    return { success: false, error: error.message };
  }
}

module.exports = {
  getTweetUrlFromGleam,
  retweetWithQuote,
  completeTwitterRetweetTask
};
