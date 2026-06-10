// ⚠️ Firebase config — ye bad me apna real config dalna
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};

firebase.initializeApp(firebaseConfig);
const fdb = firebase.firestore();

let selectedUserId = null;
let users = [];
let unsubscribeUsers = null;
let unsubscribeMsgs = null;

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

// ====================== SUBSCRIBE USERS ======================
function subscribeUsers() {
  if (unsubscribeUsers) unsubscribeUsers();

  unsubscribeUsers = fdb.collection('users')
    .orderBy('createdAt', 'desc')
    .onSnapshot((snapshot) => {
      users = [];
      snapshot.forEach((doc) => {
        users.push({ id: doc.id, ...doc.data() });
      });
      renderUserList(searchInput.value);
    }, (err) => {
      console.error('Users error:', err);
    });
}

function renderUserList(filter = '') {
  userListEl.innerHTML = '';

  const filtered = users.filter(u => {
    if (!filter) return true;
    const q = filter.toLowerCase();
    return `#${u.userId}`.includes(q) || `user ${u.userId}`.includes(q);
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

  filtered.forEach((u) => {
    const item = document.createElement('div');
    item.className = 'user-item';
    item.dataset.userId = u.userId;

    const lastMsg = u.lastMessage || 'No messages yet';
    const lastActive = u.lastMessageAt ? formatTimeAgo(u.lastMessageAt.toDate()) : '';
    const isOnline = u.online === true;
    const isNew = !u.hasSentMessage;

    item.innerHTML = `
      <div class="user-avatar" style="background: ${getAvatarColor(u.userId)}">
        ${u.userId}
        <span class="online-indicator ${isOnline ? 'online' : 'offline'}"></span>
      </div>
      <div class="user-info">
        <div class="user-name">
          User #${u.userId}
          ${isNew ? '<span class="badge new">NEW</span>' : ''}
        </div>
        <div class="user-preview">${lastMsg}</div>
      </div>
      <div class="user-time">${lastActive}</div>
    `;

    item.addEventListener('click', () => selectUser(u.userId));
    userListEl.appendChild(item);
  });
}

function getAvatarColor(id) {
  const colors = ['#007AFF', '#34C759', '#FF9500', '#FF3B30', '#AF52DE', '#5AC8FA', '#FF2D55', '#5856D6'];
  return colors[(id - 1) % colors.length];
}

function formatTimeAgo(date) {
  try {
    if (!date || !(date instanceof Date)) return '';
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;

    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${months[date.getMonth()]} ${date.getDate()}`;
  } catch {
    return '';
  }
}

// ====================== SELECT USER ======================
async function selectUser(userId) {
  selectedUserId = userId;

  noChatSelected.style.display = 'none';
  adminChatContainer.style.display = 'flex';
  adminChatContainer.style.flexDirection = 'column';
  adminChatContainer.style.gap = '6px';
  inputBar.style.display = 'block';
  navTitle.textContent = `User #${userId}`;
  navRight.textContent = `#${userId}`;

  userListPanel.classList.add('hidden');
  chatPanel.classList.add('show');
  backBtn.classList.add('show');

  document.querySelectorAll('.user-item').forEach(el => {
    el.style.background = parseInt(el.dataset.userId) === userId ? 'rgba(0, 122, 255, 0.08)' : '';
  });

  subscribeMessages(userId);
  adminTextInput.focus();
}

// ====================== SUBSCRIBE MESSAGES ======================
function subscribeMessages(userId) {
  if (unsubscribeMsgs) unsubscribeMsgs();

  adminChatContainer.innerHTML = '<div class="chat-empty">Loading messages...</div>';

  unsubscribeMsgs = fdb.collection('messages')
    .where('userId', '==', userId)
    .orderBy('createdAt', 'asc')
    .onSnapshot((snapshot) => {
      adminChatContainer.innerHTML = '';
      let hasMsgs = false;

      snapshot.forEach((doc) => {
        hasMsgs = true;
        addMessageToUI({ id: doc.id, ...doc.data() });
      });

      if (!hasMsgs) {
        adminChatContainer.innerHTML = '<div class="chat-empty">No messages yet. Send a welcome message!</div>';
      }

      scrollChatToBottom();
    }, (err) => {
      console.error('Messages error:', err);
      adminChatContainer.innerHTML = '<div class="chat-empty">Error loading messages</div>';
    });
}

function addMessageToUI(msg) {
  const div = document.createElement('div');
  div.className = `message ${msg.isAdmin ? 'admin' : 'user'}`;

  let content = '';
  if (msg.imageUrl) {
    content += `<img src="${msg.imageUrl}" alt="image" loading="lazy">`;
  }
  if (msg.text) {
    content += msg.text;
  }

  const time = msg.createdAt ? formatTime(msg.createdAt.toDate()) : '';
  div.innerHTML = `${content}<span class="time">${time}</span>`;
  adminChatContainer.appendChild(div);
}

function formatTime(date) {
  try {
    if (!date || !(date instanceof Date)) return '';
    let hours = date.getHours();
    const mins = date.getMinutes().toString().padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12 || 12;
    return `${hours}:${mins} ${ampm}`;
  } catch {
    return '';
  }
}

function scrollChatToBottom() {
  requestAnimationFrame(() => {
    chatMessages.scrollTop = chatMessages.scrollHeight;
  });
}

// ====================== ADMIN SEND ======================
async function adminSendMessage() {
  const text = adminTextInput.value.trim();
  if (!text || !selectedUserId) return;

  adminSendBtn.disabled = true;

  const msgData = {
    userId: selectedUserId,
    text: text,
    imageUrl: null,
    isAdmin: true,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  };

  try {
    await fdb.collection('messages').add(msgData);

    await fdb.collection('users').doc(selectedUserId.toString()).update({
      lastMessage: text,
      lastMessageAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    adminTextInput.value = '';
    adminSendBtn.disabled = true;
    autoResizeTextarea();
  } catch (err) {
    console.error('Send failed:', err);
    adminSendBtn.disabled = false;
  }
}

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
  if (unsubscribeMsgs) unsubscribeMsgs();
});

// ====================== INIT ======================
subscribeUsers();
