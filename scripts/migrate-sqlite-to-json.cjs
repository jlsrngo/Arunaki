// Migration script: Arunaki-local.db (SQLite) -> sessions-store.json
// Reads all sessions and messages from SQLite and saves them into the Rust engine's JSON store.

const fs = require('fs');
const path = require('path');
const os = require('os');

const dataDir = path.join(os.homedir(), '.local', 'share', 'arunaki');
const dbPath = path.join(dataDir, 'Arunaki-local.db');
const storePath = path.join(dataDir, 'sessions-store.json');

if (!fs.existsSync(dbPath)) {
  console.log('[migrate] No Arunaki-local.db found at', dbPath);
  process.exit(0);
}

// Check if sqlite3 is available via bun, node:sqlite, or python fallback
async function runMigration() {
  let sqliteDb = null;

  // 1. Try bun:sqlite
  try {
    const { Database } = require('bun:sqlite');
    sqliteDb = new Database(dbPath, { readonly: true });
    console.log('[migrate] Using bun:sqlite');
  } catch (_) {}

  // 2. Try node:sqlite (Node 22+)
  if (!sqliteDb) {
    try {
      const { DatabaseSync } = require('node:sqlite');
      sqliteDb = new DatabaseSync(dbPath, { readOnly: true });
      console.log('[migrate] Using node:sqlite');
    } catch (_) {}
  }

  if (!sqliteDb) {
    console.error('[migrate] SQLite driver not found in runtime.');
    process.exit(1);
  }

  // Load existing store if present
  let store = { sessions: {}, messages: {} };
  if (fs.existsSync(storePath)) {
    try {
      store = JSON.parse(fs.readFileSync(storePath, 'utf8'));
      if (!store.sessions) store.sessions = {};
      if (!store.messages) store.messages = {};
    } catch (_) {}
  }

  // Helper query runner
  function queryAll(sql) {
    if (typeof sqliteDb.query === 'function') {
      // bun:sqlite
      return sqliteDb.query(sql).all();
    } else if (typeof sqliteDb.prepare === 'function') {
      // node:sqlite
      return sqliteDb.prepare(sql).all();
    }
    return [];
  }

  // 1. Migrate sessions
  const sessionRows = queryAll('SELECT * FROM session ORDER BY time_updated ASC');
  console.log(`[migrate] Found ${sessionRows.length} sessions in SQLite`);

  for (const row of sessionRows) {
    let parsedModel = { providerID: 'local-cli', id: 'kiro/auto' };
    if (row.model) {
      try {
        const m = typeof row.model === 'string' ? JSON.parse(row.model) : row.model;
        if (m && m.providerID && m.id) parsedModel = m;
      } catch (_) {}
    }

    const dir = row.directory || '';
    store.sessions[row.id] = {
      id: row.id,
      projectID: row.project_id || 'global',
      agent: row.agent || 'default',
      model: parsedModel,
      cost: Number(row.cost || 0),
      tokens: {
        input: Number(row.tokens_input || 0),
        output: Number(row.tokens_output || 0),
        reasoning: Number(row.tokens_reasoning || 0),
        cache: {
          read: Number(row.tokens_cache_read || 0),
          write: Number(row.tokens_cache_write || 0)
        }
      },
      time: {
        created: Number(row.time_created || Date.now()),
        updated: Number(row.time_updated || Date.now())
      },
      title: row.title || 'Untitled Session',
      directory: dir,
      location: {
        directory: dir
      }
    };
    if (!store.messages[row.id]) {
      store.messages[row.id] = [];
    }
  }

  // 2. Migrate session_message table (6400+ rows)
  const smRows = queryAll('SELECT * FROM session_message ORDER BY seq ASC');
  console.log(`[migrate] Found ${smRows.length} messages in session_message table`);

  const seenMsgIds = new Set();
  for (const row of smRows) {
    const sid = row.session_id;
    if (!store.sessions[sid]) {
      store.sessions[sid] = {
        id: sid,
        projectID: 'global',
        agent: 'default',
        model: { providerID: 'local-cli', id: 'kiro/auto' },
        cost: 0,
        tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
        time: { created: Number(row.time_created || Date.now()), updated: Number(row.time_updated || Date.now()) },
        title: 'Recovered Session',
        directory: '',
        location: { directory: '' }
      };
      store.messages[sid] = [];
    }

    let parsedData = {};
    if (row.data) {
      try {
        parsedData = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
      } catch (_) {}
    }

    const msgObj = {
      id: row.id,
      sessionID: sid,
      type: row.type || 'assistant',
      role: row.type === 'user' ? 'user' : 'assistant',
      seq: row.seq,
      time: parsedData.time || { created: Number(row.time_created), completed: Number(row.time_updated) },
      time_created: Number(row.time_created),
      time_updated: Number(row.time_updated),
      ...parsedData
    };

    store.messages[sid].push(msgObj);
    seenMsgIds.add(row.id);
  }

  // 3. Migrate message + part tables (if any additional rows exist)
  try {
    const msgRows = queryAll('SELECT * FROM message ORDER BY time_created ASC');
    const partRows = queryAll('SELECT * FROM part ORDER BY id ASC');
    const partsByMsg = {};
    for (const p of partRows) {
      partsByMsg[p.message_id] = partsByMsg[p.message_id] || [];
      let pData = {};
      try { pData = typeof p.data === 'string' ? JSON.parse(p.data) : p.data; } catch (_) {}
      partsByMsg[p.message_id].push({
        id: p.id,
        messageID: p.message_id,
        sessionID: p.session_id,
        ...pData
      });
    }

    for (const row of msgRows) {
      if (seenMsgIds.has(row.id)) continue;
      const sid = row.session_id;
      if (!store.messages[sid]) store.messages[sid] = [];
      let mData = {};
      try { mData = typeof row.data === 'string' ? JSON.parse(row.data) : row.data; } catch (_) {}
      const role = mData.role || (row.type === 'user' ? 'user' : 'assistant');
      const parts = partsByMsg[row.id] || [];
      const text = parts.map(p => p.text || '').filter(Boolean).join('\n') || mData.text || '';
      store.messages[sid].push({
        id: row.id,
        sessionID: sid,
        type: role,
        role: role,
        time: mData.time || { created: Number(row.time_created), completed: Number(row.time_updated) },
        time_created: Number(row.time_created),
        time_updated: Number(row.time_updated),
        text: text,
        parts: parts,
        ...mData
      });
      seenMsgIds.add(row.id);
    }
  } catch (err) {
    console.warn('[migrate] Optional message/part scan note:', err.message);
  }

  // 4. Update message counts and timestamps on sessions
  let totalMessages = 0;
  for (const [sid, msgList] of Object.entries(store.messages)) {
    // Sort messages by time_created / seq
    msgList.sort((a, b) => {
      const ta = Number(a.time_created || a.time?.created || 0);
      const tb = Number(b.time_created || b.time?.created || 0);
      return ta - tb;
    });
    totalMessages += msgList.length;

    if (store.sessions[sid]) {
      const sess = store.sessions[sid];
      if (msgList.length > 0) {
        const lastMsg = msgList[msgList.length - 1];
        const lastTime = Number(lastMsg.time_updated || lastMsg.time_created || lastMsg.time?.created || sess.time.updated);
        if (lastTime > sess.time.updated) {
          sess.time.updated = lastTime;
        }
      }
    }
  }

  // 5. Write to sessions-store.json atomically
  const tempPath = storePath + '.tmp.' + Date.now();
  fs.writeFileSync(tempPath, JSON.stringify(store, null, 2), 'utf8');
  fs.renameSync(tempPath, storePath);

  console.log(`[migrate] Successfully migrated ${Object.keys(store.sessions).length} sessions and ${totalMessages} messages to ${storePath}`);
}

runMigration().catch(err => {
  console.error('[migrate] Migration error:', err);
  process.exit(1);
});
