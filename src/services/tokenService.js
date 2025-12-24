const crypto = require('crypto');

class TokenService {
    constructor() {
        this.secret = process.env.STREAM_SECRET || 'default-secret-change-me';
        this.tokenExpiry = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
        this.tokenCache = new Map();
    }

    /**
     * Generate a secure token for a file ID
     * Token format: base64(fileId:quality:timestamp:signature)
     */
    generateToken(fileId, quality = 'original') {
        const timestamp = Date.now();
        const data = `${fileId}:${quality}:${timestamp}`;
        const signature = this.sign(data);

        // Create URL-safe base64 token
        const token = Buffer.from(`${data}:${signature}`)
            .toString('base64')
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=/g, '');

        // Cache the token for quick lookup
        this.tokenCache.set(token, { fileId, quality, timestamp });

        // Clean old tokens periodically
        this.cleanExpiredTokens();

        return token;
    }

    /**
     * Decode and validate a token, returning the file ID and quality if valid
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
                return null;
            }

            // Restore base64 padding and decode
            let base64 = token.replace(/-/g, '+').replace(/_/g, '/');
            while (base64.length % 4) {
                base64 += '=';
            }

            const decoded = Buffer.from(base64, 'base64').toString('utf8');
            const parts = decoded.split(':');

            if (parts.length !== 4) {
                return null;
            }

            const [fileId, quality, timestampStr, signature] = parts;
            const timestamp = parseInt(timestampStr, 10);

            // Verify signature
            const data = `${fileId}:${quality}:${timestamp}`;
            const expectedSignature = this.sign(data);

            if (signature !== expectedSignature) {
                console.warn('Invalid token signature');
                return null;
            }

            // Check expiry
            if (Date.now() - timestamp > this.tokenExpiry) {
                console.warn('Token expired');
                return null;
            }

            // Cache for future lookups
            this.tokenCache.set(token, { fileId, quality, timestamp });

            return { fileId, quality };

        } catch (error) {
            console.error('Error decoding token:', error.message);
            return null;
        }
    }

    /**
     * Create HMAC signature
     */
    sign(data) {
        return crypto
            .createHmac('sha256', this.secret)
            .update(data)
            .digest('hex')
            .substring(0, 16); // Use first 16 chars for shorter URLs
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

// Export singleton instance
module.exports = new TokenService();
