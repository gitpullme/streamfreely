/**
 * StreamFreely Helper - Popup Script
 */

document.addEventListener('DOMContentLoaded', () => {
    const domainInput = document.getElementById('domainInput');
    const addBtn = document.getElementById('addBtn');
    const domainList = document.getElementById('domainList');
    const statusText = document.getElementById('statusText');

    // Load active domains
    loadDomains();

    // Add domain button
    addBtn.addEventListener('click', async () => {
        const domain = domainInput.value.trim();
        if (!domain) return;

        addBtn.textContent = '...';
        addBtn.disabled = true;

        const response = await chrome.runtime.sendMessage({
            type: 'ADD_STREAM_DOMAIN',
            domain: domain
        });

        if (response.success) {
            domainInput.value = '';
            loadDomains();
        } else {
            alert('Failed: ' + response.message);
        }

        addBtn.textContent = 'Add';
        addBtn.disabled = false;
    });

    // Enter key to add
    domainInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            addBtn.click();
        }
    });

    // Load and display active domains
    async function loadDomains() {
        const domains = await chrome.runtime.sendMessage({
            type: 'GET_ACTIVE_DOMAINS'
        });

        // Keep the auto-enabled item, add custom domains
        let html = `
            <div class="domain-item">
                <span>All stream files (.m3u8, .ts, etc.)</span>
                <span style="color: #22c55e;">✓ Auto</span>
            </div>
        `;

        if (domains && domains.length > 0) {
            domains.forEach(domain => {
                html += `
                    <div class="domain-item">
                        <span>${domain}</span>
                        <button class="danger remove-btn" data-domain="${domain}">Remove</button>
                    </div>
                `;
            });
        }

        domainList.innerHTML = html;

        // Add remove listeners
        document.querySelectorAll('.remove-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const domain = btn.dataset.domain;
                await chrome.runtime.sendMessage({
                    type: 'REMOVE_STREAM_DOMAIN',
                    domain: domain
                });
                loadDomains();
            });
        });
    }
});
