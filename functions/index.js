const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { defineString } = require('firebase-functions/params');
const admin = require('firebase-admin');
const axios = require('axios');

admin.initializeApp();

const TELEGRAM_BOT_TOKEN = defineString('TELEGRAM_BOT_TOKEN');
const CHANNEL_NEW_USER = defineString('TELEGRAM_CHANNEL_NEW_USER');
const CHANNEL_ALL_MSGS = defineString('TELEGRAM_CHANNEL_ALL_MSGS');

async function sendTelegram(chatId, text) {
  const token = TELEGRAM_BOT_TOKEN.value();
  if (!token || !chatId) return;
  try {
    await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
      chat_id: chatId,
      text: text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    });
  } catch (err) {
    console.error('Telegram error:', err.message);
  }
}

exports.onNewMessage = onDocumentCreated('/messages/{docId}', async (event) => {
  const msg = event.data.data();

  // Sirf user ke messages par alert bhejo, admin ke nahi
  if (msg.isAdmin) return;

  const userId = msg.userId;
  const text = msg.text || '[Image]';

  // ---- CHANNEL 2: Har message ka alert ----
  await sendTelegram(
    CHANNEL_ALL_MSGS.value(),
    `<b>💬 User #${userId} ne message bheja</b>\n\n${text}`
  );

  // ---- CHANNEL 1: Sirf first message par alert ----
  const snapshot = await admin.firestore()
    .collection('messages')
    .where('userId', '==', userId)
    .where('isAdmin', '==', false)
    .get();

  if (snapshot.size === 1) {
    await sendTelegram(
      CHANNEL_NEW_USER.value(),
      `<b>👤 Naya User Aaya!</b>\n\nUser #${userId} ne first message bheja hai.\nMessage: ${text}`
    );
  }
});
