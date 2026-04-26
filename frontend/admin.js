/* =========================================
   admin.js — VEDA Admin Dashboard
   ========================================= */

const API_BASE = (() => {
    const local = ['localhost','127.0.0.1',''].includes(location.hostname) || location.protocol === 'file:';
    return local ? 'http://127.0.0.1:8000' : 'https://mini-ai-chatbot-p2qe.onrender.com';
})();

console.info(`[VEDA] API_BASE = ${API_BASE}`);

// Global State
let allLeads = [];
let chatSessions = [];
let currentChat = null;

// DOM Elements (initialized in init)
let sections, navItems, topbarTitle, sidebar;

const TITLES = { analytics:'Analytics & Chats', leads:'Captured Leads', scraping:'Web Scraping' };
const VALID_SECTIONS = ['analytics', 'leads', 'scraping'];

/* ── VEDA AVATAR SVG ── */
const VEDA_SVG = `<svg width="26" height="26" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
  <circle cx="24" cy="24" r="22" fill="#0d1f14" stroke="#4ade80" stroke-width="1.5"/>
  <rect x="13" y="17" width="7" height="5" rx="2.5" fill="#4ade80"/>
  <rect x="28" y="17" width="7" height="5" rx="2.5" fill="#4ade80"/>
  <rect x="14.5" y="18.5" width="2" height="2" rx="1" fill="#0d1f14"/>
  <rect x="29.5" y="18.5" width="2" height="2" rx="1" fill="#0d1f14"/>
  <rect x="15" y="28" width="18" height="4" rx="2" fill="#4ade80"/>
  <rect x="18" y="28" width="3" height="4" fill="#0d1f14"/>
  <rect x="24" y="28" width="3" height="4" fill="#0d1f14"/>
  <line x1="24" y1="5" x2="24" y2="11" stroke="#4ade80" stroke-width="2" stroke-linecap="round"/>
  <circle cx="24" cy="3.5" r="2.5" fill="#4ade80"/>
</svg>`;

/* ── HELPERS ── */
function escHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function downloadText(content, filename) {
    const a = document.createElement('a');
    a.href = 'data:text/plain;charset=utf-8,' + encodeURIComponent(content);
    a.download = filename;
    a.click();
}

async function safeGet(endpoint) {
    const url = `${API_BASE}${endpoint}`;
    console.log(`[VEDA] GET ${url}`);
    try {
        const res = await fetch(url);
        console.log(`[VEDA] ${endpoint} → HTTP ${res.status}`);
        if (!res.ok) return null;
        return await res.json();
    } catch (err) {
        console.error(`[VEDA] ${endpoint} error:`, err);
        return null;
    }
}

/* ── UI LOGIC ── */
function switchSection(target) {
    if (!VALID_SECTIONS.includes(target)) target = 'analytics';
    
    sections.forEach(s => s.classList.remove('active'));
    navItems.forEach(n => n.classList.remove('active'));
    
    const targetSection = document.getElementById(`section-${target}`);
    const targetNav = document.getElementById(`nav-${target}`);
    
    if (targetSection) targetSection.classList.add('active');
    if (targetNav) targetNav.classList.add('active');
    if (topbarTitle) topbarTitle.textContent = TITLES[target];
    
    localStorage.setItem('adminActiveSection', target);
    closeSidebar();
}

function closeSidebar() {
    if (sidebar) sidebar.classList.remove('open');
}

/* ── DATA FETCHING ── */
async function loadLeads() {
    const tbody = document.getElementById('leadsTableBody');
    if (tbody) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:2rem;">Loading leads...</td></tr>`;
    }

    const data = await safeGet('/admin/leads');
    allLeads = Array.isArray(data) ? data : [];
    
    renderLeadsTable(allLeads);
    updateStats();
}

async function loadChatSessions() {
    const tbody = document.getElementById('chatTableBody');
    if (tbody) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:2rem;">Loading sessions...</td></tr>`;
    }

    const data = await safeGet('/admin/chat-sessions');
    chatSessions = Array.isArray(data) ? data : [];
    
    renderChatTable(chatSessions);
    updateStats();
}

async function loadRagStatus() {
    const el = document.getElementById('ragChunkCount');
    if (!el) return;
    const data = await safeGet('/rag/status');
    if (data) {
        el.textContent = `${data.total_chunks || 0} chunks from ${data.total_sources || 0} sources`;
    }
}

function updateStats() {
    const sLeads = document.getElementById('stat-leads');
    const sChats = document.getElementById('stat-chats');
    const sHuman = document.getElementById('stat-human');
    const bBadge = document.getElementById('leadCountBadge');

    if (sLeads) sLeads.textContent = allLeads.length;
    if (sChats) sChats.textContent = chatSessions.length;
    if (sHuman) sHuman.textContent = chatSessions.filter(c => c.needsHuman).length;
    if (bBadge) bBadge.textContent = allLeads.length;
}

/* ── RENDERING ── */
function renderChatTable(data) {
    const tbody = document.getElementById('chatTableBody');
    if (!tbody) return;
    
    if (!data.length) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:2rem;">No chat sessions found.</td></tr>`;
        return;
    }
    
    tbody.innerHTML = data.map((c, i) => `
        <tr>
            <td>
                <div style="display:flex;align-items:center;gap:0.6rem;">
                    <div style="width:32px;height:32px;border-radius:50%;background:#1a3a28;display:flex;align-items:center;justify-content:center;color:#4ade80;font-weight:700;">
                        ${(c.name || c.email || '?')[0].toUpperCase()}
                    </div>
                    <div>
                        <div style="font-weight:600;">${escHtml(c.name || 'Anonymous')}</div>
                        <div style="font-size:0.75rem;opacity:0.7;">${escHtml(c.email)}</div>
                    </div>
                </div>
            </td>
            <td>${c.messages || 0}</td>
            <td><span class="badge ${c.needsHuman ? 'badge-yes':'badge-no'}">${c.needsHuman ? 'Yes':'No'}</span></td>
            <td>${escHtml(c.last_message || '—')}</td>
            <td>
                <button class="btn btn-outline btn-sm" onclick="openTranscript(${i})">View</button>
                <button class="btn btn-outline btn-sm" onclick="downloadChat(${i})">Download</button>
            </td>
        </tr>`).join('');
}

function renderLeadsTable(data) {
    const tbody = document.getElementById('leadsTableBody');
    if (!tbody) return;
    
    if (!data.length) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:2rem;">No leads found.</td></tr>`;
        return;
    }
    
    tbody.innerHTML = data.map((l, i) => `
        <tr>
            <td>${i+1}</td>
            <td style="font-weight:600;">${escHtml(l.name)}</td>
            <td>${escHtml(l.email)}</td>
            <td>${escHtml(l.phone || '—')}</td>
            <td>${escHtml(l.created_at || '—')}</td>
        </tr>`).join('');
}

/* ── TRANSCRIPT ── */
async function openTranscript(i) {
    currentChat = chatSessions[i];
    if (!currentChat) return;

    const overlay = document.getElementById('transcriptOverlay');
    const drawer = document.getElementById('transcriptDrawer');
    const container = document.getElementById('drawerMessages');
    
    document.getElementById('drawerUserName').textContent = currentChat.name || currentChat.email;
    document.getElementById('drawerUserEmail').textContent = currentChat.email;
    
    if (overlay) overlay.classList.add('active');
    if (drawer) drawer.classList.add('open');
    if (container) container.innerHTML = 'Loading...';

    const history = await safeGet(`/chat-history/${encodeURIComponent(currentChat.email)}`);
    
    if (container) {
        if (!history || !history.length) {
            container.innerHTML = 'No messages found.';
        } else {
            container.innerHTML = history.map(msg => {
                const isBot = msg.role === 'bot';
                return `
                <div class="msg-row ${isBot ? 'bot' : 'user'}">
                    <div class="msg-content">
                        <div class="msg-sender">${isBot ? 'VEDA' : 'User'}</div>
                        <div class="msg-bubble">${escHtml(msg.message || msg.text)}</div>
                        <div class="msg-time">${escHtml(msg.time || msg.created_at)}</div>
                    </div>
                </div>`;
            }).join('');
            container.scrollTop = container.scrollHeight;
        }
    }
}

function closeTranscript() {
    const overlay = document.getElementById('transcriptOverlay');
    const drawer = document.getElementById('transcriptDrawer');
    if (overlay) overlay.classList.remove('active');
    if (drawer) drawer.classList.remove('open');
}

async function downloadChat(i) {
    const c = chatSessions[i];
    if (!c) return;
    const history = await safeGet(`/chat-history/${encodeURIComponent(c.email)}`);
    if (!history) return;

    let text = `Chat with ${c.name} (${c.email})\n\n`;
    history.forEach(m => {
        text += `[${m.time || m.created_at}] ${m.role.toUpperCase()}: ${m.message || m.text}\n`;
    });
    downloadText(text, `chat_${c.email}.txt`);
}

// Expose to window for onclick
window.openTranscript = openTranscript;
window.downloadChat = downloadChat;

/* ── INITIALIZATION ── */
function initDashboard() {
    try {
        console.info('[VEDA] Initializing dashboard...');
        
        // Auth Check
        const IS_LOCAL = ['localhost','127.0.0.1',''].includes(location.hostname) || location.protocol === 'file:';
        const IS_AUTHED = sessionStorage.getItem('adminLoggedIn') === 'true';

        if (!IS_LOCAL && !IS_AUTHED) {
            window.location.href = 'admin-login.html';
            return;
        } else if (!IS_AUTHED) {
            sessionStorage.setItem('adminLoggedIn', 'true');
        }

        // DOM Setup
        sections = document.querySelectorAll('.section');
        navItems = document.querySelectorAll('.nav-item');
        topbarTitle = document.getElementById('topbarTitle');
        sidebar = document.getElementById('sidebar');

        // Event Listeners
        navItems.forEach(item => {
            item.addEventListener('click', () => switchSection(item.dataset.section));
        });

        const hamBtn = document.getElementById('hamBtn');
        if (hamBtn) hamBtn.addEventListener('click', () => sidebar.classList.toggle('open'));

        document.addEventListener('click', e => {
            if (sidebar && !sidebar.contains(e.target) && hamBtn && !hamBtn.contains(e.target)) {
                closeSidebar();
            }
        });

        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => {
                sessionStorage.removeItem('adminLoggedIn');
                window.location.href = 'admin-login.html';
            });
        }

        // Live Buttons
        const setupLive = (id) => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('click', (e) => {
                e.preventDefault();
                window.location.href = 'index.html';
            });
        };
        setupLive('liveBadgeBtn');
        setupLive('liveSidebarBtn');

        // Theme
        const themeToggle = document.getElementById('adminThemeToggle');
        const themeText = document.getElementById('adminThemeText');
        const applyTheme = (t) => {
            document.body.classList.toggle('light-mode', t === 'light');
            if (themeText) themeText.textContent = (t === 'light' ? 'Dark' : 'Light');
            localStorage.setItem('theme', t);
        };
        applyTheme(localStorage.getItem('theme') || 'dark');
        if (themeToggle) {
            themeToggle.addEventListener('click', () => {
                applyTheme(document.body.classList.contains('light-mode') ? 'dark' : 'light');
            });
        }

        // Search
        const cSearch = document.getElementById('chatSearch');
        if (cSearch) {
            cSearch.addEventListener('input', (e) => {
                const q = e.target.value.toLowerCase();
                renderChatTable(chatSessions.filter(c => 
                    (c.name||'').toLowerCase().includes(q) || (c.email||'').toLowerCase().includes(q)
                ));
            });
        }

        const lSearch = document.getElementById('leadSearch');
        if (lSearch) {
            lSearch.addEventListener('input', (e) => {
                const q = e.target.value.toLowerCase();
                renderLeadsTable(allLeads.filter(l => 
                    (l.name||'').toLowerCase().includes(q) || (l.email||'').toLowerCase().includes(q)
                ));
            });
        }

        // ── CSV Download ──────────────────────────────────────────────────
        const downloadLeadsBtn = document.getElementById('downloadLeadsBtn');
        if (downloadLeadsBtn) {
            downloadLeadsBtn.addEventListener('click', () => {
                console.log(`[VEDA] CSV download triggered → ${API_BASE}/download-leads`);
                // Use window.location.href so browser triggers the file-download dialogue
                // (fetch() cannot prompt a Save-As dialogue for StreamingResponse)
                window.open(`${API_BASE}/download-leads`, '_blank');
            });
        } else {
            console.warn('[VEDA] #downloadLeadsBtn not found in DOM');
        }

        // ── RAG / Web Scraping ────────────────────────────────────────────
        const scrapeBtn = document.getElementById('scrapeBtn');
        if (scrapeBtn) {
            scrapeBtn.addEventListener('click', async () => {
                const urlInput = document.getElementById('scrapeUrl');
                const resultEl = document.getElementById('scrapeResult');
                const url = urlInput ? urlInput.value.trim() : '';

                if (!url) {
                    if (resultEl) resultEl.innerHTML = '<span style="color:#f87171;">⚠ Please enter a URL first.</span>';
                    return;
                }

                console.log(`[VEDA] Scraping URL: ${url}`);

                // Show loading state
                scrapeBtn.disabled = true;
                scrapeBtn.textContent = 'Scraping…';
                if (resultEl) resultEl.innerHTML = '<span style="opacity:0.7;">⏳ Scraping, please wait…</span>';

                try {
                    const res = await fetch(`${API_BASE}/scrape-website`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ url })
                    });

                    console.log(`[VEDA] /scrape-website → HTTP ${res.status}`);

                    let data = null;
                    try { data = await res.json(); } catch (e) { console.error('[VEDA] Failed to parse response JSON:', e); }
                    console.log('[VEDA] /scrape-website response body:', data);

                    if (res.ok && data) {
                        if (resultEl) resultEl.innerHTML =
                            `<span style="color:#4ade80;">✅ ${escHtml(data.message)}<br>` +
                            `Chunks added: <strong>${data.chunks_added}</strong> | ` +
                            `Total KB chunks: <strong>${data.total_chunks}</strong></span>`;
                        loadRagStatus();
                    } else {
                        const errMsg = (data && data.detail) ? data.detail : `HTTP ${res.status}`;
                        if (resultEl) resultEl.innerHTML = `<span style="color:#f87171;">❌ Scraping failed: ${escHtml(errMsg)}</span>`;
                    }
                } catch (err) {
                    console.error('[VEDA] Scrape fetch error:', err);
                    if (resultEl) resultEl.innerHTML =
                        `<span style="color:#f87171;">❌ Network error: ${escHtml(String(err))}.<br>Is the FastAPI server running on ${API_BASE}?</span>`;
                } finally {
                    scrapeBtn.disabled = false;
                    scrapeBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg> Ingest URL`;
                }
            });
        } else {
            console.warn('[VEDA] #scrapeBtn not found in DOM');
        }

        // Transcript UI
        const closeDrawer = document.getElementById('closeDrawerBtn');
        if (closeDrawer) closeDrawer.addEventListener('click', closeTranscript);
        const overlay = document.getElementById('transcriptOverlay');
        if (overlay) overlay.addEventListener('click', closeTranscript);

        // Transcript drawer Download button
        const drawerDownloadBtn = document.getElementById('drawerDownloadBtn');
        if (drawerDownloadBtn) {
            drawerDownloadBtn.addEventListener('click', () => {
                if (currentChat !== null) {
                    // Find index in chatSessions
                    const idx = chatSessions.indexOf(currentChat);
                    if (idx !== -1) downloadChat(idx);
                }
            });
        }

        // RAG Clear KB button
        const clearRagBtn = document.getElementById('clearRagBtn');
        if (clearRagBtn) {
            clearRagBtn.addEventListener('click', async () => {
                if (!confirm('Clear the entire knowledge base? This cannot be undone.')) return;
                try {
                    const res = await fetch(`${API_BASE}/rag/clear`, { method: 'DELETE' });
                    console.log(`[VEDA] /rag/clear → HTTP ${res.status}`);
                    if (res.ok) { alert('Knowledge base cleared.'); loadRagStatus(); }
                    else alert('Failed to clear knowledge base.');
                } catch (err) {
                    console.error('[VEDA] clearRag error:', err);
                    alert('Network error clearing knowledge base.');
                }
            });
        }

        // File Upload / PDF Ingest
        const scrapePdfBtn = document.getElementById('scrapePdfBtn');
        const fileInput    = document.getElementById('fileInput');
        const dropZone     = document.getElementById('dropZone');
        const pdfResult    = document.getElementById('pdfResult');

        // Click on drop zone opens file picker
        if (dropZone && fileInput) {
            dropZone.addEventListener('click', () => fileInput.click());
            dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('drag-active'); });
            dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-active'));
            dropZone.addEventListener('drop', (e) => {
                e.preventDefault();
                dropZone.classList.remove('drag-active');
                if (e.dataTransfer.files.length) fileInput.files = e.dataTransfer.files;
            });
        }

        if (scrapePdfBtn && fileInput) {
            scrapePdfBtn.addEventListener('click', async () => {
                const file = fileInput.files[0];
                if (!file) {
                    if (pdfResult) pdfResult.innerHTML = '<span style="color:#f87171;">⚠ Select a file first.</span>';
                    return;
                }

                console.log(`[VEDA] Uploading file: ${file.name} (${file.size} bytes)`);
                scrapePdfBtn.disabled = true;
                scrapePdfBtn.textContent = 'Uploading…';
                if (pdfResult) pdfResult.innerHTML = '<span style="opacity:0.7;">⏳ Uploading and ingesting, please wait…</span>';

                const formData = new FormData();
                formData.append('file', file);

                try {
                    const res = await fetch(`${API_BASE}/upload-doc`, {
                        method: 'POST',
                        body: formData   // No Content-Type header — browser sets multipart boundary automatically
                    });

                    console.log(`[VEDA] /upload-doc → HTTP ${res.status}`);
                    let data = null;
                    try { data = await res.json(); } catch (e) { console.error('[VEDA] Failed to parse file-ingest JSON:', e); }
                    console.log('[VEDA] /upload-doc response:', data);

                    if (res.ok && data) {
                        if (pdfResult) pdfResult.innerHTML =
                            `<span style="color:#4ade80;">✅ ${escHtml(data.message)}<br>` +
                            `Chunks added: <strong>${data.chunks_added}</strong> | ` +
                            `Total KB chunks: <strong>${data.total_chunks}</strong></span>`;
                        loadRagStatus();
                        fileInput.value = '';
                    } else {
                        const errMsg = (data && data.detail) ? data.detail : `HTTP ${res.status}`;
                        if (pdfResult) pdfResult.innerHTML = `<span style="color:#f87171;">❌ Upload failed: ${escHtml(errMsg)}</span>`;
                    }
                } catch (err) {
                    console.error('[VEDA] File upload error:', err);
                    if (pdfResult) pdfResult.innerHTML =
                        `<span style="color:#f87171;">❌ Network error: ${escHtml(String(err))}.</span>`;
                } finally {
                    scrapePdfBtn.disabled = false;
                    scrapePdfBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg> Upload &amp; Ingest`;
                }
            });
        }

        // Initial Load
        const savedSection = localStorage.getItem('adminActiveSection') || 'analytics';
        switchSection(savedSection);
        
        loadChatSessions();
        loadLeads();
        loadRagStatus();

        console.info('[VEDA] Dashboard initialized successfully.');
    } catch (err) {
        console.error('[VEDA] Initialization error:', err);
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initDashboard);
} else {
    initDashboard();
}
