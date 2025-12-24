# StreamFreely Helper - Chrome Extension

## Installation Instructions

### Step 1: Open Chrome Extensions
1. Open Chrome
2. Go to `chrome://extensions/`
3. Enable **Developer mode** (toggle in top-right corner)

### Step 2: Load the Extension
1. Click **"Load unpacked"**
2. Select the `extension` folder from this project
3. The extension icon should appear in your toolbar

### Step 3: Create Icons (Required)
Chrome requires PNG icons. Create simple icons using any tool:
- 16x16 pixels → `icons/icon16.png`
- 48x48 pixels → `icons/icon48.png`  
- 128x128 pixels → `icons/icon128.png`

**Quick Option:** Use any online SVG-to-PNG converter with `icons/icon.svg`

Or just use a simple colored square as placeholder.

## How to Use

1. **Install the extension** following steps above
2. **Open your StreamFreely app** (localhost:3000 or vercel URL)
3. **Go to Universal Stream tab**
4. **Paste your HLS link**
5. **Try HLS.js mode first** (uncheck Direct Mode)
   - The extension adds CORS headers to allow HLS.js to work!

## What It Does

The extension modifies request/response headers:

### Request Headers Modified:
- Removes `Origin` header (avoids CORS preflight)
- Sets `Sec-Fetch-Mode: no-cors`
- Sets `Sec-Fetch-Site: none`

### Response Headers Added:
- `Access-Control-Allow-Origin: *`
- `Access-Control-Allow-Methods: GET, HEAD, OPTIONS`
- `Access-Control-Allow-Headers: *`

This tricks the browser into allowing HLS.js to fetch streams that would normally be blocked!

## Adding Specific Domains

For extra compatibility with stubborn sites:
1. Click the extension icon
2. Enter the domain (e.g., `web24code.site`)
3. Click "Add"
4. This adds Referer and Origin headers matching that domain

## Troubleshooting

### Extension not working?
1. Make sure it's enabled in `chrome://extensions/`
2. Try reloading the StreamFreely page
3. Check the browser console for errors

### Still getting 403?
Some sites have additional protections beyond CORS:
- Cookie-based authentication
- IP-based rate limiting
- Bot detection (Cloudflare)

The extension can bypass CORS but not all protections.

## Files

```
extension/
├── manifest.json    # Extension configuration
├── background.js    # Header modification logic
├── rules.json       # Static header rules
├── popup.html       # Extension popup UI
├── popup.js         # Popup logic
└── icons/
    ├── icon.svg     # Source icon
    ├── icon16.png   # (create this)
    ├── icon48.png   # (create this)
    └── icon128.png  # (create this)
```
