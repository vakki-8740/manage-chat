const firebaseConfig = {
  apiKey: "AIzaSyBNzgygZVvV1QuOcPIXgfSCmP3D0xs37LU",
  authDomain: "chat-data-3233b.firebaseapp.com",
  projectId: "chat-data-3233b",
  storageBucket: "chat-data-3233b.firebasestorage.app",
  messagingSenderId: "781730752698",
  appId: "1:781730752698:web:0df5196d94f9c2d9367a83"
};

// ⚠️ Telegram config
const TELEGRAM_BOT_TOKEN = '8853360102:AAERqOXQhrUnjvTHsVMIt_5bnVP1IdAWh6g';
const TELEGRAM_CHANNEL_NEW_USER = '-1003980959944';
const TELEGRAM_CHANNEL_ALL_MSGS = '-1003751648253';
const TELEGRAM_CHANNEL_IMAGES = 'YOUR_IMAGES_CHANNEL_ID'; // ⚠️ images store karne wale channel ki ID daalna

firebase.initializeApp(firebaseConfig);
const fdb = firebase.firestore();

function sendTelegram(chatId, message) {
  fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: message,
      parse_mode: 'HTML',
      disable_web_page_preview: true
    })
  }).catch(err => console.error('Telegram error:', err.message));
}

async function uploadImageToTelegram(file) {
  const formData = new FormData();
  formData.append('chat_id', TELEGRAM_CHANNEL_IMAGES);
  formData.append('photo', file);

  try {
    const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendPhoto`, {
      method: 'POST',
      body: formData
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.description);

    const fileId = data.result.photo[data.result.photo.length - 1].file_id;

    // Get file path from Telegram
    const fileRes = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getFile?file_id=${fileId}`);
    const fileData = await fileRes.json();
    if (!fileData.ok) throw new Error(fileData.description);

    return `https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}/${fileData.result.file_path}`;
  } catch (err) {
    console.error('Telegram image upload error:', err.message);
    throw err;
  }
}

let userId = null;
let selectedImage = null;
let unsubscribeMsgs = null;

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
  const storedId = localStorage.getItem('chat_userId');
  if (storedId) {
    userId = parseInt(storedId);
    goOnline();
    subscribeMessages();
    return;
  }

  try {
    // Atomic counter se naya user ID lo
    const userRef = await fdb.collection('counters').doc('users').get();
    let nextId = 1;
    if (userRef.exists) {
      nextId = userRef.data().current + 1;
    }
    await fdb.collection('counters').doc('users').set({ current: nextId });

    // User doc banao
    await fdb.collection('users').doc(nextId.toString()).set({
      userId: nextId,
      online: true,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      hasSentMessage: false,
      lastMessage: '',
      lastMessageAt: null
    });

    userId = nextId;
    localStorage.setItem('chat_userId', userId);
    subscribeMessages();
  } catch (err) {
    console.error('Failed to create user:', err);
    statusText.textContent = 'Connection error';
  }
}

function goOnline() {
  if (!userId) return;
  fdb.collection('users').doc(userId.toString()).update({ online: true });
}

function goOffline() {
  if (!userId) return;
  fdb.collection('users').doc(userId.toString()).update({ online: false });
}

// ====================== SUBSCRIBE MESSAGES ======================
function subscribeMessages() {
  if (unsubscribeMsgs) unsubscribeMsgs();

  unsubscribeMsgs = fdb.collection('messages')
    .where('userId', '==', userId)
    .orderBy('createdAt', 'asc')
    .onSnapshot((snapshot) => {
      messagesEl.innerHTML = '';
      let hasMsgs = false;

      snapshot.forEach((doc) => {
        hasMsgs = true;
        addMessageToUI({ id: doc.id, ...doc.data() }, false);
      });

      if (!hasMsgs) {
        messagesEl.innerHTML = `
          <div class="empty-state">
            <div class="icon">💬</div>
            <h3>Welcome to Support</h3>
            <p>Hi there! 👋 How can we help you today?<br>Send a message and our team will assist you.</p>
          </div>
        `;
      }

      scrollToBottom();
    }, (err) => {
      console.error('Messages error:', err);
    });
}

// ====================== RENDER MESSAGE ======================
function addMessageToUI(msg, animate = true) {
  const div = document.createElement('div');
  div.className = `message ${msg.isAdmin ? 'admin' : 'user'}`;
  if (!animate) div.style.animation = 'none';

  let content = '';
  if (msg.imageUrl) {
    content += `<img src="${msg.imageUrl}" alt="image" loading="lazy">`;
  }
  if (msg.text) {
    content += msg.text;
  }

  const time = msg.createdAt ? formatTime(msg.createdAt.toDate()) : '';
  div.innerHTML = `${content}<span class="time">${time}</span>`;
  messagesEl.appendChild(div);
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

  // Upload image to Telegram channel
  if (selectedImage) {
    try {
      imageUrl = await uploadImageToTelegram(selectedImage);
    } catch (err) {
      console.error('Image upload failed:', err);
      sendBtn.disabled = false;
      return;
    }
  }

  const msgData = {
    userId: userId,
    text: text || null,
    imageUrl: imageUrl,
    isAdmin: false,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  };

  try {
    const msgRef = await fdb.collection('messages').add(msgData);

    // Update user's last message
    await fdb.collection('users').doc(userId.toString()).update({
      lastMessage: text || '[Image]',
      lastMessageAt: firebase.firestore.FieldValue.serverTimestamp(),
      hasSentMessage: true
    });

    // ---- Telegram Alerts ----
    const content = text || '[Image]';

    // Always send to all-messages channel
    sendTelegram(TELEGRAM_CHANNEL_ALL_MSGS, `<b>💬 User #${userId} ne message bheja</b>\n\n${content}`);

    // Check if first message → send to new-user channel
    const msgsSnap = await fdb.collection('messages')
      .where('userId', '==', userId)
      .where('isAdmin', '==', false)
      .get();

    if (msgsSnap.size === 1) {
      sendTelegram(TELEGRAM_CHANNEL_NEW_USER, `<b>👤 Naya User Aaya!</b>\n\nUser #${userId} ne first message bheja hai.\nMessage: ${content}`);
    }

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

// Connection status (Firestore connection)
firebase.firestore().enableNetwork().then(() => {
  statusDot.className = 'status-dot online';
  statusText.textContent = 'Support Team Online';
}).catch(() => {
  statusDot.className = 'status-dot offline';
  statusText.textContent = 'Offline';
});

// ====================== START ======================
init();

window.addEventListener('beforeunload', () => {
  goOffline();
  if (unsubscribeMsgs) unsubscribeMsgs();
});
