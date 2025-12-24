const functions = require('firebase-functions');
const express = require('express');
const cors = require('cors');
const { google } = require('googleapis');
const crypto = require('crypto');

const app = express();

// CORS configuration
app.use(cors({
    origin: true,
    methods: ['GET', 'HEAD', 'POST', 'OPTIONS'],
    allowedHeaders: ['Range', 'Content-Type'],
    exposedHeaders: ['Content-Range', 'Accept-Ranges', 'Content-Length']
}));

app.use(express.json());

// ============================================
// Configuration - Set these in Firebase Config
// ============================================
// Run: firebase functions:config:set google.api_key="YOUR_KEY" stream.secret="YOUR_SECRET"

const config = functions.config();
const GOOGLE_API_KEY = config.google?.api_key || process.env.GOOGLE_API_KEY;
const STREAM_SECRET = config.stream?.secret || process.env.STREAM_SECRET || 'default-secret';

// Initialize Google Drive
let drive = null;
if (GOOGLE_API_KEY) {
    drive = google.drive({ version: 'v3', auth: GOOGLE_API_KEY });
    console.log('✓ Google Drive initialized');
} else {
    console.warn('⚠ GOOGLE_API_KEY not configured');
}

// ============================================
// Cache
// ============================================
const fileInfoCache = new Map();
const tokenCache = new Map();
const CACHE_TTL = 5 * 60 * 1000;
const TOKEN_EXPIRY = 24 * 60 * 60 * 1000;

// ============================================
// Helper Functions
// ============================================

function extractFileId(url) {
    if (!url) return null;
    if (/^[a-zA-Z0-9_-]{25,}$/.test(url)) return url;

    const patterns = [
        /\/file\/d\/([a-zA-Z0-9_-]+)/,
        /[?&]id=([a-zA-Z0-9_-]+)/,
        /\/([a-zA-Z0-9_-]{25,})/
    ];

    for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match?.[1]) return match[1];
    }
    return null;
}

async function getFileInfo(fileId) {
    // Check cache
    const cached = fileInfoCache.get(fileId);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        return cached.data;
    }

    if (!drive) throw new Error('Google Drive not initialized');

    const response = await drive.files.get({
        fileId,
        fields: 'id,name,size,mimeType,videoMediaMetadata'
    });

    fileInfoCache.set(fileId, { data: response.data, timestamp: Date.now() });
    return response.data;
}

function analyzeVideoQuality(fileInfo) {
    const metadata = fileInfo.videoMediaMetadata || {};
    const fileSize = parseInt(fileInfo.size, 10) || 0;
    const durationMs = parseInt(metadata.durationMillis, 10) || 0;
    const width = parseInt(metadata.width, 10) || 0;
    const height = parseInt(metadata.height, 10) || 0;

    const durationSeconds = durationMs / 1000;
    const bitrate = durationSeconds > 0 ? Math.round((fileSize * 8) / durationSeconds) : 0;

    const getResolution = (w, h) => {
        const max = Math.max(w, h);
        if (max >= 3840) return '4K Ultra HD';
        if (max >= 1920) return '1080p Full HD';
        if (max >= 1280) return '720p HD';
        if (max >= 854) return '480p SD';
        return `${w}×${h}`;
    };

    const qualityOptions = [
        { id: 'original', label: 'Original', icon: '⭐', width, height, isOriginal: true }
    ];

    if (height >= 720) qualityOptions.push({ id: '720p', label: '720p HD', icon: '📺', width: Math.round(720 * width / height), height: 720 });
    if (height >= 480) qualityOptions.push({ id: '480p', label: '480p SD', icon: '📱', width: Math.round(480 * width / height), height: 480 });

    return {
        width, height,
        resolution: getResolution(width, height),
        durationMs,
        durationFormatted: durationMs > 0 ? `${Math.floor(durationMs / 60000)}:${String(Math.floor((durationMs % 60000) / 1000)).padStart(2, '0')}` : 'Unknown',
        bitrate,
        bitrateMbps: (bitrate / 1000000).toFixed(2),
        bitrateLabel: `${(bitrate / 1000000).toFixed(2)} Mbps`,
        bitrateQuality: { level: 'medium', label: 'Good Quality', color: '#22c55e' },
        codec: fileInfo.mimeType?.replace('video/', '').toUpperCase() || 'Unknown',
        fileSize,
        fileSizeFormatted: `${(fileSize / (1024 * 1024)).toFixed(2)} MB`,
        qualityOptions
    };
}

function generateToken(fileId, quality = 'original') {
    const timestamp = Date.now();
    const data = `${fileId}:${quality}:${timestamp}`;
    const signature = crypto.createHmac('sha256', STREAM_SECRET).update(data).digest('hex').substring(0, 16);
    const token = Buffer.from(`${data}:${signature}`).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    tokenCache.set(token, { fileId, quality, timestamp });
    return token;
}

function decodeToken(token) {
    const cached = tokenCache.get(token);
    if (cached && Date.now() - cached.timestamp < TOKEN_EXPIRY) {
        return cached;
    }

    try {
        let base64 = token.replace(/-/g, '+').replace(/_/g, '/');
        while (base64.length % 4) base64 += '=';
        const decoded = Buffer.from(base64, 'base64').toString('utf8');
        const [fileId, quality, timestampStr, signature] = decoded.split(':');
        const timestamp = parseInt(timestampStr, 10);

        const data = `${fileId}:${quality}:${timestamp}`;
        const expected = crypto.createHmac('sha256', STREAM_SECRET).update(data).digest('hex').substring(0, 16);

        if (signature !== expected || Date.now() - timestamp > TOKEN_EXPIRY) return null;

        tokenCache.set(token, { fileId, quality, timestamp });
        return { fileId, quality };
    } catch {
        return null;
    }
}

// ============================================
// API Routes
// ============================================

app.post('/api/analyze', async (req, res) => {
    try {
        const { driveUrl } = req.body;
        const fileId = extractFileId(driveUrl);
        if (!fileId) return res.status(400).json({ error: 'Invalid URL' });

        const fileInfo = await getFileInfo(fileId);
        if (!fileInfo) return res.status(404).json({ error: 'File not found' });
        if (!fileInfo.mimeType?.startsWith('video/')) return res.status(400).json({ error: 'Not a video' });

        res.json({
            success: true,
            data: {
                fileId,
                name: fileInfo.name,
                mimeType: fileInfo.mimeType,
                quality: analyzeVideoQuality(fileInfo)
            }
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/generate-link', async (req, res) => {
    try {
        const { driveUrl, fileId: providedFileId, quality } = req.body;
        let fileId = providedFileId || extractFileId(driveUrl);
        if (!fileId) return res.status(400).json({ error: 'Invalid URL or fileId' });

        const fileInfo = await getFileInfo(fileId);
        if (!fileInfo) return res.status(404).json({ error: 'File not found' });

        const selectedQuality = quality || 'original';
        const token = generateToken(fileId, selectedQuality);
        const baseUrl = `https://streamfreely-b119f.web.app`;
        const streamUrl = `${baseUrl}/stream/${token}.mp4`;

        const qualityInfo = analyzeVideoQuality(fileInfo);
        const selectedOption = qualityInfo.qualityOptions.find(q => q.id === selectedQuality) || qualityInfo.qualityOptions[0];

        res.json({
            success: true,
            data: {
                streamUrl,
                selectedQuality: selectedOption,
                fileInfo: { name: fileInfo.name, size: fileInfo.size, mimeType: fileInfo.mimeType },
                quality: qualityInfo
            }
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/stream/:token.mp4', async (req, res) => {
    try {
        const { token } = req.params;
        const tokenData = decodeToken(token);
        if (!tokenData) return res.status(400).json({ error: 'Invalid token' });

        const { fileId } = tokenData;
        const fileInfo = await getFileInfo(fileId);
        if (!fileInfo) return res.status(404).json({ error: 'File not found' });

        const fileSize = parseInt(fileInfo.size, 10);
        const range = req.headers.range;

        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('Content-Type', 'video/mp4');
        res.setHeader('Cache-Control', 'public, max-age=3600');

        const headers = {};
        let start = 0, end = fileSize - 1;

        if (range) {
            const parts = range.replace(/bytes=/, '').split('-');
            start = parseInt(parts[0], 10);
            end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

            res.status(206);
            res.setHeader('Content-Range', `bytes ${start}-${end}/${fileSize}`);
            res.setHeader('Content-Length', end - start + 1);
            headers.Range = `bytes=${start}-${end}`;
        } else {
            res.setHeader('Content-Length', fileSize);
        }

        const response = await drive.files.get(
            { fileId, alt: 'media' },
            { responseType: 'stream', headers }
        );

        response.data.pipe(res);
    } catch (error) {
        console.error('Stream error:', error);
        if (!res.headersSent) res.status(500).json({ error: 'Stream failed' });
    }
});

app.head('/stream/:token.mp4', async (req, res) => {
    try {
        const tokenData = decodeToken(req.params.token);
        if (!tokenData) return res.status(400).end();

        const fileInfo = await getFileInfo(tokenData.fileId);
        if (!fileInfo) return res.status(404).end();

        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('Content-Type', 'video/mp4');
        res.setHeader('Content-Length', fileInfo.size);
        res.status(200).end();
    } catch {
        res.status(500).end();
    }
});

app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Export the Express app as a Firebase Cloud Function
exports.api = functions.https.onRequest(app);
