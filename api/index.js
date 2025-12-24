// Vercel Serverless Function - Main API Handler
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();

// CORS configuration - allow all origins for streaming
app.use(cors({
    origin: true,
    methods: ['GET', 'HEAD', 'POST', 'OPTIONS'],
    allowedHeaders: ['Range', 'Content-Type', 'Authorization'],
    exposedHeaders: ['Content-Range', 'Accept-Ranges', 'Content-Length', 'Content-Type']
}));

// Parse JSON bodies
app.use(express.json());

// Import services
const driveService = require('../src/services/driveService');
const tokenService = require('../src/services/tokenService');

// ============================================
// API Routes
// ============================================

/**
 * POST /api/analyze - Analyze a Google Drive video
 */
app.post('/api/analyze', async (req, res) => {
    try {
        const { driveUrl } = req.body;

        if (!driveUrl) {
            return res.status(400).json({
                error: 'Missing driveUrl parameter',
                message: 'Please provide a Google Drive URL'
            });
        }

        const fileId = driveService.extractFileId(driveUrl);

        if (!fileId) {
            return res.status(400).json({
                error: 'Invalid Google Drive URL',
                message: 'Could not extract file ID from the provided URL'
            });
        }

        const fileInfo = await driveService.getFileInfo(fileId);

        if (!fileInfo) {
            return res.status(404).json({
                error: 'File not found',
                message: 'The file could not be found or is not accessible'
            });
        }

        if (!fileInfo.mimeType?.startsWith('video/')) {
            return res.status(400).json({
                error: 'Not a video file',
                message: `The file is of type "${fileInfo.mimeType}", not a video`
            });
        }

        const qualityInfo = driveService.analyzeVideoQuality(fileInfo);

        res.json({
            success: true,
            data: {
                fileId,
                name: fileInfo.name,
                mimeType: fileInfo.mimeType,
                quality: qualityInfo
            }
        });

    } catch (error) {
        console.error('Error analyzing video:', error);
        res.status(500).json({
            error: 'Failed to analyze video',
            message: error.message
        });
    }
});

/**
 * POST /api/generate-link - Generate streamable URL
 */
app.post('/api/generate-link', async (req, res) => {
    try {
        const { driveUrl, fileId: providedFileId, quality, quick } = req.body;

        let fileId = providedFileId;

        if (!fileId) {
            if (!driveUrl) {
                return res.status(400).json({
                    error: 'Missing driveUrl or fileId parameter',
                    message: 'Please provide a Google Drive URL or file ID'
                });
            }
            fileId = driveService.extractFileId(driveUrl);
        }

        if (!fileId) {
            return res.status(400).json({
                error: 'Invalid Google Drive URL',
                message: 'Could not extract file ID from the provided URL'
            });
        }

        const fileInfo = await driveService.getFileInfo(fileId);

        if (!fileInfo) {
            return res.status(404).json({
                error: 'File not found',
                message: 'The file could not be found or is not accessible'
            });
        }

        if (!fileInfo.mimeType?.startsWith('video/')) {
            return res.status(400).json({
                error: 'Not a video file',
                message: `The file is of type "${fileInfo.mimeType}", not a video`
            });
        }

        const selectedQuality = quality || 'original';
        const token = tokenService.generateToken(fileId, selectedQuality);

        // Get the base URL from Vercel's headers or environment
        const protocol = req.headers['x-forwarded-proto'] || 'https';
        const host = req.headers['x-forwarded-host'] || req.headers.host;
        const baseUrl = process.env.VERCEL_URL
            ? `https://${process.env.VERCEL_URL}`
            : (process.env.BASE_URL || `${protocol}://${host}`);

        const streamUrl = `${baseUrl}/api/stream/${token}.mp4`;

        if (quick) {
            return res.json({
                success: true,
                data: {
                    streamUrl,
                    quality: selectedQuality,
                    name: fileInfo.name
                }
            });
        }

        const qualityInfo = driveService.analyzeVideoQuality(fileInfo);
        const selectedOption = qualityInfo.qualityOptions.find(q => q.id === selectedQuality)
            || qualityInfo.qualityOptions[0];

        res.json({
            success: true,
            data: {
                streamUrl,
                selectedQuality: selectedOption,
                fileInfo: {
                    name: fileInfo.name,
                    size: fileInfo.size,
                    mimeType: fileInfo.mimeType
                },
                quality: qualityInfo
            }
        });

    } catch (error) {
        console.error('Error generating stream link:', error);
        res.status(500).json({
            error: 'Failed to generate stream link',
            message: error.message
        });
    }
});

/**
 * GET /api/stream/* - Stream video (handles tokens with dots)
 */
app.get('/api/stream/*', async (req, res) => {
    try {
        // Get the full path after /api/stream/
        let token = req.params[0] || '';

        // Remove .mp4 extension if present
        token = token.replace(/\.mp4$/i, '');

        const tokenData = tokenService.decodeToken(token);

        if (!tokenData) {
            return res.status(400).json({
                error: 'Invalid or expired token',
                message: 'The stream link is invalid or has expired'
            });
        }

        const { fileId } = tokenData;
        const fileInfo = await driveService.getFileInfo(fileId);

        if (!fileInfo) {
            return res.status(404).json({
                error: 'File not found',
                message: 'The video file is no longer available'
            });
        }

        const fileSize = parseInt(fileInfo.size, 10);
        const range = req.headers.range;

        // Set common headers
        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('Content-Type', 'video/mp4');
        res.setHeader('Cache-Control', 'public, max-age=3600');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Accept-Ranges, Content-Length');

        let start = 0;
        let end = fileSize - 1;

        if (range) {
            const parts = range.replace(/bytes=/, '').split('-');
            start = parseInt(parts[0], 10);
            end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

            res.status(206);
            res.setHeader('Content-Range', `bytes ${start}-${end}/${fileSize}`);
            res.setHeader('Content-Length', end - start + 1);
        } else {
            res.setHeader('Content-Length', fileSize);
        }

        // Stream from Google Drive
        const stream = await driveService.streamFile(fileId, start, end);
        stream.pipe(res);

        stream.on('error', (error) => {
            console.error('Stream error:', error);
            if (!res.headersSent) {
                res.status(500).json({ error: 'Stream failed' });
            }
        });

    } catch (error) {
        console.error('Stream error:', error);
        if (!res.headersSent) {
            res.status(500).json({
                error: 'Failed to stream video',
                message: error.message
            });
        }
    }
});

/**
 * HEAD /api/stream/* - Handle HEAD requests for video
 */
app.head('/api/stream/*', async (req, res) => {
    try {
        let token = req.params[0] || '';
        token = token.replace(/\.mp4$/i, '');

        const tokenData = tokenService.decodeToken(token);
        if (!tokenData) {
            return res.status(400).end();
        }

        const fileInfo = await driveService.getFileInfo(tokenData.fileId);
        if (!fileInfo) {
            return res.status(404).end();
        }

        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('Content-Type', 'video/mp4');
        res.setHeader('Content-Length', fileInfo.size);
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.status(200).end();

    } catch (error) {
        console.error('HEAD request error:', error);
        res.status(500).end();
    }
});

/**
 * GET /api/health - Health check
 */
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        environment: process.env.VERCEL ? 'vercel' : 'local'
    });
});

// ============================================
// Universal Stream API Routes
// ============================================

/**
 * Detect stream type from URL
 */
function detectStreamType(url) {
    const urlLower = url.toLowerCase();
    if (urlLower.includes('.m3u8') || urlLower.includes('hls')) {
        return 'HLS';
    } else if (urlLower.includes('.mpd') || urlLower.includes('dash')) {
        return 'DASH';
    } else if (urlLower.includes('.mp4')) {
        return 'MP4';
    } else if (urlLower.includes('.webm')) {
        return 'WebM';
    } else if (urlLower.includes('.mkv')) {
        return 'MKV';
    }
    return 'Universal';
}

/**
 * POST /api/universal/generate - Generate universal stream proxy URL
 */
app.post('/api/universal/generate', async (req, res) => {
    try {
        const { sourceUrl, enableBuffer = true, enableProxy = true } = req.body;

        if (!sourceUrl) {
            return res.status(400).json({
                error: 'Missing sourceUrl parameter',
                message: 'Please provide a streaming URL'
            });
        }

        // Validate URL
        try {
            new URL(sourceUrl);
        } catch {
            return res.status(400).json({
                error: 'Invalid URL',
                message: 'Please provide a valid streaming URL'
            });
        }

        const streamType = detectStreamType(sourceUrl);

        // Generate a secure token for the stream
        const streamToken = tokenService.generateUniversalToken(sourceUrl, {
            buffer: enableBuffer,
            proxy: enableProxy,
            type: streamType
        });

        // Get the base URL
        const protocol = req.headers['x-forwarded-proto'] || 'https';
        const host = req.headers['x-forwarded-host'] || req.headers.host;
        const baseUrl = process.env.VERCEL_URL
            ? `https://${process.env.VERCEL_URL}`
            : (process.env.BASE_URL || `${protocol}://${host}`);

        // Generate proxy URL based on stream type
        let proxyUrl;
        if (streamType === 'HLS') {
            proxyUrl = `${baseUrl}/api/universal/stream/${streamToken}.m3u8`;
        } else if (streamType === 'DASH') {
            proxyUrl = `${baseUrl}/api/universal/stream/${streamToken}.mpd`;
        } else {
            proxyUrl = `${baseUrl}/api/universal/stream/${streamToken}`;
        }

        res.json({
            success: true,
            data: {
                proxyUrl,
                streamType,
                buffering: enableBuffer,
                proxied: enableProxy,
                originalUrl: sourceUrl
            }
        });

    } catch (error) {
        console.error('Error generating universal stream:', error);
        res.status(500).json({
            error: 'Failed to generate stream',
            message: error.message
        });
    }
});

/**
 * GET /api/universal/stream/* - Proxy universal stream
 */
app.get('/api/universal/stream/*', async (req, res) => {
    try {
        let token = req.params[0] || '';

        // Remove extension if present
        token = token.replace(/\.(m3u8|mpd|mp4|webm|ts|m4s)$/i, '');

        const tokenData = tokenService.decodeUniversalToken(token);

        if (!tokenData) {
            return res.status(400).json({
                error: 'Invalid or expired token',
                message: 'The stream link is invalid or has expired'
            });
        }

        const { sourceUrl, options } = tokenData;
        const streamType = options.type || detectStreamType(sourceUrl);

        // Set CORS headers
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
        res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Accept-Ranges, Content-Length');

        // Fetch the stream from source
        const https = require('https');
        const http = require('http');
        const { URL } = require('url');

        const sourceUrlObj = new URL(sourceUrl);
        const protocol = sourceUrlObj.protocol === 'https:' ? https : http;

        const proxyRequest = protocol.get(sourceUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': '*/*',
                'Accept-Encoding': 'identity',
                'Connection': 'keep-alive',
                ...(req.headers.range && { 'Range': req.headers.range })
            }
        }, (proxyResponse) => {
            // Set response headers
            const contentType = proxyResponse.headers['content-type'] ||
                (streamType === 'HLS' ? 'application/vnd.apple.mpegurl' : 'video/mp4');

            res.setHeader('Content-Type', contentType);

            if (proxyResponse.headers['content-length']) {
                res.setHeader('Content-Length', proxyResponse.headers['content-length']);
            }
            if (proxyResponse.headers['content-range']) {
                res.setHeader('Content-Range', proxyResponse.headers['content-range']);
            }
            if (proxyResponse.headers['accept-ranges']) {
                res.setHeader('Accept-Ranges', proxyResponse.headers['accept-ranges']);
            }

            res.status(proxyResponse.statusCode);

            // For HLS playlists, we need to rewrite URLs to proxy through us
            if (streamType === 'HLS' && contentType.includes('mpegurl')) {
                let body = '';
                proxyResponse.setEncoding('utf8');
                proxyResponse.on('data', (chunk) => {
                    body += chunk;
                });
                proxyResponse.on('end', () => {
                    // Rewrite segment URLs to proxy through our server
                    const baseSourceUrl = sourceUrl.substring(0, sourceUrl.lastIndexOf('/') + 1);
                    const protocol = req.headers['x-forwarded-proto'] || 'https';
                    const host = req.headers['x-forwarded-host'] || req.headers.host;
                    const baseProxyUrl = process.env.VERCEL_URL
                        ? `https://${process.env.VERCEL_URL}`
                        : (process.env.BASE_URL || `${protocol}://${host}`);

                    // Rewrite relative URLs to absolute proxy URLs
                    const rewrittenBody = body.split('\n').map(line => {
                        line = line.trim();
                        if (line && !line.startsWith('#')) {
                            // This is a URL line
                            let absoluteUrl;
                            if (line.startsWith('http://') || line.startsWith('https://')) {
                                absoluteUrl = line;
                            } else {
                                absoluteUrl = baseSourceUrl + line;
                            }
                            // Generate a token for this segment
                            const segmentToken = tokenService.generateUniversalToken(absoluteUrl, {
                                buffer: options.buffer,
                                proxy: options.proxy,
                                type: 'segment'
                            });
                            return `${baseProxyUrl}/api/universal/stream/${segmentToken}`;
                        }
                        return line;
                    }).join('\n');

                    res.send(rewrittenBody);
                });
            } else {
                // Pipe the response directly
                proxyResponse.pipe(res);
            }
        });

        proxyRequest.on('error', (error) => {
            console.error('Proxy request error:', error);
            if (!res.headersSent) {
                res.status(500).json({
                    error: 'Stream failed',
                    message: 'Failed to fetch from source'
                });
            }
        });

        // Handle request timeout
        proxyRequest.setTimeout(30000, () => {
            proxyRequest.destroy();
            if (!res.headersSent) {
                res.status(504).json({
                    error: 'Stream timeout',
                    message: 'The source took too long to respond'
                });
            }
        });

    } catch (error) {
        console.error('Universal stream error:', error);
        if (!res.headersSent) {
            res.status(500).json({
                error: 'Failed to stream',
                message: error.message
            });
        }
    }
});

/**
 * OPTIONS /api/universal/stream/* - Handle CORS preflight
 */
app.options('/api/universal/stream/*', (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type');
    res.status(204).end();
});

// Export for Vercel
module.exports = app;

