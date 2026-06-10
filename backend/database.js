const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'chat.db');
let db;

async function initDatabase() {
  const SQL = await initSqlJs();

  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at DATETIME DEFAULT (datetime('now', 'localtime')),
      online INTEGER DEFAULT 0,
      has_sent_message INTEGER DEFAULT 0
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      message TEXT,
      image_url TEXT,
      is_admin INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  saveDatabase();
  return db;
}

function saveDatabase() {
  try {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_PATH, buffer);
  } catch (err) {
    console.error('Save DB error:', err.message);
  }
}

function getLastInsertId() {
  const stmt = db.prepare('SELECT last_insert_rowid() as id');
  if (stmt.step()) {
    const row = stmt.getAsObject();
    stmt.free();
    return row.id;
  }
  stmt.free();
  return null;
}

function queryAll(sql, params = []) {
  const stmt = db.prepare(sql);
  if (params.length > 0) stmt.bind(params);
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

function queryOne(sql, params = []) {
  const rows = queryAll(sql, params);
  return rows.length > 0 ? rows[0] : null;
}

function toVal(v) {
  return v === undefined ? null : v;
}

module.exports = {
  async init() {
    await initDatabase();
  },

  createUser() {
    db.run('INSERT INTO users (online) VALUES (1)');
    const id = getLastInsertId();
    saveDatabase();
    return { id };
  },

  getUser(id) {
    return queryOne('SELECT * FROM users WHERE id = ?', [id]);
  },

  getAllUsers() {
    return queryAll(`
      SELECT u.*,
        (SELECT message FROM messages WHERE user_id = u.id ORDER BY id DESC LIMIT 1) as last_message,
        (SELECT created_at FROM messages WHERE user_id = u.id ORDER BY id DESC LIMIT 1) as last_active
      FROM users u
      ORDER BY u.id DESC
    `);
  },

  setUserOnline(id, online) {
    db.run('UPDATE users SET online = ? WHERE id = ?', [online, id]);
    saveDatabase();
  },

  setUserHasSentMessage(id) {
    db.run('UPDATE users SET has_sent_message = 1 WHERE id = ?', [id]);
    saveDatabase();
  },

  addMessage(userId, message, imageUrl, isAdmin = 0) {
    db.run(
      'INSERT INTO messages (user_id, message, image_url, is_admin) VALUES (?, ?, ?, ?)',
      [userId, toVal(message), toVal(imageUrl), isAdmin ? 1 : 0]
    );
    const id = getLastInsertId();
    saveDatabase();

    return {
      id,
      user_id: userId,
      message: message || null,
      image_url: imageUrl || null,
      is_admin: isAdmin ? 1 : 0,
      created_at: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
    };
  },

  getMessages(userId) {
    return queryAll('SELECT * FROM messages WHERE user_id = ? ORDER BY id ASC', [userId]);
  },

  getUserMessageCount(userId) {
    const row = queryOne('SELECT COUNT(*) as count FROM messages WHERE user_id = ? AND is_admin = 0', [userId]);
    return row ? row.count : 0;
  },
};
