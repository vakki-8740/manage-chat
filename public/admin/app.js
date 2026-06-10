// ⚠️ Render deploy karne ke baad ye URL change karo
const BACKEND_URL = '';  // Example: 'https://your-app.onrender.com'

const socket = io(BACKEND_URL || undefined, {
  transports: ['websocket', 'polling']
});
let selectedUserId = null;
let users = [];
let userMessages = {};

function api(path) {
  return BACKEND_URL + path;
}

function assetUrl(url) {
  if (!url) return url;
  if (url.startsWith('http')) return url;
  return BACKEND_URL + url;
}

// DOM refs
const userListEl = document.getElementById('userList');
const searchInput = document.getElementById('searchInput');
const sectionHeader = document.getElementById('sectionHeader');
const chatMessages = document.getElementById('chatMessages');
const adminChatContainer = document.getElementById('adminChatContainer');
const noChatSelected = document.getElementById('noChatSelected');
const adminTextInput = document.getElementById('adminTextInput');
const adminSendBtn = document.getElementById('adminSendBtn');
const inputBar = document.getElementById('inputBar');
const navTitle = document.getElementById('navTitle');
const navRight = document.getElementById('navRight');
const backBtn = document.getElementById('backBtn');
const userListPanel = document.getElementById('userListPanel');
const chatPanel = document.getElementById('chatPanel');

const isMobile = () => window.innerWidth < 768;

// ====================== LOAD USERS ======================
async function loadUsers() {
  try {
    const res = await fetch(api('/api/users'));
    users = await res.json();
    renderUserList();
  } catch (err) {
    console.error('Failed to load users:', err);
  }
}

function renderUserList(filter = '') {
  userListEl.innerHTML = '';

  const filtered = users.filter(u => {
    if (!filter) return true;
    const q = filter.toLowerCase();
    return `#${u.id}`.includes(q) || `user ${u.id}`.includes(q);
  });

  if (filtered.length === 0) {
    userListEl.innerHTML = `
      <div class="no-users">
        <div class="icon">👤</div>
        <p>No users found</p>
      </div>
    `;
    sectionHeader.textContent = 'No Results';
    return;
  }

  sectionHeader.textContent = `All Users (${filtered.length})`;

  filtered.forEach((u, idx) => {
    const item = document.createElement('div');
    item.className = 'user-item';
    item.dataset.userId = u.id;

    const initial = `#${u.id}`;
    const lastMsg = u.last_message || 'No messages yet';
    const lastActive = u.last_active ? formatTimeAgo(u.last_active) : '';
    const isOnline = u.online === 1;

    // Check if new user (has_sent_message === 0 but exists)
    const isNew = u.has_sent_message === 0;

    item.innerHTML = `
      <div class="user-avatar" style="background: ${getAvatarColor(u.id)}">
        ${u.id}
        <span class="online-indicator ${isOnline ? 'online' : 'offline'}"></span>
      </div>
      <div class="user-info">
        <div class="user-name">
          User #${u.id}
          ${isNew ? '<span class="badge new">NEW</span>' : ''}
        </div>
        <div class="user-preview">${lastMsg}</div>
      </div>
      <div class="user-time">${lastActive}</div>
    `;

    item.addEventListener('click', () => selectUser(u.id));
    userListEl.appendChild(item);
  });
}

function getAvatarColor(id) {
  const colors = ['#007AFF', '#34C759', '#FF9500', '#FF3B30', '#AF52DE', '#5AC8FA', '#FF2D55', '#5856D6'];
  return colors[(id - 1) % colors.length];
}

function formatTimeAgo(dateStr) {
  try {
    const now = new Date();
    const d = new Date(dateStr);
    const diffMs = now - d;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;

    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${months[d.getMonth()]} ${d.getDate()}`;
  } catch {
    return '';
  }
}

// ====================== SELECT USER ======================
async function selectUser(userId) {
  selectedUserId = userId;
  socket.emit('admin:select_user', userId);

  // Update UI
  noChatSelected.style.display = 'none';
  adminChatContainer.style.display = 'flex';
  adminChatContainer.style.flexDirection = 'column';
  adminChatContainer.style.gap = '6px';
  inputBar.style.display = 'block';
  navTitle.textContent = `User #${userId}`;
  navRight.textContent = `#${userId}`;

  // Mobile navigation
  if (isMobile()) {
    userListPanel.classList.add('hidden');
    chatPanel.classList.add('show');
    backBtn.classList.add('show');
  }

  // Update user item highlight
  document.querySelectorAll('.user-item').forEach(el => {
    el.style.background = parseInt(el.dataset.userId) === userId ? 'rgba(0, 122, 255, 0.08)' : '';
  });

  // Load messages
  await loadMessages(userId);
  adminTextInput.focus();
}

async function loadMessages(userId) {
  try {
    const res = await fetch(api(`/api/messages/${userId}`));
    const messages = await res.json();
    userMessages[userId] = messages;
    renderMessages(messages);
  } catch (err) {
    console.error('Failed to load messages:', err);
  }
}

function renderMessages(messages) {
  adminChatContainer.innerHTML = '';

  if (!messages || messages.length === 0) {
    adminChatContainer.innerHTML = '<div class="chat-empty">No messages yet. Send a welcome message!</div>';
    scrollChatToBottom();
    return;
  }

  messages.forEach(msg => {
    const div = document.createElement('div');
    div.className = `message ${msg.is_admin ? 'admin' : 'user'}`;

    let content = '';
    if (msg.image_url) {
      content += `<img src="${assetUrl(msg.image_url)}" alt="image" loading="lazy">`;
    }
    if (msg.message) {
      content += msg.message;
    }

    const time = msg.created_at ? formatTime(msg.created_at) : '';
    div.innerHTML = `${content}<span class="time">${time}</span>`;
    adminChatContainer.appendChild(div);
  });

  scrollChatToBottom();
}

function addMessageToUI(msg) {
  if (msg.user_id !== selectedUserId) return;

  if (noChatSelected.style.display !== 'none') {
    noChatSelected.style.display = 'none';
    adminChatContainer.style.display = 'flex';
    adminChatContainer.style.flexDirection = 'column';
    adminChatContainer.style.gap = '6px';
  }

  const empty = adminChatContainer.querySelector('.chat-empty');
  if (empty) empty.remove();

  const div = document.createElement('div');
  div.className = `message ${msg.is_admin ? 'admin' : 'user'}`;

  let content = '';
  if (msg.image_url) {
    content += `<img src="${assetUrl(msg.image_url)}" alt="image" loading="lazy">`;
  }
  if (msg.message) {
    content += msg.message;
  }

  const time = msg.created_at ? formatTime(msg.created_at) : '';
  div.innerHTML = `${content}<span class="time">${time}</span>`;
  adminChatContainer.appendChild(div);
  scrollChatToBottom();
}

function formatTime(dateStr) {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    let hours = d.getHours();
    const mins = d.getMinutes().toString().padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12 || 12;
    return `${hours}:${mins} ${ampm}`;
  } catch {
    return dateStr;
  }
}

function scrollChatToBottom() {
  requestAnimationFrame(() => {
    chatMessages.scrollTop = chatMessages.scrollHeight;
  });
}

// ====================== ADMIN SEND MESSAGE ======================
async function adminSendMessage() {
  const text = adminTextInput.value.trim();
  if (!text || !selectedUserId) return;

  adminSendBtn.disabled = true;

  try {
    await fetch(api('/api/message'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: selectedUserId,
        message: text,
        imageUrl: null,
        isAdmin: true,
      }),
    });

    adminTextInput.value = '';
    adminSendBtn.disabled = true;
    autoResizeTextarea();
  } catch (err) {
    console.error('Send failed:', err);
    adminSendBtn.disabled = false;
  }
}

// ====================== SOCKET EVENTS ======================
socket.on('message:new', (msg) => {
  // Update user list if needed
  const userIdx = users.findIndex(u => u.id === msg.user_id);
  if (userIdx !== -1) {
    users[userIdx].last_message = msg.message || '[Image]';
    users[userIdx].last_active = msg.created_at;
    // Move to top
    const user = users.splice(userIdx, 1)[0];
    users.unshift(user);
    renderUserList(searchInput.value);
  }

  // Add to chat if selected
  if (selectedUserId === msg.user_id) {
    addMessageToUI(msg);
  }
});

socket.on('user:status', (data) => {
  const user = users.find(u => u.id === data.userId);
  if (user) {
    user.online = data.online;
    renderUserList(searchInput.value);
  }
});

// ====================== UI EVENTS ======================
searchInput.addEventListener('input', () => {
  renderUserList(searchInput.value);
});

adminTextInput.addEventListener('input', () => {
  adminSendBtn.disabled = adminTextInput.value.trim().length === 0;
  autoResizeTextarea();
});

function autoResizeTextarea() {
  adminTextInput.style.height = 'auto';
  adminTextInput.style.height = Math.min(adminTextInput.scrollHeight, 100) + 'px';
}

adminTextInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    adminSendMessage();
  }
});

adminSendBtn.addEventListener('click', adminSendMessage);

backBtn.addEventListener('click', () => {
  userListPanel.classList.remove('hidden');
  chatPanel.classList.remove('show');
  backBtn.classList.remove('show');
  navTitle.textContent = 'Users';
  navRight.textContent = '';
  selectedUserId = null;
});

// ====================== POLLING ======================
// Poll for user list updates every 5 seconds
setInterval(loadUsers, 5000);

// ====================== INIT ======================
loadUsers();

// Handle window resize
window.addEventListener('resize', () => {
  if (!isMobile()) {
    userListPanel.classList.remove('hidden');
    chatPanel.classList.add('show');
    backBtn.classList.remove('show');
  }
});
