const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { createClient } = require('redis');
const cookie = require('cookie');
const mysql = require('mysql2/promise');

const PORT = 8931;
const AI_API_URL = 'http://127.0.0.1:8741/v1/chat/completions';
const AI_API_KEY = 'dyyyyds114514';
const AI_MODEL = 'gemini-3-flash';
const REDIS_CACHE_TTL = 86400; // 1 day in seconds
const MAX_HISTORY = 10;

// --- OAuth2 Configuration ---
const OAUTH_CLIENT_ID = 'englishd';
const OAUTH_REDIRECT_URI = 'http://localhost:8931/auth/callback';
const OAUTH_AUTH_URL = 'https://auth.dyyapp.com/oauth/authorize';
const OAUTH_TOKEN_URL = 'https://auth.dyyapp.com/oauth/token';
const OAUTH_USERINFO_URL = 'https://auth.dyyapp.com/oauth/userinfo';
const SESSION_TTL = 86400; // 1 day
const SESSION_COOKIE_NAME = 'englishd_session';

// --- User Whitelist ---
const ALLOWED_EMAILS = [
  'test@example.com',
  'admin@dyyapp.com',
];

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

// --- Redis client setup ---
const redisClient = createClient({ url: 'redis://localhost:6379' });
let redisReady = false;

redisClient.on('error', (err) => {
  console.error('[Redis] Connection error:', err.message);
  redisReady = false;
});

redisClient.on('ready', () => {
  console.log('[Redis] Connected and ready');
  redisReady = true;
});

redisClient.on('reconnecting', () => {
  console.log('[Redis] Reconnecting...');
});

redisClient.connect().catch((err) => {
  console.error('[Redis] Initial connection failed:', err.message);
  console.error('[Redis] Server will continue without caching.');
});
// --- End Redis setup ---

// --- MySQL setup ---
let db;

async function initMySQL() {
  try {
    db = await mysql.createPool({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '3306', 10),
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || 'dyy1957',
      database: process.env.DB_NAME || 'englishd',
      waitForConnections: true,
      connectionLimit: 10,
    });
    // Create tables if they don't exist
    await db.execute(`CREATE TABLE IF NOT EXISTS cards (
      id VARCHAR(64) NOT NULL PRIMARY KEY,
      user_email VARCHAR(255) NOT NULL,
      word VARCHAR(255) NOT NULL,
      phonetic VARCHAR(255) DEFAULT '',
      definitions JSON,
      examples JSON,
      etymology TEXT,
      box INT DEFAULT 1,
      nextReviewDate BIGINT DEFAULT 0,
      addedDate BIGINT DEFAULT 0,
      INDEX idx_cards_user (user_email)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

    await db.execute(`CREATE TABLE IF NOT EXISTS mastered (
      id VARCHAR(64) NOT NULL PRIMARY KEY,
      user_email VARCHAR(255) NOT NULL,
      word VARCHAR(255) NOT NULL,
      phonetic VARCHAR(255) DEFAULT '',
      definitions JSON,
      examples JSON,
      etymology TEXT,
      masteredDate BIGINT DEFAULT 0,
      INDEX idx_mastered_user (user_email)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

    await db.execute(`CREATE TABLE IF NOT EXISTS history (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_email VARCHAR(255) NOT NULL,
      word VARCHAR(255) NOT NULL,
      timestamp BIGINT DEFAULT 0,
      INDEX idx_history_user (user_email)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

    console.log('[MySQL] Connected and tables ready');
  } catch (err) {
    console.error('[MySQL] Init error:', err.message);
    process.exit(1);
  }
}

initMySQL();
// --- End MySQL setup ---

// --- Session helpers ---

function generateSessionId() {
  return crypto.randomBytes(32).toString('hex');
}

function getSessionIdFromRequest(req) {
  const cookieHeader = req.headers.cookie || '';
  const cookies = cookie.parse(cookieHeader);
  return cookies[SESSION_COOKIE_NAME] || null;
}

async function getSession(sessionId) {
  if (!redisReady || !sessionId) return null;
  try {
    const data = await redisClient.get(`session:${sessionId}`);
    return data ? JSON.parse(data) : null;
  } catch (err) {
    console.error('[Session] Read error:', err.message);
    return null;
  }
}

async function saveSession(sessionId, data) {
  if (!redisReady) return false;
  try {
    await redisClient.setEx(`session:${sessionId}`, SESSION_TTL, JSON.stringify(data));
    return true;
  } catch (err) {
    console.error('[Session] Write error:', err.message);
    return false;
  }
}

async function destroySession(sessionId) {
  if (!redisReady || !sessionId) return;
  try {
    await redisClient.del(`session:${sessionId}`);
  } catch (err) {
    console.error('[Session] Delete error:', err.message);
  }
}

function setSessionCookie(res, sessionId) {
  const serialized = cookie.serialize(SESSION_COOKIE_NAME, sessionId, {
    httpOnly: true,
    path: '/',
    maxAge: SESSION_TTL,
    sameSite: 'lax',
  });
  res.setHeader('Set-Cookie', serialized);
}

function clearSessionCookie(res) {
  const serialized = cookie.serialize(SESSION_COOKIE_NAME, '', {
    httpOnly: true,
    path: '/',
    maxAge: 0,
    sameSite: 'lax',
  });
  res.setHeader('Set-Cookie', serialized);
}

// --- End Session helpers ---

// --- OAuth2 helpers ---

function httpsPostJson(urlStr, formData) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const body = new URLSearchParams(formData).toString();
    const options = {
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`Failed to parse token response: ${data}`));
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function httpsGetJson(urlStr, accessToken) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const options = {
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`Failed to parse userinfo response: ${data}`));
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

// --- End OAuth2 helpers ---

// --- Auth middleware ---

async function getAuthenticatedUser(req) {
  const sessionId = getSessionIdFromRequest(req);
  if (!sessionId) return null;
  const session = await getSession(sessionId);
  return session ? session.user : null;
}

// Returns true if the request was blocked (caller MUST return early to avoid auth bypass)
async function requireAuth(req, res) {
  const user = await getAuthenticatedUser(req);
  if (!user) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Unauthorized. Please login at /auth/login' }));
    return true;
  }
  req.user = user;
  return false;
}

// --- End Auth middleware ---

// --- Route handlers ---

function handleAuthLogin(req, res) {
  const authUrl = `${OAUTH_AUTH_URL}?client_id=${OAUTH_CLIENT_ID}&redirect_uri=${encodeURIComponent(OAUTH_REDIRECT_URI)}&response_type=code&scope=openid%20profile%20email`;
  res.writeHead(302, { Location: authUrl });
  res.end();
}

async function handleAuthCallback(req, res) {
  const reqUrl = new URL(req.url, `http://${req.headers.host}`);
  const code = reqUrl.searchParams.get('code');
  const error = reqUrl.searchParams.get('error');

  if (error || !code) {
    const errMsg = error || 'No authorization code received';
    console.error('[OAuth] Callback error:', errMsg);
    res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<html><body><h1>Authentication Error</h1><p>${escapeHtml(errMsg)}</p><p><a href=\"/\">Return Home</a></p></body></html>`);
    return;
  }

  try {
    // Exchange code for token
    const tokenData = await httpsPostJson(OAUTH_TOKEN_URL, {
      grant_type: 'authorization_code',
      code: code,
      redirect_uri: OAUTH_REDIRECT_URI,
      client_id: OAUTH_CLIENT_ID,
    });

    if (tokenData.error || !tokenData.access_token) {
      const errMsg = tokenData.error_description || tokenData.error || 'Token exchange failed';
      console.error('[OAuth] Token exchange error:', errMsg);
      res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<html><body><h1>Authentication Error</h1><p>${escapeHtml(errMsg)}</p><p><a href=\"/\">Return Home</a></p></body></html>`);
      return;
    }

    // Fetch user info
    const userInfo = await httpsGetJson(OAUTH_USERINFO_URL, tokenData.access_token);

    if (!userInfo || !userInfo.email) {
      console.error('[OAuth] Userinfo missing email:', JSON.stringify(userInfo));
      res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<html><body><h1>Authentication Error</h1><p>Could not retrieve user email.</p><p><a href=\"/\">Return Home</a></p></body></html>');
      return;
    }

    // Check whitelist
    if (!ALLOWED_EMAILS.includes(userInfo.email.toLowerCase())) {
      console.warn('[Auth] Email not in whitelist:', userInfo.email);
      res.writeHead(403, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<html><body><h1>Access Denied</h1><p>Your email (${escapeHtml(userInfo.email)}) is not authorized to use this application.</p><p><a href=\"/\">Return Home</a></p></body></html>`);
      return;
    }

    // Create session
    const sessionId = generateSessionId();
    const sessionData = {
      user: {
        email: userInfo.email,
        name: userInfo.name || userInfo.email,
        sub: userInfo.sub || null,
      },
      createdAt: Date.now(),
    };

    const saved = await saveSession(sessionId, sessionData);
    if (!saved) {
      res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<html><body><h1>Server Error</h1><p>Failed to create session. Redis may be unavailable.</p><p><a href=\"/\">Return Home</a></p></body></html>');
      return;
    }

    setSessionCookie(res, sessionId);
    res.writeHead(302, { Location: '/' });
    res.end();
    console.log(`[Auth] User logged in: ${userInfo.email}`);

  } catch (err) {
    console.error('[OAuth] Callback processing error:', err.message);
    res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<html><body><h1>Authentication Error</h1><p>An unexpected error occurred during authentication.</p><p><a href=\"/\">Return Home</a></p></body></html>`);
  }
}

async function handleAuthLogout(req, res) {
  const sessionId = getSessionIdFromRequest(req);
  if (sessionId) {
    await destroySession(sessionId);
    console.log('[Auth] Session destroyed');
  }
  clearSessionCookie(res);
  res.writeHead(302, { Location: '/' });
  res.end();
}

async function handleApiUser(req, res) {
  const user = await getAuthenticatedUser(req);
  if (!user) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not authenticated' }));
    return;
  }
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ user }));
}

// --- End Route handlers ---

// --- MySQL CRUD helpers ---

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      try { resolve(JSON.parse(body)); }
      catch (e) { resolve(null); }
    });
    req.on('error', reject);
  });
}

function jsonResponse(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

// --- Cards API handlers ---

async function handleGetCards(req, res) {
  try {
    const [rows] = await db.execute(
      'SELECT * FROM cards WHERE user_email = ?',
      [req.user.email]
    );
    const cards = rows.map(r => ({
      id: r.id,
      word: r.word,
      phonetic: r.phonetic,
      definitions: typeof r.definitions === 'string' ? JSON.parse(r.definitions) : r.definitions,
      examples: typeof r.examples === 'string' ? JSON.parse(r.examples) : r.examples,
      etymology: r.etymology,
      box: r.box,
      nextReviewDate: Number(r.nextReviewDate),
      addedDate: Number(r.addedDate),
    }));
    jsonResponse(res, 200, cards);
  } catch (err) {
    console.error('[Cards] GET error:', err.message);
    jsonResponse(res, 500, { error: 'Failed to fetch cards' });
  }
}

async function handlePostCard(req, res) {
  try {
    const card = await readBody(req);
    if (!card || !card.id || !card.word) {
      jsonResponse(res, 400, { error: 'Missing card data' });
      return;
    }
    await db.execute(
      `INSERT INTO cards (id, user_email, word, phonetic, definitions, examples, etymology, box, nextReviewDate, addedDate)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         word = VALUES(word), phonetic = VALUES(phonetic), definitions = VALUES(definitions),
         examples = VALUES(examples), etymology = VALUES(etymology), box = VALUES(box),
         nextReviewDate = VALUES(nextReviewDate), addedDate = VALUES(addedDate)`,
      [
        card.id,
        req.user.email,
        card.word,
        card.phonetic || '',
        JSON.stringify(card.definitions || []),
        JSON.stringify(card.examples || []),
        card.etymology || null,
        card.box || 1,
        card.nextReviewDate || 0,
        card.addedDate || Date.now(),
      ]
    );
    jsonResponse(res, 200, { ok: true });
  } catch (err) {
    console.error('[Cards] POST error:', err.message);
    jsonResponse(res, 500, { error: 'Failed to save card' });
  }
}

async function handleDeleteCard(req, res, cardId) {
  try {
    await db.execute(
      'DELETE FROM cards WHERE id = ? AND user_email = ?',
      [cardId, req.user.email]
    );
    jsonResponse(res, 200, { ok: true });
  } catch (err) {
    console.error('[Cards] DELETE error:', err.message);
    jsonResponse(res, 500, { error: 'Failed to delete card' });
  }
}

// --- Mastered API handlers ---

async function handleGetMastered(req, res) {
  try {
    const [rows] = await db.execute(
      'SELECT * FROM mastered WHERE user_email = ?',
      [req.user.email]
    );
    const mastered = rows.map(r => ({
      id: r.id,
      word: r.word,
      phonetic: r.phonetic,
      definitions: typeof r.definitions === 'string' ? JSON.parse(r.definitions) : r.definitions,
      examples: typeof r.examples === 'string' ? JSON.parse(r.examples) : r.examples,
      etymology: r.etymology,
      masteredDate: Number(r.masteredDate),
    }));
    jsonResponse(res, 200, mastered);
  } catch (err) {
    console.error('[Mastered] GET error:', err.message);
    jsonResponse(res, 500, { error: 'Failed to fetch mastered' });
  }
}

async function handlePostMastered(req, res) {
  try {
    const card = await readBody(req);
    if (!card || !card.id || !card.word) {
      jsonResponse(res, 400, { error: 'Missing mastered card data' });
      return;
    }
    await db.execute(
      `INSERT INTO mastered (id, user_email, word, phonetic, definitions, examples, etymology, masteredDate)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         word = VALUES(word), phonetic = VALUES(phonetic), definitions = VALUES(definitions),
         examples = VALUES(examples), etymology = VALUES(etymology), masteredDate = VALUES(masteredDate)`,
      [
        card.id,
        req.user.email,
        card.word,
        card.phonetic || '',
        JSON.stringify(card.definitions || []),
        JSON.stringify(card.examples || []),
        card.etymology || null,
        card.masteredDate || Date.now(),
      ]
    );
    jsonResponse(res, 200, { ok: true });
  } catch (err) {
    console.error('[Mastered] POST error:', err.message);
    jsonResponse(res, 500, { error: 'Failed to save mastered card' });
  }
}

// --- History API handlers ---

async function handleGetHistory(req, res) {
  try {
    const [rows] = await db.execute(
      'SELECT word, timestamp FROM history WHERE user_email = ? ORDER BY timestamp DESC LIMIT ?',
      [req.user.email, MAX_HISTORY]
    );
    const history = rows.map(r => r.word);
    jsonResponse(res, 200, history);
  } catch (err) {
    console.error('[History] GET error:', err.message);
    jsonResponse(res, 500, { error: 'Failed to fetch history' });
  }
}

async function handlePostHistory(req, res) {
  try {
    const data = await readBody(req);
    if (!data || !data.word) {
      jsonResponse(res, 400, { error: 'Missing word' });
      return;
    }
    // Remove existing entry for this word (case-insensitive)
    await db.execute(
      'DELETE FROM history WHERE user_email = ? AND LOWER(word) = LOWER(?)',
      [req.user.email, data.word]
    );
    // Insert new entry
    await db.execute(
      'INSERT INTO history (user_email, word, timestamp) VALUES (?, ?, ?)',
      [req.user.email, data.word, Date.now()]
    );
    // Prune old entries beyond MAX_HISTORY
    await db.execute(
      `DELETE h FROM history h
       LEFT JOIN (
         SELECT id FROM history WHERE user_email = ? ORDER BY timestamp DESC LIMIT ?
       ) keep ON h.id = keep.id
       WHERE h.user_email = ? AND keep.id IS NULL`,
      [req.user.email, MAX_HISTORY, req.user.email]
    );
    jsonResponse(res, 200, { ok: true });
  } catch (err) {
    console.error('[History] POST error:', err.message);
    jsonResponse(res, 500, { error: 'Failed to save history' });
  }
}

// --- End MySQL CRUD ---

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function serveStatic(req, res) {
  let filePath = req.url === '/' ? '/index.html' : req.url;
  filePath = filePath.split('?')[0];
  const fullPath = path.join(__dirname, filePath);
  const ext = path.extname(fullPath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(fullPath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found');
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
}

function handleLookup(req, res) {
  let body = '';
  req.on('data', (chunk) => { body += chunk; });
  req.on('end', async () => {
    let word;
    try {
      const parsed = JSON.parse(body);
      word = parsed.word;
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid JSON body' }));
      return;
    }

    if (!word || !word.trim()) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing word parameter' }));
      return;
    }

    const trimmed = word.trim().toLowerCase();
    const cacheKey = `dict:${trimmed}`;

    // --- Check Redis cache ---
    if (redisReady) {
      try {
        const cached = await redisClient.get(cacheKey);
        if (cached) {
          console.log(`[Cache] HIT for \"${trimmed}\"`);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(cached);
          return;
        }
        console.log(`[Cache] MISS for \"${trimmed}\"`);
      } catch (err) {
        console.error('[Cache] Read error:', err.message);
        // Fall through to AI API
      }
    }
    // --- End cache check ---

    const prompt = `You are an English-Chinese dictionary assistant. For the English word or phrase \"${trimmed}\", provide a detailed dictionary entry. You MUST respond with valid JSON only, no markdown, no code fences, no extra text. The JSON format:
{
  \"word\": \"${trimmed}\",
  \"phonetic\": \"IPA phonetic notation, e.g. /ɪɡˈzæmpəl/\",
  \"definitions\": [
    { \"pos\": \"part of speech in English, e.g. noun, verb\", \"meaning\": \"Chinese definition\" }
  ],
  \"examples\": [
    { \"en\": \"English example sentence\", \"zh\": \"Chinese translation\" }
  ],
  \"etymology\": \"Brief etymology or word origin (in Chinese), or null if not interesting\"
}

Provide 1-3 definitions and 2-3 example sentences. Be accurate and concise.`;

    const aiPayload = JSON.stringify({
      model: AI_MODEL,
      messages: [
        { role: 'system', content: 'You are a precise English-Chinese dictionary. Always respond with valid JSON only.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.3,
      max_tokens: 1024,
    });

    const url = new URL(AI_API_URL);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${AI_API_KEY}`,
        'Content-Length': Buffer.byteLength(aiPayload),
      },
    };

    const proxyReq = http.request(options, (proxyRes) => {
      let responseData = '';
      proxyRes.on('data', (chunk) => { responseData += chunk; });
      proxyRes.on('end', () => {
        try {
          const aiResponse = JSON.parse(responseData);
          const content = aiResponse.choices?.[0]?.message?.content;
          if (!content) {
            res.writeHead(502, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'AI API returned empty response' }));
            return;
          }

          let cleaned = content.trim();
          if (cleaned.startsWith('```')) {
            cleaned = cleaned.replace(/^```(?:json)?\\s*\\n?/, '').replace(/\\n?```\\s*$/, '');
          }

          let dictEntry;
          try {
            dictEntry = JSON.parse(cleaned);
          } catch (parseErr) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ word: trimmed, raw: cleaned }));
            return;
          }

          const responseJson = JSON.stringify(dictEntry);

          // --- Store in Redis cache ---
          if (redisReady) {
            redisClient.setEx(cacheKey, REDIS_CACHE_TTL, responseJson).catch((err) => {
              console.error('[Cache] Write error:', err.message);
            });
          }
          // --- End cache store ---

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(responseJson);
        } catch (e) {
          res.writeHead(502, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Failed to parse AI API response' }));
        }
      });
    });

    proxyReq.on('error', (e) => {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'AI API connection failed: ' + e.message }));
    });

    proxyReq.write(aiPayload);
    proxyReq.end();
  });
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const urlPath = req.url.split('?')[0];

  // --- Auth routes (no auth required) ---
  if (req.method === 'GET' && urlPath === '/auth/login') {
    handleAuthLogin(req, res);
    return;
  }

  if (req.method === 'GET' && urlPath === '/auth/callback') {
    await handleAuthCallback(req, res);
    return;
  }

  if (req.method === 'GET' && urlPath === '/auth/logout') {
    await handleAuthLogout(req, res);
    return;
  }

  // --- API routes (auth required) ---
  if (req.method === 'GET' && urlPath === '/api/user') {
    await handleApiUser(req, res);
    return;
  }

  if (req.method === 'POST' && urlPath === '/api/lookup') {
    const blocked = await requireAuth(req, res);
    if (blocked) return;
    handleLookup(req, res);
    return;
  }

  // --- Cards CRUD routes ---
  if (req.method === 'GET' && urlPath === '/api/cards') {
    const blocked = await requireAuth(req, res);
    if (blocked) return;
    await handleGetCards(req, res);
    return;
  }

  if (req.method === 'POST' && urlPath === '/api/cards') {
    const blocked = await requireAuth(req, res);
    if (blocked) return;
    await handlePostCard(req, res);
    return;
  }

  if (req.method === 'DELETE' && urlPath.startsWith('/api/cards/')) {
    const blocked = await requireAuth(req, res);
    if (blocked) return;
    const cardId = urlPath.split('/api/cards/')[1];
    await handleDeleteCard(req, res, cardId);
    return;
  }

  // --- Mastered routes ---
  if (req.method === 'GET' && urlPath === '/api/mastered') {
    const blocked = await requireAuth(req, res);
    if (blocked) return;
    await handleGetMastered(req, res);
    return;
  }

  if (req.method === 'POST' && urlPath === '/api/mastered') {
    const blocked = await requireAuth(req, res);
    if (blocked) return;
    await handlePostMastered(req, res);
    return;
  }

  // --- History routes ---
  if (req.method === 'GET' && urlPath === '/api/history') {
    const blocked = await requireAuth(req, res);
    if (blocked) return;
    await handleGetHistory(req, res);
    return;
  }

  if (req.method === 'POST' && urlPath === '/api/history') {
    const blocked = await requireAuth(req, res);
    if (blocked) return;
    await handlePostHistory(req, res);
    return;
  }

  if (urlPath.startsWith('/api/')) {
    const blocked = await requireAuth(req, res);
    if (blocked) return;
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
    return;
  }

  serveStatic(req, res);
});

server.listen(PORT, () => {
  console.log('englishd server running on http://localhost:' + PORT);
});
