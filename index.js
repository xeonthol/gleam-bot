// Gleam Bot - Phase 5: Multi-Account + Twitter OAuth + Auto Retweet
// Supports unlimited accounts with proxy rotation + Auto Twitter Follow + Auto Retweet with Quote

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const dotenv = require('dotenv');
const utils = require('./utils');
const twitterOAuth = require('./twitter-oauth');
const twitterActions = require('./twitter-actions');

puppeteer.use(StealthPlugin());
dotenv.config();

const config = {
  gleamUrl: process.env.GLEAM_URL,
  headless: process.env.HEADLESS === 'true',
  actionDelay: parseInt(process.env.ACTION_DELAY) || 2000,
  maxRetries: parseInt(process.env.MAX_RETRIES) || 3,
  pageTimeout: parseInt(process.env.PAGE_TIMEOUT) || 30000,
  accountDelay: parseInt(process.env.ACCOUNT_DELAY) || 5000,
  accountStart: parseInt(process.env.ACCOUNT_START) || 1,
  accountLimit: parseInt(process.env.ACCOUNT_LIMIT) || 999,
  stealthMode: process.env.STEALTH_MODE === 'true',
  saveScreenshots: process.env.SAVE_SCREENSHOTS === 'true',
  debug: process.env.DEBUG === 'true'
};

function validateConfig() {
  if (!config.gleamUrl || config.gleamUrl === 'https://gleam.io/xxxxx/your-campaign') {
    utils.log('❌ GLEAM_URL tidak valid! Edit .env file.', 'error');
    process.exit(1);
  }
  utils.log('✅ Config validated', 'success');
}

async function setupBrowser(proxyServer = null) {
  utils.log('🚀 Launching browser...', 'process');
  
  const browserArgs = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-accelerated-2d-canvas',
    '--no-first-run',
    '--no-zygote',
    '--disable-gpu'
  ];
  
  if (proxyServer) {
    browserArgs.push(`--proxy-server=${proxyServer}`);
    utils.log(`🔒 Using proxy: ${proxyServer}`, 'info');
  }
  
  const browser = await puppeteer.launch({
    headless: config.headless,
    args: browserArgs,
    defaultViewport: { width: 1366, height: 768 }
  });
  
  utils.log('✅ Browser launched', 'success');
  return browser;
}

async function setupPage(browser) {
  const page = await browser.newPage();
  const userAgent = utils.getRandomUserAgent();
  await page.setUserAgent(userAgent);
  
  if (config.debug) {
    utils.log(`🎭 User Agent: ${userAgent.substring(0, 50)}...`, 'info');
  }
  
  await page.setExtraHTTPHeaders({
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
  });
  
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
    Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
    window.chrome = { runtime: {} };
    
    const originalQuery = window.navigator.permissions.query;
    window.navigator.permissions.query = (parameters) => (
      parameters.name === 'notifications' ?
        Promise.resolve({ state: Notification.permission }) :
        originalQuery(parameters)
    );
  });
  
  page.setDefaultTimeout(config.pageTimeout);
  page.setDefaultNavigationTimeout(config.pageTimeout);
  
  utils.log('✅ Page configured with anti-detection', 'success');
  return page;
}

async function navigateToGleam(page) {
  utils.log(`🌐 Navigating to Gleam...`, 'process');
  
  try {
    await page.goto(config.gleamUrl, {
      waitUntil: 'networkidle2',
      timeout: config.pageTimeout
    });
    
    utils.log('✅ Page loaded', 'success');
    
    const widgetLoaded = await utils.waitForElement(
      page, 
      '.entry-method, .gleam-widget, [class*="gleam"]',
      config.pageTimeout,
      3
    );
    
    if (widgetLoaded) {
      utils.log('✅ Gleam widget loaded', 'success');
      return true;
    } else {
      utils.log('❌ Gleam widget not found', 'error');
      return false;
    }
    
  } catch (error) {
    utils.log(`❌ Navigation error: ${error.message}`, 'error');
    return false;
  }
}

async function analyzeEntryMethods(page) {
  utils.log('🔍 Analyzing entry methods...', 'process');
  
  try {
    const entryMethods = await page.$$eval('.entry-method', methods => {
      return methods.map((method, index) => {
        const actionType = method.getAttribute('data-action') || 
                          method.getAttribute('data-entry-method') || 'unknown';
        const title =
          method.querySelector(
            '.widget-title, .widget-action-title, .widget-entry-title, .entry-name, .entry-description, .task-title span, .action-content span, .action-content strong'
        )?.textContent.trim() || 'No title';



        const isCompleted = method.classList.contains('completed') || method.classList.contains('entered');
        
        return { index, action: actionType, title, completed: isCompleted };
      });
    });
    
    utils.log(`📋 Found ${entryMethods.length} entry methods`, 'info');
    return entryMethods;
    
  } catch (error) {
    utils.log(`❌ Error analyzing: ${error.message}`, 'error');
    return [];
  }
}

async function completeSubmitTask(page, taskIndex, taskType, userData) {
  utils.log(`📝 Completing task #${taskIndex + 1}: ${taskType}`, 'process');
  
  try {
    const entryMethodSelector = `.entry-method:nth-of-type(${taskIndex + 1})`;
    await utils.safeClick(page, entryMethodSelector);
    await utils.sleep(1000);
    
    const inputSelectors = [
      'input[type="text"]',
      'input[type="email"]',
      'input[type="url"]',
      'input[name*="email"]',
      'input[name*="wallet"]',
      'input[name*="address"]',
      'input[name*="link"]',
      'input[placeholder*="Enter"]',
      'input[placeholder*="link"]',
      'input[placeholder*="URL"]',
      '.form-control',
      '.input-field',
      'textarea'
    ];
    
    let inputFound = false;
    let inputSelector = null;
    
    for (const selector of inputSelectors) {
      const exists = await utils.elementExists(page, selector);
      if (exists) {
        inputSelector = selector;
        inputFound = true;
        break;
      }
    }
    
    if (!inputFound) {
      utils.log(`⚠️ No input field found`, 'warning');
      return { success: false, reason: 'no_input_field' };
    }
    
    let submitData = '';
    
    if (taskType.includes('email') || taskType.includes('Email')) {
      submitData = userData.email;
    } else if (taskType.includes('wallet') || taskType.includes('address')) {
      submitData = userData.wallet;
    } else if (taskType.includes('telegram') || taskType.includes('Telegram')) {
      submitData = userData.telegram?.username || '@username';
    } else if (taskType.includes('twitter') || taskType.includes('Twitter') && !taskType.includes('link') && !taskType.includes('repost')) {
      submitData = userData.twitter?.username || '@username';
    } else if (taskType.includes('kucoin') || taskType.includes('KuCoin') || taskType.includes('UID') || taskType.includes('uid')) {
      submitData = userData.kucoin_uid || '123456789';
      utils.log(`🪙 Submitting KuCoin UID: ${submitData}`, 'info');
    } else if (taskType.includes('repost') || taskType.includes('link') || taskType.includes('tweet link') || taskType.includes('post link') || taskType.includes('quote')) {
      // This will be filled by retweet task if it's auto-generated
      submitData = userData.repost_link || userData.quote_tweet_link || 'https://twitter.com/status/123';
      utils.log(`🔗 Submitting link: ${submitData}`, 'info');
    } else {
      submitData = userData.email;
    }
    
    await utils.safeType(page, inputSelector, submitData, { clear: true, delay: 100 });
    await utils.sleep(500);
    
    const submitButtonSelectors = [
      'button[type="submit"]',
      'button:has-text("Submit")',
      'button:has-text("Continue")',
      '.submit-button',
      '.btn-primary'
    ];
    
    let submitClicked = false;
    
    for (const selector of submitButtonSelectors) {
      try {
        const buttonExists = await page.$(selector);
        if (buttonExists) {
          await page.click(selector);
          submitClicked = true;
          break;
        }
      } catch (error) {
        continue;
      }
    }
    
    if (!submitClicked) {
      await page.keyboard.press('Enter');
    }
    
    await utils.sleep(2000);
    
    const taskCompleted = await page.$eval(
      entryMethodSelector,
      el => el.classList.contains('completed') || el.classList.contains('entered')
    ).catch(() => false);
    
    if (taskCompleted) {
      utils.log(`✅ Task #${taskIndex + 1} completed!`, 'success');
      return { success: true, data: submitData };
    } else {
      utils.log(`⚠️ Task #${taskIndex + 1} status uncertain`, 'warning');
      return { success: true, data: submitData, uncertain: true };
    }
    
  } catch (error) {
    utils.log(`❌ Error task #${taskIndex + 1}: ${error.message}`, 'error');
    return { success: false, error: error.message };
  }
}

async function processAllTasks(page, entryMethods, userData) {
  const results = [];
  
  for (const method of entryMethods) {
    if (method.completed) {
      utils.log(`⏭️ Skip task #${method.index + 1} - already done`, 'info');
      results.push({ taskIndex: method.index, skipped: true, reason: 'already_completed' });
      continue;
    }
    
    const titleLower = method.title.toLowerCase();
    const actionLower = method.action.toLowerCase();
    
    // 🐦 Check if it's a Twitter Follow task
    const isTwitterFollowTask = 
      actionLower === 'twitter_follow' ||
      actionLower.includes('follow') && titleLower.includes('twitter') ||
      titleLower.includes('follow') && (titleLower.includes('@') || titleLower.includes('twitter'));
    
    // 🔄 Check if it's a Twitter Retweet/Quote task
    const isTwitterRetweetTask = 
      actionLower === 'twitter_retweet' ||
      actionLower.includes('retweet') ||
      actionLower.includes('repost') ||
      titleLower.includes('retweet') ||
      titleLower.includes('repost') ||
      titleLower.includes('quote tweet') ||
      titleLower.includes('rt ') ||
      (titleLower.includes('twitter') && titleLower.includes('share'));
    
    // 📝 Check if it's a Submit task (email, wallet, UID, link, etc)
    const isSubmitTask = 
      actionLower.includes('email') ||
      actionLower.includes('wallet') ||
      actionLower.includes('address') ||
      titleLower.includes('submit') ||
      titleLower.includes('enter your') ||
      titleLower.includes('your email') ||
      titleLower.includes('your wallet') ||
      titleLower.includes('kucoin uid') ||
      titleLower.includes('tweet link') ||
      titleLower.includes('post link');
    
    // Process tasks based on type
    if (isTwitterFollowTask) {
      // ✅ Twitter Follow with OAuth
      utils.log(`🐦 Detected TWITTER FOLLOW task: ${method.title}`, 'info');
      
      if (userData.twitter && userData.twitter.password) {
        const result = await twitterOAuth.completeTwitterFollowTask(
          page, 
          method.index, 
          userData.twitter
        );
        results.push({ taskIndex: method.index, ...result });
        await utils.randomDelay(3000, 5000);
      } else {
        utils.log(`⚠️ No Twitter credentials - skipping`, 'warning');
        results.push({ taskIndex: method.index, skipped: true, reason: 'no_credentials' });
      }
      
    } else if (isTwitterRetweetTask) {
      // ✅ NEW: Twitter Retweet with Quote + Auto Submit Link
      utils.log(`🔄 Detected TWITTER RETWEET task: ${method.title}`, 'info');
      
      if (userData.twitter && userData.twitter.password && userData.retweet_config) {
        const result = await twitterActions.completeTwitterRetweetTask(
          page,
          method.index,
          userData.twitter,
          userData.retweet_config
        );
        
        // Store the quote tweet link for later submit tasks
        if (result.success && result.quoteTweetUrl) {
          userData.quote_tweet_link = result.quoteTweetUrl;
          utils.log(`💾 Saved quote tweet link: ${result.quoteTweetUrl}`, 'success');
        }
        
        results.push({ taskIndex: method.index, ...result });
        await utils.randomDelay(3000, 6000);
      } else {
        utils.log(`⚠️ Missing Twitter credentials or retweet_config - skipping`, 'warning');
        results.push({ taskIndex: method.index, skipped: true, reason: 'no_credentials' });
      }
      
    } else if (isSubmitTask) {
      // ✅ Submit task (email, wallet, UID, link, etc)
      const result = await completeSubmitTask(page, method.index, method.title, userData);
      results.push({ taskIndex: method.index, ...result });
      await utils.randomDelay(2000, 4000);
      
    } else {
      // ⏭️ Other action tasks (Discord, YouTube, etc)
      utils.log(`⏭️ Skip ACTION task: ${method.title} (not supported yet)`, 'warning');
      results.push({ taskIndex: method.index, skipped: true, reason: 'unsupported_action' });
    }
  }
  
  return results;
}

// Process single account
async function processAccount(account, accountIndex, totalAccounts) {
  utils.log(`\n${'='.repeat(60)}`, 'info');
  utils.log(`🤖 Processing Account ${accountIndex + 1}/${totalAccounts}`, 'process');
  utils.log(`   Name: ${account.name || `Account ${account.id}`}`, 'info');
  utils.log(`   Email: ${account.email}`, 'info');
  utils.log(`${'='.repeat(60)}\n`, 'info');
  
  let browser;
  
  try {
    const proxyServer = account.proxy || null;
    browser = await setupBrowser(proxyServer);
    
    const page = await setupPage(browser);
    
    const navigated = await navigateToGleam(page);
    if (!navigated) {
      throw new Error('Failed to navigate');
    }
    
    const entryMethods = await analyzeEntryMethods(page);
    if (entryMethods.length === 0) {
      throw new Error('No entry methods found');
    }
    
    const results = await processAllTasks(page, entryMethods, account);
    
    const completed = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success && !r.skipped).length;
    const skipped = results.filter(r => r.skipped).length;
    
    utils.log(`\n📊 Account ${accountIndex + 1} Summary:`, 'info');
    utils.log(`   ✅ Completed: ${completed}`, 'success');
    utils.log(`   ❌ Failed: ${failed}`, failed > 0 ? 'error' : 'info');
    utils.log(`   ⏭️ Skipped: ${skipped}`, 'info');
    
    if (config.saveScreenshots) {
      await utils.takeScreenshot(page, `account-${account.id}-result`);
    }
    
    await browser.close();
    
    return {
      accountId: account.id,
      accountName: account.name,
      success: true,
      completed,
      failed,
      skipped,
      results
    };
    
  } catch (error) {
    utils.log(`❌ Account ${accountIndex + 1} FAILED: ${error.message}`, 'error');
    
    if (browser) {
      try {
        const page = (await browser.pages())[0];
        if (page && config.saveScreenshots) {
          await utils.takeScreenshot(page, `account-${account.id}-error`);
        }
      } catch {}
      await browser.close();
    }
    
    return {
      accountId: account.id,
      accountName: account.name,
      success: false,
      error: error.message
    };
  }
}

// Main bot function
async function runBot() {
  utils.log(`
╔═══════════════════════════════════════════════════╗
║      🤖 GLEAM BOT - PHASE 5 ULTIMATE              ║
║      Multi-Account + Twitter Auto-Everything      ║
║      ✅ Follow  ✅ Retweet  ✅ Quote  ✅ Submit    ║
╚═══════════════════════════════════════════════════╝
  `, 'info');
  
  validateConfig();
  
  try {
    const allAccounts = utils.loadAccounts();
    
    if (allAccounts.length === 0) {
      utils.log('❌ No accounts found in accounts.json!', 'error');
      process.exit(1);
    }
    
    // Apply account filtering based on ACCOUNT_START and ACCOUNT_LIMIT
    const startIndex = config.accountStart - 1;
    const endIndex = Math.min(startIndex + config.accountLimit, allAccounts.length);
    const accounts = allAccounts.slice(startIndex, endIndex);
    
    utils.log(`📋 Total accounts in file: ${allAccounts.length}`, 'info');
    utils.log(`🎯 Processing accounts: ${config.accountStart} to ${endIndex}`, 'success');
    utils.log(`⏱️ Estimated time: ${Math.ceil(accounts.length * 30 / 60)} minutes\n`, 'info');
    
    const startTime = Date.now();
    const accountResults = [];
    
    for (let i = 0; i < accounts.length; i++) {
      const result = await processAccount(accounts[i], i, accounts.length);
      accountResults.push(result);
      
      if (i < accounts.length - 1) {
        utils.log(`\n⏳ Waiting ${config.accountDelay/1000}s before next account...\n`, 'info');
        await utils.sleep(config.accountDelay);
      }
    }
    
    // Final summary
    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000 / 60).toFixed(2);
    
    const successfulAccounts = accountResults.filter(r => r.success).length;
    const failedAccounts = accountResults.filter(r => !r.success);
    
    const totalCompleted = accountResults
      .filter(r => r.success)
      .reduce((sum, r) => sum + (r.completed || 0), 0);
    
    const totalSkipped = accountResults
      .filter(r => r.success)
      .reduce((sum, r) => sum + (r.skipped || 0), 0);
    
    utils.log(`\n${'='.repeat(60)}`, 'info');
    utils.log(`
╔═══════════════════════════════════════════════════╗
║              📊 FINAL SUMMARY                     ║
╚═══════════════════════════════════════════════════╝
    `, 'info');
    
    utils.log(`Total Accounts Processed: ${accounts.length}`, 'info');
    utils.log(`✅ Successful Accounts: ${successfulAccounts}`, 'success');
    utils.log(`❌ Failed Accounts: ${failedAccounts.length}`, failedAccounts.length > 0 ? 'error' : 'info');
    utils.log(`📝 Total Tasks Completed: ${totalCompleted}`, 'success');
    utils.log(`⏭️ Total Tasks Skipped: ${totalSkipped}`, 'info');
    utils.log(`⏱️ Total Time: ${duration} minutes\n`, 'info');
    
    if (failedAccounts.length > 0) {
      utils.saveFailedAccounts(failedAccounts);
    }
    
    utils.log('✨ All accounts processed!', 'success');
    
  } catch (error) {
    utils.log(`❌ Fatal error: ${error.message}`, 'error');
    if (config.debug) {
      console.error(error);
    }
  }
}

runBot().catch(error => {
  utils.log(`❌ Unhandled error: ${error.message}`, 'error');
  process.exit(1);
});
