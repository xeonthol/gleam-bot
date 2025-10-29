// Gleam Bot - Enhanced Version with Twitter Cookie Auth
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
  debug: process.env.DEBUG === 'true',
  manualRepostLinks: process.env.MANUAL_REPOST_LINKS ? process.env.MANUAL_REPOST_LINKS.split(',') : [
    "https://x.com/yourusername/status/123456789"
  ],
  myTwitterUsername: process.env.MY_TWITTER_USERNAME || "your_twitter_username"
};

function validateConfig() {
  if (!config.gleamUrl || config.gleamUrl === 'https://gleam.io/xxxxx/your-campaign') {
    utils.log('❌ GLEAM_URL tidak valid! Edit .env file.', 'error');
    process.exit(1);
  }
  
  if (config.manualRepostLinks[0].includes("yourusername")) {
    utils.log('⚠️ PERINGATAN: Manual repost link belum dikonfigurasi!', 'warning');
    utils.log('📝 Silakan buat repost di Twitter dan update config.manualRepostLinks', 'info');
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
    '--disable-gpu',
    '--disable-blink-features=AutomationControlled'
  ];
  
  if (config.headless) {
    browserArgs.push('--headless=new');
  }
  
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
    Object.defineProperty(navigator, 'platform', { get: () => 'Win32' });
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
    const widgetLoaded = await utils.waitForElement(target, '.entry-method, .gleam-widget, .task', config.pageTimeout, 3);
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
      const entryElements = document.querySelectorAll('.entry-method, .task, [data-task]');
      
      entryElements.forEach((el, idx) => {
        const text = el.innerText || el.textContent || '';
        const classes = el.className || '';
        
        let type = 'unknown';
        if (text.toLowerCase().includes('twitter') || text.toLowerCase().includes('retweet') || 
            text.toLowerCase().includes('follow') || text.toLowerCase().includes('x.com') || classes.includes('twitter')) {
          type = 'twitter';
        } else if (text.toLowerCase().includes('visit') || text.toLowerCase().includes('website')) {
          type = 'visit';
        } else if (text.toLowerCase().includes('email') || text.toLowerCase().includes('subscribe')) {
          type = 'email';
        } else if (text.toLowerCase().includes('submit link') || text.toLowerCase().includes('repost')) {
          type = 'submit_link';
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
  utils.log(`🐦 Processing Twitter entry...`, 'process');
  
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

    const clicked = await utils.clickGleamTask(target, 'Follow', config.actionDelay);
    
    if (!clicked) {
      const selector = `.entry-method:nth-child(${method.index + 1}) button, .entry-method:nth-child(${method.index + 1}) a`;
      const fallbackClicked = await utils.clickElement(target, selector, config.actionDelay);
      
      if (!fallbackClicked) {
        utils.log('❌ Could not click Twitter entry button', 'error');
        return false;
      }
    }

    await utils.sleep(2000);

    const authSuccess = await twitterOAuth.handleTwitterAuth(page, account);
    if (!authSuccess) {
      utils.log('❌ Twitter OAuth failed', 'error');
      return false;
    }

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

    const clicked = await utils.clickGleamTask(target, 'Visit', config.actionDelay);
    
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

    const inputSelector = `input[type="email"]`;
    const input = await target.$(inputSelector);
    
    if (input) {
      await input.type(account.email, { delay: 100 });
      await utils.sleep(1000);
      
      await utils.clickGleamTask(target, 'Submit', config.actionDelay);
      utils.log('✅ Email entry completed', 'success');
      return true;
    }
    
    return false;
  } catch (error) {
    utils.log(`❌ Email entry error: ${error.message}`, 'error');
    return false;
  }
}

async function handleSubmitLinkEntry(page, method, account) {
  utils.log(`🔗 Processing submit link entry: ${method.text.substring(0, 50)}...`, 'process');
  
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

    const clicked = await utils.clickGleamTask(target, 'Submit link', config.actionDelay);
    
    if (!clicked) {
      const fallbackClicked = await utils.clickGleamTask(target, 'repost', config.actionDelay);
      if (!fallbackClicked) {
        utils.log('❌ Could not click submit link task', 'error');
        return false;
      }
    }

    await utils.sleep(3000);

    const inputSelectors = [
      'input[type="url"]',
      'input[type="text"]',
      'input[placeholder*="link"]',
      'input[placeholder*="http"]',
      'textarea',
      'input[name*="link"]',
      'input[name*="url"]',
      '.gleam-form input',
      'form input[type="text"]'
    ];

    let inputField = null;
    for (const selector of inputSelectors) {
      try {
        inputField = await target.$(selector);
        if (inputField) {
          utils.log(`✅ Found input field with selector: ${selector}`, 'success');
          
          const isVisible = await target.evaluate((el) => {
            const style = window.getComputedStyle(el);
            return style.display !== 'none' && 
                   style.visibility !== 'hidden' && 
                   !el.disabled &&
                   el.offsetWidth > 0 && 
                   el.offsetHeight > 0;
          }, inputField);
          
          if (!isVisible) {
            utils.log('⚠️ Input field found but not visible/active', 'warning');
            inputField = null;
            continue;
          }
          break;
        }
      } catch (error) {
        continue;
      }
    }

    if (!inputField) {
      utils.log('❌ No usable input field found for link submission', 'error');
      const allInputs = await target.$$('input, textarea');
      utils.log(`🔍 Found ${allInputs.length} total input/textarea elements`, 'info');
      
      for (let i = 0; i < allInputs.length; i++) {
        const input = allInputs[i];
        const placeholder = await target.evaluate(el => el.placeholder || 'no-placeholder', input);
        const type = await target.evaluate(el => el.type || 'no-type', input);
        utils.log(`  Input ${i}: type=${type}, placeholder=${placeholder}`, 'info');
      }
      
      return false;
    }

    try {
      const linkIndex = account.index || 0;
      const manualLink = config.manualRepostLinks[linkIndex % config.manualRepostLinks.length];
      
      if (!manualLink || manualLink.includes("yourusername")) {
        utils.log('❌ Manual repost link not configured! Please update config.manualRepostLinks', 'error');
        return false;
      }

      await target.evaluate((element) => {
        element.focus();
        element.value = '';
      }, inputField);
      
      await utils.sleep(500);
      
      await inputField.type(manualLink, { delay: 50 });
      utils.log(`✅ Link entered: ${manualLink}`, 'success');
      
      await utils.sleep(1000);

    } catch (inputError) {
      utils.log(`❌ Input error: ${inputError.message}`, 'error');
      
      const manualLink = config.manualRepostLinks[0];
      await target.evaluate((element, link) => {
        element.value = link;
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
      }, inputField, manualLink);
      
      utils.log(`✅ Link set via evaluate: ${manualLink}`, 'success');
    }

    let submitSuccess = false;
    
    const submitMethods = [
      async () => {
        const submitSuccess = await utils.clickGleamTask(target, 'Submit', 2000);
        if (submitSuccess) {
          utils.log('✅ Submitted via submit button', 'success');
          return true;
        }
        return false;
      },
      
      async () => {
        await inputField.press('Enter');
        await utils.sleep(2000);
        utils.log('✅ Submitted via Enter key', 'success');
        return true;
      },
      
      async () => {
        const submitButtons = await target.$$('button[type="submit"], input[type="submit"], .submit-btn, button:has-text("Submit"), button:has-text("Confirm")');
        for (const btn of submitButtons) {
          try {
            await btn.click();
            await utils.sleep(2000);
            utils.log('✅ Submitted via generic submit button', 'success');
            return true;
          } catch (e) {
            continue;
          }
        }
        return false;
      }
    ];

    for (const method of submitMethods) {
      if (await method()) {
        submitSuccess = true;
        break;
      }
    }

    if (submitSuccess) {
      utils.log('✅ Link submitted successfully', 'success');
      return true;
    } else {
      utils.log('❌ Could not submit link', 'error');
      return false;
    }

  } catch (error) {
    utils.log(`❌ Submit link entry error: ${error.message}`, 'error');
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
      case 'submit_link':
        success = await handleSubmitLinkEntry(page, method, account);
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
      if (!fs.existsSync('screenshots')) {
        fs.mkdirSync('screenshots');
      }
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

process.on('SIGINT', async () => {
  utils.log('\n⚠️ Process interrupted by user', 'warning');
  process.exit(0);
});

process.on('unhandledRejection', (reason, promise) => {
  utils.log(`❌ Unhandled rejection: ${reason}`, 'error');
});

if (require.main === module) {
  runBot().catch(error => {
    utils.log(`❌ Bot crashed: ${error.message}`, 'error');
    process.exit(1);
  });
}

module.exports = { runBot };
