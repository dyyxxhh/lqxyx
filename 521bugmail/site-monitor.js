/**
 * dyyapp.com 网站监控脚本
 * 默认按常规间隔检查网站状态。
 * 一旦首次发现异常，进入接下来 5 分钟的持续检测窗口：
 * 只有在这 5 分钟内持续检测都异常，才发送故障邮件。
 * 使用 Redis 保存告警状态和观察窗口状态，避免重复通知。
 */

require('dotenv').config({ debug: false });
const https = require('https');
const cron = require('node-cron');
const Redis = require('ioredis');

const PERSISTENT_FAILURE_WINDOW_MS = 5 * 60 * 1000;
const PERSISTENT_FAILURE_CHECK_INTERVAL_MS = 60 * 1000;

// 配置
const CONFIG = {
    targetUrl: process.env.MONITOR_URL || 'https://dyyapp.com',
    checkIntervalMinutes: parseInt(process.env.CHECK_INTERVAL_MINUTES, 10) || 5,
    timeout: 30000,

    redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT, 10) || 6379,
        errorKey: 'site-monitor:error-state',
        pendingErrorKey: 'site-monitor:pending-error-state'
    },

    graph: {
        clientId: process.env.MICROSOFT_GRAPH_CLIENT_ID,
        clientSecret: process.env.MICROSOFT_GRAPH_CLIENT_SECRET,
        tenantId: process.env.MICROSOFT_GRAPH_TENANT_ID,
    },

    email: {
        sender: process.env.EMAIL_SENDER || 'notice@dyyapp.com',
        recipients: (process.env.EMAIL_RECIPIENTS || 'yueyang@dyyapp.com').split(',').map(e => e.trim()),
        errorSubject: process.env.EMAIL_ERROR_SUBJECT || '⚠️ dyyapp.com 网站错误警报',
        errorBody: process.env.EMAIL_ERROR_BODY || '<h2>网站监控警报</h2><p>错误: {ERROR_MSG}</p><p>时间: {TIME}</p><p>站点: {URL}</p>',
        recoverySubject: process.env.EMAIL_RECOVERY_SUBJECT || '✅ dyyapp.com 网站已恢复正常',
        recoveryBody: process.env.EMAIL_RECOVERY_BODY || '<h2>网站恢复通知</h2><p>网站已恢复正常</p><p>时间: {TIME}</p><p>站点: {URL}</p>',
    }
};

const CLOUDFLARE_ERROR_CODES = [520, 521, 522, 523, 524, 525, 526, 527];
let redisClient;
let pendingValidationTimer = null;
let validationInProgress = false;

function nowIso() {
    return new Date().toISOString();
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// 简单的 HTTPS 请求封装
function httpsRequest(url, options = {}) {
    return new Promise((resolve, reject) => {
        const req = https.get(url, { timeout: CONFIG.timeout, ...options }, (res) => {
            resolve({ status: res.statusCode, headers: res.headers });
            res.destroy();
        });
        req.on('error', reject);
        req.on('timeout', () => {
            req.destroy();
            reject(new Error('ETIMEDOUT'));
        });
    });
}

// HTTPS POST 请求
function httpsPost(url, data, headers = {}) {
    return new Promise((resolve, reject) => {
        const urlObj = new URL(url);
        const postData = typeof data === 'string' ? data : JSON.stringify(data);

        const options = {
            hostname: urlObj.hostname,
            path: `${urlObj.pathname}${urlObj.search}`,
            method: 'POST',
            headers: {
                'Content-Type': headers['Content-Type'] || 'application/json',
                'Content-Length': Buffer.byteLength(postData),
                ...headers
            }
        };

        const req = https.request(options, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                try {
                    resolve({ status: res.statusCode, data: JSON.parse(body) });
                } catch {
                    resolve({ status: res.statusCode, data: body });
                }
            });
        });

        req.on('error', reject);
        req.write(postData);
        req.end();
    });
}

async function initRedis() {
    redisClient = new Redis({
        host: CONFIG.redis.host,
        port: CONFIG.redis.port,
        lazyConnect: true
    });
    redisClient.on('error', err => console.error('[Redis] 错误:', err.message));
    await redisClient.connect();
    console.log('[Redis] 连接成功');
}

async function getErrorState() {
    return (await redisClient.get(CONFIG.redis.errorKey)) === 'true';
}

async function setErrorState(hasError) {
    await redisClient.set(CONFIG.redis.errorKey, hasError ? 'true' : 'false');
}

async function getPendingErrorState() {
    const raw = await redisClient.get(CONFIG.redis.pendingErrorKey);
    return raw ? JSON.parse(raw) : null;
}

async function setPendingErrorState(state) {
    if (!state) {
        await redisClient.del(CONFIG.redis.pendingErrorKey);
        return;
    }
    await redisClient.set(CONFIG.redis.pendingErrorKey, JSON.stringify(state));
}

function formatTemplate(template, vars) {
    let result = template;
    for (const [key, value] of Object.entries(vars)) {
        result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
    }
    return result;
}

function getTimeString() {
    return new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
}

async function getAccessToken() {
    const tokenUrl = `https://login.microsoftonline.com/${CONFIG.graph.tenantId}/oauth2/v2.0/token`;
    const params = new URLSearchParams();
    params.append('client_id', CONFIG.graph.clientId);
    params.append('client_secret', CONFIG.graph.clientSecret);
    params.append('scope', 'https://graph.microsoft.com/.default');
    params.append('grant_type', 'client_credentials');

    const res = await httpsPost(tokenUrl, params.toString(), {
        'Content-Type': 'application/x-www-form-urlencoded'
    });
    return res.data.access_token;
}

async function sendEmailNotification(subject, body) {
    try {
        const accessToken = await getAccessToken();
        const mailUrl = `https://graph.microsoft.com/v1.0/users/${CONFIG.email.sender}/sendMail`;

        const mailData = {
            message: {
                subject,
                body: { contentType: 'HTML', content: body },
                toRecipients: CONFIG.email.recipients.map(email => ({
                    emailAddress: { address: email }
                }))
            },
            saveToSentItems: false
        };

        await httpsPost(mailUrl, mailData, {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
        });

        console.log(`[${nowIso()}] 邮件发送成功: ${subject}`);
        return true;
    } catch (error) {
        console.error(`[${nowIso()}] 邮件发送失败:`, error.message);
        return false;
    }
}

function buildErrorResultFromStatus(statusCode) {
    const isCloudflareError = CLOUDFLARE_ERROR_CODES.includes(statusCode);
    const isServerError = statusCode >= 500;

    if (!isServerError && !isCloudflareError) {
        return {
            ok: statusCode >= 200 && statusCode < 400,
            statusCode,
            message: `HTTP ${statusCode}`
        };
    }

    const errorType = isCloudflareError ? 'Cloudflare 错误' : '服务器错误';
    return {
        ok: false,
        statusCode,
        message: `${errorType} - HTTP ${statusCode}`
    };
}

async function probeWebsite() {
    try {
        const response = await httpsRequest(CONFIG.targetUrl);
        return buildErrorResultFromStatus(response.status);
    } catch (error) {
        return {
            ok: false,
            statusCode: null,
            message: `网络错误 - ${error.message || '未知错误'}`
        };
    }
}

function clearPendingValidationTimer() {
    if (pendingValidationTimer) {
        clearTimeout(pendingValidationTimer);
        pendingValidationTimer = null;
    }
}

function schedulePendingValidation(delayMs = 0) {
    clearPendingValidationTimer();
    pendingValidationTimer = setTimeout(() => {
        validatePendingFailureWindow().catch(err => {
            console.error(`[${nowIso()}] 持续检测任务失败:`, err);
        });
    }, delayMs);
}

async function clearPendingErrorState(reason) {
    await setPendingErrorState(null);
    clearPendingValidationTimer();
    console.log(`[${nowIso()}] 已清除待确认故障状态${reason ? `：${reason}` : ''}`);
}

async function validatePendingFailureWindow() {
    if (validationInProgress) {
        console.log(`[${nowIso()}] 持续检测任务已在运行，跳过重复执行`);
        return;
    }

    validationInProgress = true;
    try {
        const pendingState = await getPendingErrorState();
        if (!pendingState) {
            clearPendingValidationTimer();
            return;
        }

        const now = Date.now();
        const elapsedMs = now - pendingState.firstDetectedAt;
        const result = await probeWebsite();

        if (result.ok) {
            console.log(`[${nowIso()}] ✅ 观察期内网站恢复正常，取消故障告警流程`);
            await clearPendingErrorState('观察期内恢复');
            return;
        }

        const updatedState = {
            ...pendingState,
            lastCheckedAt: now,
            lastError: result.message,
            consecutiveFailures: (pendingState.consecutiveFailures || 1) + 1
        };

        if (elapsedMs >= PERSISTENT_FAILURE_WINDOW_MS) {
            console.log(`[${nowIso()}] ❌ 故障已持续超过 5 分钟，发送告警邮件: ${result.message}`);
            const vars = { TIME: getTimeString(), URL: CONFIG.targetUrl, ERROR_MSG: result.message };
            const sent = await sendEmailNotification(
                formatTemplate(CONFIG.email.errorSubject, vars),
                formatTemplate(CONFIG.email.errorBody, vars)
            );

            if (sent) {
                await setErrorState(true);
                await clearPendingErrorState('已发送故障告警');
                console.log(`[${nowIso()}] [Redis] 已标记错误状态`);
            } else {
                await setPendingErrorState(updatedState);
                schedulePendingValidation(PERSISTENT_FAILURE_CHECK_INTERVAL_MS);
            }
            return;
        }

        await setPendingErrorState(updatedState);
        const remainingMs = PERSISTENT_FAILURE_WINDOW_MS - elapsedMs;
        console.log(`[${nowIso()}] 观察期内仍异常：${result.message}，${Math.ceil(remainingMs / 1000)} 秒后继续检测`);
        schedulePendingValidation(Math.min(PERSISTENT_FAILURE_CHECK_INTERVAL_MS, Math.max(remainingMs, 1000)));
    } finally {
        validationInProgress = false;
    }
}

async function handleHealthyState(timestamp, wasInErrorState) {
    console.log(`[${timestamp}] ✅ 网站正常`);

    const pendingState = await getPendingErrorState();
    if (pendingState) {
        await clearPendingErrorState('常规检测发现网站正常');
    }

    if (wasInErrorState) {
        const vars = { TIME: getTimeString(), URL: CONFIG.targetUrl };
        await sendEmailNotification(
            formatTemplate(CONFIG.email.recoverySubject, vars),
            formatTemplate(CONFIG.email.recoveryBody, vars)
        );
        await setErrorState(false);
        console.log(`[${timestamp}] [Redis] 已清除错误状态`);
    }
}

async function startPendingFailureWindow(errorMsg, timestamp) {
    const pendingState = await getPendingErrorState();
    if (pendingState) {
        console.log(`[${timestamp}] 已存在待确认故障窗口，继续等待持续检测结论`);
        schedulePendingValidation(PERSISTENT_FAILURE_CHECK_INTERVAL_MS);
        return;
    }

    const state = {
        firstDetectedAt: Date.now(),
        lastCheckedAt: Date.now(),
        lastError: errorMsg,
        consecutiveFailures: 1
    };

    await setPendingErrorState(state);
    console.log(`[${timestamp}] 首次检测到异常，进入 5 分钟持续检测窗口：${errorMsg}`);
    schedulePendingValidation(PERSISTENT_FAILURE_CHECK_INTERVAL_MS);
}

async function checkWebsite() {
    const timestamp = nowIso();
    console.log(`[${timestamp}] 正在检查 ${CONFIG.targetUrl}...`);

    const wasInErrorState = await getErrorState();
    const result = await probeWebsite();

    if (result.ok) {
        await handleHealthyState(timestamp, wasInErrorState);
        return;
    }

    console.log(`[${timestamp}] ❌ 检测异常: ${result.message}`);

    if (wasInErrorState) {
        console.log(`[${timestamp}] 已在错误状态中，跳过重复告警`);
        return;
    }

    await startPendingFailureWindow(result.message, timestamp);
}

async function restorePendingValidationOnStart() {
    const pendingState = await getPendingErrorState();
    if (!pendingState) return;

    const elapsedMs = Date.now() - pendingState.firstDetectedAt;
    if (elapsedMs >= PERSISTENT_FAILURE_WINDOW_MS) {
        console.log(`[${nowIso()}] 检测到遗留观察窗口已超时，立即继续验证`);
        schedulePendingValidation(0);
        return;
    }

    const remainingMs = PERSISTENT_FAILURE_WINDOW_MS - elapsedMs;
    console.log(`[${nowIso()}] 恢复遗留观察窗口，${Math.ceil(remainingMs / 1000)} 秒后继续检测`);
    schedulePendingValidation(Math.min(PERSISTENT_FAILURE_CHECK_INTERVAL_MS, Math.max(remainingMs, 1000)));
}

async function main() {
    console.log('='.repeat(50));
    console.log('dyyapp.com 网站监控脚本已启动');
    console.log(`监控目标: ${CONFIG.targetUrl}`);
    console.log(`常规检查间隔: 每 ${CONFIG.checkIntervalMinutes} 分钟`);
    console.log(`异常确认窗口: ${PERSISTENT_FAILURE_WINDOW_MS / 60000} 分钟，期间每 ${PERSISTENT_FAILURE_CHECK_INTERVAL_MS / 1000} 秒复检一次`);
    console.log(`通知邮箱: ${CONFIG.email.recipients.join(', ')}`);
    console.log('='.repeat(50));

    await initRedis();
    await restorePendingValidationOnStart();
    await checkWebsite();

    cron.schedule(`*/${CONFIG.checkIntervalMinutes} * * * *`, () => {
        checkWebsite().catch(err => {
            console.error(`[${nowIso()}] 定时检查失败:`, err);
        });
    });
}

process.on('SIGINT', async () => {
    console.log('\n正在关闭...');
    clearPendingValidationTimer();
    if (redisClient) await redisClient.quit();
    console.log('监控脚本已停止');
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('\n收到 SIGTERM，正在关闭...');
    clearPendingValidationTimer();
    if (redisClient) await redisClient.quit();
    console.log('监控脚本已停止');
    process.exit(0);
});

main().catch(err => {
    console.error('启动失败:', err);
    process.exit(1);
});
