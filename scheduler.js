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
    TOMO_AVATAR_URL: 'https://emojis.wiki/thumbs/emojis/lying-face.webp',
    ATTACK_CHANNEL_ID: '1476939503510884638',
    // --- ニュースソースを大手・一般紙に拡充 ---
    FEEDS: [
        "https://news.yahoo.co.jp/rss/topics/top-pickups.xml", // Yahoo!ニュース（トピックス）
        "https://www.nhk.or.jp/rss/news/shuyo.xml",           // NHKニュース（主要）
        "https://rss.asahi.com/rss/asahi/newsheadlines.rdf",  // 朝日新聞
        "https://mainichi.jp/rss/etc/mainichi_flash.rss",     // 毎日新聞
        "https://www.nikkei.com/rss/index.rdf",               // 日本経済新聞
        "https://www.itmedia.co.jp/rss/2.0/itmedia_all.xml",  // ITmedia
        "https://news.livedoor.com/topics/rss/top.xml"        // ライブドア（総合）
    ]
};

// --- ともちゃん人格プロンプト ---
const TOMO_PROMPT = `
あなたはニュース解説アシスタントの「ともちゃん」です。
【ルール】
1. 丁寧で親しみやすい言葉遣いを用いてください。
2. ニュースの内容を客観的に要約し、そのニュースが社会に与える影響や背景を3行程度で分かりやすく解説してください。
3. 専門用語はなるべく避け、中立的な立場を保ってください。
`;

// --- Webhook取得 ---
async function getWebhook(channel) {
    if (webhookCache.has(channel.id)) return webhookCache.get(channel.id);
    try {
        const webhooks = await channel.fetchWebhooks();
        let webhook = webhooks.find(wh => wh.token);
        if (!webhook) {
            webhook = await channel.createWebhook({ name: 'ともちゃん', avatar: CONFIG.TOMO_AVATAR_URL });
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
        if (!fs.existsSync(CONFIG.POSTED_LOG_PATH)) return [];
        return JSON.parse(fs.readFileSync(CONFIG.POSTED_LOG_PATH, 'utf8'));
    } catch { return []; }
}

function savePostedUrl(url) {
    const urls = getPostedUrls();
    if (!urls.includes(url)) {
        urls.push(url);
        // ログが肥大化しないよう直近100件程度を保持
        if (urls.length > 100) urls.shift(); 
        fs.writeFileSync(CONFIG.POSTED_LOG_PATH, JSON.stringify(urls, null, 2));
    }
}

// --- ニュース送信 ---
async function sendTomoNews(client) {
    try {
        const channel = await client.channels.fetch(CONFIG.ATTACK_CHANNEL_ID);
        const postedUrls = getPostedUrls();
        
        // フィードをシャッフルして毎回違うソースから選ぶ
        const feeds = [...CONFIG.FEEDS].sort(() => Math.random() - 0.5);
        let targetItem = null;

        for (const url of feeds) {
            try {
                const response = await axios.get(url, { timeout: 10000 });
                const feed = await parser.parseString(response.data);

                // まだ投稿していない最新の記事を1つ取得
                targetItem = feed.items.find(item => !postedUrls.includes(item.link));
                if (targetItem) break;
            } catch { continue; }
        }

        if (!targetItem) return;

        const contentSnippet = (targetItem.contentSnippet || targetItem.content || "").replace(/<[^>]*>/g, "").substring(0, 200);

        let aiText = "";
        try {
            const res = await axios.post(
                "https://api.groq.com/openai/v1/chat/completions",
                {
                    model: "llama-3.3-70b-versatile",
                    messages: [
                        { role: "system", content: TOMO_PROMPT },
                        { role: "user", content: `【ニュース】${targetItem.title}\n【内容】${contentSnippet}` }
                    ]
                },
                {
                    headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
                    timeout: 20000
                }
            );
            aiText = res.data.choices[0].message.content;
        } catch {
            aiText = "最新のニュースをお伝えします。詳細はリンク先をご確認ください。";
        }

        const now = new Date();
        const hour = now.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", hour: "numeric", hour12: false });

        // --- スレッド作成 ---
        const thread = await channel.threads.create({
            name: `📰 ${targetItem.title.substring(0, 80)}`,
            autoArchiveDuration: 60,
            reason: 'ニュース配信',
        });

        const embed = new EmbedBuilder()
            .setTitle(targetItem.title)
            .setURL(targetItem.link)
            .setDescription(aiText)
            .setColor(0x00AEFF)
            .setFooter({ text: `ともちゃんニュース通信 | ${hour}時発表` });

        const payload = {
            content: `🕒 **${hour}時の定期ニュースをお届けします**`,
            embeds: [embed],
            username: 'ともちゃんニュース通信',
            avatarURL: CONFIG.TOMO_AVATAR_URL,
            threadId: thread.id 
        };

        const webhook = await getWebhook(channel);
        if (webhook) await webhook.send(payload);
        else await thread.send({ content: payload.content, embeds: payload.embeds });

        savePostedUrl(targetItem.link);
    } catch (e) { console.error("News Error:", e.message); }
}

// --- スケジューラ ---
function initScheduler(client) {
    // 毎時0分にニュース送信
    cron.schedule('0 * * * *', () => sendTomoNews(client), { timezone: "Asia/Tokyo" });

    if (process.env.DEBUG_MODE === 'true') {
        setTimeout(() => { sendTomoNews(client); }, 3000);
    }
}

module.exports = { initScheduler };