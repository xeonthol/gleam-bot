const puppeteer = require('puppeteer');
const {
  sleep,
  randomDelay,
  log,
  safeClick,
  safeType,
  takeScreenshot,
  loadAccounts,
  getRandomUserAgent
} = require('./utils'); // ← Import dari utils.js yang sudah ada

async function completeGleamKuCoin(account) {
  log(`🚀 Starting: ${account.twitter_username}`, 'process');
  
  const browser = await puppeteer.launch({
    headless: false,
    userDataDir: `./profiles/${account.email}`,
    args: [`--user-agent=${getRandomUserAgent()}`]
  });
  
  const page = await browser.newPage();
  
  try {
    // 1. Buka Gleam
    await page.goto('https://gleam.io/agMfj/kucoin-x-bitlight-labs-light', {
      waitUntil: 'networkidle2'
    });
    await sleep(3000);
    
    // 2. Complete task Follow @kucoincom
    log('📌 Completing: Follow @kucoincom', 'info');
    const task1Selector = 'div[class*="entry"]:has-text("@kucoincom")';
    if (await safeClick(page, task1Selector)) {
      await randomDelay(2000, 4000);
    }
    
    // 3. Complete task Follow @BitlightLabs
    log('📌 Completing: Follow @BitlightLabs', 'info');
    const task2Selector = 'div[class*="entry"]:has-text("@BitlightLabs")';
    if (await safeClick(page, task2Selector)) {
      await randomDelay(2000, 4000);
    }
    
    // 4. Submit Repost Link
    log('📌 Submitting: Repost Link', 'info');
    const task3Selector = 'div[class*="entry"]:has-text("repost")';
    if (await safeClick(page, task3Selector)) {
      await sleep(1000);
      await safeType(page, 'input[type="url"]', account.repost_link);
      await safeClick(page, 'button.continue');
      await randomDelay(2000, 4000);
    }
    
    // 5. Submit KuCoin UID
    log('📌 Submitting: KuCoin UID', 'info');
    const task4Selector = 'div[class*="entry"]:has-text("KuCoin UID")';
    if (await safeClick(page, task4Selector)) {
      await sleep(1000);
      await safeType(page, 'textarea', account.kucoin_uid);
      await safeClick(page, 'button.continue');
      await randomDelay(2000, 4000);
    }
    
    // 6. Screenshot hasil
    await takeScreenshot(page, `completed-${account.twitter_username}`);
    log(`✅ SUCCESS: ${account.twitter_username}`, 'success');
    
    return { success: true, account: account.twitter_username };
    
  } catch (error) {
    log(`❌ ERROR: ${account.twitter_username} - ${error.message}`, 'error');
    await takeScreenshot(page, `error-${account.twitter_username}`);
    return { success: false, account: account.twitter_username, error: error.message };
  } finally {
    await browser.close();
  }
}

// Main execution
(async () => {
  log('🤖 Gleam Bot Started', 'process');
  
  const accounts = loadAccounts();
  
  if (accounts.length === 0) {
    log('❌ No accounts found in accounts.json', 'error');
    return;
  }
  
  log(`📊 Found ${accounts.length} accounts`, 'info');
  
  const results = [];
  
  for (let i = 0; i < accounts.length; i++) {
    const account = accounts[i];
    log(`\n📍 Processing account ${i + 1}/${accounts.length}`, 'info');
    
    const result = await completeGleamKuCoin(account);
    results.push(result);
    
    // Delay antar akun
    if (i < accounts.length - 1) {
      const delayTime = Math.floor(Math.random() * 10000) + 10000; // 10-20 detik
      log(`⏳ Waiting ${delayTime/1000}s before next account...`, 'warning');
      await sleep(delayTime);
    }
  }
  
  // Summary
  const successful = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  
  log('\n📊 === SUMMARY ===', 'info');
  log(`✅ Successful: ${successful}`, 'success');
  log(`❌ Failed: ${failed}`, 'error');
  
  log('🎉 Bot Finished!', 'success');
})();
