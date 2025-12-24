const express = require('express');
const router = express.Router();
const driveService = require('../services/driveService');
const tokenService = require('../services/tokenService');

/**
 * GET /stream/:token.mp4
 * Stream video content from Google Drive with range request support
 */
router.get('/:token.mp4', async (req, res) => {
    try {
        const { token } = req.params;

        // Validate and decode the token
        const tokenData = tokenService.decodeToken(token);

        if (!tokenData) {
            return res.status(400).json({ error: 'Invalid or expired stream token' });
        }

        const { fileId, quality } = tokenData;
        console.log(`Streaming: ${fileId} at quality: ${quality}`);

        // Get file info for content-length
        const fileInfo = await driveService.getFileInfo(fileId);

        if (!fileInfo) {
            return res.status(404).json({ error: 'Video file not found' });
        }

        const fileSize = parseInt(fileInfo.size, 10);
        const range = req.headers.range;

        // Set common headers
        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('Content-Type', 'video/mp4');
        res.setHeader('Cache-Control', 'public, max-age=3600');

        // Handle range requests for seeking support
        if (range) {
            const parts = range.replace(/bytes=/, '').split('-');
            const start = parseInt(parts[0], 10);
            const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
            const chunkSize = end - start + 1;

            console.log(`Range request: bytes=${start}-${end}/${fileSize}`);

            res.status(206);
            res.setHeader('Content-Range', `bytes ${start}-${end}/${fileSize}`);
            res.setHeader('Content-Length', chunkSize);

            // Stream the requested range from Google Drive
            const stream = await driveService.streamFile(fileId, start, end);

            stream.on('error', (error) => {
                console.error('Stream error:', error);
                if (!res.headersSent) {
                    res.status(500).json({ error: 'Stream error' });
                }
            });

            stream.pipe(res);

        } else {
            // No range header - send entire file
            console.log(`Full file request: ${fileSize} bytes`);

            res.setHeader('Content-Length', fileSize);

            const stream = await driveService.streamFile(fileId);

            stream.on('error', (error) => {
                console.error('Stream error:', error);
                if (!res.headersSent) {
                    res.status(500).json({ error: 'Stream error' });
                }
            });

            stream.pipe(res);
        }

    } catch (error) {
        console.error('Error streaming video:', error);
        if (!res.headersSent) {
            res.status(500).json({ error: 'Failed to stream video' });
        }
    }
});

/**
 * HEAD /stream/:token.mp4
 * Return headers for the video (used by video players to determine file size)
 */
router.head('/:token.mp4', async (req, res) => {
    try {
        const { token } = req.params;

        const tokenData = tokenService.decodeToken(token);

        if (!tokenData) {
            return res.status(400).end();
        }

        const { fileId } = tokenData;

        const fileInfo = await driveService.getFileInfo(fileId);

        if (!fileInfo) {
            return res.status(404).end();
        }

        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('Content-Type', 'video/mp4');
        res.setHeader('Content-Length', fileInfo.size);
        res.setHeader('Cache-Control', 'public, max-age=3600');
        res.status(200).end();

    } catch (error) {
        console.error('Error handling HEAD request:', error);
        res.status(500).end();
    }
});

module.exports = router;
