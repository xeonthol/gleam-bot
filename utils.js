// Gleam Bot - Utility Functions

// Sleep/delay function
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Random delay (between min and max)
function randomDelay(min = 1000, max = 3000) {
  const delay = Math.floor(Math.random() * (max - min + 1)) + min;
  return sleep(delay);
}

// Generate random user agent
function getRandomUserAgent() {
  const userAgents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15'
  ];
  
  return userAgents[Math.floor(Math.random() * userAgents.length)];
}

// Log with timestamp and color
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[36m',
  magenta: '\x1b[35m'
};

function log(message, type = 'info') {
  const timestamp = new Date().toLocaleTimeString();
  let color = colors.reset;
  let icon = 'ℹ️';
  
  switch(type) {
    case 'success':
      color = colors.green;
      icon = '✅';
      break;
    case 'error':
      color = colors.red;
      icon = '❌';
      break;
    case 'warning':
      color = colors.yellow;
      icon = '⚠️';
      break;
    case 'info':
      color = colors.blue;
      icon = '💡';
      break;
    case 'process':
      color = colors.magenta;
      icon = '⚙️';
      break;
  }
  
  console.log(`${color}[${timestamp}] ${icon} ${message}${colors.reset}`);
}

// Wait for element with retry
async function waitForElement(page, selector, timeout = 10000, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      await page.waitForSelector(selector, { timeout });
      return true;
    } catch (error) {
      log(`Attempt ${i + 1}/${retries} failed for selector: ${selector}`, 'warning');
      if (i === retries - 1) throw error;
      await sleep(2000);
    }
  }
  return false;
}

// Safe click (wait + click + verify)
async function safeClick(page, selector, waitTime = 1000) {
  try {
    await page.waitForSelector(selector, { visible: true, timeout: 10000 });
    await sleep(waitTime);
    await page.click(selector);
    await randomDelay(500, 1500);
    return true;
  } catch (error) {
    log(`Failed to click: ${selector}`, 'error');
    return false;
  }
}

// Safe type (wait + type + verify)
async function safeType(page, selector, text, options = {}) {
  try {
    await page.waitForSelector(selector, { visible: true, timeout: 10000 });
    await page.click(selector);
    await sleep(300);
    
    if (options.clear) {
      await page.click(selector, { clickCount: 3 });
      await page.keyboard.press('Backspace');
    }
    
    await page.type(selector, text, { delay: options.delay || 50 });
    await randomDelay(300, 800);
    return true;
  } catch (error) {
    log(`Failed to type in: ${selector}`, 'error');
    return false;
  }
}

// Take screenshot with timestamp
async function takeScreenshot(page, name = 'screenshot') {
  const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
  const filename = `${name}-${timestamp}.png`;
  await page.screenshot({ path: filename, fullPage: true });
  log(`Screenshot saved: ${filename}`, 'info');
  return filename;
}

// Check if element exists
async function elementExists(page, selector) {
  try {
    await page.waitForSelector(selector, { timeout: 3000 });
    return true;
  } catch {
    return false;
  }
}

// Get element text
async function getElementText(page, selector) {
  try {
    await page.waitForSelector(selector, { timeout: 5000 });
    return await page.$eval(selector, el => el.textContent.trim());
  } catch {
    return null;
  }
}

// Load accounts from JSON
function loadAccounts() {
  const fs = require('fs');
  try {
    const data = fs.readFileSync('accounts.json', 'utf8');
    return JSON.parse(data);
  } catch (error) {
    log('Error loading accounts.json', 'error');
    return [];
  }
}

// Save failed accounts
function saveFailedAccounts(failedAccounts) {
  const fs = require('fs');
  const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
  const filename = `failed-accounts-${timestamp}.json`;
  
  try {
    fs.writeFileSync(filename, JSON.stringify(failedAccounts, null, 2));
    log(`Failed accounts saved: ${filename}`, 'warning');
  } catch (error) {
    log('Error saving failed accounts', 'error');
  }
}

// Get nested value (e.g. "twitter.username" -> account.twitter.username)
function getNestedValue(obj, path) {
  return path.split('.').reduce((acc, key) => (acc && acc[key] !== undefined ? acc[key] : null), obj);
}

module.exports = {
  sleep,
  randomDelay,
  getRandomUserAgent,
  log,
  waitForElement,
  safeClick,
  safeType,
  takeScreenshot,
  elementExists,
  getElementText,
  loadAccounts,
  saveFailedAccounts,
  getNestedValue,
  colors
};
