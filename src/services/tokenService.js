const crypto = require('crypto');

class TokenService {
    constructor() {
        this.secret = process.env.STREAM_SECRET || 'default-secret-change-me';
        this.tokenExpiry = 24 * 60 * 60 * 1000; // 24 hours
        this.tokenCache = new Map();

        // Base62 characters for shorter URLs
        this.base62Chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
    }

    /**
     * Convert bytes to base62 for shorter strings
     */
    bytesToBase62(buffer) {
        let num = BigInt('0x' + buffer.toString('hex'));
        if (num === 0n) return '0';
        let result = '';
        while (num > 0n) {
            result = this.base62Chars[Number(num % 62n)] + result;
            num = num / 62n;
        }
        return result;
    }

    /**
     * Convert base62 to hex string
     */
    base62ToHex(str) {
        let num = 0n;
        for (const char of str) {
            num = num * 62n + BigInt(this.base62Chars.indexOf(char));
        }
        return num.toString(16).padStart(2, '0');
    }

    /**
     * Compress quality string to single char
     */
    compressQuality(quality) {
        const map = { 'original': 'o', '1080p': 'h', '720p': 'm', '480p': 's', '360p': 'l' };
        return map[quality] || 'o';
    }

    /**
     * Decompress quality char to string
     */
    decompressQuality(char) {
        const map = { 'o': 'original', 'h': '1080p', 'm': '720p', 's': '480p', 'l': '360p' };
        return map[char] || 'original';
    }

    /**
     * Number to base62
     */
    numToBase62(num) {
        if (num === 0) return '0';
        let result = '';
        while (num > 0) {
            result = this.base62Chars[num % 62] + result;
            num = Math.floor(num / 62);
        }
        return result;
    }

    /**
     * Base62 to number
     */
    base62ToNum(str) {
        let result = 0;
        for (const char of str) {
            result = result * 62 + this.base62Chars.indexOf(char);
        }
        return result;
    }

    /**
     * Generate a SHORT but self-contained token
     * Format: {fileId62}.{quality}{expHours62}.{sig62}
     * 
     * Google Drive IDs are ~33 chars base64, we convert to base62 for ~5% savings
     * Plus we use dots as separators (shorter than underscores in URLs)
     */
    generateToken(fileId, quality = 'original') {
        const now = Date.now();

        // Calculate expiry in hours from Unix epoch (fits in smaller number)
        const expiryHours = Math.floor((now + this.tokenExpiry) / 3600000);
        const expiryBase62 = this.numToBase62(expiryHours);

        // Quality as single char
        const qualityChar = this.compressQuality(quality);

        // Create signature (shorter - 6 chars is enough for basic validation)
        const sigData = `${fileId}:${quality}:${expiryHours}:${this.secret}`;
        const signature = crypto.createHash('sha256').update(sigData).digest('hex').substring(0, 6);

        // Token format: fileId.qExpiry.sig
        // fileId is already URL-safe, just use it directly
        const token = `${fileId}.${qualityChar}${expiryBase62}.${signature}`;

        // Cache for faster lookups
        this.tokenCache.set(token, { fileId, quality, timestamp: now });

        return token;
    }

    /**
     * Decode and validate token
     */
    decodeToken(token) {
        try {
            // Check cache first
            if (this.tokenCache.has(token)) {
                const cached = this.tokenCache.get(token);
                if (Date.now() - cached.timestamp < this.tokenExpiry) {
                    return { fileId: cached.fileId, quality: cached.quality };
                }
                this.tokenCache.delete(token);
            }

            // Parse token: fileId.qExpiry.sig
            const parts = token.split('.');
            if (parts.length !== 3) {
                console.warn('Invalid token format');
                return null;
            }

            const [fileId, qExpiry, providedSig] = parts;

            // Extract quality (first char) and expiry (rest)
            const qualityChar = qExpiry[0];
            const expiryBase62 = qExpiry.substring(1);

            const quality = this.decompressQuality(qualityChar);
            const expiryHours = this.base62ToNum(expiryBase62);

            // Check expiry
            const currentHours = Math.floor(Date.now() / 3600000);
            if (currentHours > expiryHours) {
                console.warn('Token expired');
                return null;
            }

            // Verify signature
            const sigData = `${fileId}:${quality}:${expiryHours}:${this.secret}`;
            const expectedSig = crypto.createHash('sha256').update(sigData).digest('hex').substring(0, 6);

            if (providedSig !== expectedSig) {
                console.warn('Invalid token signature');
                return null;
            }

            // Cache for future lookups
            this.tokenCache.set(token, { fileId, quality, timestamp: Date.now() });

            return { fileId, quality };

        } catch (error) {
            console.error('Error decoding token:', error.message);
            return null;
        }
    }

    /**
     * Create HMAC signature (for backwards compatibility)
     */
    sign(data) {
        return crypto
            .createHmac('sha256', this.secret)
            .update(data)
            .digest('hex')
            .substring(0, 16);
    }

    /**
     * Remove expired tokens from cache
     */
    cleanExpiredTokens() {
        const now = Date.now();
        for (const [token, data] of this.tokenCache.entries()) {
            if (now - data.timestamp > this.tokenExpiry) {
                this.tokenCache.delete(token);
            }
        }
    }
}

module.exports = new TokenService();
