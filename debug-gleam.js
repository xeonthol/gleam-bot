// debug-gleam.js - Analyze Gleam HTML Structure
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');

puppeteer.use(StealthPlugin());

async function debugGleam(gleamUrl) {
  console.log('🔍 Starting Gleam Structure Analysis...\n');
  
  const browser = await puppeteer.launch({
    headless: false,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const page = await browser.newPage();
  
  console.log(`📡 Loading: ${gleamUrl}\n`);
  await page.goto(gleamUrl, { waitUntil: 'networkidle2' });
  
  // Wait for widget
  await page.waitForSelector('.entry-method', { timeout: 10000 });
  
  console.log('✅ Gleam widget loaded!\n');
  console.log('=' .repeat(60));
  
  // Analyze structure
  const analysis = await page.evaluate(() => {
    const methods = document.querySelectorAll('.entry-method');
    const results = [];
    
    methods.forEach((method, index) => {
      const analysis = {
        index: index + 1,
        classList: Array.from(method.classList),
        attributes: {},
        possibleTitles: {},
        textContent: method.textContent.replace(/\s+/g, ' ').trim().substring(0, 150),
        innerHTML: method.innerHTML.substring(0, 500)
      };
      
      // Get all attributes
      Array.from(method.attributes).forEach(attr => {
        analysis.attributes[attr.name] = attr.value;
      });
      
      // Try different title selectors
      const titleSelectors = [
        '.entry-title',
        '.entry-name',
        '.entry-description',
        '.entry-content',
        '.entry-text',
        'h3',
        'h4',
        '.description',
        '[class*="title"]',
        '[class*="description"]',
        'span',
        'div',
        'p'
      ];
      
      titleSelectors.forEach(selector => {
        const el = method.querySelector(selector);
        if (el && el.textContent.trim()) {
          analysis.possibleTitles[selector] = el.textContent.trim().substring(0, 100);
        }
      });
      
      results.push(analysis);
    });
    
    return results;
  });
  
  // Print results
  analysis.forEach(task => {
    console.log(`\n📝 TASK ${task.index}:`);
    console.log('─'.repeat(60));
    
    console.log('\n🏷️  Classes:');
    console.log(`   ${task.classList.join(', ')}`);
    
    console.log('\n📋 Attributes:');
    Object.entries(task.attributes).forEach(([key, value]) => {
      console.log(`   ${key}: ${value}`);
    });
    
    console.log('\n📖 Possible Titles:');
    if (Object.keys(task.possibleTitles).length > 0) {
      Object.entries(task.possibleTitles).forEach(([selector, text]) => {
        console.log(`   ${selector}: "${text}"`);
      });
    } else {
      console.log('   ❌ No title elements found!');
    }
    
    console.log('\n📄 Text Content:');
    console.log(`   ${task.textContent}`);
    
    console.log('\n🔧 HTML Preview:');
    console.log(`   ${task.innerHTML.substring(0, 200)}...`);
    
    console.log('\n' + '='.repeat(60));
  });
  
  // Save full HTML
  const fullHtml = await page.content();
  fs.writeFileSync('gleam-debug.html', fullHtml);
  console.log('\n💾 Full HTML saved to: gleam-debug.html');
  
  // Take screenshot
  await page.screenshot({ path: 'gleam-debug.png', fullPage: true });
  console.log('📸 Screenshot saved to: gleam-debug.png');
  
  console.log('\n✅ Analysis complete! Press Ctrl+C to exit.');
  
  // Keep browser open for manual inspection
  // await browser.close();
}

// Run if called directly
if (require.main === module) {
  const gleamUrl = process.argv[2] || process.env.GLEAM_URL;
  
  if (!gleamUrl) {
    console.error('❌ Usage: node debug-gleam.js <GLEAM_URL>');
    console.error('   Or set GLEAM_URL in .env file');
    process.exit(1);
  }
  
  debugGleam(gleamUrl).catch(console.error);
}

module.exports = { debugGleam };
