const cron = require('node-cron');
const axios = require('axios');
const Parser = require('rss-parser');
const parser = new Parser();
const fs = require('fs');
const path = require('path');
const { EmbedBuilder } = require('discord.js');

// --- 設定情報 ---
const CONFIG = {
    POSTED_LOG_PATH: path.join(__dirname, 'posted_news.json'),
    YUME_AVATAR_URL: 'https://emojis.wiki/thumbs/emojis/lying-face.webp',

    // ✅ ハードコード化
    NEWS_CHANNEL_ID: '1476939503510884638',

    ROLE_JAKUSHA: '1476944370694488134',
    ROLE_RAIHIN: '1478715790575538359',
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

// --- 追加：キャッシュ ---
const webhookCache = new Map();

// --- 投稿履歴 ---
function getPostedUrls() {
    try {
        if (!fs.existsSync(CONFIG.POSTED_LOG_PATH)) return [];
        return JSON.parse(fs.readFileSync(CONFIG.POSTED_LOG_PATH));
    } catch {
        return [];
    }
}

function savePostedUrl(url) {
    const urls = getPostedUrls();
    urls.push(url);
    fs.writeFileSync(CONFIG.POSTED_LOG_PATH, JSON.stringify(urls, null, 2));
}

// --- Webhook ---
async function getWebhook(channel) {
    if (webhookCache.has(channel.id)) return webhookCache.get(channel.id);

    try {
        console.log("🔍 webhook取得");

        const webhooks = await channel.fetchWebhooks();
        let webhook = webhooks.find(wh => wh.token);

        if (!webhook) {
            console.log("🆕 webhook作成");
            webhook = await channel.createWebhook({
                name: 'ゆめちゃん',
                avatar: CONFIG.YUME_AVATAR_URL
            });
        }

        webhookCache.set(channel.id, webhook);
        return webhook;

    } catch (e) {
        console.error("❌ Webhook Error:", e.message);
        return null;
    }
}

// --- メイン ---
async function sendYumeNews(client) {
    console.log("🔥 sendYumeNews 実行");

    try {
        const channel = await client.channels.fetch(CONFIG.NEWS_CHANNEL_ID);

        if (!channel) {
            console.error("❌ チャンネル取得失敗");
            return;
        }

        const postedUrls = getPostedUrls();
        const feeds = [...CONFIG.FEEDS].sort(() => Math.random() - 0.5);
        let targetItem = null;

        for (const url of feeds) {
            try {
                console.log("📡 RSS:", url);

                const response = await axios.get(url, { timeout: 10000 });
                const feed = await parser.parseString(response.data);

                targetItem = feed.items.find(item =>
                    CONFIG.TARGET_KEYWORDS.some(key => (item.title || "").includes(key)) &&
                    !postedUrls.includes(item.link)
                );

                if (!targetItem) {
                    targetItem = feed.items.find(i => !postedUrls.includes(i.link));
                }

                if (targetItem) {
                    console.log("✅ 記事取得:", targetItem.title);
                    break;
                }

            } catch (e) {
                console.error("❌ RSS失敗:", e.message);
            }
        }

        if (!targetItem) {
            console.log("⚠️ 記事見つからず");
            return;
        }

        // --- AI ---
        let aiText = "記事はこちら👇";

        try {
            const content = (targetItem.contentSnippet || "")
                .replace(/<[^>]*>/g, "")
                .substring(0, 150);

            const res = await axios.post(
                "https://api.groq.com/openai/v1/chat/completions",
                {
                    model: "llama-3.3-70b-versatile",
                    messages: [
                        { role: "system", content: PROMPTS.YUME_BASE },
                        { role: "user", content: `【題】${targetItem.title}\n【内容】${content}` }
                    ]
                },
                {
                    headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
                    timeout: 20000
                }
            );

            aiText = res.data.choices[0].message.content;

        } catch (e) {
            console.error("❌ AIエラー:", e.response?.data || e.message);
        }

        const webhook = await getWebhook(channel);

        const embed = new EmbedBuilder()
            .setTitle(targetItem.title)
            .setURL(targetItem.link)
            .setDescription(aiText)
            .setColor(0xFF4500)
            .setFooter({ text: `ゆめちゃん (${new Date().getHours()}時)` });

        const payload = {
            content: `🕒 ${new Date().getHours()}時だよ🤥`,
            embeds: [embed],
            username: 'ゆめちゃん🤥',
            avatarURL: CONFIG.YUME_AVATAR_URL
        };

        if (webhook) {
            await webhook.send(payload);
        } else {
            await channel.send(payload);
        }

        savePostedUrl(targetItem.link);
        console.log("🚀 投稿成功");

    } catch (e) {
        console.error("💥 News Error:", e.message);
    }
}

// --- スケジューラ ---
function initScheduler(client) {
    console.log("🟢 Scheduler起動");

    // ⏰ 毎時
    cron.schedule('0 * * * *', () => {
        console.log("⏰ cron発火");
        sendYumeNews(client);
    }, { timezone: "Asia/Tokyo" });

    // ✅ 起動直後に1回（重要）
    setTimeout(() => {
        console.log("🚀 初回実行");
        sendYumeNews(client);
    }, 5000);

    // --- 襲撃系（そのまま） ---
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
        setTimeout(() => {
            sendYumeNews(client);
            yumeRandomAttack(client);
        }, 3000);
    }
}

module.exports = { initScheduler };