const BACKEND_URL = 'https://manage-chat.onrender.com';

const socket = io(BACKEND_URL || undefined, {
  transports: ['websocket', 'polling']
});
let userId = localStorage.getItem('chat_userId');
let selectedImage = null;

function api(path) {
  return BACKEND_URL + path;
}

function assetUrl(url) {
  if (!url) return url;
  if (url.startsWith('http')) return url;
  return BACKEND_URL + url;
}

// DOM refs
const messagesEl = document.getElementById('messagesContainer');
const chatContainer = document.getElementById('chatContainer');
const textInput = document.getElementById('textInput');
const sendBtn = document.getElementById('sendBtn');
const attachBtn = document.getElementById('attachBtn');
const fileInput = document.getElementById('fileInput');
const imagePreview = document.getElementById('imagePreview');
const previewImg = document.getElementById('previewImg');
const removeImg = document.getElementById('removeImg');
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');

// ====================== INIT ======================
async function init() {
  if (!userId) {
    try {
      const res = await fetch(api('/api/user/new'), { method: 'POST' });
      const data = await res.json();
      userId = data.id;
      localStorage.setItem('chat_userId', userId);
    } catch (err) {
      console.error('Failed to create user:', err);
      statusText.textContent = 'Connection error';
      return;
    }
  }

  socket.emit('user:online', userId);
  loadMessages();
}

// ====================== LOAD MESSAGES ======================
async function loadMessages() {
  try {
    const res = await fetch(api(`/api/messages/${userId}`));
    const messages = await res.json();
    renderMessages(messages);
  } catch (err) {
    console.error('Failed to load messages:', err);
  }
}

function renderMessages(messages) {
  messagesEl.innerHTML = '';

  if (!messages || messages.length === 0) {
    messagesEl.innerHTML = `
      <div class="empty-state">
        <div class="icon">💬</div>
        <h3>Welcome to Support</h3>
        <p>Hi there! 👋 How can we help you today?<br>Send a message and our team will assist you.</p>
      </div>
    `;
    return;
  }

  messages.forEach(msg => addMessageToUI(msg, false));
  scrollToBottom();
}

function addMessageToUI(msg, animate = true) {
  // Remove empty state if present
  const emptyState = messagesEl.querySelector('.empty-state');
  if (emptyState) emptyState.remove();

  const div = document.createElement('div');
  div.className = `message ${msg.is_admin ? 'admin' : 'user'}`;
  if (!animate) div.style.animation = 'none';

  let content = '';
    if (msg.image_url) {
    content += `<img src="${assetUrl(msg.image_url)}" alt="image" loading="lazy">`;
  }
  if (msg.message) {
    content += msg.message;
  }

  const time = msg.created_at ? formatTime(msg.created_at) : '';
  div.innerHTML = `${content}<span class="time">${time}</span>`;
  messagesEl.appendChild(div);

  if (!animate) {
    div.style.animation = 'none';
  }

  scrollToBottom();
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

function scrollToBottom() {
  requestAnimationFrame(() => {
    chatContainer.scrollTop = chatContainer.scrollHeight;
  });
}

// ====================== SEND MESSAGE ======================
async function sendMessage() {
  const text = textInput.value.trim();
  if (!text && !selectedImage) return;

  sendBtn.disabled = true;

  let imageUrl = null;

  // Upload image if selected
  if (selectedImage) {
    const formData = new FormData();
    formData.append('image', selectedImage);
    try {
      const uploadRes = await fetch(api('/api/upload'), { method: 'POST', body: formData });
      const uploadData = await uploadRes.json();
      imageUrl = uploadData.url;
    } catch (err) {
      console.error('Upload failed:', err);
      sendBtn.disabled = false;
      return;
    }
  }

  try {
    await fetch(api('/api/message'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: parseInt(userId),
        message: text || null,
        imageUrl,
        isAdmin: false,
      }),
    });

    textInput.value = '';
    selectedImage = null;
    imagePreview.classList.remove('active');
    updateSendButton();
    autoResizeTextarea();
  } catch (err) {
    console.error('Send failed:', err);
    sendBtn.disabled = false;
  }
}

// ====================== SOCKET EVENTS ======================
socket.on('message:new', (msg) => {
  if (msg.user_id === parseInt(userId)) {
    addMessageToUI(msg, true);
  }
});

socket.on('user:status', (data) => {
  // This user panel only shows admin/agent status
  // We'll show a simulated "online" status for the support team
  updateConnectionStatus(true);
});

socket.on('connect', () => {
  updateConnectionStatus(true);
  if (userId) socket.emit('user:online', userId);
});

socket.on('disconnect', () => {
  updateConnectionStatus(false);
});

function updateConnectionStatus(online) {
  if (online) {
    statusDot.className = 'status-dot online';
    statusText.textContent = 'Support Team Online';
  } else {
    statusDot.className = 'status-dot offline';
    statusText.textContent = 'Reconnecting...';
  }
}

// ====================== UI EVENTS ======================
function updateSendButton() {
  const hasText = textInput.value.trim().length > 0;
  const hasImage = selectedImage !== null;
  sendBtn.disabled = !(hasText || hasImage);
}

textInput.addEventListener('input', () => {
  updateSendButton();
  autoResizeTextarea();
});

function autoResizeTextarea() {
  textInput.style.height = 'auto';
  textInput.style.height = Math.min(textInput.scrollHeight, 100) + 'px';
}

textInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

sendBtn.addEventListener('click', sendMessage);

attachBtn.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;

  if (!file.type.startsWith('image/')) {
    alert('Only image files are allowed');
    return;
  }

  if (file.size > 5 * 1024 * 1024) {
    alert('Image must be less than 5MB');
    return;
  }

  selectedImage = file;
  const reader = new FileReader();
  reader.onload = (e) => {
    previewImg.src = e.target.result;
    imagePreview.classList.add('active');
    updateSendButton();
  };
  reader.readAsDataURL(file);
  fileInput.value = '';
});

removeImg.addEventListener('click', () => {
  selectedImage = null;
  imagePreview.classList.remove('active');
  updateSendButton();
});

// ====================== START ======================
init();

// Handle page unload
window.addEventListener('beforeunload', () => {
  if (userId) {
    socket.emit('user:offline', userId);
  }
});
