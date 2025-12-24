/**
 * StreamFreely - Frontend JavaScript
 * Handles video analysis, quality selection, stream link generation, and universal streaming
 */

document.addEventListener('DOMContentLoaded', () => {
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

        setLoading(universalGenerateBtn, true);
        hideUniversalError();

        try {
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
            showUniversalError(error.message);
        } finally {
            setLoading(universalGenerateBtn, false);
        }
    });

    // Display universal stream result
    function displayUniversalResult(data, originalUrl) {
        const { proxyUrl, streamType, buffering } = data;
        const detected = detectStreamType(originalUrl);

        // Update stats
        document.getElementById('bufferStatus').textContent = buffering ? 'Active' : 'Disabled';
        document.getElementById('detectedType').textContent = streamType || detected.type;
        document.getElementById('proxyStatus').textContent = data.proxied ? 'Active' : 'Direct';

        // Update stream type info
        document.getElementById('universalStreamType').textContent =
            `${detected.icon} ${detected.type} stream • ${buffering ? 'Enhanced buffering' : 'Standard playback'}`;

        // Set the URL
        document.getElementById('universalStreamUrl').value = proxyUrl;

        // Setup video player based on stream type
        setupUniversalPlayer(proxyUrl, detected.type, originalUrl);

        // Embed code
        const embedCode = generateEmbedCode(proxyUrl, detected.type);
        document.getElementById('universalEmbedCode').textContent = embedCode;
    }

    // Setup universal video player with HLS.js support
    function setupUniversalPlayer(proxyUrl, streamType, originalUrl) {
        // Cleanup previous HLS instance
        if (hlsInstance) {
            hlsInstance.destroy();
            hlsInstance = null;
        }

        // Show buffer indicator
        bufferIndicator.classList.remove('hidden');

        if (streamType === 'HLS') {
            // Use HLS.js for m3u8 streams
            if (typeof Hls !== 'undefined' && Hls.isSupported()) {
                hlsInstance = new Hls({
                    enableWorker: true,
                    maxBufferLength: 60,
                    maxMaxBufferLength: 120,
                    maxBufferSize: 60 * 1000 * 1000, // 60MB
                    maxBufferHole: 0.5,
                    lowLatencyMode: false,
                    backBufferLength: 90
                });

                hlsInstance.loadSource(proxyUrl);
                hlsInstance.attachMedia(universalVideoPlayer);

                hlsInstance.on(Hls.Events.MANIFEST_PARSED, () => {
                    bufferIndicator.classList.add('hidden');
                    universalVideoPlayer.play().catch(() => { });
                });

                hlsInstance.on(Hls.Events.ERROR, (event, data) => {
                    if (data.fatal) {
                        console.error('HLS fatal error:', data);
                        // Try direct playback as fallback
                        universalVideoPlayer.src = proxyUrl;
                    }
                });

                // Buffer monitoring
                hlsInstance.on(Hls.Events.FRAG_BUFFERED, () => {
                    document.getElementById('bufferStatus').textContent = 'Buffered';
                });

            } else if (universalVideoPlayer.canPlayType('application/vnd.apple.mpegurl')) {
                // Native HLS support (Safari)
                universalVideoPlayer.src = proxyUrl;
                universalVideoPlayer.addEventListener('loadedmetadata', () => {
                    bufferIndicator.classList.add('hidden');
                    universalVideoPlayer.play().catch(() => { });
                });
            } else {
                // Fallback to direct URL
                universalVideoPlayer.src = proxyUrl;
            }
        } else {
            // Direct playback for MP4, WebM, etc.
            universalVideoPlayer.src = proxyUrl;
            universalVideoPlayer.addEventListener('canplay', () => {
                bufferIndicator.classList.add('hidden');
            }, { once: true });
        }

        // Buffer state monitoring
        universalVideoPlayer.addEventListener('waiting', () => {
            bufferIndicator.classList.remove('hidden');
            document.getElementById('bufferStatus').textContent = 'Buffering...';
        });

        universalVideoPlayer.addEventListener('playing', () => {
            bufferIndicator.classList.add('hidden');
            document.getElementById('bufferStatus').textContent = 'Playing';
        });

        universalVideoPlayer.addEventListener('error', (e) => {
            bufferIndicator.classList.add('hidden');
            console.error('Video error:', e);
        });
    }

    // Generate embed code based on stream type
    function generateEmbedCode(proxyUrl, streamType) {
        if (streamType === 'HLS') {
            return `<!-- Include HLS.js for best compatibility -->
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
            return `<video controls width="640" height="360">
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
