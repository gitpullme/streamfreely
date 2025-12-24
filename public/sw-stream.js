/**
 * StreamFreely Service Worker
 * ============================
 * 
 * NOVEL APPROACH: Aggressive pre-caching for HLS streams
 * 
 * This SW intercepts video segment requests and:
 * 1. Serves from cache if available (instant!)
 * 2. Fetches and caches if not
 * 3. Pre-fetches future segments in background
 * 4. Builds a massive buffer that survives network issues
 */

const CACHE_NAME = 'streamfreely-segments-v1';
const PREFETCH_AHEAD = 10; // Pre-fetch 10 segments ahead
const MAX_CACHE_SIZE = 500; // Keep max 500 segments cached

// Track active streams for pre-fetching
const activeStreams = new Map();

// Install event - cache core assets
self.addEventListener('install', (event) => {
    console.log('🚀 StreamFreely SW: Installing...');
    self.skipWaiting(); // Activate immediately
});

// Activate event - clean old caches
self.addEventListener('activate', (event) => {
    console.log('✅ StreamFreely SW: Activated!');
    event.waitUntil(clients.claim()); // Take control immediately
});

// Fetch event - intercept ALL requests
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Check if this is a stream-related request
    if (isStreamRequest(url)) {
        event.respondWith(handleStreamRequest(event.request, url));
    }
});

// Check if this is a stream segment or playlist
function isStreamRequest(url) {
    const path = url.pathname.toLowerCase();
    return (
        path.endsWith('.m3u8') ||
        path.endsWith('.ts') ||
        path.endsWith('.m4s') ||
        path.endsWith('.mp4') ||
        path.includes('/hls/') ||
        path.includes('/segment') ||
        url.href.includes('m3u8') ||
        url.href.includes('.ts')
    );
}

// Handle stream requests with caching and pre-fetching
async function handleStreamRequest(request, url) {
    const cache = await caches.open(CACHE_NAME);
    const cacheKey = url.href;

    // 1. Try cache first (instant response!)
    const cachedResponse = await cache.match(cacheKey);
    if (cachedResponse) {
        console.log('⚡ SW: Serving from cache:', getShortUrl(url));
        // Trigger background prefetch for future segments
        triggerPrefetch(url);
        return cachedResponse;
    }

    // 2. Not in cache - fetch from network
    console.log('🌐 SW: Fetching:', getShortUrl(url));

    try {
        // Fetch with various strategies for restrictive servers
        const response = await fetchWithStrategies(request, url);

        if (response && response.ok) {
            // Cache the response (clone because response can only be used once)
            const responseToCache = response.clone();
            cache.put(cacheKey, responseToCache);
            console.log('💾 SW: Cached:', getShortUrl(url));

            // If this is a playlist, parse and prefetch segments
            if (url.pathname.endsWith('.m3u8')) {
                prefetchFromPlaylist(url, response.clone());
            }

            // Trigger prefetch of next segments
            triggerPrefetch(url);
        }

        return response;
    } catch (error) {
        console.error('❌ SW: Fetch failed:', error);
        // Return whatever we can - even an error response is better than hanging
        return new Response('Stream temporarily unavailable', {
            status: 503,
            headers: { 'Content-Type': 'text/plain' }
        });
    }
}

// Try multiple fetch strategies for restrictive servers
async function fetchWithStrategies(request, url) {
    const strategies = [
        // Strategy 1: Standard fetch with no-cors (for opaque responses)
        () => fetch(request.url, {
            mode: 'cors',
            credentials: 'omit',
            headers: {
                'Accept': '*/*',
            }
        }),
        // Strategy 2: No-CORS mode (gets opaque response but works)
        () => fetch(request.url, {
            mode: 'no-cors',
            credentials: 'omit'
        }),
        // Strategy 3: Original request clone
        () => fetch(request.clone()),
    ];

    for (const strategy of strategies) {
        try {
            const response = await strategy();
            // For no-cors, response.ok is false but response.type is 'opaque'
            if (response.ok || response.type === 'opaque') {
                return response;
            }
        } catch (e) {
            console.warn('SW: Strategy failed:', e.message);
        }
    }

    // All strategies failed
    throw new Error('All fetch strategies failed');
}

// Trigger prefetch of upcoming segments
function triggerPrefetch(currentUrl) {
    // Parse segment number from URL
    const segmentInfo = parseSegmentUrl(currentUrl);
    if (!segmentInfo) return;

    const { baseUrl, segmentNumber, extension } = segmentInfo;

    // Store stream info for tracking
    activeStreams.set(baseUrl, {
        lastSegment: segmentNumber,
        timestamp: Date.now()
    });

    // Prefetch next segments in background
    for (let i = 1; i <= PREFETCH_AHEAD; i++) {
        const nextSegment = segmentNumber + i;
        const nextUrl = buildSegmentUrl(baseUrl, nextSegment, extension);

        // Don't block - prefetch in background
        prefetchSegment(nextUrl);
    }
}

// Prefetch a single segment
async function prefetchSegment(url) {
    try {
        const cache = await caches.open(CACHE_NAME);

        // Check if already cached
        const existing = await cache.match(url);
        if (existing) return;

        console.log('📥 SW: Pre-fetching:', getShortUrl(new URL(url)));

        const response = await fetch(url, {
            mode: 'cors',
            credentials: 'omit'
        }).catch(() => fetch(url, { mode: 'no-cors' }));

        if (response && (response.ok || response.type === 'opaque')) {
            await cache.put(url, response);
            console.log('✅ SW: Pre-fetched:', getShortUrl(new URL(url)));
        }
    } catch (e) {
        // Prefetch failed - not critical
        console.warn('SW: Pre-fetch failed:', url);
    }
}

// Parse m3u8 playlist and prefetch all segments
async function prefetchFromPlaylist(playlistUrl, response) {
    try {
        const text = await response.text();
        const lines = text.split('\n');
        const baseUrl = playlistUrl.href.substring(0, playlistUrl.href.lastIndexOf('/') + 1);

        const segmentUrls = [];

        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed && !trimmed.startsWith('#')) {
                // This is a segment URL (relative or absolute)
                const segmentUrl = trimmed.startsWith('http')
                    ? trimmed
                    : baseUrl + trimmed;
                segmentUrls.push(segmentUrl);
            }
        }

        console.log(`📋 SW: Found ${segmentUrls.length} segments in playlist`);

        // Prefetch first N segments immediately
        const immediateCount = Math.min(PREFETCH_AHEAD, segmentUrls.length);
        for (let i = 0; i < immediateCount; i++) {
            prefetchSegment(segmentUrls[i]);
        }

        // Store remaining for later prefetch
        activeStreams.set(playlistUrl.href, {
            segments: segmentUrls,
            prefetchIndex: immediateCount,
            timestamp: Date.now()
        });

    } catch (e) {
        console.warn('SW: Could not parse playlist:', e);
    }
}

// Parse segment URL to extract number pattern
function parseSegmentUrl(url) {
    const href = url.href;

    // Common patterns: segment_001.ts, seg-1.ts, media_0001.ts, etc.
    const patterns = [
        /(.+?)(\d+)(\.ts)$/i,
        /(.+?)(\d+)(\.m4s)$/i,
        /(.+?segment)(\d+)(.+)$/i,
    ];

    for (const pattern of patterns) {
        const match = href.match(pattern);
        if (match) {
            return {
                baseUrl: match[1],
                segmentNumber: parseInt(match[2]),
                extension: match[3]
            };
        }
    }

    return null;
}

// Build segment URL from components
function buildSegmentUrl(baseUrl, segmentNumber, extension) {
    // Maintain same padding as original
    const paddedNum = String(segmentNumber).padStart(3, '0');
    return `${baseUrl}${paddedNum}${extension}`;
}

// Helper: Get short URL for logging
function getShortUrl(url) {
    const path = url.pathname;
    return path.length > 50 ? '...' + path.slice(-47) : path;
}

// Periodic cleanup of old cache entries
async function cleanupCache() {
    const cache = await caches.open(CACHE_NAME);
    const keys = await cache.keys();

    if (keys.length > MAX_CACHE_SIZE) {
        // Delete oldest entries
        const toDelete = keys.slice(0, keys.length - MAX_CACHE_SIZE);
        for (const key of toDelete) {
            await cache.delete(key);
        }
        console.log(`🧹 SW: Cleaned ${toDelete.length} old cache entries`);
    }
}

// Run cleanup periodically
setInterval(cleanupCache, 60000); // Every minute

// Listen for messages from main thread
self.addEventListener('message', (event) => {
    const { type, data } = event.data;

    switch (type) {
        case 'PREFETCH_STREAM':
            // Main thread is telling us to prefetch a stream
            console.log('📡 SW: Received prefetch request for:', data.url);
            prefetchFromUrl(data.url);
            break;

        case 'CLEAR_CACHE':
            caches.delete(CACHE_NAME).then(() => {
                console.log('🗑️ SW: Cache cleared');
            });
            break;
    }
});

// Prefetch from a given URL
async function prefetchFromUrl(url) {
    try {
        const response = await fetch(url, { mode: 'cors', credentials: 'omit' });
        if (response.ok && url.includes('.m3u8')) {
            await prefetchFromPlaylist(new URL(url), response);
        }
    } catch (e) {
        console.warn('SW: prefetchFromUrl failed:', e);
    }
}

console.log('🎬 StreamFreely Service Worker loaded!');
