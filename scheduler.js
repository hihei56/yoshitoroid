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
    // 優先的に拾いたいキーワード
    TARGET_KEYWORDS: ["女子枠","女性枠","女性優遇","弱者男性","非モテ","パパ活","ルッキズム","男女論","社畜","やりがい搾取"]
};

// ...（PROMPTSなどは据え置き）

// --- Webhook取得ヘルパー ---
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

// ...（getPostedUrls, savePostedUrl, yumeRandomAttackなどは据え置き）

async function sendYumeNews(client) {
    try {
        const channel = await client.channels.fetch(process.env.NEWS_CHANNEL_ID);
        const postedUrls = getPostedUrls();
        const feeds = [...CONFIG.FEEDS].sort(() => Math.random() - 0.5);
        let targetItem = null;

        for (const url of feeds) {
            try {
                const response = await axios.get(url, { timeout: 10000 });
                const feed = await parser.parseString(response.data);
                
                // 1. まずキーワードに一致する未投稿記事を探す
                targetItem = feed.items.find(item => 
                    CONFIG.TARGET_KEYWORDS.some(key => (item.title || "").includes(key)) && !postedUrls.includes(item.link)
                );
                
                // 2. なければ、単に未投稿の最新記事を拾う
                if (!targetItem) {
                    targetItem = feed.items.find(i => !postedUrls.includes(i.link));
                }
                
                if (targetItem) break;
            } catch (e) { continue; }
        }

        if (!targetItem) return;

        const content = (targetItem.contentSnippet || "").replace(/<[^>]*>/g, "").substring(0, 150);
        const res = await axios.post("https://api.groq.com/openai/v1/chat/completions", { 
            model: "llama-3.3-70b-versatile", 
            messages: [{ role: "system", content: PROMPTS.YUME_BASE }, { role: "user", content: `【題】${targetItem.title}\n【内容】${content}` }] 
        }, { headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` }, timeout: 20000 });

        const webhook = await getWebhook(channel);
        const embed = new EmbedBuilder()
            .setTitle(targetItem.title)
            .setURL(targetItem.link)
            .setDescription(res.data.choices[0].message.content)
            .setColor(0xFF4500)
            .setFooter({ text: `ゆめちゃんの体内時計時報 (${new Date().getHours()}時)🤥` });

        const payload = {
            content: `🕒 **${new Date().getHours()}時だよぉ。ジャップランドの末路でも見て落ち着きなよ🤥💢**`,
            embeds: [embed],
            username: 'ゆめちゃん🤥',
            avatarURL: CONFIG.YUME_AVATAR_URL
        };

        if (webhook) {
            await webhook.send(payload);
        } else {
            await channel.send({ content: payload.content, embeds: payload.embeds });
        }

        savePostedUrl(targetItem.link);
    } catch (e) { console.error("News Error:", e.message); }
}

function initScheduler(client) {
    // 🔥 1時間おき（毎時0分）に実行するように変更
    cron.schedule('0 * * * *', () => sendYumeNews(client), { timezone: "Asia/Tokyo" });

    // 毎日0時に襲撃予定を組む
    cron.schedule('0 0 0 * * *', () => planDailyAttacks(), { timezone: "Asia/Tokyo" });
    planDailyAttacks();

    // 襲撃チェック（毎分）
    cron.schedule('* * * * *', () => {
        const now = new Date();
        const hitIndex = attackSchedule.findIndex(s => s.hour === now.getHours() && s.minute === now.getMinutes());
        if (hitIndex !== -1) {
            attackSchedule.splice(hitIndex, 1);
            yumeRandomAttack(client);
        }
    }, { timezone: "Asia/Tokyo" });

    // デバッグモード時は即時実行
    if (process.env.DEBUG_MODE === 'true') {
        setTimeout(() => { sendYumeNews(client); yumeRandomAttack(client); }, 3000);
    }
}

module.exports = { initScheduler };