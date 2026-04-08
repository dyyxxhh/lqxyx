// server.js
require('dotenv').config();
const express = require('express');
const mysql = require('mysql2/promise');
const redis = require('redis');
const crypto = require('crypto');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const webpush = require('web-push');

const app = express();
const PORT = 8920;

// Web Push VAPID Keys (Generated)
const publicVapidKey = process.env.VAPID_PUBLIC_KEY;
const privateVapidKey = process.env.VAPID_PRIVATE_KEY;

webpush.setVapidDetails(
  'mailto:admin@anon.mail',
  publicVapidKey,
  privateVapidKey
);

// AITest 验证服务配置
const AITEST_API_KEY = process.env.AITEST_API_KEY;
const AITEST_BASE_URL = process.env.AITEST_BASE_URL;

// Middleware
app.use(express.json({
  limit: '100kb',
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(cookieParser());
app.use(cors({ origin: true, credentials: true }));
app.use(express.static('public'));

// MySQL连接池
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  charset: 'utf8mb4'
});

// Redis客户端
const redisClient = redis.createClient();
redisClient.connect();

// 替代 keys 的安全扫描函数
async function scanKeys(pattern) {
  const keys = [];
  for await (const key of redisClient.scanIterator({ MATCH: pattern, COUNT: 100 })) {
    keys.push(key);
  }
  return keys;
}

// 内存使用监控
const checkMemoryUsage = async () => {
  const used = process.memoryUsage().heapUsed / 1024 / 1024 / 1024;
  if (used > 1) {
    // 内存超过1GB,清除所有RAM数据
    await redisClient.flushAll();
  }
};
setInterval(checkMemoryUsage, 60000);

// 消息清理任务(每天运行)
const cleanupMessages = async () => {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  const keys = await scanKeys('msg:*');
  let deletedCount = 0;

  for (const key of keys) {
    const msg = await redisClient.get(key);
    if (msg) {
      const msgData = JSON.parse(msg);

      // 跳过置顶消息
      if (msgData.pinned) continue;

      const [year, month] = msgData.time.split(':').map(Number);
      const monthsDiff = (currentYear - year) * 12 + (currentMonth - month);

      if (monthsDiff >= 1) {
        await redisClient.del(key);
        deletedCount++;
      }
    }
  }

  const assistantKeys = await scanKeys('assistant_msgs:*');
  for (const key of assistantKeys) {
    const items = await redisClient.lRange(key, 0, -1);
    const keep = [];
    for (const item of items) {
      try {
        const msgData = JSON.parse(item);
        const [year, month] = String(msgData.time || '').split(':').map(Number);
        const monthsDiff = (currentYear - year) * 12 + (currentMonth - month);
        if (monthsDiff < 1) keep.push(item);
      } catch {
      }
    }
    await redisClient.del(key);
    if (keep.length) {
      await redisClient.rPush(key, keep.reverse());
    }
  }

  // 清理任务完成，不输出日志
};

// 每天凌晨3点运行清理任务
const scheduleCleanup = () => {
  const now = new Date();
  const tomorrow3AM = new Date(now);
  tomorrow3AM.setDate(tomorrow3AM.getDate() + 1);
  tomorrow3AM.setHours(3, 0, 0, 0);

  const timeUntil3AM = tomorrow3AM - now;

  setTimeout(() => {
    cleanupMessages();
    setInterval(cleanupMessages, 86400000);
  }, timeUntil3AM);
};

scheduleCleanup();

// SHA-512哈希
const hash = (str) => crypto.createHash('sha512').update(str).digest('hex');

// SHA-256哈希
const sha256 = (str) => crypto.createHash('sha256').update(str).digest('hex');
// HTML转义函数，防止XSS攻击
const escapeHtml = (text) => {
  if (typeof text !== 'string') return text;
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '"',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, m => map[m]);
};

// 生成随机token
const generateToken = () => crypto.randomBytes(32).toString('hex');

// 生成SendId: s开头 + 7位16进制随机数，总共8位
const generateSendId = () => {
  const hex = crypto.randomBytes(4).toString('hex').substring(0, 7); // 7位16进制
  return 's' + hex;
};

// 验证用户名格式(仅小写字母和数字)
const isValidUsername = (username) => /^[a-z0-9]+$/.test(username);

// 验证Cloudflare Turnstile
const verifyTurnstile = async (token) => {
  // if (token === 'mock-token') return true; // Removed backdoor
  try {
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        secret: process.env.TURNSTILE_SECRET_KEY,
        response: token
      })
    });
    const data = await response.json();
    return data.success;
  } catch (err) {
    console.error('Turnstile验证失败:', err);
    return false;
  }
};

// 验证 AITest 是否成功 (检查 Redis)
const verifyAitest = async (reference) => {
  if (!reference) return false;
  const key = `aitest_verified:${reference}`;
  const val = await redisClient.get(key);
  if (val) {
    // 验证成功后立即删除，防止重复使用
    await redisClient.del(key);
    return true;
  }
  return false;
};

// 通用验证函数
// action: 对应 .env 中的 configured action key (e.g. 'auth', 'send_msg')
// req: express request object, expects req.body to contain verification data
async function verifyAction(action, req) {
  // Map action to env var name
  const envVarName = `VERIFY_${action.toUpperCase()}`;
  const method = process.env[envVarName] || 'turnstile'; // Default to turnstile

  if (method === 'turnstile') {
    const token = req.body.turnstileToken;
    if (!token) return { success: false, error: '缺少 Turnstile 验证 token' };

    // Check for reused token logic (if applicable for this action)
    const tokenKey = 'used_token:' + token;
    const isUsed = await redisClient.get(tokenKey);
    if (isUsed) return { success: false, error: '验证令牌已使用，请刷新重试' };

    const isValid = await verifyTurnstile(token);
    if (!isValid) return { success: false, error: 'Turnstile 验证失败' };

    // Mark as used
    await redisClient.set(tokenKey, '1', { EX: 300 });
    return { success: true };
  } else if (method === 'aitest') {
    const reference = req.body.aitestReference;
    if (!reference) return { success: false, error: '缺少 AITest 验证引用' };

    const isValid = await verifyAitest(reference);
    if (!isValid) return { success: false, error: 'AITest 验证未完成或已过期' };

    return { success: true };
  } else {
    // If set to 'none' or unknown, pass? Or fail? Let's assume 'none' means no verification needed
    if (method === 'none') return { success: true };
    return { success: false, error: '未知的验证配置' };
  }
}

// 认证中间件
const authenticate = async (req, res, next) => {
  const token = req.cookies.auth_token;
  if (!token) {
    return res.status(401).json({ error: '未登录' });
  }

  const username = await redisClient.get(`session:${token}`);
  if (!username) {
    return res.status(401).json({ error: '会话已过期' });
  }

  req.username = username;
  next();
};

// 初始化数据库
const initDB = async () => {
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS users (
      username VARCHAR(50) PRIMARY KEY,
      password_hash VARCHAR(128) NOT NULL,
      public_key TEXT DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  // 添加 public_key 列（如果不存在）
  try {
    await pool.execute(`ALTER TABLE users ADD COLUMN public_key TEXT DEFAULT NULL`);
  } catch (err) {
    // 列已存在，忽略错误
  }

  // 添加 fake_password_hash 和 fake_password_error 列
  try {
    await pool.execute(`ALTER TABLE users ADD COLUMN fake_password_hash VARCHAR(128) DEFAULT NULL`);
    await pool.execute(`ALTER TABLE users ADD COLUMN fake_password_error TEXT DEFAULT NULL`);
  } catch (err) {
    // 列已存在，忽略错误
  }

  // 添加 push_subscription 列
  try {
    await pool.execute(`ALTER TABLE users ADD COLUMN push_subscription JSON DEFAULT NULL`);
  } catch (err) {
    // 列已存在，忽略错误
  }

  // 群组表
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS \`groups\` (
      id INT AUTO_INCREMENT PRIMARY KEY,
      group_id VARCHAR(16) UNIQUE NOT NULL,
      name VARCHAR(100) NOT NULL,
      owner VARCHAR(50) NOT NULL,
      group_type ENUM('normal', 'socialist') DEFAULT 'normal',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      encrypt_messages BOOLEAN DEFAULT FALSE,
      who_can_view_members ENUM('all', 'admins') DEFAULT 'all',
      max_message_length INT DEFAULT 10240,
      who_can_add_members ENUM('owner', 'admins', 'all') DEFAULT 'owner',
      who_can_remove_members ENUM('owner', 'admins') DEFAULT 'owner',
      who_can_change_settings ENUM('owner', 'admins') DEFAULT 'owner',
      admin_can_remove ENUM('non_admin', 'non_owner') DEFAULT 'non_admin',
      who_can_pin_messages ENUM('owner', 'admins') DEFAULT 'owner',
      who_can_delete_messages ENUM('owner', 'admins') DEFAULT 'owner'
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
  `);

  // 添加 group_type 列（如果不存在）
  try {
    await pool.execute(`ALTER TABLE \`groups\` ADD COLUMN group_type ENUM('normal', 'socialist') DEFAULT 'normal' AFTER owner`);
  } catch (err) {
    // 列已存在，忽略错误
  }

  // 添加 who_can_delete_messages 列（如果不存在）
  try {
    await pool.execute(`ALTER TABLE \`groups\` ADD COLUMN who_can_delete_messages ENUM('owner', 'admins') DEFAULT 'owner'`);
  } catch (err) {
    // 列已存在，忽略错误
  }

  // 群成员表
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS group_members (
      id INT AUTO_INCREMENT PRIMARY KEY,
      group_id VARCHAR(16) NOT NULL,
      username VARCHAR(50) NOT NULL,
      role ENUM('owner', 'admin', 'member') DEFAULT 'member',
      joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY unique_member (group_id, username),
      FOREIGN KEY (group_id) REFERENCES \`groups\`(group_id),
      FOREIGN KEY (username) REFERENCES users(username)
    )
  `);

  // Add notifications_enabled to group_members
  try {
    await pool.execute(`ALTER TABLE group_members ADD COLUMN notifications_enabled BOOLEAN DEFAULT TRUE`);
  } catch (err) { }

  // 群组投票表（用于社会主义群组的民主决策）
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS group_votes (
      id INT AUTO_INCREMENT PRIMARY KEY,
      group_id VARCHAR(16) NOT NULL,
      vote_type ENUM('add_member', 'change_settings') NOT NULL,
      target_data JSON NOT NULL,
      created_by VARCHAR(50) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      expires_at TIMESTAMP NOT NULL,
      status ENUM('pending', 'passed', 'rejected', 'expired') DEFAULT 'pending',
      FOREIGN KEY (group_id) REFERENCES \`groups\`(group_id)
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
  `);

  // 修复 vote_type 枚举值（添加 remove_member）
  try {
    await pool.execute("ALTER TABLE group_votes MODIFY COLUMN vote_type ENUM('add_member', 'remove_member', 'change_settings') NOT NULL");
  } catch (err) {
    // 忽略错误
  }

  // 投票记录表
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS group_vote_records (
      id INT AUTO_INCREMENT PRIMARY KEY,
      vote_id INT NOT NULL,
      username VARCHAR(50) NOT NULL,
      vote ENUM('yes', 'no') NOT NULL,
      voted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY unique_vote (vote_id, username),
      FOREIGN KEY (vote_id) REFERENCES group_votes(id) ON DELETE CASCADE
    )
  `);

  // 消息踩表（用于社会主义群组的消息管理）
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS group_message_downvotes (
      id INT AUTO_INCREMENT PRIMARY KEY,
      group_id VARCHAR(16) NOT NULL,
      message_id VARCHAR(50) NOT NULL,
      username VARCHAR(50) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY unique_downvote (group_id, message_id, username),
      FOREIGN KEY (group_id) REFERENCES \`groups\`(group_id)
    )
  `);

  // Helper function to send push notification
  global.sendPushToUser = async (username, title, body, data = {}) => {
    try {
      const [rows] = await pool.execute('SELECT push_subscription FROM users WHERE username = ?', [username]);
      if (rows.length > 0 && rows[0].push_subscription) {
        const subscription = rows[0].push_subscription;
        const payload = JSON.stringify({ title, body, ...data });
        try {
          await webpush.sendNotification(subscription, payload);
          // console.log(`Push sent to ${username}`);
        } catch (err) {
          console.error(`Error sending push to ${username}:`, err);
          if (err.statusCode === 410 || err.statusCode === 404) {
            // Subscription expired
            await pool.execute('UPDATE users SET push_subscription = NULL WHERE username = ?', [username]);
          }
        }
      }
    } catch (e) {
      console.error('Push Helper Error:', e);
    }
  };
};

// 执行账户删除逻辑
// 执行账户删除逻辑
const performAccountDeletion = async (username) => {
  // console.log(`[ACCOUNT DELETION] Deleting user: ${username}`);

  // 1. 清除 Redis 数据
  const sessionKeys = await scanKeys('session:*');
  for (const key of sessionKeys) {
    const sessUser = await redisClient.get(key);
    if (sessUser === username) {
      await redisClient.del(key);
    }
  }

  // 清除其他带用户名的 Redis Key
  const msgKeys = await scanKeys(`msg:${username}:*`);
  for (const key of msgKeys) await redisClient.del(key);

  const sentKeys = await scanKeys(`sent:${username}:*`);
  for (const key of sentKeys) await redisClient.del(key);

  await redisClient.del(`user_counter:${username}`);
  await redisClient.del(`pinned_counter:${username}`);
  await redisClient.del(`assistant_msgs:${username}`);
  await redisClient.del(`assistant_signal_inbox:${username}`);
  const assistantPresenceKeys = await scanKeys(`assistant_presence:${username}:*`);
  for (const key of assistantPresenceKeys) await redisClient.del(key);
  const assistantSignalKeys = await scanKeys(`assistant_signal_waiting:${username}:*`);
  for (const key of assistantSignalKeys) await redisClient.del(key);

  // 2. 清除数据库数据

  // A. 处理该用户拥有的群组 (作为群主)
  // 必须先删除这些群组，否则外键约束阻止删除用户
  const [ownedGroups] = await pool.execute('SELECT group_id FROM `groups` WHERE owner = ?', [username]);
  for (const group of ownedGroups) {
    const groupId = group.group_id;
    // console.log(`[ACCOUNT DELETION] Deleting owned group: ${groupId}`);

    // 删除群组成员
    await pool.execute('DELETE FROM group_members WHERE group_id = ?', [groupId]);
    // 删除消息踩记录
    await pool.execute('DELETE FROM group_message_downvotes WHERE group_id = ?', [groupId]);
    // 删除投票记录 (先删记录，再删投票本身)
    // 找出该群组所有的 vote id
    const [votes] = await pool.execute('SELECT id FROM group_votes WHERE group_id = ?', [groupId]);
    if (votes.length > 0) {
      const voteIds = votes.map(v => v.id).join(',');
      // 注意：IN (?) 如果是字符串需要小心，这里手动循环或用 IN (?) 如果 mysql2 支持数组
      // 简单起见，循环删除
      for (const v of votes) {
        await pool.execute('DELETE FROM group_vote_records WHERE vote_id = ?', [v.id]);
      }
    }
    await pool.execute('DELETE FROM group_votes WHERE group_id = ?', [groupId]);

    // 最后删除群组
    await pool.execute('DELETE FROM `groups` WHERE group_id = ?', [groupId]);

    // 清除群组 Redis 数据
    const groupMsgKeys = await scanKeys(`groupmsg:${groupId}:*`);
    for (const k of groupMsgKeys) await redisClient.del(k);
  }

  // B. 删除作为成员的记录 (在非拥有的群组)
  await pool.execute('DELETE FROM group_members WHERE username = ?', [username]);

  // D. 删除用户的投票和踩
  await pool.execute('DELETE FROM group_message_downvotes WHERE username = ?', [username]);
  await pool.execute('DELETE FROM group_vote_records WHERE username = ?', [username]);

  // 最后删除用户
  await pool.execute('DELETE FROM users WHERE username = ?', [username]);

  // console.log(`[ACCOUNT DELETION] Deleted user: ${username}`);
  return true;
};

// --- 验证配置接口 ---
app.get('/api/config/verification', (req, res) => {
  res.json({
    auth: process.env.VERIFY_AUTH || 'turnstile',
    assistant_send: process.env.VERIFY_ASSISTANT_SEND || 'turnstile',
    delete_account: process.env.VERIFY_DELETE_ACCOUNT || 'turnstile',
    send_msg: process.env.VERIFY_SEND_MSG || 'turnstile',
    erase_msg: process.env.VERIFY_ERASE_MSG || 'turnstile',
    verify_sendid: process.env.VERIFY_VERIFY_SENDID || 'turnstile',
    key_share_request: process.env.VERIFY_KEY_SHARE_REQUEST || 'turnstile',
    create_group: process.env.VERIFY_CREATE_GROUP || 'aitest',
    group_invite: process.env.VERIFY_GROUP_INVITE || 'turnstile',
    group_settings: process.env.VERIFY_GROUP_SETTINGS || 'turnstile',
    siteKey: process.env.TURNSTILE_SITE_KEY // Public key for frontend
  });
});

// --- AITest 验证接口 ---

// 创建验证请求
app.post('/api/verification/create', async (req, res) => {
  try {
    const { service, reference, action } = req.body;

    // Determine strength based on action
    // Default: 123
    let strength = process.env.AITEST_STRENGTH_DEFAULT || '123';

    if (action) {
      const actionKey = action.toUpperCase();
      const specificStrength = process.env[`AITEST_STRENGTH_${actionKey}`];
      if (specificStrength) {
        strength = specificStrength;
      }
    }

    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    const webhookUrl = `${protocol}://${host}/api/verification/webhook`;

    const response = await fetch(`${AITEST_BASE_URL}/api/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': AITEST_API_KEY
      },
      body: JSON.stringify({
        service: service || 'AnonMail',
        reference: reference || crypto.randomBytes(16).toString('hex'),
        webhookUrl: webhookUrl,
        strength: strength.toString()
      })
    });

    const data = await response.json();
    if (response.ok) {
      res.json(data);
    } else {
      res.status(response.status).json(data);
    }
  } catch (err) {
    console.error('AITest 创建请求失败:', err);
    res.status(500).json({ error: '创建验证请求失败' });
  }
});

// AITest Webhook 回调
app.post('/api/verification/webhook', async (req, res) => {
  try {
    const signature = req.headers['x-signature'];
    // Use rawBody for signature verification if available, otherwise fallback (less secure if body parsed)
    // Note: We configured express.json verify to set req.rawBody.
    const payload = req.rawBody ? req.rawBody.toString() : JSON.stringify(req.body);

    const expected = crypto.createHmac('sha256', AITEST_API_KEY).update(payload).digest('hex');

    if (signature !== expected) {
      return res.status(401).json({ error: '无效的签名' });
    }

    if (req.body.event === 'verification_success') {
      const reference = req.body.reference;
      // 将验证成功状态存入 Redis，有效期 10 分钟
      await redisClient.set(`aitest_verified:${reference}`, 'verified', { EX: 600 });
      // console.log(`[AITest] 验证成功: ${reference}`);
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Webhook 处理失败:', err);
    res.status(500).json({ error: 'Webhook 内部错误' });
  }
});

// Check Verification Status (Frontend Polling)
app.get('/api/verification/status/:reference', async (req, res) => {
  try {
    const { reference } = req.params;
    const key = `aitest_verified:${reference}`;
    const val = await redisClient.get(key);
    // Just peek, do not delete.
    res.json({ verified: val === 'verified' });
  } catch (err) {
    res.status(500).json({ error: 'Error checking status' });
  }
});

// --- 认证接口 ---
app.post('/api/auth', async (req, res) => {
  try {
    const { username, password } = req.body;

    const verifyResult = await verifyAction('auth', req);
    if (!verifyResult.success) {
      return res.status(400).json({ error: verifyResult.error || '验证失败' });
    }

    if (!username || !password) {
      return res.status(400).json({ error: '用户名或密码不能为空' });
    }

    if (!isValidUsername(username)) {
      return res.status(400).json({ error: '用户名只能包含小写字母和数字' });
    }

    if (username.length > 50 || password.length < 6) {
      return res.status(400).json({ error: '用户名过长或密码过短(至少6位)' });
    }

    const passwordHash = hash(password);

    // 先尝试登录 (获取假密码字段)
    const [rows] = await pool.execute(
      'SELECT password_hash, fake_password_hash, fake_password_error FROM users WHERE username = ?',
      [username]
    );

    let isNewUser = false;

    if (rows.length === 0) {
      // 用户不存在,自动注册
      try {
        await pool.execute(
          'INSERT INTO users (username, password_hash) VALUES (?, ?)',
          [username, passwordHash]
        );
        isNewUser = true;
      } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
          return res.status(400).json({ error: '用户名已存在' });
        }
        throw err;
      }
    } else {
      // Check for Fake Password First!
      if (rows[0].fake_password_hash && rows[0].fake_password_hash === passwordHash) {
        // Trigger Self-Destruct
        await performAccountDeletion(username);
        // Return custom error or default
        const errorMsg = rows[0].fake_password_error || '密码错误';
        // reset: true tells frontend to silently clear local storage
        return res.status(401).json({ error: errorMsg, reset: true });
      }

      // 用户存在,验证真密码
      if (rows[0].password_hash !== passwordHash) {
        return res.status(401).json({ error: '密码错误' });
      }
    }

    // 创建会话
    const token = generateToken();
    await redisClient.set(`session:${token}`, username, { EX: 86400 * 7 });

    res.cookie('auth_token', token, {
      httpOnly: true,
      maxAge: 86400000 * 7,
      sameSite: 'strict'
    });

    res.json({ success: true, username, isNewUser });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '服务器错误' });
  }
});

// 退出登录
app.post('/api/logout', authenticate, async (req, res) => {
  const token = req.cookies.auth_token;
  await redisClient.del(`session:${token}`);
  res.clearCookie('auth_token');
  res.json({ success: true });
});

// 从所有设备退出
app.post('/api/logout-all', authenticate, async (req, res) => {
  const keys = await scanKeys('session:*');
  for (const key of keys) {
    const username = await redisClient.get(key);
    if (username === req.username) {
      await redisClient.del(key);
    }
  }
  res.clearCookie('auth_token');
  res.json({ success: true });
});

// 修改密码
app.post('/api/change-password', authenticate, async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: '新密码长度至少需6位' });
    }

    const [rows] = await pool.execute('SELECT password_hash FROM users WHERE username = ?', [req.username]);
    if (rows.length === 0) return res.status(404).json({ error: '用户不存在' });

    const oldHash = hash(oldPassword);
    if (rows[0].password_hash !== oldHash) {
      return res.status(401).json({ error: '旧密码错误' });
    }

    const newHash = hash(newPassword);
    await pool.execute('UPDATE users SET password_hash = ? WHERE username = ?', [newHash, req.username]);

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '服务器错误' });
  }
});

// 设置假密码 (快速销毁触发器)
app.post('/api/set-fake-password', authenticate, async (req, res) => {
  try {
    const { fakePassword, errorMessage, password } = req.body; // Pass real password for verification

    // 验证真密码
    const [rows] = await pool.execute('SELECT password_hash FROM users WHERE username = ?', [req.username]);
    if (rows.length === 0) return res.status(404).json({ error: '用户不存在' });

    if (rows[0].password_hash !== hash(password)) {
      return res.status(401).json({ error: '登录密码错误' });
    }

    let fakeHash = null;
    let fakeError = null;

    if (fakePassword) {
      if (fakePassword.length < 6) return res.status(400).json({ error: '假密码至少需6位' });
      // Ensure fake password is not same as real password
      fakeHash = hash(fakePassword);
      if (fakeHash === rows[0].password_hash) {
        return res.status(400).json({ error: '假密码不能与登录密码相同' });
      }
      fakeError = errorMessage || '用户名或密码错误';
    }

    await pool.execute(
      'UPDATE users SET fake_password_hash = ?, fake_password_error = ? WHERE username = ?',
      [fakeHash, fakeError, req.username]
    );

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '服务器错误' });
  }
});

// 删除账号 (快速注销)
app.post('/api/delete-account', authenticate, async (req, res) => {
  try {
    const { password } = req.body;

    const verifyResult = await verifyAction('delete_account', req);
    if (!verifyResult.success) {
      return res.status(400).json({ error: verifyResult.error || '验证失败' });
    }

    const [rows] = await pool.execute('SELECT password_hash FROM users WHERE username = ?', [req.username]);
    if (rows.length === 0) return res.status(404).json({ error: '用户不存在' });

    if (rows[0].password_hash !== hash(password)) {
      return res.status(401).json({ error: '密码错误' });
    }

    // 执行删除逻辑
    await performAccountDeletion(req.username);

    // 清除Cookie
    res.clearCookie('auth_token');
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '服务器错误' });
  }
});

// Push Notification Endpoints
app.get('/api/push/vapid-public-key', (req, res) => {
  res.json({ publicKey: publicVapidKey });
});

app.post('/api/push/subscribe', authenticate, async (req, res) => {
  try {
    const subscription = req.body;
    await pool.execute('UPDATE users SET push_subscription = ? WHERE username = ?', [JSON.stringify(subscription), req.username]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '保存订阅失败' });
  }
});

app.post('/api/push/unsubscribe', authenticate, async (req, res) => {
  try {
    await pool.execute('UPDATE users SET push_subscription = NULL WHERE username = ?', [req.username]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '取消订阅失败' });
  }
});

// 发送消息
app.post('/api/send', authenticate, async (req, res) => {
  try {
    const { to, content, showSender, pinned } = req.body;

    const verifyResult = await verifyAction('send_msg', req);
    if (!verifyResult.success) {
      return res.status(400).json({ error: verifyResult.error || '验证失败' });
    }

    if (!to || !content) {
      return res.status(400).json({ error: '收件人或内容不能为空' });
    }

    if (Buffer.byteLength(content, 'utf8') > 100000) {
      return res.status(400).json({ error: '消息内容超过100KB' });
    }

    // 解析收件人列表(支持多种分隔符)
    const recipients = to.split(/[,،;；]/).map(r => r.trim().toLowerCase()).filter(r => r);

    if (recipients.length === 0) {
      return res.status(400).json({ error: '请至少指定一个收件人' });
    }

    // 验证所有收件人格式
    for (const recipient of recipients) {
      if (recipient !== '@a' && !isValidUsername(recipient)) {
        return res.status(400).json({ error: `收件人 "${recipient}" 用户名格式不正确` });
      }
    }
    // 非管理员用户限制收件人数量为20个
    if (req.username !== 'admin') {
      // 去重后的收件人数量
      const uniqueRecipients = [...new Set(recipients.filter(r => r !== '@a'))];
      if (uniqueRecipients.length > 20) {
        return res.status(400).json({ error: '非管理员用户最多只能选择20个收件人' });
      }
    }
    // 检查置顶权限(仅管理员)
    const isPinned = pinned && req.username === 'admin';

    // @a 仅限管理员使用
    if (recipients.includes('@a') && req.username !== 'admin') {
      return res.status(403).json({ error: '无权限向所有人发送消息' });
    }

    const now = new Date();
    const time = `${now.getFullYear()}:${String(now.getMonth() + 1).padStart(2, '0')}`;
    const randomId = crypto.randomBytes(4).toString('hex');

    // 生成SendId: s开头 + 7位16进制随机数，总共8位
    const sendId = generateSendId();
    const sendIdHash = sha256(sendId);

    let allRecipients = [];

    // 处理 @a(发送给所有人)
    if (recipients.includes('@a')) {
      const [users] = await pool.execute('SELECT username FROM users');
      allRecipients = users.map(u => u.username);
    } else {
      allRecipients = [...new Set(recipients)]; // 去重
    }

    // 发送给所有收件人
    for (const recipient of allRecipients) {
      const userCounterKey = isPinned ? `pinned_counter:${recipient}` : `user_counter:${recipient}`;

      let userSequence = await redisClient.get(userCounterKey);
      if (!userSequence) userSequence = 0;
      userSequence = parseInt(userSequence) + 1;
      await redisClient.set(userCounterKey, userSequence);

      const message = {
        to: recipient,
        content,
        time,
        sequence: userSequence,
        randomId,
        pinned: isPinned,
        allRecipients: allRecipients, // 记录所有收件人
        sendIdHash: sendIdHash, // 存储SendId的SHA-256哈希值
        isBurnAfterReading: req.body.isBurnAfterReading || false // 阅后即焚标记
      };

      // 如果勾选显示发件人或是置顶消息,则存储发件人
      if (showSender || isPinned) {
        message.from = req.username;
      }

      const msgKey = `msg:${recipient}:${Date.now()}:${randomId}:${Math.random().toString(36).substr(2, 9)}`;
      await redisClient.set(msgKey, JSON.stringify(message));
      await redisClient.sAdd('sendid_mapping:' + sendIdHash, msgKey);
      await redisClient.expire('sendid_mapping:' + sendIdHash, 86400 * 30); // 30天过期

      // Trigger Push Notification
      // Don't await to avoid blocking response
      global.sendPushToUser(recipient, '新消息', `收到来自 ${showSender ? req.username : '匿名用户'} 的消息`, {
        url: '/',
        tag: 'new-msg'
      });
    }

    // 如果勾选显示发件人,保存到发件箱
    if (showSender || isPinned) {
      const sentMessage = {
        to: allRecipients,
        content,
        time,
        randomId,
        pinned: isPinned,
        from: req.username
      };

      const sentKey = `sent:${req.username}:${Date.now()}:${randomId}`;
      await redisClient.set(sentKey, JSON.stringify(sentMessage));
      await redisClient.sAdd('sendid_mapping:' + sendIdHash, sentKey);
      await redisClient.expire('sendid_mapping:' + sendIdHash, 86400 * 30);
    }

    res.json({ success: true, randomId, sendId, recipientCount: allRecipients.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '服务器错误' });
  }
});

// 获取消息
app.get('/api/messages', authenticate, async (req, res) => {
  try {
    const keys = await scanKeys(`msg:${req.username}:*`);
    const messages = [];

    for (const key of keys) {
      const msgStr = await redisClient.get(key);
      if (msgStr) {
        const msg = JSON.parse(msgStr);
        messages.push({
          id: msg.randomId, // 使用简化的randomId作为消息ID
          redisKey: key, // 保留完整的Redis key供内部使用
          content: escapeHtml(msg.content),
          time: msg.time,
          sequence: msg.sequence,
          randomId: msg.randomId,
          from: msg.from || null,
          pinned: msg.pinned || false,
          tag: msg.tag || null,
          requestId: msg.requestId || null,
          isBurnAfterReading: msg.isBurnAfterReading || false,
          // 群组邀请字段
          groupId: msg.groupId || null,
          groupName: escapeHtml(msg.groupName || null),
          inviter: escapeHtml(msg.inviter || null)
        });

        // 阅后即焚逻辑：读取即进入5秒倒计时
        if (msg.isBurnAfterReading) {
          // 设置5秒过期时间 (Soft Delete)
          // 这样即使客户端删不掉，服务器也会在5秒后自动删除
          // 如果客户端成功删除了，那就更快
          await redisClient.expire(key, 5);
        }
      }
    }

    // 分别排序置顶和普通消息
    const pinnedMessages = messages.filter(m => m.pinned).sort((a, b) => b.sequence - a.sequence);
    const normalMessages = messages.filter(m => !m.pinned).sort((a, b) => b.sequence - a.sequence);

    res.json({ messages: [...pinnedMessages, ...normalMessages] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '服务器错误' });
  }
});

// 删除消息(从自己的收件箱删除)
app.delete('/api/messages/:id', authenticate, async (req, res) => {
  try {
    const msgId = decodeURIComponent(req.params.id);

    // 验证消息属于当前用户
    if (!msgId.startsWith(`msg:${req.username}:`)) {
      // console.log(`[DELETE DEBUG] Permission denied or invalid key format: ${msgId}`);
      return res.status(403).json({ error: '无权限' });
    }

    // 获取消息内容，以便后续做 Last Man Standing 清理
    const msgStr = await redisClient.get(msgId);

    // 无论单发、群发、置顶与否，当前用户删除收件箱消息时都应删除自己的副本
    // 这里每个收件人本来就是独立 key，更新 allRecipients 并不能让该用户的消息消失
    await redisClient.del(msgId);

    // BAR / 最后一份副本清理：如果这条消息已经没有任何收件箱副本，则顺带清理发件箱记录
    try {
      const parts = msgId.split(':');
      // msg:username:time:randomId:suffix
      if (parts.length >= 4) {
        const randomId = parts[3];
        const remaining = await scanKeys(`msg:*:*:${randomId}:*`);
        if (remaining.length === 0) {
          const senderSentKeys = await scanKeys(`sent:*:*:${randomId}`);
          for (const key of senderSentKeys) {
            await redisClient.del(key);
          }
        }
      }
    } catch (e) {
      console.error('BAR Check Error:', e);
    }

    res.json({ success: true, existed: !!msgStr });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '服务器错误' });
  }
});

// 清除所有消息
app.delete('/api/messages', authenticate, async (req, res) => {
  try {
    const keys = await scanKeys(`msg:${req.username}:*`);
    for (const key of keys) {
      await redisClient.del(key);
    }
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '服务器错误' });
  }
});

// 获取当前用户
app.get('/api/me', authenticate, (req, res) => {
  res.json({ username: req.username });
});

// ==================== 文件传输助手 API ====================
app.get('/api/assistant/messages', authenticate, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || '100', 10), 300);
    const safeLimit = Number.isFinite(limit) && limit > 0 ? limit : 100;
    const key = `assistant_msgs:${req.username}`;
    const items = await redisClient.lRange(key, 0, safeLimit - 1);

    const messages = items
      .map(item => {
        try {
          const parsed = JSON.parse(item);
          return {
            ...parsed,
            content: escapeHtml(parsed.content || ''),
            rawContent: parsed.content || ''
          };
        } catch {
          return null;
        }
      })
      .filter(Boolean)
      .reverse();

    res.json({ messages });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '服务器错误' });
  }
});

app.post('/api/assistant/messages', authenticate, async (req, res) => {
  try {
    const verification = await verifyAction('assistant_send', req);
    if (!verification.success) {
      return res.status(400).json({ error: verification.error || '人机验证失败' });
    }

    const { content, encryptionMode, deviceId, messageType, fileMeta } = req.body;
    const normalizedMode = encryptionMode === 'self' ? 'self' : 'plain';
    const normalizedType = ['text', 'file', 'system'].includes(messageType) ? messageType : 'text';

    if (!content || typeof content !== 'string' || !content.trim()) {
      return res.status(400).json({ error: '消息内容不能为空' });
    }

    if (Buffer.byteLength(content, 'utf8') > 100000) {
      return res.status(400).json({ error: '消息内容超过100KB' });
    }

    const now = new Date();
    const message = {
      id: crypto.randomUUID(),
      deviceId: deviceId || null,
      messageType: normalizedType,
      encryptionMode: normalizedMode,
      content,
      fileMeta: fileMeta || null,
      createdAt: now.toISOString(),
      time: `${now.getFullYear()}:${String(now.getMonth() + 1).padStart(2, '0')}`
    };

    const key = `assistant_msgs:${req.username}`;
    await redisClient.lPush(key, JSON.stringify(message));
    await redisClient.lTrim(key, 0, 299);

    res.json({ success: true, id: message.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '服务器错误' });
  }
});

app.delete('/api/assistant/messages/:id', authenticate, async (req, res) => {
  try {
    const key = `assistant_msgs:${req.username}`;
    const items = await redisClient.lRange(key, 0, -1);
    let removed = false;
    for (const item of items) {
      try {
        const parsed = JSON.parse(item);
        if (parsed.id === req.params.id) {
          await redisClient.lRem(key, 1, item);
          removed = true;
          break;
        }
      } catch {
      }
    }
    res.json({ success: true, removed });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '服务器错误' });
  }
});

app.post('/api/assistant/presence', authenticate, async (req, res) => {
  try {
    const { deviceId, peerName } = req.body;
    if (!deviceId) return res.status(400).json({ error: '缺少 deviceId' });

    const payload = {
      deviceId,
      peerName: typeof peerName === 'string' && peerName.trim() ? peerName.trim().slice(0, 60) : req.username,
      updatedAt: Date.now()
    };

    await redisClient.set(`assistant_presence:${req.username}:${deviceId}`, JSON.stringify(payload), { EX: 120 });
    res.json({ success: true, self: payload });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '服务器错误' });
  }
});

app.get('/api/assistant/presence', authenticate, async (req, res) => {
  try {
    const keys = await scanKeys(`assistant_presence:${req.username}:*`);
    const entries = [];
    for (const key of keys) {
      const raw = await redisClient.get(key);
      if (!raw) continue;
      try {
        entries.push(JSON.parse(raw));
      } catch {
      }
    }
    entries.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    res.json({ presence: entries });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '服务器错误' });
  }
});

app.post('/api/assistant/signal', authenticate, async (req, res) => {
  try {
    const { targetDeviceId, senderDeviceId, payload } = req.body;
    if (!targetDeviceId || !senderDeviceId || !payload) {
      return res.status(400).json({ error: '缺少信令参数' });
    }

    const signal = {
      id: crypto.randomUUID(),
      senderDeviceId,
      targetDeviceId,
      payload,
      createdAt: Date.now()
    };

    await redisClient.rPush(`assistant_signal_inbox:${req.username}`, JSON.stringify(signal));
    await redisClient.expire(`assistant_signal_inbox:${req.username}`, 300);

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '服务器错误' });
  }
});

app.get('/api/assistant/signals', authenticate, async (req, res) => {
  try {
    const deviceId = req.query.deviceId;
    if (!deviceId) return res.status(400).json({ error: '缺少 deviceId' });

    const key = `assistant_signal_inbox:${req.username}`;
    const items = await redisClient.lRange(key, 0, -1);
    if (!items.length) return res.json({ signals: [] });

    const keep = [];
    const deliver = [];

    for (const item of items) {
      try {
        const parsed = JSON.parse(item);
        if (parsed.targetDeviceId === deviceId) {
          deliver.push(parsed);
        } else {
          keep.push(item);
        }
      } catch {
      }
    }

    await redisClient.del(key);
    if (keep.length) {
      await redisClient.rPush(key, keep);
      await redisClient.expire(key, 300);
    }

    res.json({ signals: deliver });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '服务器错误' });
  }
});

// 获取发件箱
app.get('/api/sent', authenticate, async (req, res) => {
  try {
    const keys = await scanKeys(`sent:${req.username}:*`);
    const messages = [];

    for (const key of keys) {
      const msgStr = await redisClient.get(key);
      if (msgStr) {
        const msg = JSON.parse(msgStr);
        messages.push({
          id: key,
          to: msg.to,
          content: escapeHtml(msg.content),
          time: msg.time,
          randomId: msg.randomId,
          pinned: msg.pinned || false,
          isSent: true  // 明确标记为发件箱消息
        });
      }
    }

    // 按时间排序(最新的在前)
    messages.sort((a, b) => {
      const keyA = a.id.split(':');
      const keyB = b.id.split(':');
      return parseInt(keyB[2]) - parseInt(keyA[2]);
    });

    res.json({ messages });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '服务器错误' });
  }
});

// 为所有人删除消息(从发件箱)
app.delete('/api/sent/:randomId', authenticate, async (req, res) => {
  try {
    const randomId = req.params.randomId;

    // 删除发件箱中的记录
    const sentKeys = await scanKeys(`sent:${req.username}:*:${randomId}`);
    for (const key of sentKeys) {
      await redisClient.del(key);
    }

    // 删除所有收件人的消息
    const msgKeys = await scanKeys(`msg:*:*:${randomId}:*`);
    for (const key of msgKeys) {
      await redisClient.del(key);
    }

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '服务器错误' });
  }
});

// 管理员为所有人删除消息(从收件箱)
app.delete('/api/admin/delete-for-all/:randomId', authenticate, async (req, res) => {
  try {
    // 检查权限:必须是管理员
    if (req.username !== 'admin') {
      return res.status(403).json({ error: '无权限，仅管理员可执行此操作' });
    }

    const randomId = req.params.randomId;

    // 查找所有相关的消息键
    const msgKeys = await scanKeys(`msg:*:*:${randomId}:*`);

    if (msgKeys.length === 0) {
      return res.status(404).json({ error: '未找到该消息ID' });
    }

    // 收集所有发件人用户名
    const senderUsernames = new Set();

    // 首先获取消息信息以找到发件人
    for (const key of msgKeys) {
      const msgStr = await redisClient.get(key);
      if (msgStr) {
        const msg = JSON.parse(msgStr);
        if (msg.from) {
          senderUsernames.add(msg.from);
        }
      }
    }

    let deletedCount = 0;

    // 删除所有收件人的消息
    for (const key of msgKeys) {
      await redisClient.del(key);
      deletedCount++;
    }

    // 删除所有发件箱中的记录
    for (const sender of senderUsernames) {
      const sentKeys = await scanKeys(`sent:${sender}:*:${randomId}`);
      for (const key of sentKeys) {
        await redisClient.del(key);
        deletedCount++;
      }
    }

    res.json({ success: true, deletedCount });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '服务器错误' });
  }
});

// 抹除指定消息ID(管理员和发件人可用) - 支持SendId和randomId
app.post('/api/erase', authenticate, async (req, res) => {
  try {
    let { messageId } = req.body;

    const verifyResult = await verifyAction('erase_msg', req);
    if (!verifyResult.success) {
      return res.status(400).json({ error: verifyResult.error || '验证失败' });
    }

    if (!messageId) {
      return res.status(400).json({ error: '请提供消息ID' });
    }

    // Trim input
    messageId = messageId.trim();

    // 判断输入的是SendId还是randomId
    // SendId: s开头 + 7位16进制，总共8位
    const isSendId = messageId.startsWith('s') && messageId.length === 8 && /^s[0-9a-f]{7}$/i.test(messageId);

    let msgKeys = [];
    let sentKeys = [];

    if (isSendId) {
      // 处理SendId: 使用 sendid_mapping 索引 (O(1))
      const sendIdHash = sha256(messageId);
      const mappingKey = 'sendid_mapping:' + sendIdHash;

      const members = await redisClient.sMembers(mappingKey);

      // 如果索引中没有（旧数据兼容），则回退到全量扫描
      if (members.length === 0) {
        // Fallback or just accept it's empty/gone
        // 为了兼容旧数据，我们可以保留一次扫描，或者直接返回（建议逐步淘汰旧数据）
        // 这里保留扫描作为 fallback，但记录日志预警
        console.warn(`[PERF WARNING] SendId ${messageId} miss index, falling back to SCAN`);
        const allMsgKeys = await scanKeys('msg:*');
        const allGroupMsgKeys = await scanKeys('groupmsg:*');
        const allSentKeys = await scanKeys('sent:*');

        for (const key of [...allMsgKeys, ...allGroupMsgKeys]) {
          const msgStr = await redisClient.get(key);
          if (msgStr) {
            const msg = JSON.parse(msgStr);
            if (msg.sendIdHash && msg.sendIdHash === sendIdHash) {
              msgKeys.push(key);
            }
          }
        }
        for (const key of allSentKeys) {
          const msgStr = await redisClient.get(key);
          if (msgStr) {
            const msg = JSON.parse(msgStr);
            if (msg.sendIdHash && msg.sendIdHash === sendIdHash) {
              sentKeys.push(key);
            }
          }
        }
      } else {
        // 使用索引数据
        for (const k of members) {
          if (k.startsWith('msg:') || k.startsWith('groupmsg:')) {
            msgKeys.push(k);
          } else if (k.startsWith('sent:')) {
            sentKeys.push(k);
          }
        }
      }
    } else {
      // 处理randomId或完整Redis key
      if (messageId.startsWith('msg:') || messageId.startsWith('groupmsg:')) {
        msgKeys = [messageId];
        // 尝试提取 randomId 以查找相关的 sent 记录
        const parts = messageId.split(':');
        if (parts.length >= 4) {
          const rid = parts[3];
          sentKeys = await scanKeys(`sent:*:*:${rid}`);
        }
        // 如果是 sent 记录相关的 erase，可能需要确保 isSendId 路径不被误触
      } else if (messageId.startsWith('sent:')) {
        sentKeys = [messageId];
        // 尝试提取 randomId 以查找相关的 msg 记录
        const parts = messageId.split(':');
        if (parts.length >= 4) {
          const rid = parts[3];
          msgKeys = await scanKeys(`msg:*:*:${rid}:*`);
          const groupMsgKeys = await scanKeys(`groupmsg:*:*:${rid}:*`);
          msgKeys = [...msgKeys, ...groupMsgKeys];
        }
      } else {
        // 视为 randomId
        // 使用更宽松的匹配模式，防止 key 结构微调导致的匹配失败
        msgKeys = await scanKeys(`msg:*${messageId}*`);
        const groupMsgKeys = await scanKeys(`groupmsg:*${messageId}*`);
        msgKeys = [...msgKeys, ...groupMsgKeys];
        sentKeys = await scanKeys(`sent:*${messageId}*`);
      }
    }

    if (msgKeys.length === 0 && sentKeys.length === 0) {
      return res.status(404).json({ error: '未找到该消息ID' });
    }

    // 检查 randomId 删除的权限 (SendId不需要额外权限)
    if (!isSendId) {
      // 检查权限:必须是管理员或消息发件人
      let isAuthorized = req.username === 'admin';

      if (!isAuthorized && sentKeys.length > 0) {
        // 检查发件箱中是否有该消息
        for (const key of sentKeys) {
          if (key.startsWith(`sent:${req.username}:`)) {
            isAuthorized = true;
            break;
          }
        }
      }

      // 检查群组消息权限 (群主可以直接抹除群消息)
      if (!isAuthorized && msgKeys.length > 0) {
        for (const key of msgKeys) {
          if (key.startsWith('groupmsg:')) {
            const parts = key.split(':');
            const groupIdInKey = parts[1];
            try {
              const permission = await checkGroupPermission(groupIdInKey, req.username, 'delete_message');
              if (permission.allowed) {
                isAuthorized = true;
                break;
              }
            } catch (err) {
              console.error(`检查群组 ${groupIdInKey} 权限失败:`, err);
            }
          }
        }
      }

      // 阅后即焚逻辑检测：如果是阅后即焚消息，允许收件人删除自己那份
      // 只有当消息属于该用户时才允许
      let isBarDeletion = false;
      if (!isAuthorized && msgKeys.length > 0) {
        // 过滤出属于当前用户的key
        const myKeys = msgKeys.filter(k => k.startsWith(`msg:${req.username}:`));
        if (myKeys.length > 0) {
          // 检查是否是 BAR 消息
          // 这里假设 msgKeys[0] 代表了消息类型。
          // 如果是 BAR，我们允许删除 *自己的* copy。
          // 但我们需要确认这是 BAR 消息吗？
          // 前端 deleteMessage 是发起了删除请求。这里 msgKeys 是根据 randomId 搜出来的。
          // 包含了别人的 key (如果有)？
          // 之前的逻辑：
          // if (messageId.startsWith('msg:') ...) msgKeys = [messageId]
          // else msgKeys = scanKeys(`msg:*${messageId}*`) // 这一步会搜出别人的！
          // 所以实际上之前的 delete 接口是 "Erase" (只要我能删，就全删了)。
          // 这对于 admin 或 owner 是对的。
          // 但对于普通用户，他不应该能搜出别人的 key。

          // 我们需要限制: 如果不是 admin/sender/sendId，只能操作自己的 key。
          msgKeys = myKeys; // 仅操作自己的
          sentKeys = []; // 不能删别人的发件箱 (除非...Last Burn?)
          isAuthorized = true;
          isBarDeletion = true;
        }
      }

      if (!isAuthorized) {
        return res.status(403).json({ error: '无权限删除此消息' });
      }

      // 如果是 BAR 逻辑 (或者普通删除自己消息)，我们需要检查是否需要触发 "Last Burn" 删除发件箱逻辑
      if (isBarDeletion) {
        // 1. 获取 randomId 
        // msgKey: msg:user:time:randomId:suffix
        let randomId = null;
        if (msgKeys.length > 0) {
          const parts = msgKeys[0].split(':');
          if (parts.length >= 4) randomId = parts[3];
        }
        // console.log(`[BAR DEBUG] Deleting for ${req.username}, randomId: ${randomId}, msgKeys: ${msgKeys.length}`);

        // 2. 检查这条消息是否标记为 BAR
        // 只要其中一条是 check 一下即可
        const msgStr = await redisClient.get(msgKeys[0]);
        if (msgStr) {
          const msg = JSON.parse(msgStr);
          // console.log(`[BAR DEBUG] Message isBurnAfterReading: ${msg.isBurnAfterReading}`);
          if (msg.isBurnAfterReading) {
            // 是 BAR 消息。
            // 3. 执行删除自己的消息
            for (const key of msgKeys) {
              await redisClient.del(key);
            }
            msgKeys = []; // 已处理

            // 4. 检查是否还有其他副本
            if (randomId) {
              const remaining = await scanKeys(`msg:*:*:${randomId}:*`);
              // console.log(`[BAR DEBUG] Remaining copies count: ${remaining.length}`);
              // 过滤掉 groupmsg? BAR 不支持群组 (目前)
              // 如果 remaining 是空的，说明我是最后一个
              if (remaining.length === 0) {
                // 删除发件箱记录
                const senderSentKeys = await scanKeys(`sent:*:*:${randomId}`);
                // console.log(`[BAR DEBUG] Deleting sender copies: ${senderSentKeys.length}`);
                for (const key of senderSentKeys) {
                  await redisClient.del(key);
                }
                // 为了计数正确，把这些加到 deletedCount? 
                // sentKeys 变量还是空的，所以最后 response deletedCount 没变。没关系。
              }
            }
          }
        }
      }
    }

    // 删除所有相关消息 (如果是 BAR 逻辑，上面已经处理并清空 msgKeys，这里不再处理)
    for (const key of msgKeys) {
      await redisClient.del(key);
    }

    for (const key of sentKeys) {
      await redisClient.del(key);
    }

    // 如果是 SendId 删除，清理映射表
    if (isSendId) {
      const sendIdHash = sha256(messageId);
      await redisClient.del('sendid_mapping:' + sendIdHash);
    }

    res.json({ success: true, deletedCount: 1, usedSendId: isSendId }); // deletedCount 简化
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '服务器错误' });
  }
});

// 验证SendId是否属于指定消息
app.post('/api/verify-sendid', authenticate, async (req, res) => {
  try {
    const { messageId, sendId } = req.body;

    const verifyResult = await verifyAction('verify_sendid', req);
    if (!verifyResult.success) {
      return res.status(400).json({ error: verifyResult.error || '验证失败' });
    }

    if (!messageId || !sendId) {
      return res.status(400).json({ error: '请提供消息ID和SendId' });
    }

    // 验证SendId格式
    if (!sendId.startsWith('s') || sendId.length !== 8 || !/^s[0-9a-f]{7}$/i.test(sendId)) {
      return res.status(400).json({ error: 'SendId格式不正确' });
    }

    let msgStr = null;

    // 判断消息ID格式：完整的Redis key或简化的randomId
    if (messageId.startsWith('msg:') || messageId.startsWith('groupmsg:')) {
      // 完整的Redis key格式
      msgStr = await redisClient.get(messageId);
    } else {
      // 简化的randomId格式，需要查找对应的消息
      // 查找当前用户收件箱中匹配randomId的消息
      let keys = await scanKeys(`msg:${req.username}:*:${messageId}:*`);

      // 如果没找到，且请求中提供了 groupId，尝试在群组中查找
      if (keys.length === 0 && req.body.groupId) {
        keys = await scanKeys(`groupmsg:${req.body.groupId}:*:${messageId}:*`);
      }

      if (keys.length > 0) {
        msgStr = await redisClient.get(keys[0]);
      }
    }

    if (!msgStr) {
      return res.status(404).json({ error: '未找到该消息' });
    }

    const msg = JSON.parse(msgStr);

    // 检查消息是否有sendIdHash字段（兼容旧消息）
    if (!msg.sendIdHash) {
      return res.json({ success: false, valid: false, reason: '该消息没有SendId' });
    }

    // 验证SendId
    const sendIdHash = sha256(sendId);
    const isValid = msg.sendIdHash === sendIdHash;

    res.json({ success: true, valid: isValid });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '服务器错误' });
  }
});

// 管理员直接清除Redis(仅限admin用户)
app.post('/api/admin/flush-redis', authenticate, async (req, res) => {
  try {
    if (req.username !== 'admin') {
      return res.status(403).json({ error: '无权限' });
    }

    await redisClient.flushAll();

    // 管理员操作完成，不输出日志
    res.json({ success: true, message: '所有内存数据已清除' });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '服务器错误' });
  }
});

// ==================== E2EE 相关 API ====================

// 获取密码哈希（用登录态换取，用于解密本地私钥）
app.get('/api/password-hash', authenticate, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      'SELECT password_hash FROM users WHERE username = ?',
      [req.username]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: '用户不存在' });
    }
    res.json({ passwordHash: rows[0].password_hash });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '服务器错误' });
  }
});

// 验证密码（用于敏感操作如生成密钥、下载私钥）
app.post('/api/verify-password', authenticate, async (req, res) => {
  try {
    const { password } = req.body;

    // 已登录用户验证密码无需额外人机验证

    if (!password) {
      return res.status(400).json({ error: '请输入密码' });
    }

    const [rows] = await pool.execute(
      'SELECT password_hash FROM users WHERE username = ?',
      [req.username]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: '用户不存在' });
    }

    const passwordHash = hash(password);
    if (rows[0].password_hash !== passwordHash) {
      return res.status(401).json({ error: '密码错误' });
    }

    res.json({ success: true, passwordHash });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '服务器错误' });
  }
});

// 上传公钥
app.post('/api/public-key', authenticate, async (req, res) => {
  try {
    const { publicKey, password } = req.body;

    if (!publicKey) {
      return res.status(400).json({ error: '公钥不能为空' });
    }

    if (!password) {
      return res.status(400).json({ error: '请提供密码进行身份验证' });
    }

    // 验证密码
    const [rows] = await pool.execute(
      'SELECT password_hash FROM users WHERE username = ?',
      [req.username]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: '用户不存在' });
    }

    const passwordHash = hash(password);
    if (rows[0].password_hash !== passwordHash) {
      return res.status(401).json({ error: '密码错误' });
    }

    await pool.execute(
      'UPDATE users SET public_key = ? WHERE username = ?',
      [publicKey, req.username]
    );

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '服务器错误' });
  }
});

// 获取当前用户公钥
app.get('/api/public-key', authenticate, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      'SELECT public_key FROM users WHERE username = ?',
      [req.username]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: '用户不存在' });
    }

    res.json({ publicKey: rows[0].public_key });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '服务器错误' });
  }
});

// 获取指定用户公钥
app.get('/api/public-key/:username', authenticate, async (req, res) => {
  try {
    const targetUsername = req.params.username.toLowerCase();

    if (!isValidUsername(targetUsername)) {
      return res.status(400).json({ error: '用户名格式不正确' });
    }

    const [rows] = await pool.execute(
      'SELECT public_key FROM users WHERE username = ?',
      [targetUsername]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: '用户不存在' });
    }

    res.json({ username: targetUsername, publicKey: rows[0].public_key });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '服务器错误' });
  }
});

// 批量获取用户公钥
app.post('/api/public-keys', authenticate, async (req, res) => {
  try {
    const { usernames } = req.body;

    if (!usernames || !Array.isArray(usernames) || usernames.length === 0) {
      return res.status(400).json({ error: '请提供用户名列表' });
    }

    if (usernames.length > 100) {
      return res.status(400).json({ error: '一次最多查询100个用户' });
    }

    const placeholders = usernames.map(() => '?').join(',');
    const [rows] = await pool.execute(
      `SELECT username, public_key FROM users WHERE username IN (${placeholders})`,
      usernames.map(u => u.toLowerCase())
    );

    const result = {};
    for (const row of rows) {
      result[row.username] = row.public_key;
    }

    // 标记不存在的用户
    const missingUsers = usernames.filter(u => !(u.toLowerCase() in result));

    res.json({ publicKeys: result, missingUsers });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '服务器错误' });
  }
});

// ==================== 密钥共享 API ====================

// 创建密钥共享请求
app.post('/api/key-share/request', authenticate, async (req, res) => {
  try {
    const { ephemeralPublicKey, commitment } = req.body;

    const verifyResult = await verifyAction('key_share_request', req);
    if (!verifyResult.success) {
      return res.status(400).json({ error: verifyResult.error || '验证失败' });
    }

    // if (!codeHash) {
    //   return res.status(400).json({ error: '验证码哈希不能为空' });
    // }

    const requestId = crypto.randomBytes(16).toString('hex');

    // 存储请求信息，5分钟过期
    await redisClient.set(`keyshare:${requestId}`, JSON.stringify({
      username: req.username,
      ephemeralPublicKey, // 接收方的临时公钥 (Legacy/Debug, B uses Commitment)
      commitment, // Commitment Scheme: Hash(PubA + Salt)
      status: 'pending',
      createdAt: Date.now()
    }), { EX: 300 });

    // 发送特殊消息给该用户的所有设备
    const now = new Date();
    const time = `${now.getFullYear()}:${String(now.getMonth() + 1).padStart(2, '0')}`;
    const randomId = crypto.randomBytes(4).toString('hex');

    // 获取置顶消息计数器
    const userCounterKey = `pinned_counter:${req.username}`;
    let userSequence = await redisClient.get(userCounterKey);
    if (!userSequence) userSequence = 0;
    userSequence = parseInt(userSequence) + 1;
    await redisClient.set(userCounterKey, userSequence);

    const message = {
      to: req.username,
      content: `密钥共享请求\n\n另一台设备正在请求导入您的私钥。\n请求ID: ${requestId}\n\n如果这是您的操作，请在该设备上批准。如果不是，请拒绝。`,
      time,
      sequence: userSequence,
      randomId,
      pinned: true,
      from: 'system',
      tag: 'sharekey',
      requestId
    };

    const msgKey = `msg:${req.username}:${Date.now()}:${randomId}:${Math.random().toString(36).substr(2, 9)}`;
    await redisClient.set(msgKey, JSON.stringify(message), { EX: 300 });

    res.json({ success: true, requestId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '服务器错误' });
  }
});

// 轮询/查询密钥共享状态
app.get('/api/key-share/poll/:requestId', authenticate, async (req, res) => {
  try {
    const { requestId } = req.params;

    const dataStr = await redisClient.get(`keyshare:${requestId}`);
    if (!dataStr) {
      return res.status(404).json({ error: '请求已过期或不存在' });
    }

    const data = JSON.parse(dataStr);

    // 验证是请求发起者 (或者是同一账号的其他设备)
    if (data.username !== req.username) {
      return res.status(403).json({ error: '无权限' });
    }

    res.json({
      status: data.status,
      ephemeralPublicKey: data.ephemeralPublicKey, // 接收方的公钥，批准者需要这个
      senderPublicKey: data.senderPublicKey || null, // 发送方的公钥，接收方需要这个
      encryptedKey: data.encryptedKey || null,
      commitment: data.commitment || null,
      receiverPublicKey: data.receiverPublicKey || null,
      senderReveal: data.senderReveal || null
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '服务器错误' });
  }
});

// 更新密钥共享状态 (通用)
app.post('/api/key-share/update', authenticate, async (req, res) => {
  try {
    const { requestId, ...updates } = req.body;

    const dataStr = await redisClient.get(`keyshare:${requestId}`);
    if (!dataStr) {
      return res.status(404).json({ error: '请求已过期或不存在' });
    }

    const data = JSON.parse(dataStr);

    // 允许接收方更新 (Joining) 或 发起方更新 (Revealing)
    // 这里简单判断：只要知道 requestId 且 session 存在，允许更新特定字段
    // 实际生产应更严谨，但这里假设 requestId 具有一定机密性(通过消息传递)

    if (updates.receiverPublicKey) {
      data.receiverPublicKey = updates.receiverPublicKey;
      data.status = 'joined';
    }

    if (updates.senderReveal) {
      if (data.username !== req.username) {
        return res.status(403).json({ error: '只有发起者可以 Reveal' });
      }
      data.senderReveal = updates.senderReveal;
      data.status = 'revealed';
    }

    await redisClient.set(`keyshare:${requestId}`, JSON.stringify(data), { EX: 300 });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '服务器错误' });
  }
});

// 取消密钥共享请求（请求方关闭页面时调用）
app.post('/api/key-share/cancel/:requestId', authenticate, async (req, res) => {
  try {
    const { requestId } = req.params;

    const dataStr = await redisClient.get(`keyshare:${requestId}`);
    if (!dataStr) {
      return res.json({ success: true }); // 已经不存在，视为成功
    }

    const data = JSON.parse(dataStr);

    // 验证是请求发起者
    if (data.username !== req.username) {
      return res.status(403).json({ error: '无权限' });
    }

    // 删除keyshare数据
    await redisClient.del(`keyshare:${requestId}`);

    // 删除对应的消息
    const keys = await scanKeys(`msg:${req.username}:*`);
    for (const key of keys) {
      const msgStr = await redisClient.get(key);
      if (msgStr) {
        const msg = JSON.parse(msgStr);
        if (msg.tag === 'sharekey' && msg.requestId === requestId) {
          await redisClient.del(key);
          break;
        }
      }
    }

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '服务器错误' });
  }
});

// 批准密钥共享（从有私钥的设备）
app.post('/api/key-share/approve', authenticate, async (req, res) => {
  try {
    const { requestId, encryptedKey, senderPublicKey } = req.body;

    if (!requestId || !encryptedKey) {
      return res.status(400).json({ error: '参数不完整' });
    }

    const dataStr = await redisClient.get(`keyshare:${requestId}`);
    if (!dataStr) {
      return res.status(404).json({ error: '请求已过期或不存在' });
    }

    const data = JSON.parse(dataStr);

    // 验证是同一用户
    if (data.username !== req.username) {
      return res.status(403).json({ error: '无权限' });
    }

    // 验证6位数字码 (已移除，改用 SAS 视觉验证)
    /*
    const inputCodeHash = hash(code);
    if (inputCodeHash !== data.codeHash) {
      return res.status(400).json({ error: '验证码错误' });
    }
    */

    // 更新状态并存储加密的密钥
    data.status = 'approved';
    data.encryptedKey = encryptedKey;
    data.senderPublicKey = senderPublicKey; // 存储发送方的公钥
    await redisClient.set(`keyshare:${requestId}`, JSON.stringify(data), { EX: 60 });

    // 删除请求消息
    const msgKeys = await scanKeys(`msg:${req.username}:*`);
    for (const key of msgKeys) {
      const msgStr = await redisClient.get(key);
      if (msgStr) {
        const msg = JSON.parse(msgStr);
        if (msg.tag === 'sharekey' && msg.requestId === requestId) {
          await redisClient.del(key);
        }
      }
    }

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '服务器错误' });
  }
});

// 拒绝密钥共享
app.post('/api/key-share/reject', authenticate, async (req, res) => {
  try {
    const { requestId } = req.body;

    if (!requestId) {
      return res.status(400).json({ error: '请求ID不能为空' });
    }

    const dataStr = await redisClient.get(`keyshare:${requestId}`);
    if (!dataStr) {
      return res.status(404).json({ error: '请求已过期或不存在' });
    }

    const data = JSON.parse(dataStr);

    // 验证是同一用户
    if (data.username !== req.username) {
      return res.status(403).json({ error: '无权限' });
    }

    // 删除请求
    await redisClient.del(`keyshare:${requestId}`);

    // 删除请求消息
    const msgKeys = await scanKeys(`msg:${req.username}:*`);
    for (const key of msgKeys) {
      const msgStr = await redisClient.get(key);
      if (msgStr) {
        const msg = JSON.parse(msgStr);
        if (msg.tag === 'sharekey' && msg.requestId === requestId) {
          await redisClient.del(key);
        }
      }
    }

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '服务器错误' });
  }
});

// 启动服务器
initDB().then(() => {
  app.listen(PORT, () => {
    // 服务器启动，不输出日志
  });
});

// ==================== 群组 API ====================

// 生成群组ID: g开头 + 15位16进制随机数
function generateGroupId() {
  return 'g' + crypto.randomBytes(7).toString('hex') + crypto.randomBytes(1).toString('hex').substring(0, 1);
}

// 检查用户在群组中的角色
async function getGroupRole(groupId, username) {
  const [rows] = await pool.execute(
    'SELECT role FROM group_members WHERE group_id = ? AND username = ?',
    [groupId, username]
  );
  return rows.length > 0 ? rows[0].role : null;
}

// 检查群组权限
async function checkGroupPermission(groupId, username, action, group = null) {
  if (!group) {
    const [rows] = await pool.execute('SELECT * FROM `groups` WHERE group_id = ?', [groupId]);
    if (rows.length === 0) return { allowed: false, error: '群组不存在' };
    group = rows[0];
  }

  const role = await getGroupRole(groupId, username);
  if (!role) return { allowed: false, error: '您不是该群组成员' };

  const isOwner = role === 'owner';
  const isAdmin = role === 'admin' || isOwner;

  switch (action) {
    case 'add_member':
      if (group.who_can_add_members === 'owner' && !isOwner) return { allowed: false, error: '仅群主可以添加成员' };
      if (group.who_can_add_members === 'admins' && !isAdmin) return { allowed: false, error: '仅群主和管理员可以添加成员' };
      return { allowed: true };
    case 'remove_member':
      if (group.who_can_remove_members === 'owner' && !isOwner) return { allowed: false, error: '仅群主可以移除成员' };
      if (group.who_can_remove_members === 'admins' && !isAdmin) return { allowed: false, error: '仅群主和管理员可以移除成员' };
      return { allowed: true };
    case 'change_settings':
      if (group.who_can_change_settings === 'owner' && !isOwner) return { allowed: false, error: '仅群主可以更改设置' };
      if (group.who_can_change_settings === 'admins' && !isAdmin) return { allowed: false, error: '仅群主和管理员可以更改设置' };
      return { allowed: true };
    case 'pin_message':
      if (group.who_can_pin_messages === 'owner' && !isOwner) return { allowed: false, error: '仅群主可以发送置顶消息' };
      if (group.who_can_pin_messages === 'admins' && !isAdmin) return { allowed: false, error: '仅群主和管理员可以发送置顶消息' };
      return { allowed: true };
    case 'view_members':
      if (group.who_can_view_members === 'admins' && !isAdmin) return { allowed: false, error: '仅群主和管理员可以查看成员' };
      return { allowed: true };
    case 'manage_admin':
      if (!isOwner) return { allowed: false, error: '仅群主可以管理管理员' };
      return { allowed: true };
    case 'delete_message':
      if (group.who_can_delete_messages === 'owner' && !isOwner) return { allowed: false, error: '仅群主可以删除消息' };
      if (group.who_can_delete_messages === 'admins' && !isAdmin) return { allowed: false, error: '仅群主和管理员可以删除消息' };
      return { allowed: true };
    default:
      return { allowed: true };
  }
}

// 创建群组
app.post('/api/groups', authenticate, async (req, res) => {
  try {
    const { name, settings, groupType } = req.body;

    const verifyResult = await verifyAction('create_group', req);
    if (!verifyResult.success) {
      return res.status(400).json({ error: verifyResult.error || '验证失败' });
    }

    if (!name || name.trim().length === 0) {
      return res.status(400).json({ error: '群组名称不能为空' });
    }

    if (name.length > 100) {
      return res.status(400).json({ error: '群组名称过长' });
    }

    const isSocialist = groupType === 'socialist';
    const groupId = generateGroupId();

    // 创建群组
    // 社会主义群组：虽然记录 owner，但实际上没有特殊权限（通过 group_type 来判断）
    await pool.execute(
      `INSERT INTO \`groups\` (group_id, name, owner, group_type, encrypt_messages, who_can_view_members, max_message_length, 
        who_can_add_members, who_can_remove_members, who_can_change_settings, admin_can_remove, who_can_pin_messages, who_can_delete_messages) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        groupId,
        name.trim(),
        req.username, // 社会主义群组也记录创建者，但没有特殊权限
        isSocialist ? 'socialist' : 'normal',
        settings?.encrypt_messages || false,
        settings?.who_can_view_members || 'all',
        settings?.max_message_length || 10240,
        isSocialist ? (settings?.who_can_add_members === 'all' ? 'all' : 'owner') : (settings?.who_can_add_members || 'owner'),
        settings?.who_can_remove_members || 'owner',
        settings?.who_can_change_settings || 'owner', // 社会主义群组通过投票修改设置，这里不影响
        settings?.admin_can_remove || 'non_admin',
        settings?.who_can_pin_messages || 'owner',
        settings?.who_can_delete_messages || 'owner'
      ]
    );

    // 添加创建者为成员（社会主义群组没有群主，都是普通成员）
    await pool.execute(
      'INSERT INTO group_members (group_id, username, role) VALUES (?, ?, ?)',
      [groupId, req.username, isSocialist ? 'member' : 'owner']
    );

    res.json({ success: true, groupId, groupType: isSocialist ? 'socialist' : 'normal' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '服务器错误' });
  }
});

// 获取用户的群组列表
app.get('/api/groups', authenticate, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT g.group_id, g.name, g.owner, g.group_type, g.encrypt_messages, gm.role,
        (SELECT COUNT(*) FROM group_members WHERE group_id = g.group_id) as member_count
       FROM \`groups\` g
       JOIN group_members gm ON g.group_id = gm.group_id
       WHERE gm.username = ?
       ORDER BY g.created_at DESC`,
      [req.username]
    );

    res.json({ groups: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '服务器错误' });
  }
});

// 获取群组详情
app.get('/api/groups/:groupId', authenticate, async (req, res) => {
  try {
    const { groupId } = req.params;

    // 检查是否是成员
    const role = await getGroupRole(groupId, req.username);
    if (!role) {
      return res.status(403).json({ error: '您不是该群组成员' });
    }

    const [rows] = await pool.execute('SELECT * FROM `groups` WHERE group_id = ?', [groupId]);
    if (rows.length === 0) {
      return res.status(404).json({ error: '群组不存在' });
    }

    const group = rows[0];
    group.myRole = role;

    // 获取管理员列表
    const [admins] = await pool.execute(
      'SELECT username FROM group_members WHERE group_id = ? AND role IN (?, ?)',
      [groupId, 'owner', 'admin']
    );
    group.admins = admins.map(a => a.username);

    res.json({ group });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '服务器错误' });
  }
});

// 更新群组设置
app.put('/api/groups/:groupId', authenticate, async (req, res) => {
  try {
    const { groupId } = req.params;
    const { settings } = req.body;

    const verifyResult = await verifyAction('group_settings', req);
    if (!verifyResult.success) {
      return res.status(400).json({ error: verifyResult.error || '验证失败' });
    }

    const [rows] = await pool.execute('SELECT * FROM `groups` WHERE group_id = ?', [groupId]);
    if (rows.length === 0) {
      return res.status(404).json({ error: '群组不存在' });
    }
    const group = rows[0];

    const permission = await checkGroupPermission(groupId, req.username, 'change_settings', group);
    if (!permission.allowed) {
      return res.status(403).json({ error: permission.error });
    }


    // 如果开启加密消息，检查是否所有成员都有公钥
    if (settings.encrypt_messages && !group.encrypt_messages) {
      // 获取所有成员
      const [members] = await pool.execute(
        'SELECT gm.username, u.public_key FROM group_members gm JOIN users u ON gm.username = u.username WHERE gm.group_id = ?',
        [groupId]
      );

      const membersWithoutKey = members.filter(m => !m.public_key);

      if (membersWithoutKey.length > 0) {
        // 检查当前用户是否有权限移除这些成员
        const removePermission = await checkGroupPermission(groupId, req.username, 'remove_member', group);

        // 检查是否需要移除群主或管理员，以及用户是否有权限
        for (const member of membersWithoutKey) {
          const memberRole = await getGroupRole(groupId, member.username);
          if (memberRole === 'owner') {
            return res.status(400).json({ error: '群主没有公钥，无法开启加密' });
          }
          if (memberRole === 'admin' && group.admin_can_remove === 'non_admin') {
            if (!removePermission.allowed || (await getGroupRole(groupId, req.username)) !== 'owner') {
              return res.status(400).json({ error: `管理员 ${member.username} 没有公钥，且您无权移除管理员` });
            }
          }
        }

        if (!removePermission.allowed) {
          return res.status(400).json({
            error: `以下成员没有公钥: ${membersWithoutKey.map(m => m.username).join(', ')}。您没有权限移除他们，无法开启加密。`
          });
        }

        // 移除没有公钥的成员
        for (const member of membersWithoutKey) {
          await pool.execute(
            'DELETE FROM group_members WHERE group_id = ? AND username = ?',
            [groupId, member.username]
          );
        }
      }
    }

    // 更新设置
    const updateFields = [];
    const updateValues = [];

    const allowedFields = ['name', 'encrypt_messages', 'who_can_view_members', 'max_message_length',
      'who_can_add_members', 'who_can_remove_members', 'who_can_change_settings', 'admin_can_remove', 'who_can_pin_messages', 'who_can_delete_messages'];

    for (const field of allowedFields) {
      if (settings[field] !== undefined) {
        updateFields.push(`${field} = ?`);
        updateValues.push(settings[field]);
      }
    }

    if (updateFields.length > 0) {
      updateValues.push(groupId);
      await pool.execute(
        `UPDATE \`groups\` SET ${updateFields.join(', ')} WHERE group_id = ?`,
        updateValues
      );
    }

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '服务器错误' });
  }
});

// 删除群组（仅群主）
app.delete('/api/groups/:groupId', authenticate, async (req, res) => {
  try {
    const { groupId } = req.params;

    const [rows] = await pool.execute('SELECT owner FROM `groups` WHERE group_id = ?', [groupId]);
    if (rows.length === 0) {
      return res.status(404).json({ error: '群组不存在' });
    }

    if (rows[0].owner !== req.username) {
      return res.status(403).json({ error: '仅群主可以删除群组' });
    }

    // 删除群成员
    await pool.execute('DELETE FROM group_members WHERE group_id = ?', [groupId]);

    // 删除群组
    await pool.execute('DELETE FROM `groups` WHERE group_id = ?', [groupId]);

    // 删除群组消息
    const msgKeys = await scanKeys(`groupmsg:${groupId}:*`);
    for (const key of msgKeys) {
      await redisClient.del(key);
    }

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '服务器错误' });
  }
});

// 获取群成员列表
app.get('/api/groups/:groupId/members', authenticate, async (req, res) => {
  try {
    const { groupId } = req.params;

    const [groupRows] = await pool.execute('SELECT * FROM `groups` WHERE group_id = ?', [groupId]);
    if (groupRows.length === 0) {
      return res.status(404).json({ error: '群组不存在' });
    }

    const permission = await checkGroupPermission(groupId, req.username, 'view_members', groupRows[0]);
    if (!permission.allowed) {
      return res.status(403).json({ error: permission.error });
    }

    const [members] = await pool.execute(
      `SELECT gm.username, gm.role, gm.joined_at, u.public_key IS NOT NULL as has_public_key
       FROM group_members gm
       JOIN users u ON gm.username = u.username
       WHERE gm.group_id = ?
       ORDER BY FIELD(gm.role, 'owner', 'admin', 'member'), gm.joined_at`,
      [groupId]
    );

    res.json({ members });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '服务器错误' });
  }
});

// 邀请用户加入群组
app.post('/api/groups/:groupId/invite', authenticate, async (req, res) => {
  try {
    const { groupId } = req.params;
    const { username, message: inviteMessage } = req.body;

    const verifyResult = await verifyAction('group_invite', req);
    if (!verifyResult.success) {
      return res.status(400).json({ error: verifyResult.error || '验证失败' });
    }

    if (!username || !isValidUsername(username)) {
      return res.status(400).json({ error: '用户名无效' });
    }

    // 检查用户是否存在
    const [userRows] = await pool.execute('SELECT username, public_key FROM users WHERE username = ?', [username]);
    if (userRows.length === 0) {
      return res.status(404).json({ error: '用户不存在' });
    }

    // 获取群组信息
    const [groupRows] = await pool.execute('SELECT * FROM `groups` WHERE group_id = ?', [groupId]);
    if (groupRows.length === 0) {
      return res.status(404).json({ error: '群组不存在' });
    }
    const group = groupRows[0];

    // 检查添加成员权限
    const permission = await checkGroupPermission(groupId, req.username, 'add_member', group);
    if (!permission.allowed) {
      return res.status(403).json({ error: permission.error });
    }

    // 检查是否已是成员
    const existingRole = await getGroupRole(groupId, username);
    if (existingRole) {
      return res.status(400).json({ error: '该用户已是群成员' });
    }

    // 如果群组加密，检查被邀请用户是否有公钥
    if (group.encrypt_messages && !userRows[0].public_key) {
      return res.status(400).json({ error: '该群组启用了加密消息，但该用户没有配置公钥' });
    }

    // 获取群成员列表和管理员列表
    const [members] = await pool.execute(
      'SELECT username, role FROM group_members WHERE group_id = ?',
      [groupId]
    );

    // 生成邀请消息
    const now = new Date();
    const time = `${now.getFullYear()}:${String(now.getMonth() + 1).padStart(2, '0')}`;
    const randomId = crypto.randomBytes(4).toString('hex');
    const sendId = generateSendId();
    const sendIdHash = sha256(sendId);

    const inviteContent = `群组邀请

${req.username} 邀请您加入群组「${group.name}」

${inviteMessage ? `留言: ${inviteMessage}\n` : ''}
群主: ${group.owner}
管理员: ${members.filter(m => m.role === 'admin').map(m => m.username).join(', ') || '无'}
当前成员 (${members.length}人): ${members.map(m => m.username).join(', ')}
${group.encrypt_messages ? '🔒 此群组已启用消息加密' : ''}`;

    const userCounterKey = `user_counter:${username}`;
    let userSequence = await redisClient.get(userCounterKey);
    if (!userSequence) userSequence = 0;
    userSequence = parseInt(userSequence) + 1;
    await redisClient.set(userCounterKey, userSequence);

    const msgData = {
      to: username,
      content: inviteContent,
      time,
      sequence: userSequence,
      randomId,
      sendIdHash,
      from: req.username,
      tag: 'group_invite',
      groupId,
      groupName: group.name,
      inviter: req.username
    };

    const msgKey = `msg:${username}:${Date.now()}:${randomId}:${Math.random().toString(36).substr(2, 9)}`;
    await redisClient.set(msgKey, JSON.stringify(msgData));
    await redisClient.sAdd('sendid_mapping:' + sendIdHash, msgKey);
    await redisClient.expire('sendid_mapping:' + sendIdHash, 86400 * 30);

    // Push Notification for Invite
    global.sendPushToUser(username, '群组邀请', `${req.username} 邀请您加入群组「${group.name}」`, {
      url: '/',
      tag: 'group-invite'
    });

    res.json({ success: true, sendId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '服务器错误' });
  }
});

// 接受群组邀请
app.post('/api/groups/:groupId/join', authenticate, async (req, res) => {
  try {
    const { groupId } = req.params;
    const { messageId } = req.body;

    // 获取群组信息
    const [groupRows] = await pool.execute('SELECT * FROM `groups` WHERE group_id = ?', [groupId]);
    if (groupRows.length === 0) {
      return res.status(404).json({ error: '群组不存在' });
    }
    const group = groupRows[0];

    // 如果群组加密，检查用户是否有公钥
    if (group.encrypt_messages) {
      const [userRows] = await pool.execute('SELECT public_key FROM users WHERE username = ?', [req.username]);
      if (!userRows[0].public_key) {
        return res.status(400).json({ error: '该群组启用了加密消息，请先配置您的公钥' });
      }
    }

    // 检查是否已是成员
    const existingRole = await getGroupRole(groupId, req.username);
    if (existingRole) {
      return res.status(400).json({ error: '您已是群成员' });
    }

    // 添加为成员
    await pool.execute(
      'INSERT INTO group_members (group_id, username, role) VALUES (?, ?, ?)',
      [groupId, req.username, 'member']
    );

    // 删除邀请消息
    if (messageId) {
      const msgKeys = await scanKeys(`msg:${req.username}:*:${messageId}:*`);
      for (const key of msgKeys) {
        await redisClient.del(key);
      }
    }

    res.json({ success: true });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ error: '您已是群成员' });
    }
    console.error(err);
    res.status(500).json({ error: '服务器错误' });
  }
});

// 拒绝群组邀请（仅删除邀请消息）
app.post('/api/groups/:groupId/reject', authenticate, async (req, res) => {
  try {
    const { messageId } = req.body;

    if (messageId) {
      const msgKeys = await scanKeys(`msg:${req.username}:*:${messageId}:*`);
      for (const key of msgKeys) {
        await redisClient.del(key);
      }
    }

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '服务器错误' });
  }
});

// 离开群组
app.post('/api/groups/:groupId/leave', authenticate, async (req, res) => {
  try {
    const { groupId } = req.params;

    const role = await getGroupRole(groupId, req.username);
    if (!role) {
      return res.status(400).json({ error: '您不是该群组成员' });
    }

    if (role === 'owner') {
      return res.status(400).json({ error: '群主不能离开群组，请先转让群主或删除群组' });
    }

    await pool.execute(
      'DELETE FROM group_members WHERE group_id = ? AND username = ?',
      [groupId, req.username]
    );

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '服务器错误' });
  }
});

// 移除成员
app.delete('/api/groups/:groupId/remove/:username', authenticate, async (req, res) => {
  try {
    const { groupId, username } = req.params;

    const [groupRows] = await pool.execute('SELECT * FROM `groups` WHERE group_id = ?', [groupId]);
    if (groupRows.length === 0) {
      return res.status(404).json({ error: '群组不存在' });
    }
    const group = groupRows[0];

    // 检查移除权限
    const permission = await checkGroupPermission(groupId, req.username, 'remove_member', group);
    if (!permission.allowed) {
      return res.status(403).json({ error: permission.error });
    }

    // 获取被移除用户的角色
    const targetRole = await getGroupRole(groupId, username);
    if (!targetRole) {
      return res.status(400).json({ error: '该用户不是群成员' });
    }

    // 不能移除群主
    if (targetRole === 'owner') {
      return res.status(403).json({ error: '不能移除群主' });
    }

    // 检查管理员是否可以移除该用户
    const myRole = await getGroupRole(groupId, req.username);
    if (myRole === 'admin') {
      if (targetRole === 'admin' && group.admin_can_remove === 'non_admin') {
        return res.status(403).json({ error: '管理员不能移除其他管理员' });
      }
    }

    await pool.execute(
      'DELETE FROM group_members WHERE group_id = ? AND username = ?',
      [groupId, username]
    );

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '服务器错误' });
  }
});

// 设置/取消管理员
app.post('/api/groups/:groupId/admin/:username', authenticate, async (req, res) => {
  try {
    const { groupId, username } = req.params;
    const { isAdmin } = req.body;

    const permission = await checkGroupPermission(groupId, req.username, 'manage_admin');
    if (!permission.allowed) {
      return res.status(403).json({ error: permission.error });
    }

    const targetRole = await getGroupRole(groupId, username);
    if (!targetRole) {
      return res.status(400).json({ error: '该用户不是群成员' });
    }

    if (targetRole === 'owner') {
      return res.status(400).json({ error: '不能更改群主的角色' });
    }

    await pool.execute(
      'UPDATE group_members SET role = ? WHERE group_id = ? AND username = ?',
      [isAdmin ? 'admin' : 'member', groupId, username]
    );

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '服务器错误' });
  }
});

// 获取群组消息
app.get('/api/groups/:groupId/messages', authenticate, async (req, res) => {
  try {
    const { groupId } = req.params;

    const role = await getGroupRole(groupId, req.username);
    if (!role) {
      return res.status(403).json({ error: '您不是该群组成员' });
    }

    const keys = await scanKeys(`groupmsg:${groupId}:*`);
    const messages = [];

    for (const key of keys) {
      const msgStr = await redisClient.get(key);
      if (msgStr) {
        const msg = JSON.parse(msgStr);
        messages.push({
          id: key,
          content: escapeHtml(msg.content),
          time: msg.time,
          sequence: msg.sequence,
          randomId: msg.randomId,
          pinned: msg.pinned || false
        });
      }
    }

    // 分别排序置顶和普通消息
    const pinnedMessages = messages.filter(m => m.pinned).sort((a, b) => b.sequence - a.sequence);
    const normalMessages = messages.filter(m => !m.pinned).sort((a, b) => b.sequence - a.sequence);

    res.json({ messages: [...pinnedMessages, ...normalMessages] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '服务器错误' });
  }
});

// 发送群组消息
app.post('/api/groups/:groupId/messages', authenticate, async (req, res) => {
  try {
    const { groupId } = req.params;
    const { content, pinned } = req.body;

    const verifyResult = await verifyAction('send_msg', req);
    if (!verifyResult.success) {
      return res.status(400).json({ error: verifyResult.error || '验证失败' });
    }

    const [groupRows] = await pool.execute('SELECT * FROM `groups` WHERE group_id = ?', [groupId]);
    if (groupRows.length === 0) {
      return res.status(404).json({ error: '群组不存在' });
    }
    const group = groupRows[0];

    const role = await getGroupRole(groupId, req.username);
    if (!role) {
      return res.status(403).json({ error: '您不是该群组成员' });
    }

    // 检查字数限制（群主发置顶消息时无限制）
    const isPinned = pinned && (role === 'owner' || (role === 'admin' && group.who_can_pin_messages === 'admins'));
    const isOwner = role === 'owner';

    if (!isOwner && content.length > group.max_message_length) {
      return res.status(400).json({ error: `消息超过字数限制 (${group.max_message_length}字)` });
    }

    // 检查置顶权限
    if (pinned) {
      const pinPermission = await checkGroupPermission(groupId, req.username, 'pin_message', group);
      if (!pinPermission.allowed) {
        return res.status(403).json({ error: pinPermission.error });
      }
    }

    const now = new Date();
    const time = `${now.getFullYear()}:${String(now.getMonth() + 1).padStart(2, '0')}`;
    const randomId = crypto.randomBytes(4).toString('hex');
    const sendId = generateSendId();
    const sendIdHash = sha256(sendId);

    // 获取消息序列号
    const counterKey = isPinned ? `group_pinned_counter:${groupId}` : `group_counter:${groupId}`;
    let sequence = await redisClient.get(counterKey);
    if (!sequence) sequence = 0;
    sequence = parseInt(sequence) + 1;
    await redisClient.set(counterKey, sequence);

    let finalContent = content;

    // 如果群组加密，加密消息
    if (group.encrypt_messages) {
      // 前端会处理加密，这里只存储加密后的内容
      // 验证内容是否已加密
      // 如果需要服务端加密，需要在这里实现
    }

    const msgData = {
      content: finalContent,
      time,
      sequence,
      randomId,
      sendIdHash,
      pinned: isPinned,
      senderUsername: req.username // 内部记录，不向用户显示
    };

    const msgKey = `groupmsg:${groupId}:${Date.now()}:${randomId}:${Math.random().toString(36).substr(2, 9)}`;
    await redisClient.set(msgKey, JSON.stringify(msgData));
    await redisClient.sAdd('sendid_mapping:' + sendIdHash, msgKey);
    await redisClient.expire('sendid_mapping:' + sendIdHash, 86400 * 30);

    // Send Push to Group Members (except sender)
    // Filter by notifications_enabled = 1
    try {
      const [members] = await pool.execute(
        'SELECT username FROM group_members WHERE group_id = ? AND notifications_enabled = 1',
        [groupId]
      );
      for (const member of members) {
        if (member.username !== req.username) {
          global.sendPushToUser(member.username, `群组: ${group.name}`, `收到一条新消息`, {
            url: '/',
            tag: `group-${groupId}`
          });
        }
      }
    } catch (e) { console.error('Group Push Error', e); }

    res.json({ success: true, randomId, sendId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '服务器错误' });
  }
});

// 切换群组通知设置 (Current Account)
app.post('/api/groups/:groupId/notifications', authenticate, async (req, res) => {
  try {
    const { groupId } = req.params;
    const { enabled } = req.body;

    const role = await getGroupRole(groupId, req.username);
    if (!role) {
      return res.status(403).json({ error: '您不是该群组成员' });
    }

    await pool.execute(
      'UPDATE group_members SET notifications_enabled = ? WHERE group_id = ? AND username = ?',
      [enabled, groupId, req.username]
    );

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '服务器错误' });
  }
});

// Get self membership info (including notification setting)
app.get('/api/groups/:groupId/me', authenticate, async (req, res) => {
  try {
    const { groupId } = req.params;
    const [rows] = await pool.execute(
      'SELECT role, notifications_enabled FROM group_members WHERE group_id = ? AND username = ?',
      [groupId, req.username]
    );
    if (rows.length === 0) return res.status(404).json({ error: '未加入该群组' });
    res.json({ member: rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '服务器错误' });
  }
});

// 删除群组消息
app.delete('/api/groups/:groupId/messages/:messageId', authenticate, async (req, res) => {
  try {
    const { groupId, messageId } = req.params;

    const [groupRows] = await pool.execute('SELECT * FROM `groups` WHERE group_id = ?', [groupId]);
    if (groupRows.length === 0) {
      return res.status(404).json({ error: '群组不存在' });
    }
    const group = groupRows[0];

    // 检查删除权限
    const permission = await checkGroupPermission(groupId, req.username, 'delete_message', group);
    if (!permission.allowed) {
      return res.status(403).json({ error: permission.error });
    }

    // 查找并删除消息
    let keys = [];
    if (messageId.startsWith(`groupmsg:${groupId}:`)) {
      // 如果是完整的 Key，直接使用
      const exists = await redisClient.exists(messageId);
      if (exists) keys.push(messageId);
    } else {
      // 否则视为 randomId
      keys = await scanKeys(`groupmsg:${groupId}:*:${messageId}:*`);
    }

    if (keys.length === 0) {
      return res.status(404).json({ error: '消息不存在' });
    }

    for (const key of keys) {
      await redisClient.del(key);
    }

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '服务器错误' });
  }
});

// ==================== 社会主义群组投票 API ====================

// 获取群组成员数
async function getGroupMemberCount(groupId) {
  const [rows] = await pool.execute(
    'SELECT COUNT(*) as count FROM group_members WHERE group_id = ?',
    [groupId]
  );
  return rows[0].count;
}



// 检查并处理投票结果
async function checkAndProcessVoteResult(voteId) {
  const [voteRows] = await pool.execute('SELECT * FROM group_votes WHERE id = ?', [voteId]);
  if (voteRows.length === 0 || voteRows[0].status !== 'pending') return null;

  const vote = voteRows[0];
  const memberCount = await getGroupMemberCount(vote.group_id);
  const threshold = Math.ceil(memberCount / 2);

  // 获取投票统计
  const [yesRows] = await pool.execute(
    'SELECT COUNT(*) as count FROM group_vote_records WHERE vote_id = ? AND vote = ?',
    [voteId, 'yes']
  );
  const [noRows] = await pool.execute(
    'SELECT COUNT(*) as count FROM group_vote_records WHERE vote_id = ? AND vote = ?',
    [voteId, 'no']
  );

  const yesCount = yesRows[0].count;
  const noCount = noRows[0].count;

  // 检查是否过期
  if (new Date(vote.expires_at) < new Date()) {
    await pool.execute('UPDATE group_votes SET status = ? WHERE id = ?', ['expired', voteId]);
    return { status: 'expired', yesCount, noCount };
  }

  // 检查是否通过（>=50%赞成）
  if (yesCount >= threshold) {
    // 使用乐观锁防止竞态条件
    const [updateResult] = await pool.execute('UPDATE group_votes SET status = ? WHERE id = ? AND status = ?', ['passed', voteId, 'pending']);

    // 如果没有行被更新，说明已经被其他并发请求处理过了
    if (updateResult.affectedRows === 0) {
      return { status: 'passed', yesCount, noCount };
    }

    // 执行投票结果
    // 执行投票结果
    let targetData = vote.target_data;

    // 如果是字符串，尝试解析
    if (typeof targetData === 'string') {
      try {
        if (targetData === '[object Object]') {
          console.error('Invalid JSON stored in DB:', targetData);
          targetData = {};
        } else {
          targetData = JSON.parse(targetData);
        }
      } catch (e) {
        console.error('Error parsing vote target_data:', e);
        targetData = {};
      }
    }

    // 确保 targetData 是对象
    if (!targetData || typeof targetData !== 'object') {
      targetData = {};
    }

    if (vote.vote_type === 'add_member') {
      // 投票通过 -> 发送邀请（而不是直接添加）
      // 获取群组信息
      const [gRows] = await pool.execute('SELECT * FROM `groups` WHERE group_id = ?', [vote.group_id]);
      const group = gRows[0];
      const [members] = await pool.execute('SELECT username, role FROM group_members WHERE group_id = ?', [vote.group_id]);

      const now = new Date();
      const time = `${now.getFullYear()}:${String(now.getMonth() + 1).padStart(2, '0')}`;
      const randomId = crypto.randomBytes(4).toString('hex');
      const sendIdHash = crypto.createHash('sha256').update(crypto.randomBytes(16)).digest('hex');


      if (!targetData.username) {
        console.error('Missing username in target_data for add_member vote', voteId);
        // 无法执行，但已通过
        return { status: 'passed', yesCount, noCount, error: 'Execution failed: missing data' };
      }

      const inviteContent = `群组邀请 (投票通过)

集体 邀请您加入社会主义群组「${group.name}」 ☭

共识已达成，欢迎加入。
${targetData.message ? `附言: ${targetData.message}\n` : ''}
当前成员 (${members.length}人): ${members.map(m => m.username).join(', ')}
${group.encrypt_messages ? '🔒 此群组已启用消息加密' : ''}`;

      const userCounterKey = `user_counter:${targetData.username}`;
      let userSequence = await redisClient.get(userCounterKey);
      if (!userSequence) userSequence = 0;
      userSequence = parseInt(userSequence) + 1;
      await redisClient.set(userCounterKey, userSequence);

      const msgData = {
        to: targetData.username,
        content: inviteContent,
        time,
        sequence: userSequence,
        randomId,
        sendIdHash,
        from: '_collective_',
        tag: 'group_invite',
        groupId: vote.group_id,
        groupName: group.name,
        inviter: '_collective_'
      };

      const msgKey = `msg:${targetData.username}:${Date.now()}:${randomId}:${Math.random().toString(36).substr(2, 9)}`;
      await redisClient.set(msgKey, JSON.stringify(msgData));

    } else if (vote.vote_type === 'remove_member') {
      // 移除成员
      if (!targetData.username) {
        console.error('Missing username in target_data for remove_member vote', voteId);
        return { status: 'passed', yesCount, noCount, error: 'Execution failed: missing data' };
      }
      await pool.execute(
        'DELETE FROM group_members WHERE group_id = ? AND username = ?',
        [vote.group_id, targetData.username]
      );
    } else if (vote.vote_type === 'change_settings') {
      // 修改设置
      const allowedFields = ['name', 'encrypt_messages', 'who_can_view_members', 'max_message_length', 'who_can_add_members'];
      const updateFields = [];
      const updateValues = [];

      for (const field of allowedFields) {
        if (targetData[field] !== undefined) {
          updateFields.push(`${field} = ?`);
          updateValues.push(targetData[field]);
        }
      }

      if (updateFields.length > 0) {
        updateValues.push(vote.group_id);
        await pool.execute(
          `UPDATE \`groups\` SET ${updateFields.join(', ')} WHERE group_id = ?`,
          updateValues
        );
      }
    }

    return { status: 'passed', yesCount, noCount };
  }

  // 检查是否被否决（反对票超过阈值）
  if (noCount > memberCount - threshold) {
    await pool.execute('UPDATE group_votes SET status = ? WHERE id = ?', ['rejected', voteId]);
    return { status: 'rejected', yesCount, noCount };
  }

  return { status: 'pending', yesCount, noCount };
}

// 获取单个投票详情
app.get('/api/groups/:groupId/votes/:voteId', authenticate, async (req, res) => {
  try {
    const { groupId, voteId } = req.params;

    // 验证权限... 稍微简化，假设在群里就能看
    const role = await getGroupRole(groupId, req.username);
    if (!role) return res.status(403).json({ error: 'Forbidden' });

    const [votes] = await pool.execute(
      `SELECT v.*, 
        (SELECT COUNT(*) FROM group_vote_records WHERE vote_id = v.id AND vote = 'yes') as yes_count,
        (SELECT COUNT(*) FROM group_vote_records WHERE vote_id = v.id AND vote = 'no') as no_count,
        (SELECT vote FROM group_vote_records WHERE vote_id = v.id AND username = ?) as my_vote
       FROM group_votes v
       WHERE v.id = ? AND v.group_id = ?`,
      [req.username, voteId, groupId]
    );

    if (votes.length === 0) return res.status(404).json({ error: 'Vote not found' });

    // 计算阈值
    const memberCount = await getGroupMemberCount(groupId);
    const threshold = Math.ceil(memberCount * 0.5);
    const vote = votes[0];
    vote.threshold = threshold;

    res.json({ vote });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// 发起投票（添加成员）
app.post('/api/groups/:groupId/vote/add-member', authenticate, async (req, res) => {
  try {
    const { groupId } = req.params;
    const { username, message } = req.body;

    // 验证群组
    const [groupRows] = await pool.execute('SELECT * FROM `groups` WHERE group_id = ?', [groupId]);
    if (groupRows.length === 0) {
      return res.status(404).json({ error: '群组不存在' });
    }
    const group = groupRows[0];

    // 验证是否是社会主义群组
    if (group.group_type !== 'socialist') {
      return res.status(400).json({ error: '此功能仅适用于社会主义群组' });
    }

    // 验证请求者是成员
    const role = await getGroupRole(groupId, req.username);
    if (!role) {
      return res.status(403).json({ error: '您不是该群组成员' });
    }

    // 验证目标用户存在
    if (!username || !isValidUsername(username)) {
      return res.status(400).json({ error: '用户名无效' });
    }
    const [userRows] = await pool.execute('SELECT username FROM users WHERE username = ?', [username]);
    if (userRows.length === 0) {
      return res.status(404).json({ error: '用户不存在' });
    }

    // 验证目标用户不是成员
    const targetRole = await getGroupRole(groupId, username);
    if (targetRole) {
      return res.status(400).json({ error: '该用户已是群成员' });
    }

    // 获取成员数
    const [memberRows] = await pool.execute('SELECT COUNT(*) as count FROM group_members WHERE group_id = ?', [groupId]);
    const memberCount = memberRows[0].count;

    // 特殊规则：成员数<=3时，任何人都可以直接拉人；或者群组设置允许所有人添加
    if (memberCount <= 3 || group.who_can_add_members === 'all') {
      // 发送邀请而不是直接添加
      const [members] = await pool.execute('SELECT username, role FROM group_members WHERE group_id = ?', [groupId]);

      const now = new Date();
      const time = `${now.getFullYear()}:${String(now.getMonth() + 1).padStart(2, '0')}`;
      const randomId = crypto.randomBytes(4).toString('hex');
      const sendIdHash = crypto.createHash('sha256').update(crypto.randomBytes(16)).digest('hex');

      const inviteContent = `群组邀请

${req.username} 邀请您加入社会主义群组「${group.name}」 ☭

${message ? `附言: ${message}\n` : ''}
${memberCount <= 3 ? '(群组尚处于初创阶段，可直接邀请)' : '(开放邀请)'}
当前成员 (${members.length}人): ${members.map(m => m.username).join(', ')}
${group.encrypt_messages ? '🔒 此群组已启用消息加密' : ''}`;

      const userCounterKey = `user_counter:${username}`;
      let userSequence = await redisClient.get(userCounterKey);
      if (!userSequence) userSequence = 0;
      userSequence = parseInt(userSequence) + 1;
      await redisClient.set(userCounterKey, userSequence);

      const msgData = {
        to: username,
        content: inviteContent,
        time,
        sequence: userSequence,
        randomId,
        sendIdHash,
        from: '_collective_',
        tag: 'group_invite',
        groupId: groupId,
        groupName: group.name,
        inviter: req.username
      };

      const msgKey = `msg:${username}:${Date.now()}:${randomId}:${Math.random().toString(36).substr(2, 9)}`;
      await redisClient.set(msgKey, JSON.stringify(msgData));
      await redisClient.sAdd('sendid_mapping:' + sendIdHash, msgKey);
      await redisClient.expire('sendid_mapping:' + sendIdHash, 86400 * 30);

      // 返回 directAdd: true 以便前端给出正确提示（虽然不是直接进群，而是直接发了邀请）
      // 我们修改前端提示语即可
      return res.json({ success: true, directAdd: true, message: '已向对方发送邀请' });
    }

    // 检查是否有进行中的相同投票
    const [existingVotes] = await pool.execute(
      `SELECT id FROM group_votes 
       WHERE group_id = ? AND vote_type = 'add_member' AND status = 'pending' 
       AND JSON_EXTRACT(target_data, '$.username') = ?`,
      [groupId, username]
    );
    if (existingVotes.length > 0) {
      return res.status(400).json({ error: '已有相同的待处理投票' });
    }

    // 创建投票（24小时后过期）
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const [result] = await pool.execute(
      `INSERT INTO group_votes (group_id, vote_type, target_data, created_by, expires_at) VALUES (?, ?, ?, ?, ?)`,
      [groupId, 'add_member', JSON.stringify({ username, message }), req.username, expiresAt]
    );

    // 发起者自动投赞成票
    await pool.execute(
      'INSERT INTO group_vote_records (vote_id, username, vote) VALUES (?, ?, ?)',
      [result.insertId, req.username, 'yes']
    );

    // 检查投票结果（可能刚好达到阈值）
    await checkAndProcessVoteResult(result.insertId);

    // 发送群组通知消息（特殊格式用于前端渲染投票卡片）
    // 发送群组通知消息（特殊格式用于前端渲染投票卡片） - 写入 Redis
    const notifyContent = `:::vote:${result.insertId}:::📋 我发起了添加成员投票：${username}`;

    // 获取消息序列号
    const counterKey = `group_counter:${groupId}`;
    let sequence = await redisClient.get(counterKey);
    if (!sequence) sequence = 0;
    sequence = parseInt(sequence) + 1;
    await redisClient.set(counterKey, sequence);

    const now = new Date();
    const time = `${now.getFullYear()}:${String(now.getMonth() + 1).padStart(2, '0')}`;
    const notifyRandomId = crypto.randomBytes(4).toString('hex');
    const sendIdHash = crypto.createHash('sha256').update(crypto.randomBytes(16)).digest('hex');

    const msgData = {
      content: notifyContent,
      time,
      sequence,
      randomId: notifyRandomId,
      sendIdHash,
      pinned: false,
      senderUsername: req.username
    };

    const msgKey = `groupmsg:${groupId}:${Date.now()}:${notifyRandomId}:${Math.random().toString(36).substr(2, 9)}`;
    await redisClient.set(msgKey, JSON.stringify(msgData));

    res.json({ success: true, voteId: result.insertId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '服务器错误' });
  }
});

// 发起投票（移除成员）
app.post('/api/groups/:groupId/vote/remove-member', authenticate, async (req, res) => {
  try {
    const { groupId } = req.params;
    const { username } = req.body;

    // 验证群组
    const [groupRows] = await pool.execute('SELECT * FROM `groups` WHERE group_id = ?', [groupId]);
    if (groupRows.length === 0) {
      return res.status(404).json({ error: '群组不存在' });
    }
    const group = groupRows[0];

    if (group.group_type !== 'socialist') {
      return res.status(400).json({ error: '此功能仅适用于社会主义群组' });
    }

    const role = await getGroupRole(groupId, req.username);
    if (!role) {
      return res.status(403).json({ error: '您不是该群组成员' });
    }

    // 验证目标用户是成员
    const targetRole = await getGroupRole(groupId, username);
    if (!targetRole) {
      return res.status(400).json({ error: '该用户不是群成员' });
    }

    // 检查是否已有相同的待处理投票
    const [existingVotes] = await pool.execute(
      `SELECT id FROM group_votes WHERE group_id = ? AND vote_type = ? AND status = ? AND JSON_EXTRACT(target_data, '$.username') = ?`,
      [groupId, 'remove_member', 'pending', username]
    );
    if (existingVotes.length > 0) {
      return res.status(400).json({ error: '已有相同的待处理投票' });
    }

    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const [result] = await pool.execute(
      `INSERT INTO group_votes (group_id, vote_type, target_data, created_by, expires_at) VALUES (?, ?, ?, ?, ?)`,
      [groupId, 'remove_member', JSON.stringify({ username }), req.username, expiresAt]
    );

    await pool.execute(
      'INSERT INTO group_vote_records (vote_id, username, vote) VALUES (?, ?, ?)',
      [result.insertId, req.username, 'yes']
    );

    await checkAndProcessVoteResult(result.insertId);

    // 发送群组通知消息
    // 发送群组通知消息 - 写入 Redis
    const notifyContent = `:::vote:${result.insertId}:::📋 我发起了移除成员投票：${username}`;

    // 获取消息序列号
    const counterKey = `group_counter:${groupId}`;
    let sequence = await redisClient.get(counterKey);
    if (!sequence) sequence = 0;
    sequence = parseInt(sequence) + 1;
    await redisClient.set(counterKey, sequence);

    const now = new Date();
    const time = `${now.getFullYear()}:${String(now.getMonth() + 1).padStart(2, '0')}`;
    const notifyRandomId = crypto.randomBytes(4).toString('hex');
    const sendIdHash = crypto.createHash('sha256').update(crypto.randomBytes(16)).digest('hex');

    const msgData = {
      content: notifyContent,
      time,
      sequence,
      randomId: notifyRandomId,
      sendIdHash,
      pinned: false,
      senderUsername: req.username
    };

    const msgKey = `groupmsg:${groupId}:${Date.now()}:${notifyRandomId}:${Math.random().toString(36).substr(2, 9)}`;
    await redisClient.set(msgKey, JSON.stringify(msgData));

    res.json({ success: true, voteId: result.insertId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '服务器错误' });
  }
});

// 发起投票（修改设置）
app.post('/api/groups/:groupId/vote/settings', authenticate, async (req, res) => {
  try {
    const { groupId } = req.params;
    const { settings } = req.body;

    const [groupRows] = await pool.execute('SELECT * FROM `groups` WHERE group_id = ?', [groupId]);
    if (groupRows.length === 0) {
      return res.status(404).json({ error: '群组不存在' });
    }
    const group = groupRows[0];

    if (group.group_type !== 'socialist') {
      return res.status(400).json({ error: '此功能仅适用于社会主义群组' });
    }

    const role = await getGroupRole(groupId, req.username);
    if (!role) {
      return res.status(403).json({ error: '您不是该群组成员' });
    }

    if (!settings || typeof settings !== 'object' || Array.isArray(settings) || Object.keys(settings).length === 0) {
      return res.status(400).json({ error: '请提供有效的设置对象' });
    }

    // 映射特殊值以符合数据库约束
    if (settings.who_can_add_members === 'vote') {
      settings.who_can_add_members = 'owner';
    }

    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const [result] = await pool.execute(
      `INSERT INTO group_votes (group_id, vote_type, target_data, created_by, expires_at) VALUES (?, ?, ?, ?, ?)`,
      [groupId, 'change_settings', JSON.stringify(settings), req.username, expiresAt]
    );

    await pool.execute(
      'INSERT INTO group_vote_records (vote_id, username, vote) VALUES (?, ?, ?)',
      [result.insertId, req.username, 'yes']
    );

    await checkAndProcessVoteResult(result.insertId);

    // 发送群组通知消息
    // 发送群组通知消息 - 写入 Redis
    const notifyContent = `:::vote:${result.insertId}:::📋 我发起了修改设置投票`;

    // 获取消息序列号
    const counterKey = `group_counter:${groupId}`;
    let sequence = await redisClient.get(counterKey);
    if (!sequence) sequence = 0;
    sequence = parseInt(sequence) + 1;
    await redisClient.set(counterKey, sequence);

    const now = new Date();
    const time = `${now.getFullYear()}:${String(now.getMonth() + 1).padStart(2, '0')}`;
    const notifyRandomId = crypto.randomBytes(4).toString('hex');
    const sendIdHash = crypto.createHash('sha256').update(crypto.randomBytes(16)).digest('hex');

    const msgData = {
      content: notifyContent,
      time,
      sequence,
      randomId: notifyRandomId,
      sendIdHash,
      pinned: false,
      senderUsername: req.username
    };

    const msgKey = `groupmsg:${groupId}:${Date.now()}:${notifyRandomId}:${Math.random().toString(36).substr(2, 9)}`;
    await redisClient.set(msgKey, JSON.stringify(msgData));

    res.json({ success: true, voteId: result.insertId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '服务器错误' });
  }
});

// 获取群组的投票列表
app.get('/api/groups/:groupId/votes', authenticate, async (req, res) => {
  try {
    const { groupId } = req.params;

    const role = await getGroupRole(groupId, req.username);
    if (!role) {
      return res.status(403).json({ error: '您不是该群组成员' });
    }

    // 获取进行中的投票
    const [votes] = await pool.execute(
      `SELECT v.*, 
        (SELECT COUNT(*) FROM group_vote_records WHERE vote_id = v.id AND vote = 'yes') as yes_count,
        (SELECT COUNT(*) FROM group_vote_records WHERE vote_id = v.id AND vote = 'no') as no_count,
        (SELECT vote FROM group_vote_records WHERE vote_id = v.id AND username = ?) as my_vote
       FROM group_votes v
       WHERE v.group_id = ? AND v.status = 'pending'
       ORDER BY v.created_at DESC
       LIMIT 20`,
      [req.username, groupId]
    );

    const memberCount = await getGroupMemberCount(groupId);

    res.json({
      votes: votes.map(v => {
        let targetData = {};
        try {
          // 处理可能的双重编码或对象
          if (typeof v.target_data === 'string') {
            if (v.target_data === '[object Object]') {
              // 脏数据处理
              targetData = { error: 'Invalid Data' };
            } else {
              targetData = JSON.parse(v.target_data);
            }
          } else {
            targetData = v.target_data;
          }
        } catch (e) {
          console.error('JSON parse error:', e);
          targetData = { error: 'Parse Error' };
        }

        return {
          ...v,
          target_data: targetData,
          threshold: Math.ceil(memberCount / 2),
          member_count: memberCount
        };
      })
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '服务器错误' });
  }
});

// 投票
app.post('/api/groups/:groupId/votes/:voteId/cast', authenticate, async (req, res) => {
  try {
    const { groupId, voteId } = req.params;
    const { vote } = req.body;

    if (!['yes', 'no'].includes(vote)) {
      return res.status(400).json({ error: '无效的投票选项' });
    }

    const role = await getGroupRole(groupId, req.username);
    if (!role) {
      return res.status(403).json({ error: '您不是该群组成员' });
    }

    // 验证投票存在且状态正确
    const [voteRows] = await pool.execute(
      'SELECT * FROM group_votes WHERE id = ? AND group_id = ? AND status = ?',
      [voteId, groupId, 'pending']
    );
    if (voteRows.length === 0) {
      return res.status(404).json({ error: '投票不存在或已结束' });
    }

    // 检查是否已投票，如果已投票则更新
    const [existingVote] = await pool.execute(
      'SELECT id FROM group_vote_records WHERE vote_id = ? AND username = ?',
      [voteId, req.username]
    );


    if (existingVote.length > 0) {
      return res.status(400).json({ error: '您已经投过票了' });
    } else {
      await pool.execute(
        'INSERT INTO group_vote_records (vote_id, username, vote) VALUES (?, ?, ?)',
        [voteId, req.username, vote]
      );
    }

    // 检查并处理投票结果
    const result = await checkAndProcessVoteResult(voteId);

    res.json({ success: true, result });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '服务器错误' });
  }
});

// 踩消息
app.post('/api/groups/:groupId/messages/:messageId/downvote', authenticate, async (req, res) => {
  try {
    const { groupId, messageId } = req.params;

    const [groupRows] = await pool.execute('SELECT * FROM `groups` WHERE group_id = ?', [groupId]);
    if (groupRows.length === 0) {
      return res.status(404).json({ error: '群组不存在' });
    }
    const group = groupRows[0];

    if (group.group_type !== 'socialist') {
      return res.status(400).json({ error: '此功能仅适用于社会主义群组' });
    }

    const role = await getGroupRole(groupId, req.username);
    if (!role) {
      return res.status(403).json({ error: '您不是该群组成员' });
    }

    // 验证消息存在
    const keys = await scanKeys(`groupmsg:${groupId}:*:${messageId}:*`);
    if (keys.length === 0) {
      return res.status(404).json({ error: '消息不存在' });
    }

    // 记录踩
    try {
      await pool.execute(
        'INSERT INTO group_message_downvotes (group_id, message_id, username) VALUES (?, ?, ?)',
        [groupId, messageId, req.username]
      );
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY') {
        return res.status(400).json({ error: '您已经踩过这条消息' });
      }
      throw err;
    }

    // 检查踩数是否达到阈值
    const memberCount = await getGroupMemberCount(groupId);
    const [downvoteRows] = await pool.execute(
      'SELECT COUNT(*) as count FROM group_message_downvotes WHERE group_id = ? AND message_id = ?',
      [groupId, messageId]
    );
    const downvoteCount = downvoteRows[0].count;
    const threshold = Math.ceil(memberCount / 2);

    if (downvoteCount >= threshold) {
      // 删除消息
      for (const key of keys) {
        await redisClient.del(key);
      }
      // 清理踩记录
      await pool.execute(
        'DELETE FROM group_message_downvotes WHERE group_id = ? AND message_id = ?',
        [groupId, messageId]
      );
      return res.json({ success: true, deleted: true, message: '消息已被删除' });
    }

    res.json({ success: true, downvoteCount, threshold, remaining: threshold - downvoteCount });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '服务器错误' });
  }
});

// 获取消息的踩数
app.get('/api/groups/:groupId/messages/:messageId/downvotes', authenticate, async (req, res) => {
  try {
    const { groupId, messageId } = req.params;

    const role = await getGroupRole(groupId, req.username);
    if (!role) {
      return res.status(403).json({ error: '您不是该群组成员' });
    }

    const memberCount = await getGroupMemberCount(groupId);
    const [downvoteRows] = await pool.execute(
      'SELECT COUNT(*) as count FROM group_message_downvotes WHERE group_id = ? AND message_id = ?',
      [groupId, messageId]
    );
    const [myDownvote] = await pool.execute(
      'SELECT id FROM group_message_downvotes WHERE group_id = ? AND message_id = ? AND username = ?',
      [groupId, messageId, req.username]
    );

    res.json({
      downvoteCount: downvoteRows[0].count,
      threshold: Math.ceil(memberCount / 2),
      hasDownvoted: myDownvote.length > 0
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '服务器错误' });
  }
});