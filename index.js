// Gleam Bot - Phase 5: Multi-Account + Twitter OAuth + Auto Retweet + 2Captcha Solver

const fs = require('fs');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const dotenv = require('dotenv');
const utils = require('./utils');
const twitterOAuth = require('./twitter-oauth');
const twitterActions = require('./twitter-actions');
const CaptchaSolver = require('./captcha-solver'); // 🧩 NEW: 2Captcha integration

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

    // 🧩 NEW: Deteksi dan atasi captcha Gleam (reCAPTCHA v2)
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

// 🧩 Bagian bawah tetap sama — jangan ubah apa pun
// Semua fungsi analyzeEntryMethods, processAccount, runBot dll tetap seperti punyamu
// (cukup paste semua kode lama kamu dari "async function analyzeEntryMethods..." sampai akhir)

