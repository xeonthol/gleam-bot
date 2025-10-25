// Gleam Bot - Main File
// Phase 1: Basic Setup & Navigation

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const dotenv = require('dotenv');
const utils = require('./utils');

// Use stealth plugin
puppeteer.use(StealthPlugin());

// Load environment variables
dotenv.config();

// Configuration
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

// Validate config
function validateConfig() {
  if (!config.gleamUrl || config.gleamUrl === 'https://gleam.io/xxxxx/your-campaign') {
    utils.log('❌ GLEAM_URL tidak valid! Edit .env file terlebih dahulu.', 'error');
    process.exit(1);
  }
  
  utils.log('✅ Config validated', 'success');
}

// Setup browser with anti-detection
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
  
  // Add proxy if configured
  if (process.env.USE_PROXY === 'true' && process.env.PROXY_SERVER) {
    browserArgs.push(`--proxy-server=${process.env.PROXY_SERVER}`);
    utils.log(`🔒 Using proxy: ${process.env.PROXY_SERVER}`, 'info');
  }
  
  const browser = await puppeteer.launch({
    headless: config.headless,
    args: browserArgs,
    defaultViewport: {
      width: 1366,
      height: 768
    }
  });
  
  utils.log('✅ Browser launched', 'success');
  return browser;
}

// Setup page with anti-detection
async function setupPage(browser) {
  const page = await browser.newPage();
  
  // Set random user agent
  const userAgent = utils.getRandomUserAgent();
  await page.setUserAgent(userAgent);
  
  if (config.debug) {
    utils.log(`🎭 User Agent: ${userAgent}`, 'info');
  }
  
  // Set extra headers
  await page.setExtraHTTPHeaders({
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
  });
  
  // Remove automation flags
  await page.evaluateOnNewDocument(() => {
    // Overwrite navigator.webdriver
    Object.defineProperty(navigator, 'webdriver', {
      get: () => false
    });
    
    // Overwrite plugins
    Object.defineProperty(navigator, 'plugins', {
      get: () => [1, 2, 3, 4, 5]
    });
    
    // Overwrite languages
    Object.defineProperty(navigator, 'languages', {
      get: () => ['en-US', 'en']
    });
    
    // Chrome runtime
    window.chrome = {
      runtime: {}
    };
    
    // Permissions
    const originalQuery = window.navigator.permissions.query;
    window.navigator.permissions.query = (parameters) => (
      parameters.name === 'notifications' ?
        Promise.resolve({ state: Notification.permission }) :
        originalQuery(parameters)
    );
  });
  
  // Set timeout
  page.setDefaultTimeout(config.pageTimeout);
  page.setDefaultNavigationTimeout(config.pageTimeout);
  
  utils.log('✅ Page configured with anti-detection', 'success');
  return page;
}

// Navigate to Gleam campaign
async function navigateToGleam(page) {
  utils.log(`🌐 Navigating to Gleam: ${config.gleamUrl}`, 'process');
  
  try {
    await page.goto(config.gleamUrl, {
      waitUntil: 'networkidle2',
      timeout: config.pageTimeout
    });
    
    utils.log('✅ Page loaded successfully', 'success');
    
    // Wait for Gleam widget to appear
    utils.log('⏳ Waiting for Gleam widget...', 'process');
    
    const widgetLoaded = await utils.waitForElement(
      page, 
      '.entry-method, .gleam-widget, [class*="gleam"]',
      config.pageTimeout,
      3
    );
    
    if (widgetLoaded) {
      utils.log('✅ Gleam widget loaded!', 'success');
      
      // Take screenshot if enabled
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

// Analyze available entry methods
async function analyzeEntryMethods(page) {
  utils.log('🔍 Analyzing available entry methods...', 'process');
  
  try {
    // Get all entry methods
    const entryMethods = await page.$$eval('.entry-method', methods => {
      return methods.map(method => {
        const actionType = method.getAttribute('data-action') || 
                          method.getAttribute('data-entry-method') ||
                          'unknown';
        const title = method.querySelector('.entry-title, .entry-name')?.textContent.trim() || 'No title';
        const isCompleted = method.classList.contains('completed') || 
                           method.classList.contains('entered');
        
        return {
          action: actionType,
          title: title,
          completed: isCompleted
        };
      });
    });
    
    utils.log(`📋 Found ${entryMethods.length} entry methods:`, 'info');
    entryMethods.forEach((method, index) => {
      const status = method.completed ? '✅' : '⏳';
      utils.log(`   ${index + 1}. ${status} ${method.title} (${method.action})`, 'info');
    });
    
    return entryMethods;
    
  } catch (error) {
    utils.log(`❌ Error analyzing entry methods: ${error.message}`, 'error');
    return [];
  }
}

// Main bot function
async function runBot() {
  utils.log(`
╔═══════════════════════════════════════════════════╗
║           🤖 GLEAM BOT - PHASE 1                  ║
║           Basic Navigation & Analysis             ║
╚═══════════════════════════════════════════════════╝
  `, 'info');
  
  // Validate config
  validateConfig();
  
  let browser;
  
  try {
    // Setup browser
    browser = await setupBrowser();
    
    // Setup page
    const page = await setupPage(browser);
    
    // Navigate to Gleam
    const navigated = await navigateToGleam(page);
    
    if (!navigated) {
      throw new Error('Failed to navigate to Gleam campaign');
    }
    
    // Analyze entry methods
    const entryMethods = await analyzeEntryMethods(page);
    
    if (entryMethods.length === 0) {
      utils.log('⚠️ No entry methods found. Campaign might be closed or URL is wrong.', 'warning');
    }
    
    // Keep browser open for inspection (if not headless)
    if (!config.headless) {
      utils.log('🔍 Browser akan tetap terbuka untuk inspeksi. Tekan CTRL+C untuk menutup.', 'info');
      await new Promise(() => {}); // Keep alive
    }
    
    utils.log('✅ Bot completed successfully!', 'success');
    
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

// Run bot
runBot().catch(error => {
  utils.log(`❌ Unhandled error: ${error.message}`, 'error');
  process.exit(1);
});
