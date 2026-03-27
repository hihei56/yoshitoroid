const Parser = require('rss-parser');
const { WebhookClient, EmbedBuilder } = require('discord.js');
const he = require('he');
const { OpenAI } = require('openai'); 
const fs = require('fs'); // 🌟 ファイル保存用に追加

const parser = new Parser();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Webhookクライアント
const UNTAI = new WebhookClient({ url: process.env.UNTAI_WEBHOOK });
const AI_WEBHOOKS = [
    new WebhookClient({ url: process.env.AI_WEBHOOK1 }),
    new WebhookClient({ url: process.env.AI_WEBHOOK2 }),
    new WebhookClient({ url: process.env.AI_WEBHOOK3 })
];

const RSS_URL = "https://rss.app/feeds/tJs1z7BnamnE09pF.xml";

// 🌟 再起動対策：送信済みリンクをファイルに記録する仕組み
// Fly.io上なら '/data' フォルダを使い、ローカルなら今のフォルダを使う
const SEEN_LINKS_FILE = process.env.FLY_APP_NAME 
    ? '/data/seen_links.json' 
    : './seen_links.json';
let seenLinks = [];

// 起動時にファイルがあれば読み込む
if (fs.existsSync(SEEN_LINKS_FILE)) {
    seenLinks = JSON.parse(fs.readFileSync(SEEN_LINKS_FILE, 'utf8'));
}

// 記録をファイルに保存する関数
function saveSeenLinks() {
    // ファイルが大きくなりすぎないよう、最新の50件だけ残す
    if (seenLinks.length > 50) {
        seenLinks = seenLinks.slice(-50);
    }
    fs.writeFileSync(SEEN_LINKS_FILE, JSON.stringify(seenLinks, null, 2));
}

// 画像URLを抜き出す関数
function findImageUrl(item) {
    if (item.enclosure && item.enclosure.url && item.enclosure.type.startsWith('image/')) {
        return item.enclosure.url;
    }
    if (item.content) {
        const imgMatch = item.content.match(/<img[^>]+src="([^">]+)"/);
        if (imgMatch) return imgMatch[1];
    }
    if (item.contentSnippet) {
        const imgMatch = item.contentSnippet.match(/<img[^>]+src="([^">]+)"/);
        if (imgMatch) return imgMatch[1];
    }
    return null;
}

// 汎用AI返信生成関数
async function generateAIReply(text) {
    try {
        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                { role: "system", content: "あなたは親しみやすいキャラクターです。以下のツイート内容に対して、軽く短めに（1〜2文程度で）相槌や感想を返信してください。" },
                { role: "user", content: `ツイート内容:\n${text}` }
            ],
            max_tokens: 100
        });
        return response.choices[0].message.content.trim();
    } catch (err) {
        console.error("❌ AI返信生成失敗:", err);
        return "（返信の生成に失敗しました…）";
    }
}

// ツイート投稿 ＆ AIスレッド返信
async function postTweet(item, client) {
    let rawContent = he.decode(item.contentSnippet || item.title || "");
    const imageUrl = findImageUrl(item);

    // --- 引用リツイート＆URLのクリーニング処理 ---
    const quoteRegex = /https?:\/\/(?:twitter\.com|x\.com)\/[a-zA-Z0-9_]+\/status\/\d+/g;
    const quoteMatches = rawContent.match(quoteRegex);
    
    let quoteAddition = "";
    if (quoteMatches) {
        quoteMatches.forEach(url => {
            rawContent = rawContent.replace(url, '').trim();
        });
        const quoteUrl = quoteMatches[quoteMatches.length - 1];
        quoteAddition = `\n\n> 🔁 **引用ポスト**\n> [🔗 引用元を見る](${quoteUrl})`;
    }

    rawContent = rawContent.replace(/https:\/\/t\.co\/\w+\s*$/, '').trim();
    const finalContent = rawContent + quoteAddition;
    // ---------------------------------------------

    const embed = new EmbedBuilder()
        .setColor('#1DA1F2')
        .setAuthor({ name: `electlone`, url: `https://x.com/electlone` })
        .setTitle("🔗 ポストをX(Twitter)で見る")
        .setURL(item.link)
        .setFooter({ text: `不対電子研究所` });

    if (item.isoDate) embed.setTimestamp(new Date(item.isoDate));

    try {
        const apiMessage = await UNTAI.send({
            content: finalContent, 
            files: imageUrl ? [{ attachment: imageUrl }] : [],
            embeds: [embed],
            username: "不対電子", 
            fetchReply: true
        });

        if (client) {
            const channelId = apiMessage.channel_id || apiMessage.channelId;
            const channel = await client.channels.fetch(channelId);
            const msg = await channel.messages.fetch(apiMessage.id);

            const thread = await msg.startThread({
                name: "不対電子理論コメント欄",
                autoArchiveDuration: 60
            });
            
            const aiWebhook = AI_WEBHOOKS[Math.floor(Math.random() * AI_WEBHOOKS.length)];
            const aiReply = await generateAIReply(rawContent); 
            
            await aiWebhook.send({
                content: aiReply,
                threadId: thread.id
            });

            console.log("💬 ツイート投稿 ＆ ランダムAIからの返信完了！");

            // 🌟 送信が無事に終わったら、そのリンクを記録してファイルに保存
            seenLinks.push(item.link);
            saveSeenLinks();
        }
    } catch (err) {
        console.error("❌ RSS取得/投稿失敗:", err);
    }
}

async function checkRSS(client) {
    try {
        const feed = await parser.parseURL(RSS_URL);
        
        // 🌟 ファイルに保存されているリンク（seenLinks）に含まれていないかチェック
        const candidates = feed.items.filter(item => !seenLinks.includes(item.link) && (item.contentSnippet?.length || item.title?.length || 0) > 50);

        if (!candidates.length) return;

        const tweet = candidates[Math.floor(Math.random() * candidates.length)];
        await postTweet(tweet, client);
    } catch (err) {
        console.error("❌ RSS取得失敗:", err);
    }
}

module.exports = { checkRSS };