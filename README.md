# MnemonicShards

English | [简体中文](./README_ZH.md)

A secure, professional mnemonic phrase splitting tool that uses Shamir's Secret Sharing algorithm to split your mnemonic phrase into multiple shards. Any specified number of shards can recover the original mnemonic.

## 🔒 Security Features

- **Completely Offline Operation** - Data never leaves your device
- **Professional-grade Encryption** - Uses standard Shamir's Secret Sharing algorithm
- **Client-side Processing** - All computations completed in the browser
- **Open Source & Transparent** - Code is fully open source and can be audited

## 🚀 Core Features

- ✅ Support for 12/24 word mnemonic phrases
- ✅ BIP39 standard word validation
- ✅ Smart auto-complete suggestions
- ✅ Duplicate word detection
- ✅ Flexible shard configuration (3-7 shards)
- ✅ Custom recovery threshold (2-5 shards)
- ✅ One-click copy/download shards
- ✅ Perfect mobile adaptation

## 🛠️ Technology Stack

### Core Dependencies

- **[shamir-secret-sharing](https://www.npmjs.com/package/shamir-secret-sharing)** - Professional-grade Shamir's Secret Sharing algorithm implementation
  - Standard cryptographic algorithm, secure and reliable
  - Peer-reviewed cryptographic library
  - Supports flexible threshold configuration

### Development Tools

- **Vite** - Modern frontend build tool
- **Native JavaScript** - No framework dependencies, lightweight and efficient
- **CSS3** - Modern styling and animations

## 📁 Project Structure

```
src/
├── components/              # Core components
│   ├── MnemonicInput.js     # Mnemonic input component (supports auto-complete, validation, duplicate detection)
│   └── ShareManager.js      # Shard management component (handles shard generation and recovery)
├── utils/                   # Utility functions
│   ├── dom.js              # DOM manipulation utilities (safe element retrieval and creation)
│   ├── validation.js       # Validation utilities (BIP39 word validation)
│   └── helpers.js          # General utilities (copy, download, encoding, etc.)
├── styles/
│   └── styles.css          # Main stylesheet (modern design system, mobile support)
├── constants/              # Constants configuration
│   ├── index.js            # Application constants and configuration
│   └── bip39-words.js      # BIP39 word list
└── main.js                 # Application entry point (modular architecture)

Root directory/
├── index.html              # Main page
├── package.json            # Project configuration
├── vite.config.js          # Build configuration
└── dist/                   # Build output
    └── index.html          # Production version (single file deployment)
```

### 🏗️ Architecture Features

- **Modular Design** - Clear component separation, easy to maintain and extend
- **Type Safety** - Complete parameter validation and error handling
- **Performance Optimization** - Debounced input, smart caching, efficient rendering
- **Mobile-first** - Perfect mobile adaptation and touch optimization
- **Framework-free** - Native JavaScript, lightweight and fast

## 🎯 How to Use

1. Open the [application page](./index.html)
2. Select mnemonic word count (12 or 24 words)
3. Configure total shards and recovery threshold
4. Enter your mnemonic phrase, the system will automatically validate each word
5. Click "Generate Shares" to create multiple shards
6. Save the shards in different secure locations
7. When recovery is needed, input any specified number of shards

### Local Development

```bash
# Clone the project
git clone <repository-url>
cd MnemonicShards

# Install dependencies
npm install

# Start development server
npm run dev
# Visit http://localhost:5174

# Build production version
npm run build
# View dist/index.html
```

## 📱 Security Recommendations

1. **Use in Offline Environment** - Recommended to use this tool in a disconnected environment
2. **Distributed Storage** - Store shards in different physical locations
3. **Secure Media** - Use encrypted USB drives or paper backups
4. **Regular Verification** - Regularly test the recovery functionality of shards
5. **Shard Protection** - Do not share shards with untrusted parties

## 🔧 Shard Configuration Examples

| Configuration | Total Shards | Recovery Threshold | Security   | Convenience |
| ------------- | ------------ | ------------------ | ---------- | ----------- |
| Conservative  | 7            | 5                  | ⭐⭐⭐⭐⭐ | ⭐⭐        |
| Balanced      | 5            | 3                  | ⭐⭐⭐⭐   | ⭐⭐⭐⭐    |
| Convenient    | 3            | 2                  | ⭐⭐⭐     | ⭐⭐⭐⭐⭐  |

## 🌟 Browser Support

- Chrome 88+
- Firefox 85+
- Safari 14+
- Edge 88+
- Mobile browsers

## ⚠️ Disclaimer

This tool is for educational and research purposes only. Users should:

- Assume all usage risks
- Ensure understanding of how Shamir's Secret Sharing works
- Conduct thorough testing before use
- Properly safeguard generated shards

## 📄 License

ISC License

---

**⚡ MnemonicShards**: Single file deployment, no server requirements, completely client-side operation
