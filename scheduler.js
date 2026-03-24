const cron = require('node-cron');
const axios = require('axios');
const Parser = require('rss-parser');
const parser = new Parser();

async function sendMimiNews(client) {
    const channel = client.channels.cache.get(process.env.NEWS_CHANNEL_ID);
    if (!channel) return;

    try {
        const feed = await parser.parseURL("https://techcrunch.com/category/artificial-intelligence/feed/");
        const articles = feed.items.slice(0, 3).map(i => i.title).join("\n");

        // 資料の教訓：外部AI連携の計算資源コストを考慮し、タイムアウトを設定
        const res = await axios.post("https://api.groq.com/openai/v1/chat/completions", {
            model: "llama-3.3-70b-versatile",
            messages: [
                { role: "system", content: "あなたは綿木ミシェル。先生を全肯定する甘えん坊。語尾は〜だもん、〜むみぃ。" },
                { role: "user", content: `以下の最新ニュースから、先生が楽に生きるための生存戦略を教えて！\n${articles}` }
            ]
        }, { headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` }, timeout: 15000 });

        await channel.send(`🕒 **ミシェルの生存戦略時報だもん！**\n\n${res.data.choices[0].message.content}`);
    } catch (e) { console.error("時報生成エラー"); }
}

function initScheduler(client) {
    // 4時間おき。リクエスト密度を分散させる
    cron.schedule('0 0 */4 * * *', () => sendMimiNews(client), { timezone: "Asia/Tokyo" });
}
module.exports = { initScheduler };