// Gleam Bot - Phase 5: Multi-Account + Twitter OAuth + Auto Retweet
// FIXED VERSION - Robust Entry Method Detection

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
    headless: 'new', // tidak membuka browser (silent mode)
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
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
    await utils.sleep(3000);

    // 🧩 Tambahan: Deteksi dan switch ke iframe jika Gleam widget disematkan di dalamnya
    const frames = page.frames();
    let gleamFrame = null;
    for (const frame of frames) {
      const frameUrl = frame.url();
      if (frameUrl.includes("gleam.io") || frameUrl.includes("embed")) {
        gleamFrame = frame;
        utils.log(`🪞 Gleam iframe detected: ${frameUrl}`, 'info');
        break;
      }
    }

    // Pilih target page yang aktif (utama atau iframe)
    const target = gleamFrame || page;

    // Tunggu widget benar-benar dimuat
    const widgetLoaded = await utils.waitForElement(
      target,
      '.entry-method, .gleam-widget, [class*="gleam"]',
      config.pageTimeout,
      3
    );

    if (widgetLoaded) {
      utils.log('✅ Gleam widget loaded (iframe-safe)', 'success');
      return true;
    } else {
      utils.log('❌ Gleam widget not found, even after iframe scan', 'error');
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
    // Wait for entry methods
    await page.waitForSelector('.entry-method', { timeout: 10000 });
    
    // Get all entry method elements
    const entryMethodElements = await page.$$('.entry-method');
    
    if (!entryMethodElements || entryMethodElements.length === 0) {
      throw new Error('No .entry-method elements found');
    }
    
    utils.log(`📋 Found ${entryMethodElements.length} entry method elements`, 'info');
    
    const entryMethods = [];
    
    // Process each element individually
    for (let index = 0; index < entryMethodElements.length; index++) {
      const element = entryMethodElements[index];
      
      try {
        // Get action type
        const actionType = await element.evaluate(el => {
          return el.getAttribute('data-action') || 
                 el.getAttribute('data-entry-method') ||
                 'unknown';
        }).catch(() => 'unknown');
        
        // Get title - try multiple selectors
        const title = await element.evaluate(el => {
          const selectors = [
            '.entry-title',
            '.entry-name',
            '.entry-description',
            'h3', 'h4',
            '[class*="title"]'
          ];
          
          for (const sel of selectors) {
            const titleEl = el.querySelector(sel);
            if (titleEl && titleEl.textContent.trim()) {
              return titleEl.textContent.trim();
            }
          }
          
          // Fallback to all text
          const text = el.textContent.replace(/\s+/g, ' ').trim();
          return text.substring(0, 100);
        }).catch(() => 'Unknown Task');
        
        // Check if completed
        const isCompleted = await element.evaluate(el => {
          return el.classList.contains('completed') || 
                 el.classList.contains('entered') ||
                 el.querySelector('.checkmark') !== null;
        }).catch(() => false);
        
        entryMethods.push({
          index,
          action: actionType,
          title: title || `Task ${index + 1}`,
          completed: isCompleted
        });
        
        if (config.debug) {
          utils.log(`   📝 Task ${index + 1}: [${actionType}] ${title}`, 'info');
        }
        
      } catch (err) {
        utils.log(`⚠️ Error reading task ${index + 1}: ${err.message}`, 'warning');
        entryMethods.push({
          index,
          action: 'unknown',
          title: `Task ${index + 1}`,
          completed: false
        });
      }
    }
    
    return entryMethods;
    
  } catch (error) {
    utils.log(`❌ Error analyzing entry methods: ${error.message}`, 'error');
    return [];
  }
}

async function completeSubmitTask(page, taskIndex, taskType, userData) {
  utils.log(`📝 Completing submit task #${taskIndex + 1}: ${taskType}`, 'process');
  
  try {
    const entrySelector = `.entry-method:nth-of-type(${taskIndex + 1})`;
    await utils.safeClick(page, entrySelector);
    await utils.sleep(2000);
    
    // Find input field
    const inputSelectors = [
      'input[type="text"]',
      'input[type="email"]',
      'input[type="url"]',
      'textarea'
    ];
    
    let inputField = null;
    for (const sel of inputSelectors) {
      inputField = await page.$(sel);
      if (inputField) break;
    }
    
    if (!inputField) {
      throw new Error('No input field found');
    }
    
    // Determine what data to submit
    let submitData = '';
    const lowerTitle = taskType.toLowerCase();
    
    if (lowerTitle.includes('email')) {
      submitData = userData.email;
    } else if (lowerTitle.includes('wallet') || lowerTitle.includes('address')) {
      submitData = userData.wallet;
    } else if (lowerTitle.includes('kucoin') || lowerTitle.includes('uid')) {
      submitData = userData.kucoin_uid;
    } else if (lowerTitle.includes('tweet') || lowerTitle.includes('link') || lowerTitle.includes('repost')) {
      submitData = userData.quote_tweet_link || userData.repost_link || 'https://twitter.com/status/123';
    } else {
      submitData = userData.email;
    }
    
    utils.log(`📤 Submitting: ${submitData}`, 'info');
    
    await inputField.type(submitData, { delay: 100 });
    await utils.sleep(1000);
    
    // Submit
    const submitBtn = await page.$('button[type="submit"]');
    if (submitBtn) {
      await submitBtn.click();
    } else {
      await page.keyboard.press('Enter');
    }
    
    await utils.sleep(3000);
    
    utils.log(`✅ Submit task completed`, 'success');
    return { success: true, data: submitData };
    
  } catch (error) {
    utils.log(`❌ Submit task error: ${error.message}`, 'error');
    return { success: false, error: error.message };
  }
}

async function processAllTasks(page, entryMethods, userData) {
  const results = [];
  
  for (const method of entryMethods) {
    if (method.completed) {
      utils.log(`⏭️ Skip task #${method.index + 1} - already completed`, 'info');
      results.push({ taskIndex: method.index, skipped: true, reason: 'already_completed' });
      continue;
    }
    
    const titleLower = method.title.toLowerCase();
    const actionLower = method.action.toLowerCase();
    
    // Detect task type
    const isFollowTask = 
      actionLower.includes('follow') || 
      titleLower.includes('follow');
    
    const isRetweetTask = 
      actionLower.includes('retweet') || 
      actionLower.includes('repost') ||
      titleLower.includes('retweet') ||
      titleLower.includes('repost');
    
    const isSubmitTask = 
      titleLower.includes('submit') ||
      titleLower.includes('enter your') ||
      titleLower.includes('email') ||
      titleLower.includes('wallet') ||
      titleLower.includes('link');
    
    if (isFollowTask && !isSubmitTask) {
      utils.log(`🐦 Twitter Follow: ${method.title}`, 'process');
      
      if (userData.twitter && userData.twitter.password) {
        const result = await twitterOAuth.completeTwitterFollowTask(
          page, method.index, userData.twitter
        );
        results.push({ taskIndex: method.index, ...result });
      } else {
        utils.log('⚠️ No Twitter credentials', 'warning');
        results.push({ taskIndex: method.index, skipped: true });
      }
      
    } else if (isRetweetTask && !isSubmitTask) {
      utils.log(`🔄 Twitter Retweet: ${method.title}`, 'process');
      
      if (userData.twitter && userData.retweet_config) {
        const result = await twitterActions.completeTwitterRetweetTask(
          page, method.index, userData.twitter, userData.retweet_config
        );
        
        if (result.success && result.quoteTweetUrl) {
          userData.quote_tweet_link = result.quoteTweetUrl;
        }
        
        results.push({ taskIndex: method.index, ...result });
      } else {
        utils.log('⚠️ No Twitter/retweet config', 'warning');
        results.push({ taskIndex: method.index, skipped: true });
      }
      
    } else if (isSubmitTask) {
      utils.log(`📝 Submit Task: ${method.title}`, 'process');
      
      const result = await completeSubmitTask(page, method.index, method.title, userData);
      results.push({ taskIndex: method.index, ...result });
      
    } else {
      utils.log(`⏭️ Skip: ${method.title} (unsupported)`, 'warning');
      results.push({ taskIndex: method.index, skipped: true });
    }
    
    await utils.randomDelay(2000, 4000);
  }
  
  return results;
}

async function processAccount(account, accountIndex, totalAccounts) {
  utils.log(`\n${'='.repeat(60)}`, 'info');
  utils.log(`🤖 Processing Account ${accountIndex + 1}/${totalAccounts}`, 'process');
  utils.log(`   Name: ${account.name || `Account ${account.id}`}`, 'info');
  utils.log(`   Email: ${account.email || 'N/A'}`, 'info');
  utils.log(`${'='.repeat(60)}\n`, 'info');
  
  let browser;
  
  try {
    browser = await setupBrowser(account.proxy);
    const page = await setupPage(browser);
    
    const navigated = await navigateToGleam(page);
    if (!navigated) {
      throw new Error('Failed to navigate to Gleam');
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
    utils.log(`   ❌ Failed: ${failed}`, 'info');
    utils.log(`   ⏭️ Skipped: ${skipped}`, 'info');
    
    if (config.saveScreenshots) {
      await utils.takeScreenshot(page, `account-${account.id}-result`);
    }
    
    console.log('\n🔒 Browser akan tetap terbuka.');
console.log('➡️  Silakan login ke Twitter secara manual jika belum.');
console.log('⏸️  Tekan ENTER di terminal setelah selesai login untuk melanjutkan...\n');

await new Promise(resolve => {
  process.stdin.once('data', () => resolve());
});

await browser.close();

    
    return {
      accountId: account.id,
      success: true,
      completed,
      failed,
      skipped
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
      success: false,
      error: error.message
    };
  }
}

async function runBot() {
  utils.log(`
╔═══════════════════════════════════════════════════╗
║      🤖 GLEAM BOT - PHASE 5 ULTIMATE              ║
║      Multi-Account + Twitter Auto-Everything      ║
╚═══════════════════════════════════════════════════╝
  `, 'info');
  
  validateConfig();
  
  try {
    const allAccounts = utils.loadAccounts();
    
    if (allAccounts.length === 0) {
      utils.log('❌ No accounts found in accounts.json!', 'error');
      process.exit(1);
    }
    
    const startIndex = config.accountStart - 1;
    const endIndex = Math.min(startIndex + config.accountLimit, allAccounts.length);
    const accounts = allAccounts.slice(startIndex, endIndex);
    
    utils.log(`📋 Processing accounts: ${config.accountStart} to ${endIndex}`, 'success');
    
    const startTime = Date.now();
    const results = [];
    
    for (let i = 0; i < accounts.length; i++) {
      const result = await processAccount(accounts[i], i, accounts.length);
      results.push(result);
      
      if (i < accounts.length - 1) {
        utils.log(`\n⏳ Waiting ${config.accountDelay/1000}s...\n`, 'info');
        await utils.sleep(config.accountDelay);
      }
    }
    
    const duration = ((Date.now() - startTime) / 60000).toFixed(2);
    const successful = results.filter(r => r.success).length;
    const totalCompleted = results.reduce((sum, r) => sum + (r.completed || 0), 0);
    
    utils.log(`\n${'='.repeat(60)}`, 'info');
    utils.log(`📊 FINAL SUMMARY`, 'info');
    utils.log(`   Accounts: ${accounts.length}`, 'info');
    utils.log(`   ✅ Successful: ${successful}`, 'success');
    utils.log(`   📝 Tasks Completed: ${totalCompleted}`, 'success');
    utils.log(`   ⏱️ Time: ${duration} minutes`, 'info');
    
    utils.log('\n✨ All done!', 'success');
    
  } catch (error) {
    utils.log(`❌ Fatal error: ${error.message}`, 'error');
  }
}

runBot().catch(error => {
  utils.log(`❌ Unhandled error: ${error.message}`, 'error');
  process.exit(1);
});
