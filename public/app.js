/**
 * StreamFreely - Frontend JavaScript
 * Handles video analysis, quality selection, and stream link generation
 */

document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const analyzeForm = document.getElementById('analyzeForm');
    const analyzeBtn = document.getElementById('analyzeBtn');
    const generateBtn = document.getElementById('generateBtn');
    const step1 = document.getElementById('step1');
    const step2 = document.getElementById('step2');
    const resultSection = document.getElementById('resultSection');
    const errorSection = document.getElementById('errorSection');
    const qualityOptionsContainer = document.getElementById('qualityOptions');

    // State
    let currentVideoData = null;
    let selectedQuality = 'original';

    // Step 1: Analyze video
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

    // Helper: Copy to clipboard
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

    // Helper: Set loading state
    function setLoading(button, isLoading) {
        button.classList.toggle('loading', isLoading);
        button.disabled = isLoading;
    }

    // Helper: Show error
    function showError(message) {
        document.getElementById('errorMessage').textContent = message;
        errorSection.classList.remove('hidden');
    }

    // Helper: Hide error
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
