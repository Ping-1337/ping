// ============ KONFIGURASI ============
const BACKEND_URL = 'https://ping-chat-backend.pxxl.click';
const SOCKET_URL = BACKEND_URL;

// ============ STATE ============
let socket = null;
let currentUser = null;
let contacts = [];
let currentChat = null;
let messages = {};
let replyToMessage = null;
let typingTimer = null;

// ============ INISIALISASI ============
document.addEventListener('DOMContentLoaded', () => {
    const savedUser = localStorage.getItem('pingUser');
    if (savedUser) {
        try {
            currentUser = JSON.parse(savedUser);
            updateUserUI();
            showPage('chatPage');
            connectSocket();
            loadContacts();
        } catch (e) {
            localStorage.removeItem('pingUser');
            showPage('authPage');
        }
    } else {
        showPage('authPage');
    }
});

// ============ UI HELPERS ============
function updateUserUI() {
    document.getElementById('myName').textContent = currentUser.username;
    document.getElementById('myAvatar').textContent = currentUser.username[0].toUpperCase();
    document.getElementById('modalAvatar').textContent = currentUser.username[0].toUpperCase();
    document.getElementById('profileUsername').textContent = currentUser.username;
    document.getElementById('profileUserId').textContent = currentUser.id;
}

function showPage(pageId) {
    document.getElementById('authPage').classList.remove('active');
    document.getElementById('chatPage').classList.remove('active');
    document.getElementById(pageId).classList.add('active');
    
    // Sembunyikan modal saat pindah halaman
    closeModal();
}

// ============ AUTH FUNCTIONS ============
function showLogin() {
    document.getElementById('loginTab').classList.add('active');
    document.getElementById('registerTab').classList.remove('active');
    document.getElementById('loginForm').classList.add('active');
    document.getElementById('registerForm').classList.remove('active');
    hideAuthMessage();
}

function showRegister() {
    document.getElementById('registerTab').classList.add('active');
    document.getElementById('loginTab').classList.remove('active');
    document.getElementById('registerForm').classList.add('active');
    document.getElementById('loginForm').classList.remove('active');
    hideAuthMessage();
}

async function handleLogin() {
    const username = document.getElementById('loginUsername').value.trim();
    const password = document.getElementById('loginPassword').value.trim();

    if (!username || !password) {
        showAuthMessage('Username dan password harus diisi!', 'error');
        return;
    }

    try {
        const response = await fetch(`${BACKEND_URL}/api/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        const data = await response.json();

        if (data.success) {
            currentUser = data.user;
            localStorage.setItem('pingUser', JSON.stringify(currentUser));
            updateUserUI();
            showPage('chatPage');
            connectSocket();
            loadContacts();
        } else {
            showAuthMessage(data.error || 'Login gagal', 'error');
        }
    } catch (error) {
        showAuthMessage('Gagal terhubung ke server', 'error');
        console.error(error);
    }
}

async function handleRegister() {
    const username = document.getElementById('regUsername').value.trim();
    const password = document.getElementById('regPassword').value.trim();

    if (!username || !password) {
        showAuthMessage('Username dan password harus diisi!', 'error');
        return;
    }

    if (password.length < 3) {
        showAuthMessage('Password minimal 3 karakter!', 'error');
        return;
    }

    try {
        const response = await fetch(`${BACKEND_URL}/api/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        const data = await response.json();

        if (data.success) {
            showAuthMessage('Registrasi berhasil! Silakan login.', 'success');
            setTimeout(() => {
                showLogin();
                document.getElementById('regUsername').value = '';
                document.getElementById('regPassword').value = '';
            }, 1500);
        } else {
            showAuthMessage(data.error || 'Registrasi gagal', 'error');
        }
    } catch (error) {
        showAuthMessage('Gagal terhubung ke server', 'error');
        console.error(error);
    }
}

function showAuthMessage(text, type) {
    const msgBox = document.getElementById('authMessage');
    msgBox.textContent = text;
    msgBox.className = 'auth-message ' + type;
}

function hideAuthMessage() {
    document.getElementById('authMessage').className = 'auth-message';
}

// ============ SOCKET.IO ============
function connectSocket() {
    if (!currentUser) return;
    
    socket = io(SOCKET_URL, {
        transports: ['websocket'],
        reconnection: true,
        reconnectionAttempts: 5
    });

    socket.on('connect', () => {
        console.log('Connected to server');
        socket.emit('user-login', currentUser.id);
    });

    socket.on('new-message', (message) => {
        if (currentChat && currentChat.id === message.from) {
            addMessage(message);
        } else {
            // Update unread count
            const contact = contacts.find(c => c.id === message.from);
            if (contact) {
                contact.unread = (contact.unread || 0) + 1;
                displayContacts(document.getElementById('searchInput').value);
            }
        }
    });

    socket.on('user-online', (userId) => {
        updateUserStatus(userId, true);
    });

    socket.on('user-offline', (userId) => {
        updateUserStatus(userId, false);
    });

    socket.on('user-typing', (data) => {
        if (currentChat && currentChat.id === data.userId) {
            document.getElementById('typingIndicator').textContent = 
                data.isTyping ? `${currentChat.username} sedang mengetik...` : '';
        }
    });

    socket.on('connect_error', (error) => {
        console.log('Connection error:', error);
    });
}

// ============ CONTACTS ============
async function loadContacts() {
    if (!currentUser) return;

    try {
        const response = await fetch(`${BACKEND_URL}/api/users/${currentUser.id}`);
        const data = await response.json();

        if (data.success) {
            contacts = data.users;
            displayContacts();
        }
    } catch (error) {
        console.error('Error loading contacts:', error);
    }
}

function displayContacts(filter = '') {
    const chatList = document.getElementById('chatList');
    
    let filtered = contacts;
    if (filter) {
        filtered = contacts.filter(c => 
            c.username.toLowerCase().includes(filter.toLowerCase())
        );
    }

    if (filtered.length === 0) {
        chatList.innerHTML = '<div class="no-results">Tidak ada kontak</div>';
        return;
    }

    let html = '';
    
    // Online first
    const online = filtered.filter(c => c.isOnline);
    const offline = filtered.filter(c => !c.isOnline);

    if (online.length > 0) {
        html += '<div class="section-label">ONLINE</div>';
        online.forEach(c => {
            html += createContactItem(c);
        });
    }

    if (offline.length > 0) {
        html += '<div class="section-label">OFFLINE</div>';
        offline.forEach(c => {
            html += createContactItem(c);
        });
    }

    chatList.innerHTML = html;
}

function createContactItem(contact) {
    const isActive = currentChat && currentChat.id === contact.id ? 'active' : '';
    const unreadBadge = contact.unread > 0 ? `<span class="unread">${contact.unread}</span>` : '';
    
    return `
        <div class="chat-item ${isActive}" onclick="selectChat(${contact.id}, '${contact.username}')">
            <div class="chat-avatar">${contact.username[0].toUpperCase()}</div>
            <div class="chat-info">
                <div class="chat-name-time">
                    <h4>${contact.username}</h4>
                    <span class="time"></span>
                </div>
                <div class="chat-preview">
                    <p>${contact.isOnline ? 'Online' : 'Offline'}</p>
                    ${unreadBadge}
                </div>
            </div>
        </div>
    `;
}

function searchContacts() {
    const query = document.getElementById('searchInput').value;
    displayContacts(query);
}

function updateUserStatus(userId, isOnline) {
    const contact = contacts.find(c => c.id === userId);
    if (contact) {
        contact.isOnline = isOnline;
        displayContacts(document.getElementById('searchInput').value);
        
        if (currentChat && currentChat.id === userId) {
            const statusHtml = isOnline 
                ? '<span class="online-dot"></span> Online'
                : '<span class="offline-dot"></span> Offline';
            document.getElementById('chatStatus').innerHTML = statusHtml;
        }
    }
}

// ============ CHAT FUNCTIONS ============
function selectChat(userId, username) {
    currentChat = { id: userId, username: username };
    
    document.getElementById('chatHeader').style.display = 'flex';
    document.getElementById('inputArea').style.display = 'flex';
    document.getElementById('welcomeMessage').style.display = 'none';
    
    document.getElementById('currentChatName').textContent = username;
    document.getElementById('chatAvatar').textContent = username[0].toUpperCase();
    
    // Update active class
    document.querySelectorAll('.chat-item').forEach(item => {
        item.classList.remove('active');
    });
    if (event && event.currentTarget) {
        event.currentTarget.classList.add('active');
    }
    
    // Reset unread
    const contact = contacts.find(c => c.id === userId);
    if (contact) {
        contact.unread = 0;
    }
    
    loadMessages(userId);
}

async function loadMessages(userId) {
    if (!currentUser) return;

    try {
        const response = await fetch(`${BACKEND_URL}/api/messages/${currentUser.id}/${userId}`);
        const data = await response.json();

        if (data.success) {
            messages[userId] = data.messages;
            displayMessages(userId);
        }
    } catch (error) {
        console.error('Error loading messages:', error);
    }
}

function displayMessages(userId) {
    const container = document.getElementById('messagesContainer');
    const msgList = messages[userId] || [];
    
    if (msgList.length === 0) {
        container.innerHTML = '<div class="welcome-message">Belum ada pesan. Kirim pesan pertama!</div>';
        return;
    }

    let html = '';
    msgList.forEach(msg => {
        const isOwn = msg.from === currentUser.id;
        html += `
            <div class="message ${isOwn ? 'own' : 'other'}">
                <div class="message-content">
                    <p>${msg.text}</p>
                    <span class="message-time">${msg.time || ''}</span>
                </div>
            </div>
        `;
    });

    container.innerHTML = html;
    container.scrollTop = container.scrollHeight;
}

function addMessage(message) {
    if (!currentChat) return;
    
    const msgList = messages[currentChat.id] || [];
    msgList.push(message);
    messages[currentChat.id] = msgList;
    displayMessages(currentChat.id);
}

function sendMessage() {
    if (!currentChat || !currentUser) return;

    const input = document.getElementById('messageInput');
    const text = input.value.trim();
    
    if (!text) return;

    const message = {
        from: currentUser.id,
        to: currentChat.id,
        text: text,
        time: new Date().getHours() + ':' + 
              (new Date().getMinutes() < 10 ? '0' : '') + new Date().getMinutes()
    };

    if (socket && socket.connected) {
        socket.emit('send-message', message);
    }

    const msgList = messages[currentChat.id] || [];
    msgList.push(message);
    messages[currentChat.id] = msgList;
    displayMessages(currentChat.id);
    input.value = '';
    
    // Stop typing indicator
    if (socket) {
        socket.emit('typing', {
            from: currentUser.id,
            to: currentChat.id,
            isTyping: false
        });
    }
}

// ============ TYPING INDICATOR ============
function handleTyping() {
    if (!currentChat || !socket || !currentUser) return;
    
    socket.emit('typing', {
        from: currentUser.id,
        to: currentChat.id,
        isTyping: true
    });

    clearTimeout(typingTimer);
    typingTimer = setTimeout(() => {
        socket.emit('typing', {
            from: currentUser.id,
            to: currentChat.id,
            isTyping: false
        });
    }, 1000);
}

// Pasang event listener untuk typing
document.addEventListener('DOMContentLoaded', () => {
    const messageInput = document.getElementById('messageInput');
    if (messageInput) {
        messageInput.addEventListener('keyup', handleTyping);
    }
});

// ============ PROFILE ============
function showProfile() {
    document.getElementById('profileModal').style.display = 'flex';
}

function closeModal() {
    document.getElementById('profileModal').style.display = 'none';
}

function logout() {
    if (socket) {
        socket.disconnect();
    }
    localStorage.removeItem('pingUser');
    showPage('authPage');
    showLogin();
}

// ============ REPLY FEATURE (Bonus) ============
function replyToMessage(messageId) {
    if (!currentChat) return;
    
    const msgList = messages[currentChat.id] || [];
    const msg = msgList.find(m => m.id === messageId);
    if (msg) {
        replyToMessage = msg;
        // Implementasi reply preview
        const replyPreview = document.getElementById('replyPreview');
        const replyText = document.getElementById('replyText');
        if (replyPreview && replyText) {
            replyText.textContent = msg.text;
            replyPreview.style.display = 'flex';
        }
    }
}

function cancelReply() {
    replyToMessage = null;
    const replyPreview = document.getElementById('replyPreview');
    if (replyPreview) {
        replyPreview.style.display = 'none';
    }
}            body: JSON.stringify({ username, password })
        });

        const data = await response.json();

        if (data.success) {
            showAuthMessage('Registrasi berhasil! Silakan login.', 'success');
            setTimeout(() => {
                showLogin();
                document.getElementById('regUsername').value = '';
                document.getElementById('regPassword').value = '';
            }, 1500);
        } else {
            showAuthMessage(data.error || 'Registrasi gagal', 'error');
        }
    } catch (error) {
        showAuthMessage('Gagal terhubung ke server', 'error');
        console.error(error);
    }
}

function showAuthMessage(text, type) {
    const msgBox = document.getElementById('authMessage');
    msgBox.textContent = text;
    msgBox.className = 'auth-message ' + type;
}

function hideAuthMessage() {
    document.getElementById('authMessage').className = 'auth-message';
}

// ============ SOCKET.IO ============
function connectSocket() {
    if (!currentUser) return;
    
    socket = io(SOCKET_URL, {
        transports: ['websocket'],
        reconnection: true,
        reconnectionAttempts: 5
    });

    socket.on('connect', () => {
        console.log('Connected to server');
        socket.emit('user-login', currentUser.id);
    });

    socket.on('new-message', (message) => {
        if (currentChat && currentChat.id === message.from) {
            addMessage(message);
        }
    });

    socket.on('user-online', (userId) => {
        updateUserStatus(userId, true);
    });

    socket.on('user-offline', (userId) => {
        updateUserStatus(userId, false);
    });

    socket.on('user-typing', (data) => {
        if (currentChat && currentChat.id === data.userId) {
            document.getElementById('typingIndicator').textContent = 
                data.isTyping ? `${currentChat.username} sedang mengetik...` : '';
        }
    });

    socket.on('connect_error', (error) => {
        console.log('Connection error:', error);
    });
}

// ============ CONTACTS ============
async function loadContacts() {
    if (!currentUser) return;

    try {
        const response = await fetch(`${BACKEND_URL}/api/users/${currentUser.id}`);
        const data = await response.json();

        if (data.success) {
            contacts = data.users;
            displayContacts();
        }
    } catch (error) {
        console.error('Error loading contacts:', error);
    }
}

function displayContacts(filter = '') {
    const chatList = document.getElementById('chatList');
    
    let filtered = contacts;
    if (filter) {
        filtered = contacts.filter(c => 
            c.username.toLowerCase().includes(filter.toLowerCase())
        );
    }

    if (filtered.length === 0) {
        chatList.innerHTML = '<div class="loading">Tidak ada kontak</div>';
        return;
    }

    let html = '';
    const online = filtered.filter(c => c.isOnline);
    const offline = filtered.filter(c => !c.isOnline);

    if (online.length > 0) {
        html += '<div class="section-label">ONLINE</div>';
        online.forEach(c => {
            html += createContactItem(c);
        });
    }

    if (offline.length > 0) {
        html += '<div class="section-label">OFFLINE</div>';
        offline.forEach(c => {
            html += createContactItem(c);
        });
    }

    chatList.innerHTML = html;
}

function createContactItem(contact) {
    const isActive = currentChat && currentChat.id === contact.id ? 'active' : '';
    return `
        <div class="chat-item ${isActive}" onclick="selectChat(${contact.id}, '${contact.username}')">
            <div class="chat-avatar">${contact.username[0].toUpperCase()}</div>
            <div class="chat-info">
                <div class="chat-name-time">
                    <h4>${contact.username}</h4>
                    <span class="time">${contact.isOnline ? 'Online' : ''}</span>
                </div>
                <div class="chat-preview">
                    <p>${contact.isOnline ? 'Online' : 'Offline'}</p>
                </div>
            </div>
        </div>
    `;
}

function searchContacts() {
    const query = document.getElementById('searchInput').value;
    displayContacts(query);
}

function updateUserStatus(userId, isOnline) {
    const contact = contacts.find(c => c.id === userId);
    if (contact) {
        contact.isOnline = isOnline;
        displayContacts(document.getElementById('searchInput').value);
        
        if (currentChat && currentChat.id === userId) {
            const statusHtml = isOnline 
                ? '<span class="online-dot"></span> Online'
                : '<span class="offline-dot"></span> Offline';
            document.getElementById('chatStatus').innerHTML = statusHtml;
        }
    }
}

// ============ CHAT FUNCTIONS ============
function selectChat(userId, username) {
    currentChat = { id: userId, username };
    
    document.getElementById('chatHeader').style.display = 'flex';
    document.getElementById('inputArea').style.display = 'flex';
    document.getElementById('welcomeMessage').style.display = 'none';
    
    document.getElementById('currentChatName').textContent = username;
    document.getElementById('chatAvatar').textContent = username[0].toUpperCase();
    
    document.querySelectorAll('.chat-item').forEach(item => {
        item.classList.remove('active');
    });
    event.currentTarget.classList.add('active');
    
    loadMessages(userId);
}

async function loadMessages(userId) {
    if (!currentUser) return;

    try {
        const response = await fetch(`${BACKEND_URL}/api/messages/${currentUser.id}/${userId}`);
        const data = await response.json();

        if (data.success) {
            messages[userId] = data.messages;
            displayMessages(userId);
        }
    } catch (error) {
        console.error('Error loading messages:', error);
    }
}

function displayMessages(userId) {
    const container = document.getElementById('messagesContainer');
    const msgList = messages[userId] || [];
    
    if (msgList.length === 0) {
        container.innerHTML = '<div class="welcome-message">Belum ada pesan. Kirim pesan pertama!</div>';
        return;
    }

    let html = '';
    msgList.forEach(msg => {
        const isOwn = msg.from === currentUser.id;
        html += `
            <div class="message ${isOwn ? 'own' : 'other'}">
                <div class="message-content">
                    <p>${msg.text}</p>
                    <span class="message-time">${msg.time || ''}</span>
                </div>
            </div>
        `;
    });

    container.innerHTML = html;
    container.scrollTop = container.scrollHeight;
}

function addMessage(message) {
    if (!currentChat) return;
    
    const msgList = messages[currentChat.id] || [];
    msgList.push(message);
    messages[currentChat.id] = msgList;
    displayMessages(currentChat.id);
}

function sendMessage() {
    if (!currentChat || !currentUser) return;

    const input = document.getElementById('messageInput');
    const text = input.value.trim();
    
    if (!text) return;

    const message = {
        from: currentUser.id,
        to: currentChat.id,
        text: text,
        time: new Date().getHours() + ':' + 
              (new Date().getMinutes() < 10 ? '0' : '') + new Date().getMinutes()
    };

    if (socket && socket.connected) {
        socket.emit('send-message', message);
    }

    const msgList = messages[currentChat.id] || [];
    msgList.push(message);
    messages[currentChat.id] = msgList;
    displayMessages(currentChat.id);
    input.value = '';
}

// ============ PROFILE ============
function showProfile() {
    document.getElementById('profileModal').style.display = 'flex';
}

function closeModal() {
    document.getElementById('profileModal').style.display = 'none';
}

function logout() {
    if (socket) socket.disconnect();
    localStorage.removeItem('pingUser');
    showPage('authPage');
    showLogin();
}        const response = await fetch(`${BACKEND_URL}/api/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        const data = await response.json();

        if (data.success) {
            showAuthMessage('Registrasi berhasil! Silakan login.', 'success');
            setTimeout(() => {
                showLogin();
                document.getElementById('regUsername').value = '';
                document.getElementById('regPassword').value = '';
            }, 1500);
        } else {
            showAuthMessage(data.error || 'Registrasi gagal', 'error');
        }
    } catch (error) {
        showAuthMessage('Gagal terhubung ke server', 'error');
        console.error(error);
    }
}

function showAuthMessage(text, type) {
    const msgBox = document.getElementById('authMessage');
    msgBox.textContent = text;
    msgBox.className = 'auth-message ' + type;
}

function hideAuthMessage() {
    document.getElementById('authMessage').className = 'auth-message';
}

// ============ SOCKET.IO ============
function connectSocket() {
    if (!currentUser) return;
    
    socket = io(SOCKET_URL, {
        transports: ['websocket'],
        reconnection: true,
        reconnectionAttempts: 5
    });

    socket.on('connect', () => {
        console.log('Connected to server');
        socket.emit('user-login', currentUser.id);
    });

    socket.on('new-message', (message) => {
        if (currentChat && currentChat.id === message.from) {
            addMessage(message);
        }
    });

    socket.on('connect_error', (error) => {
        console.log('Connection error:', error);
    });
}

// ============ CONTACTS ============
async function loadContacts() {
    if (!currentUser) return;

    try {
        const response = await fetch(`${BACKEND_URL}/api/users/${currentUser.id}`);
        const data = await response.json();

        if (data.success) {
            contacts = data.users;
            displayContacts();
        }
    } catch (error) {
        console.error('Error loading contacts:', error);
    }
}

function displayContacts(filter = '') {
    const chatList = document.getElementById('chatList');
    
    let filtered = contacts;
    if (filter) {
        filtered = contacts.filter(c => 
            c.username.toLowerCase().includes(filter.toLowerCase())
        );
    }

    if (filtered.length === 0) {
        chatList.innerHTML = '<div class="loading">Tidak ada kontak</div>';
        return;
    }

    let html = '';
    filtered.forEach(c => {
        html += `
            <div class="chat-item" onclick="selectChat(${c.id}, '${c.username}')">
                <div class="chat-avatar">${c.username[0].toUpperCase()}</div>
                <div class="chat-info">
                    <div class="chat-name-time">
                        <h4>${c.username}</h4>
                        <span class="time"></span>
                    </div>
                    <div class="chat-preview">
                        <p>${c.isOnline ? 'Online' : 'Offline'}</p>
                    </div>
                </div>
            </div>
        `;
    });

    chatList.innerHTML = html;
}

function searchContacts() {
    const query = document.getElementById('searchInput').value;
    displayContacts(query);
}

// ============ CHAT FUNCTIONS ============
function selectChat(userId, username) {
    currentChat = { id: userId, username: username };
    
    document.getElementById('chatHeader').style.display = 'flex';
    document.getElementById('inputArea').style.display = 'flex';
    document.getElementById('welcomeMessage').style.display = 'none';
    
    document.getElementById('currentChatName').textContent = username;
    document.getElementById('chatAvatar').textContent = username[0].toUpperCase();
    
    // Update active class
    document.querySelectorAll('.chat-item').forEach(item => {
        item.classList.remove('active');
    });
    event.currentTarget.classList.add('active');
    
    loadMessages(userId);
}

async function loadMessages(userId) {
    if (!currentUser) return;

    try {
        const response = await fetch(`${BACKEND_URL}/api/messages/${currentUser.id}/${userId}`);
        const data = await response.json();

        if (data.success) {
            messages[userId] = data.messages;
            displayMessages(userId);
        }
    } catch (error) {
        console.error('Error loading messages:', error);
    }
}

function displayMessages(userId) {
    const container = document.getElementById('messagesContainer');
    const msgList = messages[userId] || [];
    
    if (msgList.length === 0) {
        container.innerHTML = '<div class="welcome-message">Belum ada pesan. Kirim pesan pertama!</div>';
        return;
    }

    let html = '';
    msgList.forEach(msg => {
        const isOwn = msg.from === currentUser.id;
        html += `
            <div class="message ${isOwn ? 'own' : 'other'}">
                <div class="message-content">
                    <p>${msg.text}</p>
                    <span class="message-time">${msg.time || ''}</span>
                </div>
            </div>
        `;
    });

    container.innerHTML = html;
    container.scrollTop = container.scrollHeight;
}

function addMessage(message) {
    if (!currentChat) return;
    
    const msgList = messages[currentChat.id] || [];
    msgList.push(message);
    messages[currentChat.id] = msgList;
    
    displayMessages(currentChat.id);
}

function sendMessage() {
    if (!currentChat || !currentUser) return;

    const input = document.getElementById('messageInput');
    const text = input.value.trim();
    
    if (!text) return;

    const message = {
        from: currentUser.id,
        to: currentChat.id,
        text: text,
        time: new Date().getHours() + ':' + 
              (new Date().getMinutes() < 10 ? '0' : '') + new Date().getMinutes()
    };

    if (socket && socket.connected) {
        socket.emit('send-message', message);
    }

    const msgList = messages[currentChat.id] || [];
    msgList.push(message);
    messages[currentChat.id] = msgList;
    
    displayMessages(currentChat.id);
    input.value = '';
}

// ============ PROFILE ============
function showProfile() {
    document.getElementById('profileModal').style.display = 'flex';
}

function closeModal() {
    document.getElementById('profileModal').style.display = 'none';
}

function logout() {
    if (socket) socket.disconnect();
    localStorage.removeItem('pingUser');
    showPage('authPage');
    showLogin();
}    try {
        const response = await fetch(`${BACKEND_URL}/api/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        const data = await response.json();

        if (data.success) {
            showAuthMessage('Registrasi berhasil! Silakan login.', 'success');
            setTimeout(() => {
                showLogin();
                document.getElementById('regUsername').value = '';
                document.getElementById('regPassword').value = '';
            }, 1500);
        } else {
            showAuthMessage(data.error || 'Registrasi gagal', 'error');
        }
    } catch (error) {
        showAuthMessage('Gagal terhubung ke server', 'error');
    }
}

function showAuthMessage(text, type) {
    const msgBox = document.getElementById('authMessage');
    msgBox.textContent = text;
    msgBox.className = 'auth-message ' + type;
}

function hideAuthMessage() {
    document.getElementById('authMessage').className = 'auth-message';
}

// ============ SOCKET.IO ============
function connectSocket() {
    if (!currentUser) return;
    
    socket = io(SOCKET_URL, {
        transports: ['websocket'],
        reconnection: true
    });

    socket.on('connect', () => {
        console.log('Connected to server');
        socket.emit('user-login', currentUser.id);
        showToast('Terhubung ke server', 'success');
    });

    socket.on('new-message', (message) => {
        console.log('New message:', message);
        
        if (currentChat && currentChat.id === message.from) {
            addMessageToCurrent(message);
        } else {
            updateUnreadCount(message.from);
        }
    });

    socket.on('message-sent', (message) => {
        // Update message status
        updateMessageStatus(message.id, 'sent');
    });

    socket.on('message-read', (data) => {
        updateMessageStatus(data.messageId, 'read');
    });

    socket.on('user-online', (userId) => {
        updateUserStatus(userId, true);
    });

    socket.on('user-offline', (userId) => {
        updateUserStatus(userId, false);
    });

    socket.on('user-typing', (data) => {
        if (currentChat && currentChat.id === data.userId) {
            document.getElementById('typingIndicator').textContent = 
                data.isTyping ? `${currentChat.username} sedang mengetik...` : '';
        }
    });

    socket.on('connect_error', (error) => {
        console.log('Connection error:', error);
        showToast('Gagal terhubung ke server', 'error');
    });

    socket.on('disconnect', () => {
        console.log('Disconnected from server');
        showToast('Terputus dari server', 'error');
    });
}

// ============ CONTACTS ============
async function loadContacts() {
    if (!currentUser) return;

    try {
        const response = await fetch(`${BACKEND_URL}/api/users/${currentUser.id}`);
        const data = await response.json();

        if (data.success) {
            contacts = data.users;
            displayContacts();
        }
    } catch (error) {
        console.error('Error loading contacts:', error);
        showToast('Gagal memuat kontak', 'error');
    }
}

function displayContacts(filter = '') {
    const chatList = document.getElementById('chatList');
    
    let filtered = contacts;
    if (filter) {
        filtered = contacts.filter(c => 
            c.username.toLowerCase().includes(filter.toLowerCase())
        );
    }

    if (filtered.length === 0) {
        chatList.innerHTML = '<div class="no-results">Tidak ada kontak</div>';
        return;
    }

    let html = '';
    
    // Online first
    const online = filtered.filter(c => c.isOnline);
    const offline = filtered.filter(c => !c.isOnline);

    if (online.length > 0) {
        html += '<div class="section-label">ONLINE</div>';
        online.forEach(c => {
            html += createContactItem(c);
        });
    }

    if (offline.length > 0) {
        html += '<div class="section-label">OFFLINE</div>';
        offline.forEach(c => {
            html += createContactItem(c);
        });
    }

    chatList.innerHTML = html;
}

function createContactItem(contact) {
    const isActive = currentChat && currentChat.id === contact.id ? 'active' : '';
    const lastMessage = getLastMessage(contact.id);
    const unreadBadge = contact.unread > 0 ? `<span class="unread">${contact.unread}</span>` : '';
    
    return `
        <div class="chat-item ${isActive}" onclick="selectChat(${contact.id})">
            <div class="chat-avatar">${contact.avatar || contact.username[0].toUpperCase()}</div>
            <div class="chat-info">
                <div class="chat-name-time">
                    <h4>${contact.username}</h4>
                    <span class="time">${lastMessage.time || ''}</span>
                </div>
                <div class="chat-preview">
                    <p>${lastMessage.text || 'Belum ada pesan'}</p>
                    ${unreadBadge}
                </div>
            </div>
        </div>
    `;
}

function getLastMessage(contactId) {
    const msgList = messages[contactId];
    if (!msgList || msgList.length === 0) {
        return { text: 'Belum ada pesan', time: '' };
    }
    const last = msgList[msgList.length - 1];
    return { text: last.text, time: last.time };
}

function searchContacts() {
    const query = document.getElementById('searchInput').value;
    displayContacts(query);
}

function updateUserStatus(userId, isOnline) {
    const contact = contacts.find(c => c.id === userId);
    if (contact) {
        contact.isOnline = isOnline;
        displayContacts(document.getElementById('searchInput').value);
        
        if (currentChat && currentChat.id === userId) {
            const statusHtml = isOnline 
                ? '<span class="online-dot"></span> Online'
                : '<span class="offline-dot"></span> Offline';
            document.getElementById('chatStatus').innerHTML = statusHtml;
        }
    }
}

// ============ CHAT FUNCTIONS ============
async function selectChat(contactId) {
    const contact = contacts.find(c => c.id === contactId);
    if (!contact) return;

    currentChat = contact;
    
    // Update UI
    document.getElementById('chatHeader').style.display = 'flex';
    document.getElementById('inputArea').style.display = 'flex';
    document.getElementById('welcomeMessage').style.display = 'none';
    
    document.getElementById('currentChatName').textContent = contact.username;
    document.getElementById('chatAvatar').textContent = contact.avatar || contact.username[0].toUpperCase();
    
    const statusHtml = contact.isOnline 
        ? '<span class="online-dot"></span> Online'
        : '<span class="offline-dot"></span> Offline';
    document.getElementById('chatStatus').innerHTML = statusHtml;
    
    // Reset unread
    contact.unread = 0;
    
    // Update active class
    document.querySelectorAll('.chat-item').forEach(item => {
        item.classList.remove('active');
    });
    event.currentTarget.classList.add('active');
    
    // Load messages
    await loadMessages(contactId);
}

async function loadMessages(contactId) {
    if (!currentUser) return;

    try {
        const response = await fetch(`${BACKEND_URL}/api/messages/${currentUser.id}/${contactId}`);
        const data = await response.json();

        if (data.success) {
            messages[contactId] = data.messages;
            displayMessages(contactId);
            
            // Mark as read
            markMessagesAsRead(contactId);
        }
    } catch (error) {
        console.error('Error loading messages:', error);
        showToast('Gagal memuat pesan', 'error');
    }
}

function displayMessages(contactId) {
    const container = document.getElementById('messagesContainer');
    const msgList = messages[contactId] || [];
    
    if (msgList.length === 0) {
        container.innerHTML = `
            <div class="empty-chat">
                <p>Belum ada pesan dengan ${currentChat.username}</p>
                <p class="small">Ketik pesan untuk memulai percakapan</p>
            </div>
        `;
        return;
    }

    let html = '';

    msgList.forEach(msg => {
        const isOwn = msg.from === currentUser.id;
        const status = isOwn ? (msg.status === 'read' ? '✓✓' : '✓') : '';
        
        html += `
            <div class="message ${isOwn ? 'own' : 'other'}" ${!isOwn ? `ondblclick="replyToMessage(${msg.id})"` : ''}>
                <div class="message-content">
                    ${msg.replyTo ? '<div class="reply-indicator">↩️ ' + msg.replyTo + '</div>' : ''}
                    <p>${msg.text}</p>
                    <span class="message-time">
                        ${msg.time} ${status}
                    </span>
                </div>
            </div>
        `;
    });

    container.innerHTML = html;
    scrollToBottom();
}

function addMessageToCurrent(message) {
    if (!currentChat) return;
    
    const msgList = messages[currentChat.id] || [];
    msgList.push(message);
    messages[currentChat.id] = msgList;
    
    displayMessages(currentChat.id);
}

function sendMessage() {
    if (!currentChat || !currentUser) {
        showToast('Pilih kontak terlebih dahulu!', 'error');
        return;
    }

    const input = document.getElementById('messageInput');
    const text = input.value.trim();
    
    if (!text) return;

    const message = {
        from: currentUser.id,
        to: currentChat.id,
        text: text,
        replyTo: replyToMessage ? replyToMessage.text : null,
        time: new Date().getHours() + ':' + 
              (new Date().getMinutes() < 10 ? '0' : '') + new Date().getMinutes()
    };

    // Send via socket
    if (socket && socket.connected) {
        socket.emit('send-message', message);
    }

    // Add to local
    const msgList = messages[currentChat.id] || [];
    msgList.push({
        ...message,
        id: Date.now(),
        status: 'sent'
    });
    messages[currentChat.id] = msgList;
    
    displayMessages(currentChat.id);
    
    // Reset
    input.value = '';
    cancelReply();
    
    // Stop typing indicator
    if (socket) {
        socket.emit('typing', {
            from: currentUser.id,
            to: currentChat.id,
            isTyping: false
        });
    }
}

function updateMessageStatus(messageId, status) {
    // Find and update message status
    for (let contactId in messages) {
        const msgList = messages[contactId];
        const msg = msgList.find(m => m.id === messageId);
        if (msg) {
            msg.status = status;
            if (currentChat && currentChat.id === contactId) {
                displayMessages(contactId);
            }
            break;
        }
    }
}

function markMessagesAsRead(contactId) {
    const msgList = messages[contactId] || [];
    msgList.forEach(msg => {
        if (msg.to === currentUser.id && msg.status !== 'read') {
            msg.status = 'read';
            
            if (socket) {
                socket.emit('mark-read', {
                    messageId: msg.id,
                    userId: currentUser.id
                });
            }
        }
    });
    
    if (currentChat && currentChat.id === contactId) {
        displayMessages(contactId);
    }
}

function updateUnreadCount(contactId) {
    const contact = contacts.find(c => c.id === contactId);
    if (contact) {
        contact.unread = (contact.unread || 0) + 1;
        displayContacts(document.getElementById('searchInput').value);
    }
}

// ============ TYPING INDICATOR ============
function handleTyping() {
    if (!currentChat || !socket || !currentUser) return;
    
    socket.emit('typing', {
        from: currentUser.id,
        to: currentChat.id,
        isTyping: true
    });

    clearTimeout(typingTimer);
    typingTimer = setTimeout(() => {
        socket.emit('typing', {
            from: currentUser.id,
            to: currentChat.id,
            isTyping: false
        });
    }, 1000);
}

// ============ REPLY FEATURE ============
function replyToMessage(messageId) {
    const msgList = messages[currentChat.id];
    const msg = msgList.find(m => m.id === messageId);
    if (msg) {
        replyToMessage = msg;
        document.getElementById('replyText').textContent = msg.text.substring(0, 30) + (msg.text.length > 30 ? '...' : '');
        document.getElementById('replyPreview').style.display = 'flex';
    }
}

function cancelReply() {
    replyToMessage = null;
    document.getElementById('replyPreview').style.display = 'none';
}

// ============ ATTACH FILE ============
function attachFile() {
    showToast('Fitur upload file akan segera hadir!', 'info');
}

// ============ PROFILE MODAL ============
function showProfileModal() {
    document.getElementById('profileModal').style.display = 'flex';
}

function closeModal() {
    document.getElementById('profileModal').style.display = 'none';
}

function updateProfile() {
    const status = document.getElementById('profileStatus').value;
    // Update status via API (implement later)
    showToast('Status diperbarui', 'success');
    closeModal();
}

// ============ LOGOUT ============
function logout() {
    if (socket) {
        socket.disconnect();
    }
    localStorage.removeItem('pingUser');
    currentUser = null;
    showPage('authPage');
    showLogin();
    showToast('Berhasil logout', 'success');
}

// ============ UTILITY FUNCTIONS ============
function scrollToBottom() {
    const container = document.getElementById('messagesContainer');
    container.scrollTop = container.scrollHeight;
}

function showToast(text, type = 'info') {
    const toast = document.getElementById('toast');
    toast.textContent = text;
    toast.className = `toast ${type} show`;
    
    setTimeout(() => {
        toast.className = 'toast';
    }, 3000);
}
