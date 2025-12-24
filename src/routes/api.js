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

        // Build the streamable URL
        const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
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

module.exports = router;
