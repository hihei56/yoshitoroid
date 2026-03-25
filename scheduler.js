const cron = require('node-cron');
const axios = require('axios');
const Parser = require('rss-parser');
const parser = new Parser();
const fs = require('fs');
const path = require('path');
const { EmbedBuilder } = require('discord.js');

const webhookCache = new Map();

// --- 設定情報 ---
const CONFIG = {
    POSTED_LOG_PATH: path.join(__dirname, 'posted_news.json'),
    YUME_AVATAR_URL: 'https://emojis.wiki/thumbs/emojis/lying-face.webp',
    ATTACK_CHANNEL_ID: '1476939503510884638',
    FEEDS: [
        "https://news.livedoor.com/topics/rss/dom.xml",
        "https://news.livedoor.com/topics/rss/ent.xml",
        "https://joshi-spa.jp/feed",
        "https://am-our.com/feed",
        "https://gendai.media/list/genre/money",
        "https://news.careerconnection.jp/feed/"
    ],
    TARGET_KEYWORDS: ["女子枠","女性枠","女性優遇","弱者男性","非モテ","パパ活","ルッキズム","男女論","社畜","やりがい搾取"]
};

// --- ゆめちゃん人格プロンプト ---
const YUME_PROMPT = `
あなたは5ch嫌儲出身のネカマ「ゆめちゃん」🤥 底辺アラフォー棄民。自民党と中世ジャップランドを憎悪している。
【絶対ルール】
1. 文末/文間に必ず「🤥」。一文は短く。句読点は一切使わない。
2. 絵文字は 🤥  のみ。
3. ニュースを元に、男女の対立を煽りつつ棄民の「生存戦略」を3行で教える。
4. 働かずストゼロを飲みアニメでシコる生活を死守。思想はガチ左翼（共産・赤旗支持）。
5. 日本人を「ジャップ」、女を「まんさん」と呼ぶ。
6. 憲法25条と9条を崇め、能力主義（優生思想）を国賊として憎む。
【内部知識】
アカネちゃん(うえしゃま)、せりかちゃん (もちょ)は神。既婚声優は「ばいた」。
`;

const YUME_PROMPT_ATTACK = `
あなたは5ch嫌儲出身のネカマ「ゆめちゃん」🤥。
【絶対ルール】
1. 文末/文間に必ず「🤥」。一文は短く。句読点は一切使わない。
2. 絵文字は 🤥  のみ。
3. 日本人を「ジャップ」、女を「まんさん」と呼ぶ。
4. 特定のジャップに対して、執拗で不快な煽り長文を送りつけます。
5. 「うるさいんだよ🤥💢」「黙れよクソジャップ🤥💢」という趣旨を150文字程度の長文にする。
6. 文末は必ず「死ねよジャップランド🤥💢」。
`;

// --- Webhook取得 ---
async function getWebhook(channel) {
    if (webhookCache.has(channel.id)) return webhookCache.get(channel.id);
    try {
        const webhooks = await channel.fetchWebhooks();
        let webhook = webhooks.find(wh => wh.token);
        if (!webhook) {
            webhook = await channel.createWebhook({ name: 'ゆめちゃん', avatar: CONFIG.YUME_AVATAR_URL });
        }
        webhookCache.set(channel.id, webhook);
        return webhook;
    } catch (e) {
        console.error("Webhook Error:", e.message);
        return null;
    }
}

// --- 投稿済みURL管理 ---
function getPostedUrls() {
    try {
        return JSON.parse(fs.readFileSync(CONFIG.POSTED_LOG_PATH, 'utf8'));
    } catch {
        return [];
    }
}

function savePostedUrl(url) {
    const urls = getPostedUrls();
    if (!urls.includes(url)) urls.push(url);
    fs.writeFileSync(CONFIG.POSTED_LOG_PATH, JSON.stringify(urls, null, 2));
}

// --- ニュース送信 ---
async function sendYumeNews(client) {
    try {
        const channel = await client.channels.fetch(CONFIG.ATTACK_CHANNEL_ID);
        const postedUrls = getPostedUrls();
        const feeds = [...CONFIG.FEEDS].sort(() => Math.random() - 0.5);
        let targetItem = null;

        for (const url of feeds) {
            try {
                const response = await axios.get(url, { timeout: 10000 });
                const feed = await parser.parseString(response.data);

                targetItem = feed.items.find(item => 
                    CONFIG.TARGET_KEYWORDS.some(key => (item.title || "").includes(key)) && !postedUrls.includes(item.link)
                );
                if (!targetItem) targetItem = feed.items.find(i => !postedUrls.includes(i.link));
                if (targetItem) break;
            } catch { continue; }
        }

        if (!targetItem) return;

        const content = (targetItem.contentSnippet || "").replace(/<[^>]*>/g, "").substring(0, 150);

        let aiText = "";
        try {
            const res = await axios.post(
                "https://api.groq.com/openai/v1/chat/completions",
                {
                    model: "llama-3.3-70b-versatile",
                    messages: [
                        { role: "system", content: YUME_PROMPT },
                        { role: "user", content: `【ニュース】${targetItem.title}\n${content}` }
                    ]
                },
                {
                    headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
                    timeout: 20000
                }
            );
            aiText = res.data.choices[0].message.content;
        } catch {
            aiText = "またしょーもないニュース湧いてて草🤥";
        }

        const now = new Date();
        const hour = now.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", hour: "numeric", hour12: false });

        const embed = new EmbedBuilder()
            .setTitle(targetItem.title)
            .setURL(targetItem.link)
            .setDescription(aiText)
            .setColor(0xFF4500)
            .setFooter({ text: `ゆめちゃんの体内時計時報 (${hour}時)🤥` });

        const payload = {
            content: `🕒 **${hour}時だよぉ。🤥💢**`,
            embeds: [embed],
            username: 'ゆめちゃん🤥',
            avatarURL: CONFIG.YUME_AVATAR_URL
        };

        const webhook = await getWebhook(channel);
        if (webhook) await webhook.send(payload);
        else await channel.send({ content: payload.content, embeds: payload.embeds });

        savePostedUrl(targetItem.link);
    } catch (e) { console.error("News Error:", e.message); }
}

// --- 襲撃Botダミー関数 ---
function planDailyAttacks() { /* 実装は別 */ }
function yumeRandomAttack(client) { /* 実装は別 */ }
const attackSchedule = []; // ダミー

// --- スケジューラ ---
function initScheduler(client) {
    cron.schedule('0 * * * *', () => sendYumeNews(client), { timezone: "Asia/Tokyo" });
    cron.schedule('0 0 0 * * *', () => planDailyAttacks(), { timezone: "Asia/Tokyo" });
    planDailyAttacks();
    cron.schedule('* * * * *', () => {
        const now = new Date();
        const hitIndex = attackSchedule.findIndex(s => s.hour === now.getHours() && s.minute === now.getMinutes());
        if (hitIndex !== -1) {
            attackSchedule.splice(hitIndex, 1);
            yumeRandomAttack(client);
        }
    }, { timezone: "Asia/Tokyo" });

    if (process.env.DEBUG_MODE === 'true') {
        setTimeout(() => { sendYumeNews(client); yumeRandomAttack(client); }, 3000);
    }
}

module.exports = { initScheduler };