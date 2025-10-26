// Gleam Bot - Clean + Auto-Mapping Version

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const dotenv = require('dotenv');
const utils = require('./utils');
const twitterOAuth = require('./twitter-oauth');

puppeteer.use(StealthPlugin());
dotenv.config();

const config = {
  gleamUrl: process.env.GLEAM_URL,
  headless: process.env.HEADLESS === 'true',
  actionDelay: parseInt(process.env.ACTION_DELAY) || 2000,
  maxRetries: parseInt(process.env.MAX_RETRIES) || 3,
  pageTimeout: parseInt(process.env.PAGE_TIMEOUT) || 30000,
  accountDelay: parseInt(process.env.ACCOUNT_DELAY) || 5000,
  stealthMode: process.env.STEALTH_MODE === 'true',
  saveScreenshots: process.env.SAVE_SCREENSHOTS === 'true',
  debug: process.env.DEBUG === 'true'
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
    '--no-first-run',
    '--no-zygote'
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
  return page;
}

async function navigateToGleam(page) {
  utils.log(`🌐 Navigating to Gleam...`, 'process');
  try {
    await page.goto(config.gleamUrl, { waitUntil: 'networkidle2' });
    await utils.waitForElement(page, '.entry-method');
    utils.log('✅ Gleam page loaded', 'success');
    return true;
  } catch (e) {
    utils.log(`❌ Failed to load Gleam: ${e.message}`, 'error');
    return false;
  }
}

async function analyzeEntryMethods(page) {
  try {
    const methods = await page.$$eval('.entry-method', els =>
      els.map((el, i) => ({
        index: i,
        title: el.textContent.trim(),
        completed: el.classList.contains('completed') || el.classList.contains('entered')
      }))
    );
    utils.log(`📋 Found ${methods.length} tasks`, 'info');
    return methods;
  } catch {
    return [];
  }
}

async function completeSubmitTask(page, taskIndex, title, account) {
  const selector = `.entry-method:nth-of-type(${taskIndex + 1})`;
  await utils.safeClick(page, selector);
  await utils.sleep(1000);

  const mappings = {
    wallet: 'wallet',
    address: 'wallet',
    email: 'email',
    telegram: 'telegram.username',
    twitter: 'twitter.username',
    repost: 'repost_link',
    uid: 'kucoin_uid'
  };

  let key = Object.keys(mappings).find(k => title.toLowerCase().includes(k)) || 'email';
  const value = utils.getNestedValue(account, mappings[key]);

  if (!value) {
    utils.log(`⚠️ No data found for "${key}"`, 'warning');
    return false;
  }

  const input = await page.$('input, textarea');
  if (input) {
    await utils.safeType(page, 'input, textarea', value, { clear: true });
    await page.keyboard.press('Enter');
    await utils.randomDelay(1500, 2500);
    utils.log(`✅ Submitted ${key}: ${value}`, 'success');
    return true;
  }

  utils.log(`⚠️ Input not found for ${title}`, 'warning');
  return false;
}

async function processAllTasks(page, methods, account) {
  for (const m of methods) {
    if (m.completed) {
      utils.log(`⏭️ Skip ${m.title}`, 'info');
      continue;
    }

    if (m.title.toLowerCase().includes('submit') || m.title.toLowerCase().includes('enter')) {
      await completeSubmitTask(page, m.index, m.title, account);
      await utils.randomDelay(2000, 4000);
    } 
    
    else if (m.title.toLowerCase().includes('twitter') && m.title.toLowerCase().includes('follow')) {
      utils.log(`🐦 Detected Twitter Follow task: ${m.title}`, 'info');
      await twitterOAuth.completeTwitterFollowTask(page, m.index, account.twitter);
      await utils.randomDelay(3000, 6000);
}

    else {
      utils.log(`⏭️ Skip non-submit task: ${m.title}`, 'warning');
    }
  }
}

async function processAccount(account, idx, total) {
  utils.log(`\n🧩 Processing Account ${idx + 1}/${total} → ${account.email}`, 'process');
  const browser = await setupBrowser(account.proxy || null);
  const page = await setupPage(browser);

  try {
    const ok = await navigateToGleam(page);
    if (!ok) throw new Error('Navigation failed');
    const methods = await analyzeEntryMethods(page);
    if (methods.length === 0) throw new Error('No tasks found');
    await processAllTasks(page, methods, account);
    utils.log(`✅ Account ${account.name} done`, 'success');
  } catch (err) {
    utils.log(`❌ Error on ${account.name}: ${err.message}`, 'error');
  } finally {
    if (config.saveScreenshots) await utils.takeScreenshot(page, `account-${account.id}`);
    await browser.close();
  }
}

(async () => {
  validateConfig();
  const accounts = utils.loadAccounts();
  if (accounts.length === 0) {
    utils.log('❌ No accounts in accounts.json', 'error');
    return;
  }

  utils.log(`📦 Loaded ${accounts.length} accounts`, 'success');
  for (let i = 0; i < accounts.length; i++) {
    await processAccount(accounts[i], i, accounts.length);
    if (i < accounts.length - 1) {
      await utils.log(`⏳ Waiting ${config.accountDelay / 1000}s before next account...`, 'info');
      await utils.sleep(config.accountDelay);
    }
  }

  utils.log(`🎉 All accounts processed!`, 'success');
})();
