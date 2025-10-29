// Gleam Bot - Phase 5: Multi-Account + Twitter OAuth + Auto Retweet + 2Captcha Solver

const fs = require('fs');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const dotenv = require('dotenv');
const utils = require('./utils');
const twitterOAuth = require('./twitter-oauth');
const twitterActions = require('./twitter-actions');
const CaptchaSolver = require('./captcha-solver');

puppeteer.use(StealthPlugin());
dotenv.config();

const config = {
  gleamUrl: process.env.GLEAM_URL,
  captchaApiKey: process.env.CAPTCHA_API_KEY || "",
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
    args: browserArgs
  });
  utils.log('✅ Browser launched', 'success');
  return browser;
}

async function setupPage(browser) {
  const page = await browser.newPage();
  const userAgent = utils.getRandomUserAgent();
  await page.setUserAgent(userAgent);
  if (config.debug) utils.log(`🎭 User Agent: ${userAgent.substring(0, 50)}...`, 'info');
  await page.setExtraHTTPHeaders({
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
  });
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
    Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
    window.chrome = { runtime: {} };
  });
  page.setDefaultTimeout(config.pageTimeout);
  page.setDefaultNavigationTimeout(config.pageTimeout);
  utils.log('✅ Page configured with anti-detection', 'success');
  return page;
}

async function navigateToGleam(page) {
  utils.log(`🌐 Navigating to Gleam...`, 'process');
  try {
    await page.goto(config.gleamUrl, { waitUntil: 'networkidle2', timeout: config.pageTimeout });
    utils.log('✅ Page loaded', 'success');
    await utils.sleep(3000);

    // Deteksi dan atasi captcha Gleam (reCAPTCHA v2)
    if (config.captchaApiKey) {
      const hasCaptcha = await page.$('iframe[src*="recaptcha"]');
      if (hasCaptcha) {
        utils.log('🧠 reCAPTCHA detected! Solving via 2Captcha...', 'process');
        const solver = new CaptchaSolver(config.captchaApiKey);
        const solved = await solver.solveRecaptcha(page);
        if (solved) {
          utils.log('✅ reCAPTCHA solved successfully', 'success');
        } else {
          utils.log('❌ Failed to solve reCAPTCHA', 'error');
        }
      }
    }

    // iframe gleam check
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

    const target = gleamFrame || page;
    const widgetLoaded = await utils.waitForElement(target, '.entry-method, .gleam-widget', config.pageTimeout, 3);
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
    const frames = page.frames();
    let gleamFrame = null;
    for (const frame of frames) {
      if (frame.url().includes("gleam.io") || frame.url().includes("embed")) {
        gleamFrame = frame;
        break;
      }
    }
    const target = gleamFrame || page;

    const methods = await target.evaluate(() => {
      const entries = [];
      const entryElements = document.querySelectorAll('.entry-method');
      
      entryElements.forEach((el, idx) => {
        const text = el.innerText || el.textContent || '';
        const classes = el.className || '';
        
        let type = 'unknown';
        if (text.toLowerCase().includes('twitter') || text.toLowerCase().includes('retweet') || 
            text.toLowerCase().includes('follow') || classes.includes('twitter')) {
          type = 'twitter';
        } else if (text.toLowerCase().includes('visit') || text.toLowerCase().includes('link')) {
          type = 'visit';
        } else if (text.toLowerCase().includes('email') || text.toLowerCase().includes('subscribe')) {
          type = 'email';
        }
        
        entries.push({
          index: idx,
          type: type,
          text: text.substring(0, 100),
          classes: classes
        });
      });
      
      return entries;
    });

    utils.log(`✅ Found ${methods.length} entry methods`, 'success');
    methods.forEach(m => {
      utils.log(`  [${m.index}] ${m.type.toUpperCase()}: ${m.text.substring(0, 50)}...`, 'info');
    });
    
    return methods;
  } catch (error) {
    utils.log(`❌ Error analyzing methods: ${error.message}`, 'error');
    return [];
  }
}

async function handleTwitterEntry(page, method, account) {
  utils.log(`🐦 Processing Twitter entry: ${method.text.substring(0, 50)}...`, 'process');
  
  try {
    const frames = page.frames();
    let gleamFrame = null;
    for (const frame of frames) {
      if (frame.url().includes("gleam.io") || frame.url().includes("embed")) {
        gleamFrame = frame;
        break;
      }
    }
    const target = gleamFrame || page;

    // Click entry method button
    const selector = `.entry-method:nth-child(${method.index + 1}) button, .entry-method:nth-child(${method.index + 1}) a`;
    const clicked = await utils.clickElement(target, selector, config.actionDelay);
    
    if (!clicked) {
      utils.log('❌ Could not click Twitter entry button', 'error');
      return false;
    }

    await utils.sleep(2000);

    // Handle Twitter OAuth
    const oauthSuccess = await twitterOAuth.handleTwitterAuth(page, account);
    if (!oauthSuccess) {
      utils.log('❌ Twitter OAuth failed', 'error');
      return false;
    }

    // Perform Twitter actions (retweet/follow)
    const actionSuccess = await twitterActions.performTwitterActions(page, account);
    if (!actionSuccess) {
      utils.log('❌ Twitter actions failed', 'error');
      return false;
    }

    utils.log('✅ Twitter entry completed', 'success');
    return true;
  } catch (error) {
    utils.log(`❌ Twitter entry error: ${error.message}`, 'error');
    return false;
  }
}

async function handleVisitEntry(page, method) {
  utils.log(`🔗 Processing visit entry: ${method.text.substring(0, 50)}...`, 'process');
  
  try {
    const frames = page.frames();
    let gleamFrame = null;
    for (const frame of frames) {
      if (frame.url().includes("gleam.io") || frame.url().includes("embed")) {
        gleamFrame = frame;
        break;
      }
    }
    const target = gleamFrame || page;

    const selector = `.entry-method:nth-child(${method.index + 1}) button, .entry-method:nth-child(${method.index + 1}) a`;
    const clicked = await utils.clickElement(target, selector, config.actionDelay);
    
    if (clicked) {
      await utils.sleep(3000);
      utils.log('✅ Visit entry completed', 'success');
      return true;
    }
    
    return false;
  } catch (error) {
    utils.log(`❌ Visit entry error: ${error.message}`, 'error');
    return false;
  }
}

async function handleEmailEntry(page, method, account) {
  utils.log(`📧 Processing email entry...`, 'process');
  
  try {
    const frames = page.frames();
    let gleamFrame = null;
    for (const frame of frames) {
      if (frame.url().includes("gleam.io") || frame.url().includes("embed")) {
        gleamFrame = frame;
        break;
      }
    }
    const target = gleamFrame || page;

    const inputSelector = `.entry-method:nth-child(${method.index + 1}) input[type="email"]`;
    const input = await target.$(inputSelector);
    
    if (input) {
      await input.type(account.email, { delay: 100 });
      await utils.sleep(1000);
      
      const submitSelector = `.entry-method:nth-child(${method.index + 1}) button`;
      await utils.clickElement(target, submitSelector, config.actionDelay);
      
      utils.log('✅ Email entry completed', 'success');
      return true;
    }
    
    return false;
  } catch (error) {
    utils.log(`❌ Email entry error: ${error.message}`, 'error');
    return false;
  }
}

async function processEntryMethod(page, method, account, retries = 0) {
  if (retries >= config.maxRetries) {
    utils.log(`❌ Max retries reached for method ${method.index}`, 'error');
    return false;
  }

  try {
    let success = false;
    
    switch (method.type) {
      case 'twitter':
        success = await handleTwitterEntry(page, method, account);
        break;
      case 'visit':
        success = await handleVisitEntry(page, method);
        break;
      case 'email':
        success = await handleEmailEntry(page, method, account);
        break;
      default:
        utils.log(`⚠️ Unknown entry type: ${method.type}`, 'warning');
        success = false;
    }

    if (!success && retries < config.maxRetries - 1) {
      utils.log(`🔄 Retrying method ${method.index} (attempt ${retries + 2}/${config.maxRetries})`, 'warning');
      await utils.sleep(config.actionDelay);
      return await processEntryMethod(page, method, account, retries + 1);
    }

    return success;
  } catch (error) {
    utils.log(`❌ Error processing method: ${error.message}`, 'error');
    if (retries < config.maxRetries - 1) {
      return await processEntryMethod(page, method, account, retries + 1);
    }
    return false;
  }
}

async function processAccount(browser, account, accountNumber) {
  utils.log(`\n${'='.repeat(60)}`, 'info');
  utils.log(`👤 Processing Account ${accountNumber}: ${account.username}`, 'info');
  utils.log(`${'='.repeat(60)}`, 'info');

  let page = null;
  try {
    page = await setupPage(browser);
    
    const navigated = await navigateToGleam(page);
    if (!navigated) {
      utils.log(`❌ Failed to load Gleam for ${account.username}`, 'error');
      return { success: false, account: account.username };
    }

    const methods = await analyzeEntryMethods(page);
    if (methods.length === 0) {
      utils.log(`⚠️ No entry methods found for ${account.username}`, 'warning');
      return { success: false, account: account.username };
    }

    let completedCount = 0;
    for (const method of methods) {
      const success = await processEntryMethod(page, method, account);
      if (success) completedCount++;
      await utils.sleep(config.actionDelay);
    }

    utils.log(`✅ Account ${account.username} completed: ${completedCount}/${methods.length} entries`, 'success');
    
    if (config.saveScreenshots) {
      const timestamp = Date.now();
      await page.screenshot({ path: `screenshots/${account.username}_${timestamp}.png`, fullPage: true });
      utils.log(`📸 Screenshot saved`, 'info');
    }

    return { success: true, account: account.username, completed: completedCount, total: methods.length };
  } catch (error) {
    utils.log(`❌ Error processing account ${account.username}: ${error.message}`, 'error');
    return { success: false, account: account.username, error: error.message };
  } finally {
    if (page) await page.close();
  }
}

async function runBot() {
  utils.logBanner();
  validateConfig();

  const accounts = utils.loadAccounts();
  if (accounts.length === 0) {
    utils.log('❌ No accounts found in accounts.json', 'error');
    process.exit(1);
  }

  const accountsToProcess = accounts.slice(
    config.accountStart - 1,
    config.accountStart - 1 + config.accountLimit
  );

  utils.log(`📊 Total accounts loaded: ${accounts.length}`, 'info');
  utils.log(`🎯 Processing accounts: ${config.accountStart} to ${config.accountStart + accountsToProcess.length - 1}`, 'info');

  let browser = null;
  const results = [];

  try {
    browser = await setupBrowser();

    for (let i = 0; i < accountsToProcess.length; i++) {
      const account = accountsToProcess[i];
      const accountNumber = config.accountStart + i;
      
      const result = await processAccount(browser, account, accountNumber);
      results.push(result);

      if (i < accountsToProcess.length - 1) {
        utils.log(`⏳ Waiting ${config.accountDelay / 1000}s before next account...`, 'info');
        await utils.sleep(config.accountDelay);
      }
    }

    // Summary
    utils.log(`\n${'='.repeat(60)}`, 'info');
    utils.log(`📊 FINAL SUMMARY`, 'info');
    utils.log(`${'='.repeat(60)}`, 'info');
    
    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    
    utils.log(`✅ Successful: ${successful}`, 'success');
    utils.log(`❌ Failed: ${failed}`, 'error');
    utils.log(`📈 Success Rate: ${((successful / results.length) * 100).toFixed(1)}%`, 'info');

  } catch (error) {
    utils.log(`❌ Fatal error: ${error.message}`, 'error');
  } finally {
    if (browser) {
      await browser.close();
      utils.log('🔚 Browser closed', 'info');
    }
  }
}

// Handle process termination
process.on('SIGINT', async () => {
  utils.log('\n⚠️ Process interrupted by user', 'warning');
  process.exit(0);
});

process.on('unhandledRejection', (reason, promise) => {
  utils.log(`❌ Unhandled rejection: ${reason}`, 'error');
});

// Run the bot
if (require.main === module) {
  runBot().catch(error => {
    utils.log(`❌ Bot crashed: ${error.message}`, 'error');
    process.exit(1);
  });
}

module.exports = { runBot };
