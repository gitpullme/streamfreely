/**
 * StreamFreely - Frontend JavaScript
 * Handles video analysis, quality selection, stream link generation, and universal streaming
 */

document.addEventListener('DOMContentLoaded', () => {
    // ==========================================
    // SERVICE WORKER REGISTRATION
    // For aggressive stream pre-caching
    // ==========================================
    let swReady = false;

    // Update SW cache status indicator
    function updateSWStatus(status, color = null) {
        const el = document.getElementById('swCacheStatus');
        if (el) {
            el.textContent = status;
            if (color) el.style.color = color;
        }
    }

    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw-stream.js')
            .then(registration => {
                console.log('🚀 StreamFreely SW registered:', registration.scope);
                swReady = true;
                updateSWStatus('Ready', '#22c55e');

                // Listen for SW updates
                registration.addEventListener('updatefound', () => {
                    console.log('🔄 New SW version available');
                });
            })
            .catch(error => {
                console.warn('SW registration failed:', error);
                updateSWStatus('Unavailable', '#f87171');
            });
    } else {
        updateSWStatus('Not Supported', '#f87171');
    }

    // Function to tell SW to prefetch a stream
    function requestPrefetch(streamUrl) {
        if (swReady && navigator.serviceWorker.controller) {
            navigator.serviceWorker.controller.postMessage({
                type: 'PREFETCH_STREAM',
                data: { url: streamUrl }
            });
            console.log('📡 Requested SW to prefetch:', streamUrl);
            updateSWStatus('Pre-fetching...', '#fbbf24');

            // Update status after some time
            setTimeout(() => {
                updateSWStatus('Caching Active', '#22c55e');
            }, 3000);
        } else {
            updateSWStatus('Unavailable', '#f87171');
        }
    }
    // ==========================================
    // DOM Elements - Google Drive Module
    // ==========================================
    const analyzeForm = document.getElementById('analyzeForm');
    const analyzeBtn = document.getElementById('analyzeBtn');
    const generateBtn = document.getElementById('generateBtn');
    const step1 = document.getElementById('step1');
    const step2 = document.getElementById('step2');
    const resultSection = document.getElementById('resultSection');
    const errorSection = document.getElementById('errorSection');
    const qualityOptionsContainer = document.getElementById('qualityOptions');

    // ==========================================
    // DOM Elements - Module Tabs
    // ==========================================
    const moduleTabs = document.querySelectorAll('.module-tab');
    const driveModule = document.getElementById('driveModule');
    const universalModule = document.getElementById('universalModule');

    // ==========================================
    // DOM Elements - Universal Stream Module
    // ==========================================
    const universalForm = document.getElementById('universalForm');
    const universalGenerateBtn = document.getElementById('universalGenerateBtn');
    const universalStep1 = document.getElementById('universalStep1');
    const universalResultSection = document.getElementById('universalResultSection');
    const universalErrorSection = document.getElementById('universalErrorSection');
    const universalVideoPlayer = document.getElementById('universalVideoPlayer');
    const bufferIndicator = document.getElementById('bufferIndicator');

    // ==========================================
    // State
    // ==========================================
    let currentVideoData = null;
    let selectedQuality = 'original';
    let hlsInstance = null;

    // ==========================================
    // Module Tab Switching
    // ==========================================
    moduleTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const moduleId = tab.dataset.module;

            // Update active tab
            moduleTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            // Show/hide modules
            if (moduleId === 'drive') {
                driveModule.classList.remove('hidden');
                universalModule.classList.add('hidden');
            } else {
                driveModule.classList.add('hidden');
                universalModule.classList.remove('hidden');
            }
        });
    });

    // ==========================================
    // GOOGLE DRIVE MODULE - Step 1: Analyze video
    // ==========================================
    analyzeForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const driveUrl = document.getElementById('driveUrl').value.trim();
        if (!driveUrl) return;

        setLoading(analyzeBtn, true);
        hideError();

        try {
            const response = await fetch('/api/analyze', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ driveUrl })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || data.error || 'Failed to analyze video');
            }

            currentVideoData = data.data;
            displayQualityInfo(data.data);

            // Transition to step 2
            step1.classList.add('hidden');
            step2.classList.remove('hidden');

        } catch (error) {
            showError(error.message);
        } finally {
            setLoading(analyzeBtn, false);
        }
    });

    // Display quality information
    function displayQualityInfo(data) {
        const { name, quality } = data;

        // Video info
        document.getElementById('videoName').textContent = name;
        document.getElementById('videoDuration').textContent = `⏱️ ${quality.durationFormatted}`;
        document.getElementById('videoSize').textContent = `📦 ${quality.fileSizeFormatted}`;
        document.getElementById('videoCodec').textContent = `🎞️ ${quality.codec}`;

        // Source quality badge
        document.getElementById('sourceResolution').textContent = quality.resolution;
        document.getElementById('sourcePixels').textContent = `${quality.width} × ${quality.height}`;
        document.getElementById('sourceBitrate').textContent = quality.bitrateLabel;

        const bitrateQualityEl = document.getElementById('bitrateQuality');
        bitrateQualityEl.textContent = quality.bitrateQuality.label;
        bitrateQualityEl.style.color = quality.bitrateQuality.color;

        // Render quality options
        renderQualityOptions(quality.qualityOptions);
    }

    // Render quality selection options
    function renderQualityOptions(options) {
        qualityOptionsContainer.innerHTML = '';
        selectedQuality = 'original';

        options.forEach((option, index) => {
            const optionEl = document.createElement('div');
            optionEl.className = `quality-option ${index === 0 ? 'selected' : ''}`;
            optionEl.dataset.quality = option.id;

            optionEl.innerHTML = `
        <div class="option-header">
          <span class="option-icon">${option.icon}</span>
          <span class="option-label">${option.label}</span>
          ${option.isOriginal ? '<span class="original-badge">Source</span>' : ''}
        </div>
        <div class="option-details">
          <span class="option-resolution">${option.width}×${option.height}</span>
          <span class="option-bitrate">${option.bitrateLabel}</span>
        </div>
        <div class="option-description">${option.description}</div>
      `;

            optionEl.addEventListener('click', () => selectQuality(option.id));
            qualityOptionsContainer.appendChild(optionEl);
        });
    }

    // Select quality option
    function selectQuality(qualityId) {
        selectedQuality = qualityId;

        document.querySelectorAll('.quality-option').forEach(el => {
            el.classList.toggle('selected', el.dataset.quality === qualityId);
        });
    }

    // Generate stream link
    generateBtn.addEventListener('click', async () => {
        if (!currentVideoData) return;

        setLoading(generateBtn, true);
        hideError();

        try {
            // Pass fileId directly for faster processing (skip URL parsing on server)
            const response = await fetch('/api/generate-link', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    fileId: currentVideoData.fileId,
                    quality: selectedQuality
                })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || data.error || 'Failed to generate link');
            }

            displayResult(data.data);

            // Transition to result
            step2.classList.add('hidden');
            resultSection.classList.remove('hidden');

        } catch (error) {
            showError(error.message);
        } finally {
            setLoading(generateBtn, false);
        }
    });

    // Display result
    function displayResult(data) {
        const { streamUrl, selectedQuality: qualityOption } = data;

        document.getElementById('streamUrl').value = streamUrl;
        document.getElementById('selectedQualityInfo').textContent =
            `${qualityOption.label} • ${qualityOption.width}×${qualityOption.height} • ${qualityOption.bitrateLabel}`;

        // Video player
        const videoPlayer = document.getElementById('videoPlayer');
        videoPlayer.src = streamUrl;

        // Embed code
        const embedCode = `<video controls width="640" height="360">\n  <source src="${streamUrl}" type="video/mp4">\n</video>`;
        document.getElementById('embedCode').textContent = embedCode;
    }

    // Change video button
    document.getElementById('changeVideoBtn').addEventListener('click', () => {
        step2.classList.add('hidden');
        step1.classList.remove('hidden');
        currentVideoData = null;
    });

    // New video button
    document.getElementById('newVideoBtn').addEventListener('click', () => {
        resultSection.classList.add('hidden');
        step1.classList.remove('hidden');
        document.getElementById('driveUrl').value = '';
        currentVideoData = null;
    });

    // Copy URL button
    document.getElementById('copyBtn').addEventListener('click', async () => {
        const urlInput = document.getElementById('streamUrl');
        await copyToClipboard(urlInput.value, document.getElementById('copyBtn'));
    });

    // Copy embed code button
    document.getElementById('copyEmbedBtn').addEventListener('click', async () => {
        const embedCode = document.getElementById('embedCode').textContent;
        await copyToClipboard(embedCode, document.getElementById('copyEmbedBtn'));
    });

    // ==========================================
    // UNIVERSAL STREAM MODULE
    // ==========================================

    // Detect stream type from URL
    function detectStreamType(url) {
        const urlLower = url.toLowerCase();
        if (urlLower.includes('.m3u8') || urlLower.includes('hls')) {
            return { type: 'HLS', extension: 'm3u8', icon: '📺' };
        } else if (urlLower.includes('.mpd') || urlLower.includes('dash')) {
            return { type: 'DASH', extension: 'mpd', icon: '📡' };
        } else if (urlLower.includes('.mp4')) {
            return { type: 'MP4', extension: 'mp4', icon: '🎬' };
        } else if (urlLower.includes('.webm')) {
            return { type: 'WebM', extension: 'webm', icon: '🎥' };
        } else if (urlLower.includes('.mkv')) {
            return { type: 'MKV', extension: 'mkv', icon: '🎞️' };
        } else {
            return { type: 'Universal', extension: 'stream', icon: '🌐' };
        }
    }

    // Universal Stream form submission
    universalForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const streamUrl = document.getElementById('universalUrl').value.trim();
        if (!streamUrl) return;

        const enableBuffer = document.getElementById('enableBuffer').checked;
        const enableProxy = document.getElementById('enableProxy').checked;
        const directMode = document.getElementById('directMode').checked;

        setLoading(universalGenerateBtn, true);
        hideUniversalError();

        try {
            // Direct Mode - bypass proxy completely, play directly in browser
            if (directMode) {
                const detected = detectStreamType(streamUrl);
                displayUniversalResult({
                    proxyUrl: streamUrl, // Use original URL directly
                    streamType: detected.type,
                    buffering: enableBuffer,
                    proxied: false,
                    directMode: true,
                    originalUrl: streamUrl
                }, streamUrl);

                // Transition to result
                universalStep1.classList.add('hidden');
                universalResultSection.classList.remove('hidden');
                return;
            }

            // Proxy Mode - generate proxy URL through API
            const response = await fetch('/api/universal/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sourceUrl: streamUrl,
                    enableBuffer,
                    enableProxy
                })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || data.error || 'Failed to generate stream');
            }

            displayUniversalResult(data.data, streamUrl);

            // Transition to result
            universalStep1.classList.add('hidden');
            universalResultSection.classList.remove('hidden');

        } catch (error) {
            showUniversalError(error.message + '\n\n💡 Tip: If blocked by Cloudflare, try enabling "Direct Mode" to bypass the proxy.');
        } finally {
            setLoading(universalGenerateBtn, false);
        }
    });

    // Display universal stream result
    function displayUniversalResult(data, originalUrl) {
        const { proxyUrl, streamType, buffering, directMode } = data;
        const detected = detectStreamType(originalUrl);

        // Update stats
        document.getElementById('bufferStatus').textContent = buffering ? 'Active' : 'Disabled';
        document.getElementById('detectedType').textContent = streamType || detected.type;
        document.getElementById('proxyStatus').textContent = directMode ? '🔓 Direct' : (data.proxied ? 'Active' : 'Disabled');

        // Update stream type info
        const modeLabel = directMode ? '🔓 Direct playback (no proxy)' : (buffering ? 'Enhanced buffering' : 'Standard playback');
        document.getElementById('universalStreamType').textContent =
            `${detected.icon} ${detected.type} stream • ${modeLabel}`;

        // Set the URL
        document.getElementById('universalStreamUrl').value = proxyUrl;

        // Setup video player based on stream type
        setupUniversalPlayer(proxyUrl, detected.type, originalUrl, directMode);

        // Embed code
        const embedCode = generateEmbedCode(proxyUrl, detected.type, directMode);
        document.getElementById('universalEmbedCode').textContent = embedCode;
    }

    // ==========================================
    // ENHANCED HLS PLAYER
    // Provides aggressive buffering and continuous fetching
    // ==========================================

    // Buffer monitoring interval
    let bufferMonitorInterval = null;

    // Setup universal video player with ENHANCED HLS.js support
    function setupUniversalPlayer(proxyUrl, streamType, originalUrl, directMode = false) {
        // Cleanup previous instance
        if (hlsInstance) {
            hlsInstance.destroy();
            hlsInstance = null;
        }
        if (bufferMonitorInterval) {
            clearInterval(bufferMonitorInterval);
            bufferMonitorInterval = null;
        }

        // Show buffer indicator
        bufferIndicator.classList.remove('hidden');

        if (streamType === 'HLS') {
            setupEnhancedHLSPlayer(proxyUrl, directMode);
        } else {
            // Direct playback for MP4, WebM, etc.
            universalVideoPlayer.src = proxyUrl;
            universalVideoPlayer.addEventListener('canplay', () => {
                bufferIndicator.classList.add('hidden');
            }, { once: true });
        }

        // Common event listeners
        setupPlayerEventListeners();
    }

    // Setup Enhanced HLS Player with aggressive buffering
    function setupEnhancedHLSPlayer(streamUrl, directMode) {
        if (typeof Hls === 'undefined' || !Hls.isSupported()) {
            // Fallback for Safari
            if (universalVideoPlayer.canPlayType('application/vnd.apple.mpegurl')) {
                universalVideoPlayer.src = streamUrl;
                universalVideoPlayer.addEventListener('loadedmetadata', () => {
                    bufferIndicator.classList.add('hidden');
                    universalVideoPlayer.play().catch(() => { });
                });
            }
            return;
        }

        // === START FAST, BUFFER LATER ===
        // This configuration prioritizes INSTANT playback start,
        // then aggressively buffers in the background while playing
        const hlsConfig = {
            // === Core Settings ===
            enableWorker: true,
            lowLatencyMode: false,  // Prioritize stability over latency

            // === REQUEST CONFIGURATION ===
            // Add proper headers to avoid 403 errors
            xhrSetup: function (xhr, url) {
                // Set headers that might help with restrictive servers
                try {
                    // Note: Some headers can't be set due to browser security
                    xhr.withCredentials = false; // Don't send cookies cross-origin
                } catch (e) {
                    console.warn('Could not configure XHR:', e);
                }
            },

            // === INSTANT START SETTINGS ===
            startLevel: -1,                 // Auto-select quality (fastest start)
            autoStartLoad: true,            // Start loading immediately
            startPosition: -1,              // Start from live edge / beginning

            // === SMART BUFFER STRATEGY ===
            // Start with small buffer for instant play, then grow
            maxBufferLength: 30,            // Initial target: 30s (fast start)
            maxMaxBufferLength: 600,        // But ALLOW growth up to 10 minutes!
            maxBufferSize: 200 * 1000 * 1000, // 200MB max buffer size
            maxBufferHole: 0.5,             // Tolerate small gaps

            // === BACK BUFFER (for seeking back) ===
            backBufferLength: 180,          // Keep 3 minutes behind current position
            liveBackBufferLength: 180,      // Same for live streams

            // === FAST INITIAL LOADING ===
            manifestLoadingTimeOut: 10000,  // 10s timeout (faster fail)
            manifestLoadingMaxRetry: 2,     // Only retry 2 times before fallback
            manifestLoadingRetryDelay: 500, // 500ms between retries (faster)

            levelLoadingTimeOut: 10000,     // 10s timeout
            levelLoadingMaxRetry: 2,
            levelLoadingRetryDelay: 500,

            fragLoadingTimeOut: 20000,      // 20s timeout for fragments
            fragLoadingMaxRetry: 4,         // Retry fragments
            fragLoadingRetryDelay: 500,     // 500ms delay

            // === CONTINUOUS AGGRESSIVE FETCHING ===
            startFragPrefetch: true,        // Pre-fetch next fragment ASAP
            testBandwidth: true,            // Measure bandwidth
            progressive: true,              // Progressive loading

            // === ABR (Adaptive Bitrate) - Start Low, Go High ===
            startLevel: 0,                  // Start with LOWEST quality (instant start)
            abrEwmaDefaultEstimate: 1000000, // Start assuming 1 Mbps (conservative)
            abrBandWidthFactor: 0.9,         // Use 90% of measured bandwidth
            abrBandWidthUpFactor: 0.7,       // Conservative quality upgrades
            abrMaxWithRealBitrate: true,     // Use real bitrate for ABR

            // === PLAYBACK SETTINGS ===
            nudgeOffset: 0.1,               // Small nudge for stuck playback
            nudgeMaxRetry: 5,               // Retry nudges
            maxFragLookUpTolerance: 0.25,   // Fragment lookup tolerance

            // === ERROR RECOVERY ===
            appendErrorMaxRetry: 5,
            enableSoftwareAES: true,        // Software decryption if needed
        };

        // Track if we've already tried fallback
        let fallbackAttempted = false;

        hlsInstance = new Hls(hlsConfig);
        hlsInstance.loadSource(streamUrl);
        hlsInstance.attachMedia(universalVideoPlayer);

        // === SMART FALLBACK FUNCTION ===
        // If HLS.js fails (403, CORS, etc.), try native playback
        function tryNativeFallback() {
            if (fallbackAttempted) return;
            fallbackAttempted = true;

            console.log('🔄 HLS.js failed, trying native video playback...');
            document.getElementById('bufferStatus').textContent = 'Trying native...';

            // Destroy HLS instance
            if (hlsInstance) {
                hlsInstance.destroy();
                hlsInstance = null;
            }

            // Try native video element playback
            // This works in Safari, iOS, and some other browsers
            universalVideoPlayer.src = streamUrl;

            universalVideoPlayer.addEventListener('loadedmetadata', () => {
                console.log('✅ Native playback working!');
                bufferIndicator.classList.add('hidden');
                document.getElementById('bufferStatus').textContent = 'Native + SW Caching';
                universalVideoPlayer.play().catch(() => { });
                startBufferMonitoring();

                // 🚀 AGGRESSIVE MODE: Tell Service Worker to pre-fetch segments!
                requestPrefetch(streamUrl);
                console.log('📡 SW will pre-cache segments in background');
            }, { once: true });

            universalVideoPlayer.addEventListener('error', (e) => {
                console.error('❌ Native playback also failed:', e);
                document.getElementById('bufferStatus').textContent = 'Failed - Try Open in Tab';
                showOpenInTabOption(streamUrl);
            }, { once: true });

            universalVideoPlayer.load();
        }

        // Show "Open in New Tab" option as last resort
        function showOpenInTabOption(url) {
            const statsSection = document.querySelector('.stream-stats');
            if (statsSection && !document.getElementById('openInTabBtn')) {
                const btn = document.createElement('button');
                btn.id = 'openInTabBtn';
                btn.className = 'btn-secondary';
                btn.innerHTML = '🔗 Open Stream in New Tab';
                btn.style.marginTop = '1rem';
                btn.onclick = () => window.open(url, '_blank');
                statsSection.appendChild(btn);
            }
        }

        // === EVENT HANDLERS ===

        // Manifest loaded - start playback IMMEDIATELY
        hlsInstance.on(Hls.Events.MANIFEST_PARSED, (event, data) => {
            console.log('🎬 HLS Manifest parsed, quality levels:', data.levels.length);
            bufferIndicator.classList.add('hidden');

            // Start playback immediately
            universalVideoPlayer.play().catch(() => { });

            // Start buffer monitoring
            startBufferMonitoring();

            // Update stats
            updateStreamStats('Starting...', data.levels.length);

            // === BUFFER GROWTH: Start Fast, Then Ramp Up ===
            // After playback starts, gradually increase buffer target
            setTimeout(() => {
                if (hlsInstance) {
                    console.log('📈 Ramping up buffer target to 60s');
                    hlsInstance.config.maxBufferLength = 60;
                }
            }, 5000); // After 5 seconds

            setTimeout(() => {
                if (hlsInstance) {
                    console.log('📈 Ramping up buffer target to 120s');
                    hlsInstance.config.maxBufferLength = 120;
                }
            }, 15000); // After 15 seconds

            setTimeout(() => {
                if (hlsInstance) {
                    console.log('📈 Maximum buffer mode: 180s');
                    hlsInstance.config.maxBufferLength = 180;
                }
            }, 30000); // After 30 seconds
        });

        // Fragment loaded - update buffer status
        hlsInstance.on(Hls.Events.FRAG_LOADED, (event, data) => {
            const fragDuration = data.frag.duration;
            console.log(`📦 Fragment loaded: ${fragDuration.toFixed(1)}s`);
        });

        // Fragment buffered - continuous fetching working
        hlsInstance.on(Hls.Events.FRAG_BUFFERED, (event, data) => {
            updateBufferDisplay();
        });

        // Level switched - quality change
        hlsInstance.on(Hls.Events.LEVEL_SWITCHED, (event, data) => {
            const level = hlsInstance.levels[data.level];
            console.log(`📊 Quality switched: ${level.height}p @ ${(level.bitrate / 1000000).toFixed(1)} Mbps`);
            document.getElementById('detectedType').textContent = `HLS ${level.height}p`;
        });

        // ERROR HANDLING with auto-recovery and smart fallback
        hlsInstance.on(Hls.Events.ERROR, (event, data) => {
            console.warn('⚠️ HLS Error:', data.type, data.details, data.response?.code);

            // Check if it's a 403 or manifest load error - fallback immediately
            if (data.details === 'manifestLoadError' ||
                data.details === 'manifestParsingError' ||
                data.response?.code === 403 ||
                data.response?.code === 404 ||
                data.response?.code === 0) { // CORS error often shows as 0
                console.log('🔄 Manifest error (likely CORS/403), trying native fallback...');
                tryNativeFallback();
                return;
            }

            if (data.fatal) {
                switch (data.type) {
                    case Hls.ErrorTypes.NETWORK_ERROR:
                        // Check if it's been retrying too long
                        if (data.details.includes('manifest') || data.details.includes('level')) {
                            console.log('🔄 Network error on manifest/level, trying fallback...');
                            tryNativeFallback();
                        } else {
                            console.log('🔄 Network error, attempting recovery...');
                            document.getElementById('bufferStatus').textContent = 'Recovering...';
                            hlsInstance.startLoad(); // Retry loading
                        }
                        break;
                    case Hls.ErrorTypes.MEDIA_ERROR:
                        console.log('🔄 Media error, attempting recovery...');
                        document.getElementById('bufferStatus').textContent = 'Recovering...';
                        hlsInstance.recoverMediaError();
                        break;
                    default:
                        console.error('❌ Fatal error, trying fallback...');
                        tryNativeFallback();
                        break;
                }
            } else {
                // Non-fatal: HLS.js handles automatically with retries
                document.getElementById('bufferStatus').textContent = 'Retrying...';
            }
        });
    }

    // Start real-time buffer monitoring
    function startBufferMonitoring() {
        if (bufferMonitorInterval) clearInterval(bufferMonitorInterval);

        bufferMonitorInterval = setInterval(() => {
            updateBufferDisplay();
        }, 500); // Update every 500ms
    }

    // Update buffer display with real-time stats
    function updateBufferDisplay() {
        if (!universalVideoPlayer || !hlsInstance) return;

        const video = universalVideoPlayer;
        const buffered = video.buffered;

        if (buffered.length > 0) {
            const currentTime = video.currentTime;
            const bufferedEnd = buffered.end(buffered.length - 1);
            const bufferAhead = bufferedEnd - currentTime;

            // Calculate buffer health (target: 60s = 100%)
            const bufferHealth = Math.min(100, (bufferAhead / 60) * 100);

            // Color based on health
            let statusColor = '#22c55e'; // Green
            let statusText = 'Excellent';
            if (bufferHealth < 30) {
                statusColor = '#ef4444'; // Red
                statusText = 'Low';
            } else if (bufferHealth < 60) {
                statusColor = '#f59e0b'; // Orange
                statusText = 'Fair';
            } else if (bufferHealth < 80) {
                statusColor = '#84cc16'; // Light green
                statusText = 'Good';
            }

            const bufferStatusEl = document.getElementById('bufferStatus');
            bufferStatusEl.textContent = `${bufferAhead.toFixed(1)}s (${statusText})`;
            bufferStatusEl.style.color = statusColor;

            // Log buffer stats periodically
            if (Math.random() < 0.1) { // 10% chance to log
                console.log(`📊 Buffer: ${bufferAhead.toFixed(1)}s ahead | Health: ${bufferHealth.toFixed(0)}%`);
            }
        }
    }

    // Update stream stats display
    function updateStreamStats(status, qualityLevels = null) {
        const bufferStatusEl = document.getElementById('bufferStatus');
        bufferStatusEl.textContent = status;

        if (qualityLevels) {
            document.getElementById('detectedType').textContent = `HLS (${qualityLevels} qualities)`;
        }
    }

    // Setup common player event listeners
    function setupPlayerEventListeners() {
        // Waiting (buffering)
        universalVideoPlayer.addEventListener('waiting', () => {
            bufferIndicator.classList.remove('hidden');
            if (!hlsInstance) {
                document.getElementById('bufferStatus').textContent = 'Buffering...';
            }
        });

        // Playing
        universalVideoPlayer.addEventListener('playing', () => {
            bufferIndicator.classList.add('hidden');
        });

        // Paused - continue fetching in background
        universalVideoPlayer.addEventListener('pause', () => {
            if (hlsInstance) {
                console.log('⏸️ Paused - continuing background fetch');
                // HLS.js continues fetching by default, just log it
            }
        });

        // Seeking
        universalVideoPlayer.addEventListener('seeking', () => {
            document.getElementById('bufferStatus').textContent = 'Seeking...';
        });

        // Seeked
        universalVideoPlayer.addEventListener('seeked', () => {
            updateBufferDisplay();
        });

        // Error
        universalVideoPlayer.addEventListener('error', (e) => {
            bufferIndicator.classList.add('hidden');
            console.error('Video error:', e);
            document.getElementById('bufferStatus').textContent = 'Error';
        });

        // Ended
        universalVideoPlayer.addEventListener('ended', () => {
            if (bufferMonitorInterval) {
                clearInterval(bufferMonitorInterval);
            }
            document.getElementById('bufferStatus').textContent = 'Ended';
        });
    }

    // Generate embed code based on stream type
    function generateEmbedCode(proxyUrl, streamType, directMode = false) {
        const note = directMode ? '<!-- NOTE: This uses the original URL directly. May not work on all sites due to CORS. -->\n' : '';
        if (streamType === 'HLS') {
            return `${note}<!-- Include HLS.js for best compatibility -->
<script src="https://cdn.jsdelivr.net/npm/hls.js@latest"></script>
<video id="video" controls width="640" height="360"></video>
<script>
  var video = document.getElementById('video');
  if (Hls.isSupported()) {
    var hls = new Hls();
    hls.loadSource('${proxyUrl}');
    hls.attachMedia(video);
  } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
    video.src = '${proxyUrl}';
  }
</script>`;
        } else {
            return `${note}<video controls width="640" height="360">
  <source src="${proxyUrl}" type="video/${streamType.toLowerCase()}">
</video>`;
        }
    }

    // Universal copy buttons
    document.getElementById('universalCopyBtn').addEventListener('click', async () => {
        const urlInput = document.getElementById('universalStreamUrl');
        await copyToClipboard(urlInput.value, document.getElementById('universalCopyBtn'));
    });

    document.getElementById('universalCopyEmbedBtn').addEventListener('click', async () => {
        const embedCode = document.getElementById('universalEmbedCode').textContent;
        await copyToClipboard(embedCode, document.getElementById('universalCopyEmbedBtn'));
    });

    // New stream button
    document.getElementById('universalNewBtn').addEventListener('click', () => {
        universalResultSection.classList.add('hidden');
        universalStep1.classList.remove('hidden');
        document.getElementById('universalUrl').value = '';

        // Cleanup
        if (hlsInstance) {
            hlsInstance.destroy();
            hlsInstance = null;
        }
        universalVideoPlayer.src = '';
    });

    // Universal error helpers
    function showUniversalError(message) {
        document.getElementById('universalErrorMessage').textContent = message;
        universalErrorSection.classList.remove('hidden');
    }

    function hideUniversalError() {
        universalErrorSection.classList.add('hidden');
    }

    // ==========================================
    // Helper Functions
    // ==========================================

    // Copy to clipboard
    async function copyToClipboard(text, button) {
        try {
            await navigator.clipboard.writeText(text);
            const originalText = button.textContent;
            button.textContent = 'Copied!';
            setTimeout(() => { button.textContent = originalText; }, 2000);
        } catch (err) {
            console.error('Failed to copy:', err);
        }
    }

    // Set loading state
    function setLoading(button, isLoading) {
        button.classList.toggle('loading', isLoading);
        button.disabled = isLoading;
    }

    // Show error
    function showError(message) {
        document.getElementById('errorMessage').textContent = message;
        errorSection.classList.remove('hidden');
    }

    // Hide error
    function hideError() {
        errorSection.classList.add('hidden');
    }

    // Smooth scroll for nav links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', (e) => {
            e.preventDefault();
            const target = document.querySelector(anchor.getAttribute('href'));
            if (target) target.scrollIntoView({ behavior: 'smooth' });
        });
    });
});
