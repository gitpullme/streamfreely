/**
 * StreamFreely Helper - Background Service Worker
 * 
 * This extension modifies request headers to enable HLS.js playback
 * on restrictive streaming servers.
 */

// Dynamic rule ID counter
let ruleIdCounter = 1;

// Store active rules
const activeRules = new Map();

// Listen for messages from popup or content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    switch (message.type) {
        case 'ADD_STREAM_DOMAIN':
            addStreamDomain(message.domain).then(sendResponse);
            return true; // Async response

        case 'REMOVE_STREAM_DOMAIN':
            removeStreamDomain(message.domain).then(sendResponse);
            return true;

        case 'GET_ACTIVE_DOMAINS':
            getActiveDomains().then(sendResponse);
            return true;

        case 'ENABLE_FOR_ALL':
            enableForAllDomains().then(sendResponse);
            return true;
    }
});

// Add rules for a specific streaming domain
async function addStreamDomain(domain) {
    try {
        // Clean domain
        const cleanDomain = domain.replace(/^https?:\/\//, '').replace(/\/.*$/, '');

        if (activeRules.has(cleanDomain)) {
            return { success: true, message: 'Domain already active' };
        }

        const ruleId = ruleIdCounter++;

        // Create rules to modify headers
        const rules = [
            {
                id: ruleId,
                priority: 1,
                action: {
                    type: 'modifyHeaders',
                    requestHeaders: [
                        // Add Referer header pointing to the stream's own domain
                        {
                            header: 'Referer',
                            operation: 'set',
                            value: `https://${cleanDomain}/`
                        },
                        // Add Origin header
                        {
                            header: 'Origin',
                            operation: 'set',
                            value: `https://${cleanDomain}`
                        },
                        // Set Accept header
                        {
                            header: 'Accept',
                            operation: 'set',
                            value: '*/*'
                        }
                    ],
                    responseHeaders: [
                        // Allow CORS
                        {
                            header: 'Access-Control-Allow-Origin',
                            operation: 'set',
                            value: '*'
                        },
                        {
                            header: 'Access-Control-Allow-Methods',
                            operation: 'set',
                            value: 'GET, HEAD, OPTIONS'
                        },
                        {
                            header: 'Access-Control-Allow-Headers',
                            operation: 'set',
                            value: '*'
                        }
                    ]
                },
                condition: {
                    urlFilter: `||${cleanDomain}`,
                    resourceTypes: [
                        'xmlhttprequest',
                        'media',
                        'other'
                    ]
                }
            }
        ];

        // Add the rules
        await chrome.declarativeNetRequest.updateDynamicRules({
            addRules: rules,
            removeRuleIds: []
        });

        // Store the rule
        activeRules.set(cleanDomain, ruleId);

        // Save to storage
        await saveActiveRules();

        console.log(`✅ Added stream rules for: ${cleanDomain}`);
        return { success: true, message: `Enabled for ${cleanDomain}` };

    } catch (error) {
        console.error('Failed to add stream domain:', error);
        return { success: false, message: error.message };
    }
}

// Remove rules for a domain
async function removeStreamDomain(domain) {
    try {
        const cleanDomain = domain.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
        const ruleId = activeRules.get(cleanDomain);

        if (ruleId) {
            await chrome.declarativeNetRequest.updateDynamicRules({
                removeRuleIds: [ruleId],
                addRules: []
            });

            activeRules.delete(cleanDomain);
            await saveActiveRules();

            console.log(`🗑️ Removed stream rules for: ${cleanDomain}`);
        }

        return { success: true };
    } catch (error) {
        console.error('Failed to remove stream domain:', error);
        return { success: false, message: error.message };
    }
}

// Get list of active domains
async function getActiveDomains() {
    return Array.from(activeRules.keys());
}

// Enable for all streaming-related requests
async function enableForAllDomains() {
    try {
        const genericRuleId = 9999;

        const rules = [{
            id: genericRuleId,
            priority: 1,
            action: {
                type: 'modifyHeaders',
                responseHeaders: [
                    {
                        header: 'Access-Control-Allow-Origin',
                        operation: 'set',
                        value: '*'
                    },
                    {
                        header: 'Access-Control-Allow-Methods',
                        operation: 'set',
                        value: 'GET, HEAD, OPTIONS'
                    }
                ]
            },
            condition: {
                // Match common stream file types
                regexFilter: '.*\\.(m3u8|ts|m4s|mp4|mpd).*',
                resourceTypes: ['xmlhttprequest', 'media', 'other']
            }
        }];

        await chrome.declarativeNetRequest.updateDynamicRules({
            addRules: rules,
            removeRuleIds: [genericRuleId]
        });

        console.log('✅ Enabled CORS bypass for all stream types');
        return { success: true };

    } catch (error) {
        console.error('Failed to enable for all domains:', error);
        return { success: false, message: error.message };
    }
}

// Save rules to storage
async function saveActiveRules() {
    const data = Object.fromEntries(activeRules);
    await chrome.storage.local.set({ activeStreamRules: data });
}

// Load rules from storage on startup
async function loadActiveRules() {
    try {
        const result = await chrome.storage.local.get('activeStreamRules');
        if (result.activeStreamRules) {
            for (const [domain, ruleId] of Object.entries(result.activeStreamRules)) {
                activeRules.set(domain, ruleId);
                ruleIdCounter = Math.max(ruleIdCounter, ruleId + 1);
            }
            console.log('📋 Loaded active stream rules:', activeRules.size);
        }
    } catch (error) {
        console.error('Failed to load rules:', error);
    }
}

// Initialize on startup
loadActiveRules();

// Auto-enable for all stream types on install
chrome.runtime.onInstalled.addListener(() => {
    console.log('🚀 StreamFreely Helper installed!');
    enableForAllDomains();
});

console.log('🎬 StreamFreely Helper background script loaded');
