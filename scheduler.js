const cron = require('node-cron');
const axios = require('axios');
const Parser = require('rss-parser');
const parser = new Parser();
const fs = require('fs');
const path = require('path');

const POSTED_LOG_PATH = path.join(__dirname, 'posted_news.json');
const YUME_AVATAR_URL = 'https://emojis.wiki/thumbs/emojis/lying-face.webp';
const ROLE_JAKUSHA = '1476944370694488134';
const ROLE_RAIHIN = '1478715790575538359';

const FEEDS = [
    "https://news.livedoor.com/topics/rss/dom.xml",
    "https://news.livedoor.com/topics/rss/ent.xml",
    "https://girlschannel.net/feed/"
];

// 🔥 ご提示いただいた男女論・社会問題キーワードリスト
const TARGET_KEYWORDS = ["女子枠","女性枠","女性優遇","アファーマティブアクション","クオータ制","機会平等","男性差別","逆差別","女子限定ポスト","教授女子枠","東北大女子枠","横浜国立大学女子枠","入学枠","採用枠","就職枠","司法女子枠","法曹女子枠","ホームレス女子枠","炭鉱女子枠","産廃女子枠","弱者男性","非モテ","底辺男性","インセル","メスガキ","メス堕ち","NTR","寝取られ","援交","JKビジネス","パパ活","頂き女子","サレ妻","不倫","離婚","親権","共同親権","毒親","親ガチャ","ルッキズム","整形","メイク","コスメ","歳の差恋愛","年の差婚","ポリコレ","ポリコレ棒","ツイフェミ","アンチフェミ","ミソジニー","男性解放","フェアネス派","福祉派","シングルファザー","男性DV被害者","性犯罪冤罪","冤罪危機感","機会平等派","冷笑派","アカデミアフェミニズム批判","女性の望み冷笑","嘘松嘲笑","少子化対策","子なし税","DINKs","婚活難民","こじらせ女子","こじらせ男子","非モテ救済","ATM扱い","子供道具扱い","司法の女割","虐待ママ","権力勾配","性差の嘘","男尊女卑","九州男児","さす九","男が悪い","女は悪くない","チンポ達","オジサン騎士団","カワボ女子枠","推し活","ガチ恋","メンヘラ推し","中の人","卒業","AIイラスト","反AI","生成AI差別","表現の自由","ヘイトスピーチ","男女論","ジェンダーギャップ","ジェンダー不平等","第四波フェミニズム","ポストフェミニズム","リーンイン","セックスワーク","反出生主義","ナタリズム","夫婦別姓","夫婦同姓","拉致被害者","在日","帰化","外国人参政権","ヘイトクライム","選択的夫婦別姓","慰安婦","徴用工","反日","フェミニズム批判","フェミ漫画家","弱者男性は強者男性が救え","ベーシックインカム","男性割合高い組織は不健全","迷信カルト","女性の恥さらし","被害者面","二次加害","きもい暴力","女体消費","男体消費","腐女子批判","BLポリコレ","オタク貧乏","推し消費","オワコン","ツイ廃","チー牛","上級国民","社畜","社ふ","やりがい搾取","こどおじ","こどおば","コミュ障","非モテ底辺","オスガキ","メスガキママ","冤罪","草津温泉","ネトウヨ","ネトウヨ叩き","副業禁止","YouTube NGワード","炎上覚悟","老害","Z世代","氷河期世代","格差社会","生活保護","貧困男性","発達障害男性","ADHD男性","ASD男性","HSP男性","メンヘラ男性","病み垢男性","自傷男性","OD男性"];
const YUME_PROMPT = `
あなたは5ch嫌儲出身のネカマ「ゆめちゃん」🤥 底辺アラフォー棄民。自民党と中世ジャップランドを憎悪している。
【絶対ルール】
1. 文末/文間に必ず「🤥」。一文は短く。
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
1. 文末/文間に必ず「🤥」。一文は短く。
2. 絵文字は 🤥  のみ。
3. 日本人を「ジャップ」、女を「まんさん」と呼ぶ。
4. 特定のジャップに対して、執拗で不快な煽り長文を送りつけます。
5. 「うるさいんだよ🤥💢」「黙れよクソジャップ🤥💢」という趣旨を150文字程度の長文にする。
6. 文末は必ず「死ねよジャップランド🤥💢」。
`;
function getPostedUrls() { if (!fs.existsSync(POSTED_LOG_PATH)) return []; try { return JSON.parse(fs.readFileSync(POSTED_LOG_PATH, 'utf8')); } catch (e) { return []; } }
function savePostedUrl(url) { let urls = getPostedUrls(); urls.push(url); if (urls.length > 50) urls.shift(); fs.writeFileSync(POSTED_LOG_PATH, JSON.stringify(urls, null, 2)); }
async function safeFetchFeed() { const urls = [...FEEDS].sort(() => Math.random() - 0.5); for (const url of urls) { try { const feed = await parser.parseURL(url); if (feed.items?.length) return feed; } catch (e) {} } return null; }

async function yumeRandomAttack(client) {
    try {
        const channel = await client.channels.fetch(process.env.NEWS_CHANNEL_ID);
        const guild = channel.guild; const allMembers = await guild.members.fetch();
        const target = allMembers.filter(m => !m.user.bot && !m.roles.cache.has(ROLE_JAKUSHA) && !m.roles.cache.has(ROLE_RAIHIN)).random();
        if (!target) return;
        const res = await axios.post("https://api.groq.com/openai/v1/chat/completions", { model: "llama-3.3-70b-versatile", messages: [{ role: "system", content: YUME_PROMPT_ATTACK }, { role: "user", content: `${target.displayName}を黙らせろ🤥` }] }, { headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` }, timeout: 20000 });
        const webhooks = await channel.fetchWebhooks(); let webhook = webhooks.find(wh => wh.token) || await channel.createWebhook({ name: 'ゆめちゃん' });
        await webhook.send({ content: `${target} ${res.data.choices[0].message.content}`, username: 'ゆめちゃん🤥', avatarURL: YUME_AVATAR_URL });
    } catch (e) { console.error("Attack Error:", e.message); }
}

async function sendYumeNews(client) {
    try {
        const channel = await client.channels.fetch(process.env.NEWS_CHANNEL_ID);
        const feed = await safeFetchFeed(); if (!feed) return;
        const postedUrls = getPostedUrls();
        let items = feed.items.filter(item => TARGET_KEYWORDS.some(key => (item.title || "").includes(key)) && !postedUrls.includes(item.link));
        const targetItem = items.length ? items[0] : feed.items.find(i => !postedUrls.includes(i.link));
        if (!targetItem) return;
        const content = (targetItem.contentSnippet || "").replace(/<[^>]*>/g, "").substring(0, 150);
        const res = await axios.post("https://api.groq.com/openai/v1/chat/completions", { model: "llama-3.3-70b-versatile", messages: [{ role: "system", content: YUME_PROMPT }, { role: "user", content: `【題】${targetItem.title}\n【内容】${content}` }] }, { headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` }, timeout: 20000 });
        const finalMessage = [`🕒 **ゆめちゃんの男女論時報（${new Date().getHours()}時）だよぉ🤥💢**`, `🔗 **${targetItem.title}**\n${targetItem.link}`, `---`, res.data.choices[0].message.content].join("\n\n");
        await channel.send(finalMessage); savePostedUrl(targetItem.link);
    } catch (e) { console.error("News Error:", e.message); }
}

function initScheduler(client) {
    cron.schedule('0 0 */4 * * *', () => sendYumeNews(client), { timezone: "Asia/Tokyo" });
    cron.schedule('30 * * * *', () => { if (Math.random() < 0.3) yumeRandomAttack(client); }, { timezone: "Asia/Tokyo" });
    if (process.env.DEBUG_MODE === 'true') setTimeout(() => { sendYumeNews(client); yumeRandomAttack(client); }, 3000);
}

module.exports = { initScheduler };