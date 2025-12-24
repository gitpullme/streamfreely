const { google } = require('googleapis');
const https = require('https');

class DriveService {
    constructor() {
        this.drive = null;
        this.apiKey = process.env.GOOGLE_API_KEY;

        // Cache for file info to avoid repeated API calls
        this.fileInfoCache = new Map();
        this.cacheTTL = 5 * 60 * 1000; // 5 minutes cache TTL

        this.initializeDrive();
    }

    initializeDrive() {
        try {
            // Check for service account credentials first
            if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
                const auth = new google.auth.GoogleAuth({
                    keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
                    scopes: ['https://www.googleapis.com/auth/drive.readonly']
                });
                this.drive = google.drive({ version: 'v3', auth });
                console.log('✓ Google Drive initialized with service account');
            }
            // Fall back to API key
            else if (this.apiKey) {
                this.drive = google.drive({
                    version: 'v3',
                    auth: this.apiKey
                });
                console.log('✓ Google Drive initialized with API key');
            }
            else {
                console.warn('⚠ No Google Drive credentials configured');
                console.warn('  Set GOOGLE_API_KEY or GOOGLE_APPLICATION_CREDENTIALS in .env');
            }
        } catch (error) {
            console.error('Failed to initialize Google Drive:', error.message);
        }
    }

    /**
     * Get cached file info or null if not cached/expired
     */
    getCachedFileInfo(fileId) {
        const cached = this.fileInfoCache.get(fileId);
        if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
            return cached.data;
        }
        if (cached) this.fileInfoCache.delete(fileId);
        return null;
    }

    /**
     * Cache file info
     */
    setCachedFileInfo(fileId, data) {
        this.fileInfoCache.set(fileId, { data, timestamp: Date.now() });

        // Clean old cache entries periodically (every 100 entries)
        if (this.fileInfoCache.size > 100) {
            const now = Date.now();
            for (const [key, value] of this.fileInfoCache.entries()) {
                if (now - value.timestamp > this.cacheTTL) {
                    this.fileInfoCache.delete(key);
                }
            }
        }
    }

    /**
     * Extract file ID from various Google Drive URL formats
     */
    extractFileId(url) {
        if (!url) return null;

        // If it's already just an ID (no slashes or special chars)
        if (/^[a-zA-Z0-9_-]{25,}$/.test(url)) {
            return url;
        }

        const patterns = [
            // https://drive.google.com/file/d/FILE_ID/view
            /\/file\/d\/([a-zA-Z0-9_-]+)/,
            // https://drive.google.com/open?id=FILE_ID
            /[?&]id=([a-zA-Z0-9_-]+)/,
            // https://docs.google.com/uc?id=FILE_ID
            /\/uc\?.*id=([a-zA-Z0-9_-]+)/,
            // https://drive.google.com/uc?export=download&id=FILE_ID
            /[?&]id=([a-zA-Z0-9_-]+)/,
            // Direct file ID in URL path
            /\/([a-zA-Z0-9_-]{25,})/
        ];

        for (const pattern of patterns) {
            const match = url.match(pattern);
            if (match && match[1]) {
                return match[1];
            }
        }

        return null;
    }

    /**
     * Get file metadata from Google Drive (with caching)
     */
    async getFileInfo(fileId, skipCache = false) {
        if (!this.drive) {
            throw new Error('Google Drive not initialized');
        }

        // Check cache first
        if (!skipCache) {
            const cached = this.getCachedFileInfo(fileId);
            if (cached) {
                console.log(`Cache hit for file: ${fileId}`);
                return cached;
            }
        }

        try {
            const response = await this.drive.files.get({
                fileId: fileId,
                fields: 'id,name,size,mimeType,videoMediaMetadata'
            });

            // Cache the result
            this.setCachedFileInfo(fileId, response.data);

            return response.data;
        } catch (error) {
            if (error.code === 404) {
                return null;
            }
            console.error('Error getting file info:', error.message);
            throw error;
        }
    }

    /**
     * Stream file content from Google Drive with optional range support
     */
    async streamFile(fileId, start = null, end = null) {
        if (!this.drive) {
            throw new Error('Google Drive not initialized');
        }

        const headers = {};

        if (start !== null && end !== null) {
            headers.Range = `bytes=${start}-${end}`;
        }

        try {
            const response = await this.drive.files.get(
                { fileId: fileId, alt: 'media' },
                {
                    responseType: 'stream',
                    headers: headers
                }
            );

            return response.data;
        } catch (error) {
            console.error('Error streaming file:', error.message);
            throw error;
        }
    }

    /**
     * Get direct download link (for public files)
     */
    getDirectLink(fileId) {
        return `https://drive.google.com/uc?export=download&id=${fileId}`;
    }

    /**
     * Analyze video quality and return detailed metadata
     */
    analyzeVideoQuality(fileInfo) {
        const metadata = fileInfo.videoMediaMetadata || {};
        const fileSize = parseInt(fileInfo.size, 10) || 0;
        const durationMs = parseInt(metadata.durationMillis, 10) || 0;
        const width = parseInt(metadata.width, 10) || 0;
        const height = parseInt(metadata.height, 10) || 0;

        // Calculate bitrate (bits per second)
        const durationSeconds = durationMs / 1000;
        const bitrate = durationSeconds > 0 ? Math.round((fileSize * 8) / durationSeconds) : 0;
        const bitrateMbps = (bitrate / 1000000).toFixed(2);

        // Determine resolution label
        const resolution = this.getResolutionLabel(width, height);

        // Classify bitrate quality
        const bitrateQuality = this.classifyBitrate(bitrate, height);

        // Detect codec from mimeType
        const codec = this.detectCodec(fileInfo.mimeType);

        // Generate available quality options
        const qualityOptions = this.generateQualityOptions(width, height, bitrate);

        return {
            width,
            height,
            resolution,
            durationMs,
            durationFormatted: this.formatDuration(durationMs),
            bitrate,
            bitrateMbps: parseFloat(bitrateMbps),
            bitrateLabel: `${bitrateMbps} Mbps`,
            bitrateQuality,
            codec,
            fileSize,
            fileSizeFormatted: this.formatFileSize(fileSize),
            qualityOptions
        };
    }

    /**
     * Get human-readable resolution label
     */
    getResolutionLabel(width, height) {
        const maxDimension = Math.max(width, height);

        if (maxDimension >= 3840) return '4K Ultra HD';
        if (maxDimension >= 2560) return '1440p QHD';
        if (maxDimension >= 1920) return '1080p Full HD';
        if (maxDimension >= 1280) return '720p HD';
        if (maxDimension >= 854) return '480p SD';
        if (maxDimension >= 640) return '360p';
        if (maxDimension >= 426) return '240p';
        if (maxDimension > 0) return `${width}×${height}`;
        return 'Unknown';
    }

    /**
     * Classify bitrate quality based on resolution
     */
    classifyBitrate(bitrate, height) {
        const bitrateMbps = bitrate / 1000000;

        // Recommended bitrates by resolution (YouTube standards)
        const thresholds = {
            2160: { high: 35, medium: 20, low: 10 },  // 4K
            1440: { high: 16, medium: 10, low: 6 },   // 1440p
            1080: { high: 8, medium: 5, low: 3 },     // 1080p
            720: { high: 5, medium: 3, low: 1.5 },    // 720p
            480: { high: 2.5, medium: 1.5, low: 0.8 }, // 480p
            360: { high: 1, medium: 0.6, low: 0.3 }   // 360p
        };

        // Find closest resolution threshold
        const resolutions = Object.keys(thresholds).map(Number).sort((a, b) => b - a);
        const closestRes = resolutions.find(r => height >= r) || 360;
        const threshold = thresholds[closestRes];

        if (bitrateMbps >= threshold.high) return { level: 'high', label: 'High Quality', color: '#22c55e' };
        if (bitrateMbps >= threshold.medium) return { level: 'medium', label: 'Medium Quality', color: '#eab308' };
        return { level: 'low', label: 'Low Quality', color: '#ef4444' };
    }

    /**
     * Detect video codec from MIME type
     */
    detectCodec(mimeType) {
        if (!mimeType) return 'Unknown';

        const codecMap = {
            'video/mp4': 'H.264/AVC',
            'video/webm': 'VP8/VP9',
            'video/x-matroska': 'H.264/H.265',
            'video/quicktime': 'H.264',
            'video/x-msvideo': 'Various',
            'video/mpeg': 'MPEG-2',
            'video/3gpp': 'H.263/H.264'
        };

        return codecMap[mimeType] || mimeType.replace('video/', '').toUpperCase();
    }

    /**
     * Generate available quality options for streaming
     */
    generateQualityOptions(sourceWidth, sourceHeight, sourceBitrate) {
        const options = [];
        const sourceMax = Math.max(sourceWidth, sourceHeight);

        // Quality presets with target dimensions and bitrates
        const presets = [
            { id: 'original', label: 'Original', height: sourceHeight, bitrate: sourceBitrate, icon: '⭐' },
            { id: '1080p', label: '1080p Full HD', height: 1080, bitrate: 8000000, icon: '🎬' },
            { id: '720p', label: '720p HD', height: 720, bitrate: 5000000, icon: '📺' },
            { id: '480p', label: '480p SD', height: 480, bitrate: 2500000, icon: '📱' },
            { id: '360p', label: '360p', height: 360, bitrate: 1000000, icon: '💾' }
        ];

        for (const preset of presets) {
            // Only add options that are <= source resolution
            if (preset.id === 'original' || preset.height <= sourceHeight) {
                const aspectRatio = sourceWidth / sourceHeight;
                const targetWidth = preset.id === 'original' ? sourceWidth : Math.round(preset.height * aspectRatio);
                const targetHeight = preset.id === 'original' ? sourceHeight : preset.height;
                const targetBitrate = preset.id === 'original' ? sourceBitrate : Math.min(preset.bitrate, sourceBitrate);

                options.push({
                    id: preset.id,
                    label: preset.label,
                    icon: preset.icon,
                    width: targetWidth,
                    height: targetHeight,
                    bitrate: targetBitrate,
                    bitrateLabel: `${(targetBitrate / 1000000).toFixed(1)} Mbps`,
                    isOriginal: preset.id === 'original',
                    description: preset.id === 'original'
                        ? `${sourceWidth}×${sourceHeight} • Source quality`
                        : `${targetWidth}×${targetHeight} • Optimized for bandwidth`
                });
            }
        }

        return options;
    }

    /**
     * Format duration from milliseconds to human readable
     */
    formatDuration(ms) {
        if (!ms || ms <= 0) return 'Unknown';

        const seconds = Math.floor(ms / 1000);
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;

        if (hours > 0) {
            return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        }
        return `${minutes}:${secs.toString().padStart(2, '0')}`;
    }

    /**
     * Format file size to human readable
     */
    formatFileSize(bytes) {
        if (!bytes || bytes <= 0) return 'Unknown';

        const units = ['B', 'KB', 'MB', 'GB', 'TB'];
        let unitIndex = 0;
        let size = bytes;

        while (size >= 1024 && unitIndex < units.length - 1) {
            size /= 1024;
            unitIndex++;
        }

        return `${size.toFixed(2)} ${units[unitIndex]}`;
    }
}

// Export singleton instance
module.exports = new DriveService();
