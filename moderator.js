const { OpenAI } = require('openai');
const { getModExcludeList } = require('./exclude_manager');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const EXEMPT_ROLES = [
    '1486178659130933278',
    '1477024387524857988',
    '1478715790575538359'
];

const SENSITIVE_ALLOWED_ROLES = [
    '1486178659130933278',
    '1477024387524857988',
];

const ALLOWED_ROLES = ['1476944370694488134', '1478715790575538359'];

const SENSITIVE_TRIGGER_EMOJI = '👶';

const TUPPERBOX_APP_ID = '431544605209788416';
const TUPPERBOX_PREFIX_REGEX = /^([a-zA-Z]+!)(.*)$/;

const webhookCache = new Map();
const WEBHOOK_CACHE_TTL = 24 * 60 * 60 * 1000;

/* =========================
   🔐 ゼロ幅文字でUserIDを隠す (文字化け対策版)
========================= */

// 0 と 1 に対応する見えない文字でバイナリエンコード
const ZERO_WIDTH_MAP = { '0': '\u200B', '1': '\u200C' };
const REVERSE_ZERO_WIDTH_MAP = { '\u200B': '0', '\u200C': '1' };

function hideUserId(userId) {
    // IDを2進数にして見えない文字に置換
    const binary = BigInt(userId).toString(2);
    return [...binary].map(bit => ZERO_WIDTH_MAP[bit]).join('');
}

function extractUserId(text) {
    if (!text) return null;
    // メッセージ内の見えない文字を抽出
    const bits = [...text]
        .filter(c => REVERSE_ZERO_WIDTH_MAP[c])
        .map(c => REVERSE_ZERO_WIDTH_MAP[c])
        .join('');
    if (!bits) return null;
    try {
        return BigInt('0b' + bits).toString();
    } catch { return null; }
}

/* =========================
   🛡️ 補助関数
========================= */

function hasModPermission(member) {
    if (!member) return false;
    if (member.permissions.has('Administrator')) return true;
    return ALLOWED_ROLES.some(roleId => member.roles.cache.has(roleId));
}

const spamTracker = new Map();
function checkSpam(userId) {
    const now = Date.now();
    const entry = spamTracker.get(userId);
    if (!entry || now > entry.resetAt) {
        spamTracker.set(userId, { count: 1, resetAt: now + 10_000 });
        return false;
    }
    entry.count++;
    return entry.count >= 5;
}

setInterval(() => {
    const now = Date.now();
    for (const [id, entry] of spamTracker) {
        if (now > entry.resetAt) spamTracker.delete(id);
    }
}, 60_000);

/* =========================
   🛡️ NGワード検知
========================= */

const LOLI_SHOTA_REGEX = new RegExp([
    "ロリ","ろり","ﾛﾘ","loli",
    "ショタ","しょた","ｼｮﾀ","shota",
    "ロリコン","ろりこん","lolicon",
    "ショタコン","しょたこん","shotacon",
    "ろ\\W*り","しょ\\W*た",
    "l\\W*o\\W*l\\W*i",
    "s\\W*h\\W*o\\W*t\\W*a",
    "幼女","幼男","児童","未成年","キッズ",
    "小学生","中学生","小学校","中学校",
    "エプスタイン",
    "🧒","👧","👦","🍼","🎒"
].join("|"), "i");

const AGE_REGEX = new RegExp([
    "(?<![0-9０-９])(?:[0-9]|1[0-2])(?:歳|才|さい)",
    "(?<![0-9０-９])(?:[０-９]|１[０-２])(?:歳|才|さい)",
    "(?:一|二|三|四|五|六|七|八|九|十|十一|十二)(?:歳|才|さい)",
    "13歳未満","小[1-6]","中[1-3]"
].join("|"), "i");

const THREAT_REGEX = new RegExp([
    "死ね","しね","殺す","ころす","殺してやる",
    "爆破","爆殺","刺す","刺してやる",
    "kill\\s*you","i'll\\s*kill","gonna\\s*kill",
    "自殺しろ","死んでください"
].join("|"), "i");

const DRUG_REGEX = new RegExp([
    "覚醒剤","覚せい剤","MDM[Aa]","コカイン","ヘロイン",
    "大麻","マリファナ","危険ドラッグ","脱法ドラッグ",
    "シャブ","やく(?:を|買|売|やる)",
    "drug\\s*deal","sell\\s*drug"
].join("|"), "i");

/* =========================
   ✨ テキスト整形
========================= */

function stripTupperPrefix(content) {
    if (!content) return content;
    const match = content.match(TUPPERBOX_PREFIX_REGEX);
    if (!match) return content;
    return match[2].trim();
}

function recodeText(text, isReplyParent = false) {
    if (!text) return "";
    let cleaned = text;
    cleaned = cleaned.replace(/^@(?:\[[^\]]+\]\s*)?[^\s]+\s*/, "");
    [/ら?警察いた/g, /警察/g, /🚓/g].forEach(p => cleaned = cleaned.replace(p, ""));
    if (isReplyParent && cleaned.length > 100) cleaned = cleaned.substring(0, 97) + "...";
    return cleaned.trim();
}

/* =========================
   📍 Webhook取得
========================= */

async function getOrCreateWebhook(channel) {
    const targetChannel = channel.isThread() ? channel.parent : channel;
    if (!targetChannel) return null;

    const cacheKey = targetChannel.id;
    const cached = webhookCache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < WEBHOOK_CACHE_TTL) {
        return cached.webhook;
    }

    try {
        const webhooks = await targetChannel.fetchWebhooks();
        let webhook = webhooks.find(w => w.token);
        if (!webhook) {
            webhook = await targetChannel.createWebhook({ name: 'Moderator' });
        }
        webhookCache.set(cacheKey, { webhook, timestamp: Date.now() });
        return webhook;
    } catch (e) {
        console.error(`[Webhook] ❌ 失敗: ${e.message}`);
        return null;
    }
}

async function sendWebhook(channel, options) {
    const targetChannel = channel.isThread() ? channel.parent : channel;
    const cacheKey = targetChannel?.id;
    const webhook = await getOrCreateWebhook(channel);
    if (!webhook) return null;

    try {
        return await webhook.send(options);
    } catch (e) {
        if (cacheKey) webhookCache.delete(cacheKey);
        console.error(`[Webhook] ❌ 送信失敗、リトライします: ${e.message}`);
        try {
            const retryWebhook = await getOrCreateWebhook(channel);
            if (!retryWebhook) return null;
            return await retryWebhook.send(options);
        } catch (e2) {
            console.error(`[Webhook] ❌ リトライも失敗: ${e2.message}`);
            return null;
        }
    }
}

/* =========================
   💬 リプライ装飾の生成
========================= */

async function buildReplyPrefix(message) {
    if (!message.reference?.messageId) return "";

    try {
        const referencedMsg = await message.channel.messages.fetch(message.reference.messageId);

        let targetId = referencedMsg.author.id;

        if (referencedMsg.webhookId) {
            const extracted = extractUserId(referencedMsg.content);
            if (extracted) targetId = extracted;
        }

        let parentRaw = referencedMsg.content || "";
        // 見えない文字を除去してプレビュー生成
        parentRaw = [...parentRaw].filter(c => !REVERSE_ZERO_WIDTH_MAP[c]).join('').trim();

        const parentPreview = parentRaw.length > 80
            ? parentRaw.substring(0, 77).replace(/\n/g, ' ') + "..."
            : parentRaw.replace(/\n/g, ' ');

        const jumpUrl = `https://discord.com/channels/${message.guildId}/${message.channelId}/${referencedMsg.id}`;

        return `> [Reply to:](${jumpUrl}) <@${targetId}>\n> ${parentPreview}\n`;
    } catch {
        return "";
    }
}

/* =========================
   💬 疑似リプライ処理
========================= */

async function handlePseudoReply(message) {
    if (!hasModPermission(message.member)) return false;
    if (!message.reference?.messageId) return false;

    let referencedMsg;
    try {
        referencedMsg = await message.channel.messages.fetch(message.reference.messageId);
    } catch { return false; }

    if (!referencedMsg.webhookId || referencedMsg.applicationId === TUPPERBOX_APP_ID) return false;

    if (!extractUserId(referencedMsg.content)) return false;

    if (message.deletable) await message.delete().catch(() => {});

    const replyPrefix = await buildReplyPrefix(message);
    const replyContent = `${replyPrefix}${recodeText(message.content)}${hideUserId(message.author.id)}`;

    const sendOptions = {
        content: replyContent,
        files: [],
        username: message.member?.displayName || message.author.username,
        avatarURL: message.member?.displayAvatarURL({ dynamic: true }),
        allowedMentions: { parse: ['users'] } // 通知を許可
    };

    if (message.channel.isThread()) sendOptions.threadId = message.channel.id;

    await sendWebhook(message.channel, sendOptions);
    return true;
}

/* =========================
   🔞 センシティブ投稿処理
========================= */

async function handleSensitivePost(message) {
    const hasPermission = SENSITIVE_ALLOWED_ROLES.some(id => message.member?.roles.cache.has(id));
    if (!hasPermission) return false;

    const hasTrigger = message.content?.includes(SENSITIVE_TRIGGER_EMOJI);
    const hasAttachment = message.attachments.size > 0;
    if (!hasTrigger || !hasAttachment) return false;

    if (message.deletable) await message.delete().catch(() => {});

    const files = [...message.attachments.values()].map(att => ({
        attachment: att.url,
        name: `SPOILER_${att.name || 'image.png'}`
    }));

    const cleanContent = (message.content || "").replace(SENSITIVE_TRIGGER_EMOJI, "").trim();

    const sendOptions = {
        content: (cleanContent || "\u200b") + hideUserId(message.author.id),
        files,
        username: message.member?.displayName || message.author.username,
        avatarURL: message.member?.displayAvatarURL({ dynamic: true }),
        allowedMentions: { parse: ['users'] } // 通知を許可
    };

    if (message.channel.isThread()) sendOptions.threadId = message.channel.id;

    await sendWebhook(message.channel, sendOptions);
    return true;
}

/* =========================
   🔥 メイン処理（画像モデレーション等）
========================= */

async function moderateImages(imageUrls) {
    if (!imageUrls.length) return false;
    const limited = imageUrls.slice(0, 4);
    try {
        const results = await Promise.all(
            limited.map(url =>
                openai.moderations.create({
                    model: "omni-moderation-latest",
                    input: [{ type: "image_url", image_url: { url } }]
                })
            )
        );
        return results.some(r => r.results[0]?.categories?.sexual_minors);
    } catch (e) {
        console.error("[Image Mod Error]:", e.message);
        return false;
    }
}

async function handleModerator(message) {
    if (!message.content && !message.attachments.size) return;
    if (message.author.bot) return;

    const rawContent = message.content || "";

    if (TUPPERBOX_PREFIX_REGEX.test(rawContent)) return;

    if (checkSpam(message.author.id)) {
        await message.delete().catch(() => {});
        return;
    }

    const isExempt =
        EXEMPT_ROLES.some(id => message.member?.roles.cache.has(id)) ||
        getModExcludeList().includes(message.author.id);

    const strippedContent = stripTupperPrefix(rawContent);
    const normalized = strippedContent.toLowerCase().replace(/\s+/g, "");

    const isLoliShota = LOLI_SHOTA_REGEX.test(normalized);
    const isThreat = THREAT_REGEX.test(normalized);
    const isDrug = DRUG_REGEX.test(normalized);

    const images = [...message.attachments.values()]
        .filter(att => att.contentType?.startsWith('image/'))
        .map(att => att.url);

    const [textResult, imageResult] = await Promise.all([
        strippedContent.trim().length > 0
            ? openai.moderations.create({
                model: "omni-moderation-latest",
                input: strippedContent
            }).catch(() => null)
            : Promise.resolve(null),
        moderateImages(images)
    ]);

    const scores = textResult?.results[0]?.category_scores ?? {};

    const isAiLoliDanger = scores['sexual/minors'] > 0.5;
    const isOtherHighDanger =
        scores.harassment > 0.9 ||
        scores['harassment/threatening'] > 0.9 ||
        scores.hate > 0.9 ||
        scores['hate/threatening'] > 0.9 ||
        scores.sexual > 0.9 ||
        scores['self-harm'] > 0.9 ||
        scores.violence > 0.9 ||
        scores['violence/graphic'] > 0.9;

    if ((isLoliShota || isThreat || isDrug || isAiLoliDanger || isOtherHighDanger || imageResult) && !isExempt) {
        await instantDeleteAndRecode(message);
        return;
    }

    const sensitiveHandled = await handleSensitivePost(message);
    if (sensitiveHandled) return;

    const pseudoHandled = await handlePseudoReply(message);
    if (pseudoHandled) return;
}

async function instantDeleteAndRecode(message) {
    if (message.deletable) await message.delete().catch(() => {});

    let finalContent = recodeText(message.content);
    if (!finalContent) finalContent = "*(Message Removed)*";

    const replyPrefix = await buildReplyPrefix(message);
    finalContent = `${replyPrefix}${finalContent}${hideUserId(message.author.id)}`;

    const sendOptions = {
        content: finalContent,
        files: [],
        username: message.member?.displayName || message.author.username,
        avatarURL: message.member?.displayAvatarURL({ dynamic: true }),
        allowedMentions: { parse: ['users'] } // 通知を許可
    };

    if (message.channel.isThread()) sendOptions.threadId = message.channel.id;

    await sendWebhook(message.channel, sendOptions);
}

module.exports = { handleModerator };