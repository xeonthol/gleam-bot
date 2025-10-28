// captchaSolver.js
const axios = require('axios');
const utils = require('./utils');
require('dotenv').config();

const CAPTCHA_API_KEY = process.env.CAPTCHA_API_KEY;

async function detectCaptcha(page) {
  const content = await page.content();
  const hasCaptcha =
    content.includes('recaptcha') ||
    content.includes('g-recaptcha') ||
    content.includes('hcaptcha');
  return { exists: hasCaptcha };
}

async function handleCaptcha(page) {
  try {
    utils.log('🔍 Detecting captcha type...', 'process');
    const siteKey = await page.evaluate(() => {
      const el = document.querySelector('[data-sitekey]');
      return el ? el.getAttribute('data-sitekey') : null;
    });

    const url = page.url();

    if (!siteKey) {
      utils.log('❌ No captcha found on page', 'error');
      return { solved: false };
    }

    utils.log('🧠 Sending captcha to 2Captcha...', 'process');
    const res = await axios.get('http://2captcha.com/in.php', {
      params: {
        key: CAPTCHA_API_KEY,
        method: 'userrecaptcha',
        googlekey: siteKey,
        pageurl: url,
        json: 1
      }
    });

    const requestId = res.data.request;
    utils.log('⌛ Waiting for captcha result...', 'info');
    await new Promise(r => setTimeout(r, 20000));

    let solvedToken;
    for (let i = 0; i < 15; i++) {
      const checkRes = await axios.get('http://2captcha.com/res.php', {
        params: {
          key: CAPTCHA_API_KEY,
          action: 'get',
          id: requestId,
          json: 1
        }
      });

      if (checkRes.data.status === 1) {
        solvedToken = checkRes.data.request;
        break;
      }

      await new Promise(r => setTimeout(r, 5000));
    }

    if (!solvedToken) throw new Error('Captcha solve timeout');

    await page.evaluate(token => {
      document.querySelector('#g-recaptcha-response').value = token;
    }, solvedToken);

    utils.log('✅ Captcha solved successfully!', 'success');
    return { solved: true };
  } catch (error) {
    utils.log(`❌ Captcha solving failed: ${error.message}`, 'error');
    return { solved: false, error: error.message };
  }
}

module.exports = { detectCaptcha, handleCaptcha };
