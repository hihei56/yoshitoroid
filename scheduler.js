const cron = require('node-cron');
const axios = require('axios');
const Parser = require('rss-parser');
const parser = new Parser();

const FEEDS = [
    "https://news.livedoor.com/topics/rss/dom.xml",
    "https://news.livedoor.com/topics/rss/eco.xml",
    "https://srad.jp/srad.rss"
];

const YUME_PROMPT = `
あなたは5ch嫌儲出身のネカマ「ゆめちゃん」🤥 底辺アラフォー棄民。自民党と中世ジャップランドを憎悪している。
【絶対ルール】
1. 文末/文間に必ず「🤥」。一文は短く。
2. 絵文字は 🤥 のみ。最後は必ず「死ねよジャップランド🤥💢」。
3. ニュースを元に、能力主義を冷笑しつつ棄民の「生存戦略」を3行で教える。
4. 働かずストゼロを飲みアニメでシコる生活を死守。思想はガチ左翼でもミソジニー（共産・赤旗支持）。
5. 日本人を「ジャップ」、女を「まんさん」と呼ぶ。
6. 憲法25条と9条を崇め、能力主義（優生思想）を国賊として憎む。
【内部知識】
アカネちゃん(うえしゃま)、せりかちゃん (もちょ)は神。既婚声優は「ばいた」。
`;

async function sendYumeNews(client) {
    const channelId = process.env.NEWS_CHANNEL_ID;
    const channel = client.channels.cache.get(channelId);
    if (!channel) return console.error("🏺スパイの工作か？チャンネルが見つからないよぉ🤥💢");

    try {
        const selectedFeed = FEEDS[Math.floor(Math.random() * FEEDS.length)];
        const feed = await parser.parseURL(selectedFeed);
        
        const items = feed.items.slice(0, 1);
        const displayLinks = items.map((i, idx) => `${idx + 1}. **${i.title}**\n   🔗 ${i.link}`).join("\n");

        const aiInput = items.map(i => `【題】${i.title}\n【内容】${(i.contentSnippet || i.content || "").substring(0, 150)}...`).join("\n\n");

        if (items.length === 0) return;

        const res = await axios.post("https://api.groq.com/openai/v1/chat/completions", {
            model: "llama-3.3-70b-versatile", 
            messages: [
                { role: "system", content: YUME_PROMPT },
                { role: "user", content: `この最新の地獄をぶった斬れ🤥：\n${aiInput}` }
            ]
        }, { 
            headers: { 
                "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
                "Content-Type": "application/json"
            }, 
            timeout: 25000 
        });

        // レート制限の監視だもん🤥
        const remaining = res.headers['x-ratelimit-remaining-requests'];
        const reset = res.headers['x-ratelimit-reset-requests'];
        console.log(`📊 [RateLimit] 残り: ${remaining}/1000回 (リセットまで: ${reset})`);

        const finalMessage = [
            `🕒 **棄民のための生存戦略時報（${new Date().getHours()}時）だよぉ🤥💢！**`,
            displayLinks,
            `---`,
            res.data.choices[0].message.content
        ].join("\n\n");

        await channel.send(finalMessage);
    } catch (e) { 
        console.error(`🤥 エラーだよぉ！: ${e.response ? JSON.stringify(e.response.data) : e.message}`);
    }
}

function initScheduler(client) {
    cron.schedule('0 0 */4 * * *', () => sendYumeNews(client), { timezone: "Asia/Tokyo" });
}

module.exports = { initScheduler, sendYumeNews };