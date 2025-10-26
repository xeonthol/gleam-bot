// Gleam Bot - Twitter OAuth Module

const utils = require('./utils');

// Twitter Login via OAuth
async function twitterLogin(page, twitterCredentials) {
  utils.log('🐦 Starting Twitter OAuth login...', 'process');
  
  try {
    // Wait for Twitter OAuth popup or redirect
    await utils.sleep(2000);
    
    // Check if already logged in
    const alreadyLoggedIn = await page.$eval(
      'body',
      el => el.textContent.includes('Authorize app') || 
           el.textContent.includes('Already authorized')
    ).catch(() => false);
    
    if (alreadyLoggedIn) {
      utils.log('✅ Already logged in to Twitter!', 'success');
      return true;
    }
    
    // Twitter login page selectors
    const usernameSelectors = [
      'input[name="session[username_or_email]"]',
      'input[name="text"]',
      'input[autocomplete="username"]',
      'input[type="text"]'
    ];
    
    const passwordSelectors = [
      'input[name="session[password]"]',
      'input[name="password"]',
      'input[type="password"]'
    ];
    
    // Find and fill username
    utils.log('📝 Entering Twitter username...', 'process');
    let usernameEntered = false;
    
    for (const selector of usernameSelectors) {
      if (await utils.elementExists(page, selector)) {
        await utils.safeType(
          page, 
          selector, 
          twitterCredentials.username || twitterCredentials.email,
          { clear: true, delay: 100 }
        );
        usernameEntered = true;
        break;
      }
    }
    
    if (!usernameEntered) {
      throw new Error('Username field not found');
    }
    
    // Click Next button (Twitter's new flow)
    const nextButtonSelectors = [
      'div[role="button"]:has-text("Next")',
      'button:has-text("Next")',
      '[data-testid="LoginForm_Login_Button"]'
    ];
    
    for (const selector of nextButtonSelectors) {
      try {
        const button = await page.$(selector);
        if (button) {
          await button.click();
          await utils.sleep(2000);
          break;
        }
      } catch {}
    }
    
    // Sometimes Twitter asks for email verification
    const emailVerificationExists = await utils.elementExists(
      page, 
      'input[data-testid="ocfEnterTextTextInput"]'
    );
    
    if (emailVerificationExists && twitterCredentials.email) {
      utils.log('📧 Email verification required...', 'warning');
      await utils.safeType(
        page,
        'input[data-testid="ocfEnterTextTextInput"]',
        twitterCredentials.email,
        { clear: true, delay: 100 }
      );
      await utils.sleep(1000);
      
      // Click Next
      await page.click('[data-testid="ocfEnterTextNextButton"]');
      await utils.sleep(2000);
    }
    
    // Find and fill password
    utils.log('🔒 Entering password...', 'process');
    let passwordEntered = false;
    
    for (const selector of passwordSelectors) {
      if (await utils.elementExists(page, selector)) {
        await utils.safeType(
          page,
          selector,
          twitterCredentials.password,
          { clear: true, delay: 100 }
        );
        passwordEntered = true;
        break;
      }
    }
    
    if (!passwordEntered) {
      throw new Error('Password field not found');
    }
    
    await utils.sleep(1000);
    
    // Click Login button
    const loginButtonSelectors = [
      '[data-testid="LoginForm_Login_Button"]',
      'div[role="button"]:has-text("Log in")',
      'button[type="submit"]'
    ];
    
    let loginClicked = false;
    for (const selector of loginButtonSelectors) {
      try {
        const button = await page.$(selector);
        if (button) {
          await button.click();
          loginClicked = true;
          break;
        }
      } catch {}
    }
    
    if (!loginClicked) {
      await page.keyboard.press('Enter');
    }
    
    // Wait for login to complete
    await utils.sleep(5000);
    
    // Check for authorize page
    const authorizeExists = await page.$eval(
      'body',
      el => el.textContent.includes('Authorize app') ||
           el.textContent.includes('Authorize')
    ).catch(() => false);
    
    if (authorizeExists) {
      utils.log('✅ Twitter login successful!', 'success');
      return true;
    }
    
    // Check for errors
    const errorExists = await page.$eval(
      'body',
      el => el.textContent.includes('Wrong password') ||
           el.textContent.includes('incorrect') ||
           el.textContent.includes('suspended')
    ).catch(() => false);
    
    if (errorExists) {
      throw new Error('Login failed - wrong credentials or account suspended');
    }
    
    utils.log('✅ Twitter login completed', 'success');
    return true;
    
  } catch (error) {
    utils.log(`❌ Twitter login error: ${error.message}`, 'error');
    return false;
  }
}

// Authorize Gleam app on Twitter
async function authorizeGleamApp(page) {
  utils.log('🔐 Authorizing Gleam app...', 'process');
  
  try {
    // Look for authorize button
    const authorizeButtonSelectors = [
      '[data-testid="OAuth_Consent_Button"]',
      'input[value="Authorize app"]',
      'button:has-text("Authorize")',
      'input[type="submit"]'
    ];
    
    let authorized = false;
    
    for (const selector of authorizeButtonSelectors) {
      try {
        const button = await page.$(selector);
        if (button) {
          await button.click();
          authorized = true;
          utils.log('✅ App authorized!', 'success');
          break;
        }
      } catch {}
    }
    
    if (!authorized) {
      // Maybe already authorized
      utils.log('⚠️ Authorize button not found - maybe already authorized', 'warning');
    }
    
    // Wait for redirect back to Gleam
    await utils.sleep(3000);
    
    return true;
    
  } catch (error) {
    utils.log(`❌ Authorization error: ${error.message}`, 'error');
    return false;
  }
}

// Complete Twitter Follow task
async function completeTwitterFollowTask(page, taskIndex, twitterCredentials) {
  utils.log(`🐦 Completing Twitter Follow task #${taskIndex + 1}...`, 'process');
  
  try {
    // Click on the Twitter follow entry method
    const entryMethodSelector = `.entry-method:nth-of-type(${taskIndex + 1})`;
    
    await utils.safeClick(page, entryMethodSelector);
    await utils.sleep(2000);
    
    // This will open Twitter OAuth popup or redirect
    // Wait for Twitter page to load
    await utils.sleep(3000);
    
    // Get all pages (in case popup opened)
    const browser = page.browser();
    const pages = await browser.pages();
    const twitterPage = pages[pages.length - 1]; // Latest page (popup or redirect)
    
    // Check if on Twitter login/auth page
    const isTwitterPage = await twitterPage.url().includes('twitter.com') ||
                         await twitterPage.url().includes('x.com');
    
    if (isTwitterPage) {
      utils.log('🐦 Twitter OAuth page detected', 'info');
      
      // Login to Twitter
      const loginSuccess = await twitterLogin(twitterPage, twitterCredentials);
      
      if (!loginSuccess) {
        throw new Error('Twitter login failed');
      }
      
      // Authorize Gleam app
      await authorizeGleamApp(twitterPage);
      
      // Wait for redirect back to Gleam
      await utils.sleep(5000);
      
      // Close Twitter page if it's a popup
      if (pages.length > 1 && twitterPage !== page) {
        await twitterPage.close();
      }
      
    } else {
      utils.log('⚠️ Not redirected to Twitter - maybe already following', 'warning');
    }
    
    // Verify task completion on main Gleam page
    await page.bringToFront();
    await utils.sleep(2000);
    
    const taskCompleted = await page.$eval(
      entryMethodSelector,
      el => el.classList.contains('completed') || el.classList.contains('entered')
    ).catch(() => false);
    
    if (taskCompleted) {
      utils.log(`✅ Twitter Follow task #${taskIndex + 1} completed!`, 'success');
      return { success: true };
    } else {
      utils.log(`⚠️ Task status uncertain`, 'warning');
      return { success: true, uncertain: true };
    }
    
  } catch (error) {
    utils.log(`❌ Twitter Follow error: ${error.message}`, 'error');
    return { success: false, error: error.message };
  }
}

module.exports = {
  twitterLogin,
  authorizeGleamApp,
  completeTwitterFollowTask
};
