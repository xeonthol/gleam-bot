// Gleam Bot - Main File
// Phase 2: Complete Submit Tasks

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const dotenv = require('dotenv');
const utils = require('./utils');

puppeteer.use(StealthPlugin());
dotenv.config();

const config = {
  gleamUrl: process.env.GLEAM_URL,
  headless: process.env.HEADLESS === 'true',
  actionDelay: parseInt(process.env.ACTION_DELAY) || 2000,
  maxRetries: parseInt(process.env.MAX_RETRIES) || 3,
  pageTimeout: parseInt(process.env.PAGE_TIMEOUT) || 30000,
  stealthMode: process.env.STEALTH_MODE === 'true',
  saveScreenshots: process.env.SAVE_SCREENSHOTS === 'true',
  debug: process.env.DEBUG === 'true'
};

function validateConfig() {
  if (!config.gleamUrl || config.gleamUrl === 'https://gleam.io/xxxxx/your-campaign') {
    utils.log('❌ GLEAM_URL tidak valid! Edit .env file terlebih dahulu.', 'error');
    process.exit(1);
  }
  utils.log('✅ Config validated', 'success');
}

async function setupBrowser() {
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
  
  if (process.env.USE_PROXY === 'true' && process.env.PROXY_SERVER) {
    browserArgs.push(`--proxy-server=${process.env.PROXY_SERVER}`);
    utils.log(`🔒 Using proxy: ${process.env.PROXY_SERVER}`, 'info');
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
    utils.log(`🎭 User Agent: ${userAgent}`, 'info');
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
  utils.log(`🌐 Navigating to Gleam: ${config.gleamUrl}`, 'process');
  
  try {
    await page.goto(config.gleamUrl, {
      waitUntil: 'networkidle2',
      timeout: config.pageTimeout
    });
    
    utils.log('✅ Page loaded successfully', 'success');
    utils.log('⏳ Waiting for Gleam widget...', 'process');
    
    const widgetLoaded = await utils.waitForElement(
      page, 
      '.entry-method, .gleam-widget, [class*="gleam"]',
      config.pageTimeout,
      3
    );
    
    if (widgetLoaded) {
      utils.log('✅ Gleam widget loaded!', 'success');
      if (config.saveScreenshots) {
        await utils.takeScreenshot(page, 'gleam-loaded');
      }
      return true;
    } else {
      utils.log('❌ Gleam widget not found!', 'error');
      return false;
    }
    
  } catch (error) {
    utils.log(`❌ Navigation error: ${error.message}`, 'error');
    if (config.saveScreenshots) {
      await utils.takeScreenshot(page, 'navigation-error');
    }
    return false;
  }
}

async function analyzeEntryMethods(page) {
  utils.log('🔍 Analyzing available entry methods...', 'process');
  
  try {
    const entryMethods = await page.$$eval('.entry-method', methods => {
      return methods.map((method, index) => {
        const actionType = method.getAttribute('data-action') || 
                          method.getAttribute('data-entry-method') ||
                          'unknown';
        const title = method.querySelector('.entry-title, .entry-name, .entry-description')?.textContent.trim() || 'No title';
        const isCompleted = method.classList.contains('completed') || 
                           method.classList.contains('entered');
        
        return {
          index: index,
          action: actionType,
          title: title,
          completed: isCompleted
        };
      });
    });
    
    utils.log(`📋 Found ${entryMethods.length} entry methods:`, 'info');
    entryMethods.forEach((method) => {
      const status = method.completed ? '✅' : '⏳';
      utils.log(`   ${method.index + 1}. ${status} ${method.title} (${method.action})`, 'info');
    });
    
    return entryMethods;
    
  } catch (error) {
    utils.log(`❌ Error analyzing entry methods: ${error.message}`, 'error');
    return [];
  }
}

// NEW: Complete Submit Task (Email, Wallet, etc)
async function completeSubmitTask(page, taskIndex, taskType, userData) {
  utils.log(`📝 Attempting to complete submit task #${taskIndex + 1}: ${taskType}`, 'process');
  
  try {
    // Click pada entry method button
    const entryMethodSelector = `.entry-method:nth-of-type(${taskIndex + 1})`;
    await utils.safeClick(page, entryMethodSelector);
    await utils.sleep(1000);
    
    // Wait for input field to appear
    // Gleam biasanya menampilkan modal/popup dengan input field
    const inputSelectors = [
      'input[type="text"]',
      'input[type="email"]',
      'input[name*="email"]',
      'input[name*="wallet"]',
      'input[name*="address"]',
      'input[placeholder*="Enter"]',
      '.form-control',
      '.input-field'
    ];
    
    let inputFound = false;
    let inputSelector = null;
    
    // Cari input field yang muncul
    for (const selector of inputSelectors) {
      const exists = await utils.elementExists(page, selector);
      if (exists) {
        inputSelector = selector;
        inputFound = true;
        utils.log(`✅ Found input field: ${selector}`, 'success');
        break;
      }
    }
    
    if (!inputFound) {
      utils.log(`⚠️ No input field found for task #${taskIndex + 1}`, 'warning');
      return { success: false, reason: 'no_input_field' };
    }
    
    // Tentukan data yang akan di-submit berdasarkan task type
    let submitData = '';
    
    if (taskType.includes('email') || taskType.includes('Email')) {
      submitData = userData.email;
      utils.log(`📧 Submitting email: ${submitData}`, 'info');
    } else if (taskType.includes('wallet') || taskType.includes('address')) {
      submitData = userData.wallet;
      utils.log(`💰 Submitting wallet: ${submitData}`, 'info');
    } else if (taskType.includes('telegram') || taskType.includes('Telegram')) {
      submitData = userData.telegram?.username || '@username';
      utils.log(`📱 Submitting Telegram: ${submitData}`, 'info');
    } else if (taskType.includes('twitter') || taskType.includes('Twitter')) {
      submitData = userData.twitter?.username || '@username';
      utils.log(`🐦 Submitting Twitter: ${submitData}`, 'info');
    } else {
      // Default: pakai email
      submitData = userData.email;
      utils.log(`📝 Submitting default data: ${submitData}`, 'info');
    }
    
    // Type data ke input field
    await utils.safeType(page, inputSelector, submitData, { clear: true, delay: 100 });
    await utils.sleep(500);
    
    // Cari dan klik submit button
    const submitButtonSelectors = [
      'button[type="submit"]',
      'button:has-text("Submit")',
      'button:has-text("Continue")',
      'button:has-text("Enter")',
      '.submit-button',
      '.btn-primary',
      '.continue-button'
    ];
    
    let submitClicked = false;
    
    for (const selector of submitButtonSelectors) {
      try {
        const buttonExists = await page.$(selector);
        if (buttonExists) {
          await page.click(selector);
          submitClicked = true;
          utils.log(`✅ Clicked submit button: ${selector}`, 'success');
          break;
        }
      } catch (error) {
        continue;
      }
    }
    
    if (!submitClicked) {
      // Try pressing Enter as fallback
      await page.keyboard.press('Enter');
      utils.log(`⌨️ Pressed Enter to submit`, 'info');
    }
    
    // Wait for success indicator
    await utils.sleep(2000);
    
    // Check if task completed
    const taskCompleted = await page.$eval(
      entryMethodSelector,
      el => el.classList.contains('completed') || el.classList.contains('entered')
    ).catch(() => false);
    
    if (taskCompleted) {
      utils.log(`✅ Task #${taskIndex + 1} completed successfully!`, 'success');
      return { success: true, data: submitData };
    } else {
      utils.log(`⚠️ Task #${taskIndex + 1} might not be completed (no confirmation)`, 'warning');
      return { success: true, data: submitData, uncertain: true };
    }
    
  } catch (error) {
    utils.log(`❌ Error completing submit task #${taskIndex + 1}: ${error.message}`, 'error');
    if (config.saveScreenshots) {
      await utils.takeScreenshot(page, `submit-error-task-${taskIndex + 1}`);
    }
    return { success: false, error: error.message };
  }
}

// Process all tasks
async function processAllTasks(page, entryMethods, userData) {
  utils.log(`🎯 Processing ${entryMethods.length} tasks...`, 'process');
  
  const results = [];
  
  for (const method of entryMethods) {
    // Skip already completed tasks
    if (method.completed) {
      utils.log(`⏭️ Skipping task #${method.index + 1} - already completed`, 'info');
      results.push({ taskIndex: method.index, skipped: true, reason: 'already_completed' });
      continue;
    }
    
    // Identify task type
    const isSubmitTask = 
      method.action.includes('email') ||
      method.action.includes('wallet') ||
      method.action.includes('address') ||
      method.title.toLowerCase().includes('submit') ||
      method.title.toLowerCase().includes('enter your') ||
      method.title.toLowerCase().includes('provide');
    
    if (isSubmitTask) {
      utils.log(`📝 Detected SUBMIT task: ${method.title}`, 'info');
      const result = await completeSubmitTask(page, method.index, method.title, userData);
      results.push({ taskIndex: method.index, ...result });
      
      // Delay between tasks
      await utils.randomDelay(2000, 4000);
    } else {
      utils.log(`⏭️ Skipping ACTION task: ${method.title} (requires social auth)`, 'warning');
      results.push({ taskIndex: method.index, skipped: true, reason: 'action_task' });
    }
  }
  
  return results;
}

// Main bot function
async function runBot() {
  utils.log(`
╔═══════════════════════════════════════════════════╗
║           🤖 GLEAM BOT - PHASE 2                  ║
║           Complete Submit Tasks                   ║
╚═══════════════════════════════════════════════════╝
  `, 'info');
  
  validateConfig();
  
  let browser;
  
  try {
    // Load user data (dari .env atau accounts.json)
    const userData = {
      email: process.env.TWITTER_EMAIL || 'user@example.com',
      wallet: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1',
      telegram: { username: '@telegram_user' },
      twitter: { username: process.env.TWITTER_USERNAME || '@twitter_user' }
    };
    
    utils.log(`👤 Using account data:`, 'info');
    utils.log(`   Email: ${userData.email}`, 'info');
    utils.log(`   Wallet: ${userData.wallet}`, 'info');
    
    browser = await setupBrowser();
    const page = await setupPage(browser);
    
    const navigated = await navigateToGleam(page);
    if (!navigated) {
      throw new Error('Failed to navigate to Gleam campaign');
    }
    
    const entryMethods = await analyzeEntryMethods(page);
    if (entryMethods.length === 0) {
      utils.log('⚠️ No entry methods found. Campaign might be closed.', 'warning');
      throw new Error('No entry methods found');
    }
    
    // Process all tasks
    const results = await processAllTasks(page, entryMethods, userData);
    
    // Summary
    utils.log('\n📊 TASK COMPLETION SUMMARY:', 'info');
    const completed = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success && !r.skipped).length;
    const skipped = results.filter(r => r.skipped).length;
    
    utils.log(`✅ Completed: ${completed}`, 'success');
    utils.log(`❌ Failed: ${failed}`, 'error');
    utils.log(`⏭️ Skipped: ${skipped}`, 'warning');
    
    if (config.saveScreenshots) {
      await utils.takeScreenshot(page, 'final-result');
    }
    
    if (!config.headless) {
      utils.log('🔍 Browser akan tetap terbuka. Cek hasilnya manual! Tekan CTRL+C untuk close.', 'info');
      await new Promise(() => {});
    }
    
    utils.log('✅ Bot completed!', 'success');
    
  } catch (error) {
    utils.log(`❌ Fatal error: ${error.message}`, 'error');
    if (config.debug) {
      console.error(error);
    }
  } finally {
    if (browser && config.headless) {
      await browser.close();
      utils.log('🔒 Browser closed', 'info');
    }
  }
}

runBot().catch(error => {
  utils.log(`❌ Unhandled error: ${error.message}`, 'error');
  process.exit(1);
});
