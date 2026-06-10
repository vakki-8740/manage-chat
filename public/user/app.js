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
const fstorage = firebase.storage();

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

  // Upload image to Firebase Storage
  if (selectedImage) {
    const fileRef = fstorage.ref(`chat_images/${userId}_${Date.now()}_${selectedImage.name}`);
    try {
      const snap = await fileRef.put(selectedImage);
      imageUrl = await snap.ref.getDownloadURL();
    } catch (err) {
      console.error('Upload failed:', err);
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
