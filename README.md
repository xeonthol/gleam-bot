# 🤖 Gleam Bot - Automated Giveaway Entry

**⚠️ WARNING: This is for EDUCATIONAL PURPOSES ONLY!**

Using automation bots on Gleam.io violates their Terms of Service. Use at your own risk!

---

## 🚀 Features

- ✅ Automated navigation to Gleam campaigns
- ✅ Entry method detection & analysis
- ✅ Anti-detection (stealth mode)
- ✅ CAPTCHA solving integration (2Captcha)
- ✅ Multi-account support
- ✅ Proxy support
- ✅ Twitter OAuth automation
- ✅ Discord OAuth automation
- ✅ Screenshot on error

---

## 📋 Requirements

- Node.js 16+ 
- NPM or Yarn
- Chrome/Chromium (installed by Puppeteer)
- 2Captcha API key (for CAPTCHA solving)
- Residential proxy (recommended)

---

## 🔧 Installation

### 1. Clone Repository

```bash
git clone https://github.com/yourusername/gleam-bot.git
cd gleam-bot
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Setup Configuration

```bash
# Copy example files
cp .env.example .env
cp accounts.example.json accounts.json

# Edit with your credentials
nano .env
nano accounts.json
```

### 4. Configure .env

Edit `.env` file with your credentials:

```bash
GLEAM_URL="https://gleam.io/xxxxx/your-campaign"
TWITTER_USERNAME="your_username"
TWITTER_PASSWORD="your_password"
CAPTCHA_API_KEY="your_2captcha_key"
# ... etc
```

### 5. Configure accounts.json

Edit `accounts.json` with your account data:

```json
[
  {
    "id": 1,
    "twitter": {
      "username": "user1",
      "password": "pass1",
      "email": "user1@email.com"
    },
    "discord": {...},
    "wallet": "0x..."
  }
]
```

---

## 🚀 Usage

### Basic Run

```bash
npm start
```

### Development Mode (with browser visible)

Set in `.env`:
```bash
HEADLESS="false"
```

### Debug Mode

Set in `.env`:
```bash
DEBUG="true"
```

---

## 📁 Project Structure

```
gleam-bot/
├── index.js              # Main bot file
├── utils.js              # Helper functions
├── .env                  # Configuration (NEVER COMMIT!)
├── .env.example          # Example configuration
├── accounts.json         # Account data (NEVER COMMIT!)
├── accounts.example.json # Example account data
├── package.json          # Dependencies
├── .gitignore           # Git ignore file
└── README.md            # This file
```

---

## 🎯 Current Phase

**Phase 1: ✅ COMPLETED**
- Basic navigation
- Entry method detection
- Anti-detection setup

**Phase 2: 🚧 IN PROGRESS**
- Simple task completion
- Click automation

**Phase 3: ⏳ TODO**
- CAPTCHA solving integration
- reCAPTCHA v2/v3 support

**Phase 4: ⏳ TODO**
- Twitter OAuth automation
- Discord OAuth automation

**Phase 5: ⏳ TODO**
- Multi-account support
- Proxy rotation
- Session management

---

## ⚙️ Configuration Options

### `.env` Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `GLEAM_URL` | Gleam campaign URL | (required) |
| `HEADLESS` | Run browser in headless mode | `false` |
| `ACTION_DELAY` | Delay between actions (ms) | `2000` |
| `MAX_RETRIES` | Max retries on error | `3` |
| `PAGE_TIMEOUT` | Page load timeout (ms) | `30000` |
| `STEALTH_MODE` | Enable anti-detection | `true` |
| `SAVE_SCREENSHOTS` | Save screenshots on error | `true` |
| `DEBUG` | Enable debug logging | `true` |

---

## 🔒 Security

### Files that should NEVER be committed:

- ❌ `.env` (contains passwords!)
- ❌ `accounts.json` (contains credentials!)
- ❌ `failed-accounts-*.json` (contains sensitive data)
- ❌ `node_modules/` (large, unnecessary)

These are already in `.gitignore` - DO NOT remove them!

### Safe to commit:

- ✅ `.env.example` (template only)
- ✅ `accounts.example.json` (template only)
- ✅ `index.js`, `utils.js` (code files)
- ✅ `package.json`
- ✅ `README.md`
- ✅ `.gitignore`

---

## ⚠️ Warnings & Risks

### Legal & Terms of Service

- ⚠️ Violates Gleam.io ToS
- ⚠️ Violates Twitter ToS
- ⚠️ Violates Discord ToS
- ⚠️ May result in account bans
- ⚠️ May result in IP bans

### Financial Risks

- 💰 CAPTCHA solver costs: $2-5 per 1000 solves
- 💰 Proxy costs: $50-200 per month
- 💰 Development time: 40-80 hours

### Success Rate

- 📊 30-50% entry success rate (many get detected)
- 📊 High risk of account ban
- 📊 No guarantee of winning

---

## 🛠️ Troubleshooting

### Bot doesn't start

```bash
# Check Node.js version
node --version  # Should be 16+

# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install
```

### Navigation fails

- Check `GLEAM_URL` is correct
- Check internet connection
- Try disabling `HEADLESS` mode to see what happens

### CAPTCHA not solving

- Check `CAPTCHA_API_KEY` is valid
- Check 2Captcha balance
- Enable `DEBUG` mode

---

## 📚 Resources

- [Puppeteer Documentation](https://pptr.dev/)
- [2Captcha API](https://2captcha.com/api-docs)
- [Gleam.io](https://gleam.io/)

---

## 📝 License

MIT License - Use at your own risk!

---

## ⚠️ Disclaimer

This bot is for EDUCATIONAL PURPOSES ONLY. 

- The author is NOT responsible for:
  - Account bans
  - Legal consequences
  - Financial losses
  - Any misuse of this software

By using this bot, you accept all risks and consequences.

USE AT YOUR OWN RISK!

---

## 🤝 Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

---

## 💬 Support

For issues, please open a GitHub Issue.

**DO NOT** share your:
- `.env` file
- `accounts.json` file
- API keys
- Passwords

---

Made with ☕ by [Your Name]
