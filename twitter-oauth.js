// twitter-oauth.js - Twitter OAuth Login & Follow Automation
const utils = require('./utils');

/**
 * Login to Twitter via Gleam OAuth popup
 */
async function loginToTwitter(page, twitterCredentials) {
  utils.log('🐦 Initiating Twitter OAuth login...', 'process');
  
  try {
    const browser = page.browser();
    
    // Wait for popup to open
    const popupPromise = new Promise((resolve) => {
      browser.once('targetcreated', async (target) => {
        const popupPage = await target.page();
        if (popupPage && popupPage.url().includes('twitter.com')) {
          resolve(popupPage);
        }
      });
    });
    
    // Trigger OAuth by clicking the Twitter button
    const twitterButtonSelectors = [
      'button[data-action="twitter"]',
      'a[href*="twitter.com/oauth"]',
      '.twitter-auth-button',
      'button:has-text("Connect Twitter")',
      'button:has-text("Login with Twitter")'
    ];
    
    let buttonClicked = false;
    for (const selector of twitterButtonSelectors) {
      try {
        const button = await page.$(selector);
        if (button) {
          await button.click();
          buttonClicked = true;
          utils.log('✅ Twitter OAuth button clicked', 'success');
          break;
        }
      } catch (e) {
        continue;
      }
    }
    
    if (!buttonClicked) {
      throw new Error('Twitter OAuth button not found');
    }
    
    // Wait for popup with timeout
    const popupPage = await Promise.race([
      popupPromise,
      utils.sleep(10000).then(() => null)
    ]);
    
    if (!popupPage) {
      throw new Error('Twitter OAuth popup did not open');
    }
    
    utils.log('🔓 Twitter OAuth popup detected', 'info');
    await utils.sleep(2000);
    
    // Check if already logged in
    const alreadyAuthorized = await popupPage.evaluate(() => {
      return document.body.textContent.includes('Authorize') ||
             document.body.textContent.includes('authorize app') ||
             window.location.href.includes('oauth/authorize');
    });
    
    if (alreadyAuthorized) {
      utils.log('✅ Twitter already authorized, clicking authorize...', 'info');
      
      const authorizeButtonSelectors = [
        '#allow',
        'input[value="Authorize app"]',
        'input[value="Authorize"]',
        'button:has-text("Authorize")'
      ];
      
      for (const selector of authorizeButtonSelectors) {
        try {
          await popupPage.click(selector);
          utils.log('✅ Authorize button clicked', 'success');
          break;
        } catch (e) {
          continue;
        }
      }
      
      await utils.sleep(3000);
      return { success: true, alreadyLoggedIn: true };
    }
    
    // Perform login
    utils.log('🔐 Logging in to Twitter...', 'process');
    
    // Wait for login page to load
    await popupPage.waitForSelector('input[name="text"], input[autocomplete="username"]', { timeout: 10000 });
    
    // Step 1: Enter username/email
    const usernameSelectors = [
      'input[name="text"]',
      'input[autocomplete="username"]',
      'input[type="text"]'
    ];
    
    for (const selector of usernameSelectors) {
      try {
        const input = await popupPage.$(selector);
        if (input) {
          await popupPage.type(selector, twitterCredentials.username, { delay: 100 });
          utils.log(`📧 Username entered: ${twitterCredentials.username}`, 'info');
          break;
        }
      } catch (e) {
        continue;
      }
    }
    
    await utils.sleep(1000);
    
    // Click Next
    const nextButtonSelectors = [
      'div[role="button"]:has-text("Next")',
      'button:has-text("Next")',
      'div[data-testid="ocfEnterTextNextButton"]'
    ];
    
    for (const selector of nextButtonSelectors) {
      try {
        await popupPage.click(selector);
        utils.log('✅ Next button clicked', 'success');
        break;
      } catch (e) {
        continue;
      }
    }
    
    await utils.sleep(2000);
    
    // Check for captcha after username
    const captchaAfterUsername = await captchaSolver.detectCaptcha(popupPage);
    if (captchaAfterUsername.exists) {
      utils.log('🔐 Captcha detected after username!', 'warning');
      const solved = await captchaSolver.handleCaptcha(popupPage);
      if (!solved.solved) {
        throw new Error('Failed to solve captcha');
      }
    }
    
    // Check for unusual activity challenge (phone/email verification)
    const needsVerification = await popupPage.evaluate(() => {
      return document.body.textContent.includes('unusual login activity') ||
             document.body.textContent.includes('Verify your identity') ||
             document.body.textContent.includes('phone number') ||
             document.body.textContent.includes('verification');
    });
    
    if (needsVerification) {
      utils.log('⚠️ Twitter asking for verification!', 'warning');
      
      // Try to enter email/phone if provided
      if (twitterCredentials.email || twitterCredentials.phone) {
        const verificationInput = await popupPage.$('input[name="text"]');
        if (verificationInput) {
          const dataToEnter = twitterCredentials.email || twitterCredentials.phone;
          await popupPage.type('input[name="text"]', dataToEnter, { delay: 100 });
          utils.log(`📧 Verification data entered: ${dataToEnter}`, 'info');
          
          await utils.sleep(1000);
          
          // Click Next again
          for (const selector of nextButtonSelectors) {
            try {
              await popupPage.click(selector);
              break;
            } catch (e) {
              continue;
            }
          }
          
          await utils.sleep(2000);
        }
      }
    }
    
    // Step 2: Enter password
    await popupPage.waitForSelector('input[name="password"], input[type="password"]', { timeout: 10000 });
    
    const passwordSelectors = [
      'input[name="password"]',
      'input[type="password"]'
    ];
    
    for (const selector of passwordSelectors) {
      try {
        const input = await popupPage.$(selector);
        if (input) {
          await popupPage.type(selector, twitterCredentials.password, { delay: 100 });
          utils.log('🔑 Password entered', 'info');
          break;
        }
      } catch (e) {
        continue;
      }
    }
    
    await utils.sleep(1000);
    
    // Click Login
    const loginButtonSelectors = [
      'div[role="button"]:has-text("Log in")',
      'button[data-testid="LoginForm_Login_Button"]',
      'div[data-testid="LoginForm_Login_Button"]',
      'button:has-text("Log in")'
    ];
    
    for (const selector of loginButtonSelectors) {
      try {
        await popupPage.click(selector);
        utils.log('✅ Login button clicked', 'success');
        break;
      } catch (e) {
        continue;
      }
    }
    
    await utils.sleep(3000);
    
    // Check for captcha after login
    const captchaAfterLogin = await captchaSolver.detectCaptcha(popupPage);
    if (captchaAfterLogin.exists) {
      utils.log('🔐 Captcha detected after login!', 'warning');
      const solved = await captchaSolver.handleCaptcha(popupPage);
      if (!solved.solved) {
        throw new Error('Failed to solve captcha after login');
      }
      await utils.sleep(3000);
    }
    
    // Wait for authorization page or redirect
    const authorized = await Promise.race([
      popupPage.waitForSelector('#allow', { timeout: 10000 }).then(() => true),
      popupPage.waitForFunction(
        () => window.location.href.includes('oauth/authorize'),
        { timeout: 10000 }
      ).then(() => true),
      utils.sleep(10000).then(() => false)
    ]);
    
    if (authorized) {
      utils.log('✅ Login successful, authorizing app...', 'success');
      
      // Click Authorize button
      const authorizeButtonSelectors = [
        '#allow',
        'input[value="Authorize app"]',
        'input[value="Authorize"]'
      ];
      
      for (const selector of authorizeButtonSelectors) {
        try {
          await popupPage.click(selector);
          utils.log('✅ App authorized', 'success');
          break;
        } catch (e) {
          continue;
        }
      }
      
      await utils.sleep(3000);
      
      return { success: true };
    }
    
    // Check if popup closed (successful auth)
    const popupClosed = popupPage.isClosed();
    if (popupClosed) {
      utils.log('✅ OAuth completed (popup closed)', 'success');
      return { success: true };
    }
    
    throw new Error('Twitter login flow incomplete');
    
  } catch (error) {
    utils.log(`❌ Twitter OAuth failed: ${error.message}`, 'error');
    return { success: false, error: error.message };
  }
}

/**
 * Complete Twitter Follow task in Gleam
 */
async function completeTwitterFollowTask(page, taskIndex, twitterCredentials) {
  utils.log(`🐦 Starting Twitter Follow task #${taskIndex + 1}...`, 'process');
  
  try {
    // Click the Twitter Follow entry method
    const entryMethodSelector = `.entry-method:nth-of-type(${taskIndex + 1})`;
    
    const entryExists = await utils.elementExists(page, entryMethodSelector);
    if (!entryExists) {
      throw new Error('Entry method not found');
    }
    
    await utils.safeClick(page, entryMethodSelector);
    await utils.sleep(2000);
    
    // Check if Twitter authentication is needed
    const needsAuth = await page.evaluate(() => {
      return document.body.textContent.includes('Connect') ||
             document.body.textContent.includes('Login') ||
             document.body.textContent.includes('Authorize');
    });
    
    if (needsAuth) {
      utils.log('🔐 Twitter authentication required', 'info');
      const authResult = await loginToTwitter(page, twitterCredentials);
      
      if (!authResult.success) {
        throw new Error('Twitter authentication failed');
      }
      
      await utils.sleep(3000);
    }
    
    // Try to find and click the Follow button
    const followButtonSelectors = [
      'button:has-text("Follow")',
      'a[href*="twitter.com/intent/follow"]',
      'a[href*="twitter.com/intent/user"]',
      '.twitter-follow-button',
      'a.twitter-action'
    ];
    
    let followClicked = false;
    
    for (const selector of followButtonSelectors) {
      try {
        const button = await page.$(selector);
        if (button) {
          const buttonText = await page.evaluate(el => el.textContent, button);
          
          if (buttonText.toLowerCase().includes('following')) {
            utils.log('✅ Already following this account', 'success');
            followClicked = true;
            break;
          }
          
          await button.click();
          utils.log('✅ Follow button clicked', 'success');
          followClicked = true;
          break;
        }
      } catch (e) {
        continue;
      }
    }
    
    if (!followClicked) {
      utils.log('⚠️ Follow button not found, task might be auto-completed', 'warning');
    }
    
    await utils.sleep(3000);
    
    // Verify task completion
    const taskCompleted = await page.$eval(
      entryMethodSelector,
      el => el.classList.contains('completed') || el.classList.contains('entered')
    ).catch(() => false);
    
    if (taskCompleted) {
      utils.log(`✅ Twitter Follow task #${taskIndex + 1} completed!`, 'success');
      return { success: true, action: 'twitter_follow' };
    } else {
      utils.log(`⚠️ Task status uncertain`, 'warning');
      return { success: true, action: 'twitter_follow', uncertain: true };
    }
    
  } catch (error) {
    utils.log(`❌ Twitter Follow task failed: ${error.message}`, 'error');
    return { success: false, error: error.message };
  }
}

module.exports = {
  loginToTwitter,
  completeTwitterFollowTask
};
