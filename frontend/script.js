const API_BASE_URL = 'https://mini-ai-chatbot-p2qe.onrender.com'; // Deployed backend URL on Render

// ── FIX 3: Clear admin session when chatbot page loads ──
// This ensures the admin must re-login if they navigate to index.html
sessionStorage.removeItem('adminLoggedIn');

document.addEventListener('DOMContentLoaded', () => {
    // Theme Toggle Logic
    const themeToggleBtn = document.getElementById('theme-toggle');
    const themeText = document.querySelector('.theme-text');
    const currentTheme = localStorage.getItem('theme') || 'dark'; // Dark theme default as requested

    function updateThemeUI(theme) {
        if (theme === 'dark') {
            document.body.classList.remove('light-mode');
            document.body.classList.add('dark-mode');
            if (themeText) themeText.textContent = 'Light';
        } else {
            document.body.classList.remove('dark-mode');
            document.body.classList.add('light-mode');
            if (themeText) themeText.textContent = 'Dark';
        }
    }

    updateThemeUI(currentTheme);

    if (themeToggleBtn) {
        themeToggleBtn.addEventListener('click', () => {
            const newTheme = document.body.classList.contains('light-mode') ? 'dark' : 'light';
            updateThemeUI(newTheme);
            localStorage.setItem('theme', newTheme);
        });
    }

    // Sync theme across tabs automatically
    window.addEventListener('storage', (event) => {
        if (event.key === 'theme') {
            updateThemeUI(event.newValue);
        }
    });

    // Index Page Logic (Chat & Lead Capture)
    const chatWidgetContainer = document.getElementById('chat-widget-container');
    const leadView = document.getElementById('lead-view');
    const chatView = document.getElementById('chat-view');
    const leadForm = document.getElementById('lead-form');
    const chatInput = document.getElementById('chat-input');
    const sendBtn = document.getElementById('send-btn');
    const chatBox = document.getElementById('chat-box');
    const floatingChatBtn = document.getElementById('floating-chat-btn');
    const closeChatBtn = document.getElementById('close-chat');

    // Make API URL a bit smarter (if running locally, try to connect to local backend if desired, otherwise use production)
    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.hostname === '' || window.location.protocol === 'file:';
    const baseUrl = isLocalhost ? 'http://127.0.0.1:8000' : API_BASE_URL;
    console.info(`[Chatbot] API base URL: ${baseUrl} (isLocalhost: ${isLocalhost})`);

    function initializeChatBox(userName) {
        if (chatBox.children.length === 0) {
            const welcomeName = userName || 'there';
            appendMessage(`Hello ${welcomeName}! How can I help you today?`, 'ai-message');
            chatInput.disabled = false;
            sendBtn.disabled = false;
        }
    }

    if (floatingChatBtn) {
        floatingChatBtn.addEventListener('click', () => {
            const isLeadCaptured = localStorage.getItem('leadCaptured') === 'true';
            const userName = localStorage.getItem('userName');
            
            if (chatWidgetContainer.classList.contains('show')) {
                chatWidgetContainer.classList.remove('show');
                setTimeout(() => chatWidgetContainer.classList.add('hidden'), 300);
            } else {
                chatWidgetContainer.classList.remove('hidden');
                // Trigger reflow
                void chatWidgetContainer.offsetWidth;
                chatWidgetContainer.classList.add('show');
                
                if (isLeadCaptured) {
                    leadView.classList.add('hidden');
                    chatView.classList.remove('hidden');
                    initializeChatBox(userName);
                } else {
                    leadView.classList.remove('hidden');
                    chatView.classList.add('hidden');
                }
            }
        });
    }

    if (closeChatBtn) {
        closeChatBtn.addEventListener('click', () => {
            chatWidgetContainer.classList.remove('show');
            setTimeout(() => {
                if (!chatWidgetContainer.classList.contains('show')) {
                     chatWidgetContainer.classList.add('hidden');
                }
            }, 300);
        });
    }

    if (leadForm) {
        leadForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const name  = document.getElementById('lead-name').value.trim();
            const email = document.getElementById('lead-email').value.trim();
            // Capture optional phone field if present in the form
            const phoneEl = document.getElementById('lead-phone');
            const phone = phoneEl ? phoneEl.value.trim() : '';

            console.log(`[Chatbot] Submitting lead: name=${name}, email=${email}, phone=${phone}`);

            try {
                const response = await fetch(`${baseUrl}/lead`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name, email, phone })
                });

                console.log(`[Chatbot] /lead response: HTTP ${response.status}`);

                if (response.ok) {
                    // Store user identity so chat messages get saved to DB
                    localStorage.setItem('leadCaptured', 'true');
                    localStorage.setItem('userName', name);
                    localStorage.setItem('userEmail', email);

                    leadView.classList.add('hidden');
                    chatView.classList.remove('hidden');

                    initializeChatBox(name);
                    chatInput.focus();
                } else {
                    const errData = await response.json().catch(() => ({}));
                    console.error('[Chatbot] Lead error response:', errData);
                    alert(`Error saving lead details: ${errData.detail || response.statusText}. Please try again.`);
                }
            } catch (err) {
                console.error('[Chatbot] Lead fetch error:', err);
                alert('Backend not reachable. Make sure FastAPI is running on http://127.0.0.1:8000');
            }
        });
    }

    let isSending = false;

    if (sendBtn && chatInput) {
        const sendMessage = async () => {
            if (isSending) return;
            
            const message = chatInput.value.trim();
            if (!message) return;
            
            isSending = true;

            // Retrieve stored user identity (set when lead form was submitted)
            const userEmail = localStorage.getItem('userEmail') || '';
            const userName  = localStorage.getItem('userName')  || '';

            // Add User Message to UI
            appendMessage(message, 'user-message');
            chatInput.value = '';
            chatInput.disabled = true;
            sendBtn.disabled = true;

            // Show loading indicator
            const loadingId = appendMessage('Typing...', 'ai-message');
            
            const removeTyping = () => {
                const el = document.getElementById(loadingId);
                if (el) el.remove();
            };

            console.log("Sending request...");
            console.log(`[Chatbot] Sending chat: "${message.substring(0, 60)}" (user: ${userEmail})`);

            fetch(`${baseUrl}/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                // Include user_email and user_name so the backend saves to DB
                body: JSON.stringify({ message, user_email: userEmail, user_name: userName })
            })
            .then(res => {
                console.log(`[Chatbot] /chat response: HTTP ${res.status}`);
                return res.json();
            })
            .then(data => {
                console.log("Response received:", data);
                removeTyping();
                if (data.response) {
                    appendMessage(data.response, 'ai-message');
                } else if (data.reply) { // handle reply property if updated
                    appendMessage(data.reply, 'ai-message');
                } else {
                    appendMessage("Error: Empty response from server.", 'ai-message');
                }
            })
            .catch(err => {
                console.error('[Chatbot] Chat fetch error:', err);
                removeTyping();
                appendMessage("Server error. Please check backend connection.", 'ai-message');
            })
            .finally(() => {
                chatInput.disabled = false;
                sendBtn.disabled = false;
                chatInput.focus();
                isSending = false;
            });
        };

        // Ensure event listeners are attached only once
        sendBtn.addEventListener('click', (e) => {
            e.preventDefault();
            sendMessage();
        });
        
        chatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                sendMessage();
            }
        });
    }

    function appendMessage(text, className) {
        const msgDiv = document.createElement('div');
        msgDiv.className = `message ${className}`;
        msgDiv.innerText = text;
        const id = 'msg-' + Date.now();
        msgDiv.id = id;
        chatBox.appendChild(msgDiv);
        chatBox.scrollTop = chatBox.scrollHeight;
        return id;
    }

    // Admin Page Logic
    const loginModal = document.getElementById('login-modal');
    const dashboardContainer = document.getElementById('dashboard-container');
    const loginForm = document.getElementById('login-form');
    const loginError = document.getElementById('login-error');
    const leadsBody = document.getElementById('leads-body');
    const leadCount = document.getElementById('lead-count');

    if (loginModal && loginForm) {
        loginForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const username = document.getElementById('admin-user').value.trim();
            const password = document.getElementById('admin-pass').value.trim();

            // Hardcoded credentials
            if (username === 'Anuj' && password === 'anuj@123') {
                loginModal.classList.add('login-exit');
                setTimeout(() => {
                    loginModal.classList.add('hidden');
                    dashboardContainer.classList.remove('hidden');
                    fetchLeads();
                }, 400);
            } else {
                loginError.classList.remove('hidden');
                // Shake animation on wrong creds
                loginForm.closest('.admin-login-card').classList.add('shake');
                setTimeout(() => loginForm.closest('.admin-login-card').classList.remove('shake'), 500);
            }
        });
    }

    async function fetchLeads() {
        try {
            const response = await fetch(`${baseUrl}/admin/leads`);
            if (response.ok) {
                const leads = await response.json();
                leadCount.innerText = leads.length;

                // Fetch leads securely
                leadsBody.innerHTML = '';
                leads.forEach(lead => {
                    const tr = document.createElement('tr');

                    const tdId = document.createElement('td');
                    tdId.textContent = lead.id;
                    tr.appendChild(tdId);

                    const tdName = document.createElement('td');
                    tdName.textContent = lead.name;
                    tr.appendChild(tdName);

                    const tdEmail = document.createElement('td');
                    tdEmail.textContent = lead.email;
                    tr.appendChild(tdEmail);

                    leadsBody.appendChild(tr);
                });
            }
        } catch (err) {
            console.error(err);
        }
    }
});
