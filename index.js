// Gleam Bot - Clean + Auto-Mapping Version

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
  accountDelay: parseInt(process.env.ACCOUNT_DELAY) || 10000,
  saveScreenshots: process.env.SAVE_SCREENSHOTS === 'true'
};

function validateConfig() {
  if (!config.gleamUrl) {
    utils.log('❌ GLEAM_URL tidak ditemukan di .env!', 'error');
    process.exit(1);
  }
  utils.log('✅ Config validated', 'success');
}

async function setupBrowser(proxyServer = null) {
  const args = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-blink-features=AutomationControlled'
  ];

  if (proxyServer) {
    args.push(`--proxy-server=${proxyServer}`);
    utils.log(`🔒 Using proxy: ${proxyServer}`, 'info');
  }

  const browser = await puppeteer.launch({
    headless: config.headless,
    args,
    defaultViewport: { width: 1366, height: 768 }
  });

  return browser;
}

async function setupPage(browser) {
  const page = await browser.newPage();
  await page.setUserAgent(utils.getRandomUserAgent());
  page.setDefaultTimeout(config.pageTimeout);
  page.setDefaultNavigationTimeout(config.pageTimeout);
  
  // Anti-detection: Override webdriver
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
  });
  
  return page;
}

async function navigateToGleam(page) {
  utils.log(`🌐 Navigating to Gleam...`, 'process');
  try {
    await page.goto(config.gleamUrl, { 
      waitUntil: 'networkidle2',
      timeout: config.pageTimeout
    });
    await utils.waitForElement(page, 'div.entry-method', config.pageTimeout);
    await utils.sleep(2000);
    utils.log('✅ Gleam page loaded', 'success');
    return true;
  } catch (e) {
    utils.log(`❌ Failed to load Gleam: ${e.message}`, 'error');
    return false;
  }
}

async function analyzeEntryMethods(page) {
  try {
    const methods = await page.$$eval('div.entry-method', els =>
      els.map((el, i) => ({
        index: i,
        title: el.textContent.trim().substring(0, 100),
        completed: el.classList.contains('completed-entry-method') || 
                   el.classList.contains('done') ||
                   el.querySelector('.done') !== null,
        id: el.id || null
      }))
    );
    
    utils.log(`📋 Found ${methods.length} tasks`, 'info');
    methods.forEach((m, i) => {
      const status = m.completed ? '✅' : '❌';
      utils.log(`  ${i+1}. ${status} ${m.title}`, 'info');
    });
    
    return methods;
  } catch (e) {
    utils.log(`❌ Failed to analyze tasks: ${e.message}`, 'error');
    return [];
  }
}

async function completeSubmitTask(page, taskIndex, title, account) {
  utils.log(`📝 Processing submit task: ${title}`, 'info');
  
  // Klik task menggunakan evaluate (lebih reliable)
  const clicked = await page.evaluate((idx) => {
    const tasks = document.querySelectorAll('div.entry-method');
    const task = tasks[idx];
    if (task && !task.classList.contains('completed-entry-method')) {
      const link = task.querySelector('a.enter-link');
      if (link) {
        link.click();
        return true;
      }
    }
    return false;
  }, taskIndex);
  
  if (!clicked) {
    utils.log(`⚠️ Task already done or not clickable`, 'warning');
    return false;
  }
  
  await utils.sleep(2000);

  // Mapping keywords
  const mappings = {
    wallet: 'wallet',
    address: 'wallet',
    email: 'email',
    telegram: 'telegram.username',
    twitter: 'twitter.username',
    repost: 'repost_link',
    uid: 'kucoin_uid',
    kucid: 'kucoin_uid'
  };

  let key = Object.keys(mappings).find(k => 
    title.toLowerCase().includes(k)
  ) || 'email';
  
  const value = utils.getNestedValue(account, mappings[key]);

  if (!value) {
    utils.log(`⚠️ No data found for "${key}" in account`, 'warning');
    return false;
  }

  // Cari input field yang muncul
  const inputSelector = 'textarea[name="data"], input[type="text"], input[type="url"], input[type="email"], textarea';
  
  try {
    await page.waitForSelector(inputSelector, { timeout: 5000 });
    
    // Clear & type
    await page.evaluate((sel) => {
      const input = document.querySelector(sel);
      if (input) input.value = '';
    }, inputSelector);
    
    await page.type(inputSelector, value, { delay: 50 });
    await utils.sleep(500);
    
    // Klik button Continue/Submit
    const buttonClicked = await page.evaluate(() => {
      const buttons = document.querySelectorAll('.form-actions .btn-primary, button.btn-primary, a.btn-primary');
      const btn = Array.from(buttons).find(b => 
        b.textContent.includes('Continue') || 
        b.textContent.includes('Submit')
      );
      if (btn) {
        btn.click();
        return true;
      }
      return false;
    });
    
    if (buttonClicked) {
      await utils.randomDelay(2000, 3000);
      utils.log(`✅ Submitted ${key}: ${value}`, 'success');
      return true;
    } else {
      utils.log(`⚠️ Continue button not found`, 'warning');
      return false;
    }
    
  } catch (e) {
    utils.log(`❌ Input field not found: ${e.message}`, 'error');
    return false;
  }
}

async function processAllTasks(page, methods, account) {
  let completedCount = 0;
  
  for (const m of methods) {
    if (m.completed) {
      utils.log(`⏭️  Skip (already done): ${m.title}`, 'info');
      continue;
    }

    const titleLower = m.title.toLowerCase();
    
    // Deteksi task submit
    if (titleLower.includes('submit') || titleLower.includes('enter') || 
        titleLower.includes('your') && (titleLower.includes('email') || 
        titleLower.includes('wallet') || titleLower.includes('uid'))) {
      
      const success = await completeSubmitTask(page, m.index, m.title, account);
      if (success) completedCount++;
      await utils.randomDelay(2000, 4000);
    } 
    
    // Deteksi task Twitter follow
    else if (titleLower.includes('follow') && titleLower.includes('twitter' || titleLower.includes('x'))) {
      utils.log(`🐦 Twitter follow task detected (manual action required): ${m.title}`, 'warning');
      // TODO: Implement OAuth flow
      await utils.randomDelay(1000, 2000);
    }
    
    // Task lainnya
    else {
      utils.log(`⏭️  Skipped (not auto-supported): ${m.title}`, 'warning');
    }
  }
  
  utils.log(`📊 Completed ${completedCount} new tasks`, 'success');
  return completedCount;
}

async function processAccount(account, idx, total) {
  utils.log(`\n${'='.repeat(60)}`, 'info');
  utils.log(`🧩 Account ${idx + 1}/${total}: ${account.email}`, 'process');
  utils.log(`${'='.repeat(60)}`, 'info');
  
  const browser = await setupBrowser(account.proxy || null);
  const page = await setupPage(browser);

  try {
    const ok = await navigateToGleam(page);
    if (!ok) throw new Error('Failed to load Gleam page');
    
    const methods = await analyzeEntryMethods(page);
    if (methods.length === 0) throw new Error('No tasks found on page');
    
    const completed = await processAllTasks(page, methods, account);
    
    utils.log(`✅ Account ${account.email} finished (${completed} tasks completed)`, 'success');
    return { success: true, completed };
    
  } catch (err) {
    utils.log(`❌ Error processing ${account.email}: ${err.message}`, 'error');
    
    if (config.saveScreenshots) {
      await utils.takeScreenshot(page, `error-${account.email}-${Date.now()}`);
    }
    
    return { success: false, error: err.message };
    
  } finally {
    if (config.saveScreenshots) {
      await utils.takeScreenshot(page, `final-${account.email}`);
    }
    await browser.close();
  }
}

// Main execution
(async () => {
  console.clear();
  utils.log(`\n${'='.repeat(60)}`, 'success');
  utils.log(`🤖 GLEAM BOT STARTED`, 'success');
  utils.log(`${'='.repeat(60)}\n`, 'success');
  
  validateConfig();
  
  const accounts = utils.loadAccounts();
  if (accounts.length === 0) {
    utils.log('❌ No accounts found in accounts.json', 'error');
    return;
  }

  utils.log(`📦 Loaded ${accounts.length} account(s)\n`, 'success');
  
  const results = [];
  
  for (let i = 0; i < accounts.length; i++) {
    const result = await processAccount(accounts[i], i, accounts.length);
    results.push({ account: accounts[i].email, ...result });
    
    if (i < accounts.length - 1) {
      const waitTime = config.accountDelay / 1000;
      utils.log(`\n⏳ Waiting ${waitTime}s before next account...\n`, 'info');
      await utils.sleep(config.accountDelay);
    }
  }

  // Summary
  utils.log(`\n${'='.repeat(60)}`, 'success');
  utils.log(`📊 SUMMARY`, 'success');
  utils.log(`${'='.repeat(60)}`, 'success');
  
  const successful = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  
  utils.log(`✅ Successful: ${successful}/${accounts.length}`, 'success');
  utils.log(`❌ Failed: ${failed}/${accounts.length}`, 'error');
  
  // Save failed accounts
  const failedAccounts = results
    .filter(r => !r.success)
    .map(r => ({ email: r.account, error: r.error }));
  
  if (failedAccounts.length > 0) {
    utils.saveFailedAccounts(failedAccounts);
  }
  
  utils.log(`\n🎉 Bot finished!`, 'success');
})();
