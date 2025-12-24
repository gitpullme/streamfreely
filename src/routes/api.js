const express = require('express');
const router = express.Router();
const driveService = require('../services/driveService');
const tokenService = require('../services/tokenService');

/**
 * POST /api/analyze
 * Analyze a Google Drive video and return quality information
 */
router.post('/analyze', async (req, res) => {
    try {
        const { driveUrl } = req.body;

        if (!driveUrl) {
            return res.status(400).json({
                error: 'Missing driveUrl parameter',
                message: 'Please provide a Google Drive URL'
            });
        }

        // Extract file ID
        const fileId = driveService.extractFileId(driveUrl);

        if (!fileId) {
            return res.status(400).json({
                error: 'Invalid Google Drive URL',
                message: 'Could not extract file ID from the provided URL'
            });
        }

        // Get file info
        const fileInfo = await driveService.getFileInfo(fileId);

        if (!fileInfo) {
            return res.status(404).json({
                error: 'File not found',
                message: 'The file could not be found or is not accessible'
            });
        }

        // Check if it's a video
        if (!fileInfo.mimeType?.startsWith('video/')) {
            return res.status(400).json({
                error: 'Not a video file',
                message: `The file is of type "${fileInfo.mimeType}", not a video`
            });
        }

        // Analyze video quality
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
 * POST /api/generate-link
 * Generate a streamable .mp4 URL from a Google Drive link
 */
router.post('/generate-link', async (req, res) => {
    try {
        const { driveUrl, fileId: providedFileId, quality, quick } = req.body;

        // Allow passing fileId directly (from previous analyze call) for speed
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

        // Get file info (will use cache if available)
        const fileInfo = await driveService.getFileInfo(fileId);

        if (!fileInfo) {
            return res.status(404).json({
                error: 'File not found',
                message: 'The file could not be found or is not accessible'
            });
        }

        // Check if it's a video
        if (!fileInfo.mimeType?.startsWith('video/')) {
            return res.status(400).json({
                error: 'Not a video file',
                message: `The file is of type "${fileInfo.mimeType}", not a video`
            });
        }

        // Generate token with quality preference
        const selectedQuality = quality || 'original';
        const token = tokenService.generateToken(fileId, selectedQuality);

        // Build the streamable URL - auto-detect from request if BASE_URL not set
        const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'https';
        const host = req.headers['x-forwarded-host'] || req.headers.host || req.hostname;
        const baseUrl = process.env.BASE_URL || `${protocol}://${host}`;
        const streamUrl = `${baseUrl}/stream/${token}.mp4`;

        // Quick mode: minimal response for faster generation
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

        // Full mode: include quality analysis
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
 * GET /api/file-info/:fileId
 * Get information about a Google Drive file
 */
router.get('/file-info/:fileId', async (req, res) => {
    try {
        const { fileId } = req.params;

        const fileInfo = await driveService.getFileInfo(fileId);

        if (!fileInfo) {
            return res.status(404).json({ error: 'File not found' });
        }

        res.json({ success: true, data: fileInfo });

    } catch (error) {
        console.error('Error getting file info:', error);
        res.status(500).json({ error: 'Failed to get file info' });
    }
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
 * POST /api/universal/generate
 * Generate universal stream proxy URL
 */
router.post('/universal/generate', async (req, res) => {
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
        const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
        const host = req.headers['x-forwarded-host'] || req.headers.host;
        const baseUrl = process.env.BASE_URL || `${protocol}://${host}`;

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
 * GET /api/universal/stream/*
 * Proxy universal stream
 */
router.get('/universal/stream/*', async (req, res) => {
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
        const fetchProtocol = sourceUrlObj.protocol === 'https:' ? https : http;

        const proxyRequest = fetchProtocol.get(sourceUrl, {
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
                    const reqProtocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
                    const host = req.headers['x-forwarded-host'] || req.headers.host;
                    const baseProxyUrl = process.env.BASE_URL || `${reqProtocol}://${host}`;

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
 * OPTIONS /api/universal/stream/*
 * Handle CORS preflight
 */
router.options('/universal/stream/*', (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type');
    res.status(204).end();
});

module.exports = router;

