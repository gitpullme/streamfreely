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
git clone https://github.com/your-username/streamfreely.git
cd streamfreely

# Install dependencies
npm install

# Copy environment file
cp .env.example .env
```

### Configuration

Edit `.env` with your settings:

```env
PORT=3000
BASE_URL=http://localhost:3000
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

### Run the Server

```bash
# Development mode (with hot reload)
npm run dev

# Production mode
npm start
```

Visit `http://localhost:3000` to use the web interface.

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
curl -X POST http://localhost:3000/api/generate-link \
  -H "Content-Type: application/json" \
  -d '{"driveUrl": "https://drive.google.com/file/d/FILE_ID/view"}'
```

**Response:**

```json
{
  "success": true,
  "data": {
    "streamUrl": "http://localhost:3000/stream/TOKEN.mp4",
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
  <source src="http://your-domain.com/stream/TOKEN.mp4" type="video/mp4">
</video>
```

## 🏗️ Project Structure

```
streamfreely/
├── public/              # Frontend files
│   ├── index.html       # Main HTML page
│   ├── styles.css       # Styles
│   └── app.js           # Frontend JavaScript
├── src/
│   ├── server.js        # Express server entry
│   ├── routes/
│   │   ├── api.js       # API endpoints
│   │   └── stream.js    # Video streaming routes
│   └── services/
│       ├── driveService.js   # Google Drive API
│       └── tokenService.js   # Token generation
├── nginx/
│   └── streamfreely.conf    # Nginx config
├── .env.example         # Environment template
└── package.json
```

## 🔧 Production Deployment

### With PM2

```bash
npm install -g pm2
pm2 start src/server.js --name streamfreely
pm2 save
```

### With Nginx

Copy the nginx config:

```bash
sudo cp nginx/streamfreely.conf /etc/nginx/sites-available/
sudo ln -s /etc/nginx/sites-available/streamfreely.conf /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### SSL with Certbot

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
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
