# StreamFreely

> 🎬 Google Drive Video Streaming Proxy - Transform Drive links into streamable MP4 URLs

StreamFreely is a lightweight Node.js proxy that converts public Google Drive video links into clean, embeddable `.mp4` URLs that work seamlessly with HTML5 video players.

## ✨ Features

- **Instant Playback** - Videos start immediately with native browser support
- **Seamless Seeking** - Full range request support for smooth scrubbing
- **Easy Embedding** - Standard HTML5 video tags work everywhere
- **Secure Tokens** - Time-limited tokens for added security
- **No Re-encoding** - Direct streaming from Google Drive
- **Speed Control** - Native playback speed controls work perfectly

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ 
- npm or yarn
- Google Cloud API key or Service Account

### Installation

```bash
# Clone the repository
git clone https://github.com/gitpullme/streamfreely.git
cd streamfreely

# Install dependencies
npm install

# Copy environment file
cp .env.example .env
```

### Configuration

Edit `.env` with your settings:

```env
GOOGLE_API_KEY=your_google_api_key_here
STREAM_SECRET=your_random_secret_key
```

### Getting a Google API Key

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing
3. Enable the **Google Drive API**
4. Go to **APIs & Services > Credentials**
5. Click **Create Credentials > API Key**
6. Copy the key to your `.env` file

### Run Locally

```bash
# Development mode (with hot reload)
npm run dev

# Production mode
npm start
```

Visit `http://localhost:3000` to use the web interface.

## 🌐 Deploy to Vercel (Free)

1. Push this repo to GitHub
2. Go to [vercel.com](https://vercel.com)
3. Import your GitHub repository
4. Add environment variables:
   - `GOOGLE_API_KEY` - Your Google Drive API key
   - `STREAM_SECRET` - A random secret string
5. Deploy!

Your stream URLs will automatically use your Vercel domain.

## 📖 Usage

### Web Interface

1. Upload your video to Google Drive
2. Set sharing to "Anyone with the link can view"
3. Copy the share link
4. Paste it into StreamFreely
5. Get your streamable `.mp4` URL

### API

**Generate Stream URL:**

```bash
curl -X POST https://your-app.vercel.app/api/generate-link \
  -H "Content-Type: application/json" \
  -d '{"driveUrl": "https://drive.google.com/file/d/FILE_ID/view"}'
```

**Response:**

```json
{
  "success": true,
  "data": {
    "streamUrl": "https://your-app.vercel.app/api/stream/TOKEN.mp4",
    "fileInfo": {
      "name": "video.mp4",
      "size": "123456789",
      "mimeType": "video/mp4"
    }
  }
}
```

### Embedding

```html
<video controls width="640" height="360">
  <source src="https://your-app.vercel.app/api/stream/TOKEN.mp4" type="video/mp4">
</video>
```

## 🏗️ Project Structure

```
streamfreely/
├── api/                 # Vercel serverless functions
│   └── index.js         # Main API handler
├── public/              # Frontend files
│   ├── index.html       # Main HTML page
│   ├── styles.css       # Styles
│   └── app.js           # Frontend JavaScript
├── src/
│   ├── server.js        # Express server (local dev)
│   ├── routes/
│   │   ├── api.js       # API endpoints
│   │   └── stream.js    # Video streaming routes
│   └── services/
│       ├── driveService.js   # Google Drive API
│       └── tokenService.js   # Token generation
├── vercel.json          # Vercel configuration
├── .env.example         # Environment template
└── package.json
```

## ⚠️ Important Notes

- Videos must be set to "Anyone with the link can view"
- Large files may hit Google Drive quotas
- Stream tokens expire after 24 hours
- This is for personal use only

## 📄 License

MIT License - feel free to use for personal projects.

---

Built with ❤️ for the open web
