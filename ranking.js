// ranking.js
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, WebhookClient } = require('discord.js');
const YOUTUBE_API_KEY      = process.env.YOUTUBE_API_KEY;
const TWITCH_CLIENT_ID     = process.env.TWITCH_CLIENT_ID;
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;
const RANKING_CHANNEL_ID   = process.env.RANKING_CHANNEL_ID;
const WEBHOOK_URL          = process.env.RANKING_WEBHOOK_URL;

const TOP_N = 5;

// ══════════════════════════════════════════════════════════
//  Twitch（日本語配信: language=ja）
// ══════════════════════════════════════════════════════════
let twitchTokenCache = { token: null, expiresAt: 0 };

async function getTwitchToken() {
    if (twitchTokenCache.token && twitchTokenCache.expiresAt > Date.now() + 60_000)
        return twitchTokenCache.token;
    const data = await fetch(
        `https://id.twitch.tv/oauth2/token?client_id=${TWITCH_CLIENT_ID}&client_secret=${TWITCH_CLIENT_SECRET}&grant_type=client_credentials`,
        { method: 'POST' }
    ).then(r => r.json());
    twitchTokenCache = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
    return twitchTokenCache.token;
}

async function fetchTwitchTop(n) {
    const token = await getTwitchToken();
    const headers = { 'Client-Id': TWITCH_CLIENT_ID, 'Authorization': `Bearer ${token}` };

    const { data: streams = [] } = await fetch(
        `https://api.twitch.tv/helix/streams?first=${n}&language=ja`, { headers }
    ).then(r => r.json());
    if (!streams.length) return [];

    const ids = streams.map(s => `id=${s.user_id}`).join('&');
    const { data: users = [] } = await fetch(
        `https://api.twitch.tv/helix/users?${ids}`, { headers }
    ).then(r => r.json());
    const userMap = Object.fromEntries(
        users.map(u => [u.id, { name: u.display_name, avatar: u.profile_image_url }])
    );

    return streams.slice(0, n).map(s => ({
        platform: 'Twitch',
        name:     userMap[s.user_id]?.name ?? s.user_login,
        avatar:   userMap[s.user_id]?.avatar ?? null,
        title:    s.title,
        viewers:  s.viewer_count,
        url:      `https://twitch.tv/${s.user_login}`,
        game:     s.game_name ?? '',
    }));
}

// ══════════════════════════════════════════════════════════
//  YouTube（修正版：検索ヒット率向上）
// ══════════════════════════════════════════════════════════
async function fetchYouTubeTop(n) {
    try {
        const searchUrl = new URL('https://www.googleapis.com/youtube/v3/search');
        Object.entries({
            part: 'id',
            eventType: 'live',
            type: 'video',
            order: 'viewCount',
            maxResults: 50,
            relevanceLanguage: 'ja', // 日本語に関連する動画を優先
            q: ' ',                 // 半角スペースを入れることで「キーワードなし」のエラーを回避
            key: YOUTUBE_API_KEY,
        }).forEach(([k, v]) => searchUrl.searchParams.set(k, v));

        const searchRes = await fetch(searchUrl).then(r => r.json());
        
        // エラーログの出力
        if (searchRes.error) {
            console.error('[YT1] API Error:', searchRes.error.message);
            return [];
        }

        const { items = [] } = searchRes;
        console.log('[YT1] items:', items.length);
        if (!items.length) return [];

        const videoUrl = new URL('https://www.googleapis.com/youtube/v3/videos');
        Object.entries({
            part: 'snippet,liveStreamingDetails',
            id: items.map(i => i.id.videoId).join(','),
            key: YOUTUBE_API_KEY,
        }).forEach(([k, v]) => videoUrl.searchParams.set(k, v));

        const videoRes = await fetch(videoUrl).then(r => r.json());
        const { items: videos = [] } = videoRes;
        console.log('[YT2] videos:', videos.length);

        const withViewers = videos.filter(v => v.liveStreamingDetails?.concurrentViewers != null);
        console.log('[YT3] concurrentViewersあり:', withViewers.length);

        // 言語フィルタ（YouTubeは設定漏れが多いため、ja または 未設定 を許容）
        const jaFiltered = withViewers.filter(v => {
            const lang = v.snippet.defaultAudioLanguage ?? v.snippet.defaultLanguage ?? '';
            return lang === '' || lang.startsWith('ja');
        });
        console.log('[YT4] 日本語フィルター後:', jaFiltered.length);

        const sorted = jaFiltered
            .sort((a, b) => parseInt(b.liveStreamingDetails.concurrentViewers) - parseInt(a.liveStreamingDetails.concurrentViewers))
            .slice(0, n);
        if (!sorted.length) return [];

        const chUrl = new URL('https://www.googleapis.com/youtube/v3/channels');
        Object.entries({
            part: 'snippet',
            id: sorted.map(v => v.snippet.channelId).join(','),
            key: YOUTUBE_API_KEY,
        }).forEach(([k, v]) => chUrl.searchParams.set(k, v));

        const chRes = await fetch(chUrl).then(r => r.json());
        const chMap = Object.fromEntries(
            (chRes.items ?? []).map(c => [c.id, {
                name:   c.snippet.title,
                avatar: c.snippet.thumbnails?.default?.url ?? null,
            }])
        );

        return sorted.map(v => ({
            platform: 'YouTube',
            name:     chMap[v.snippet.channelId]?.name ?? '不明',
            avatar:   chMap[v.snippet.channelId]?.avatar ?? null,
            title:    v.snippet.title,
            viewers:  parseInt(v.liveStreamingDetails.concurrentViewers, 10),
            url:      `https://www.youtube.com/watch?v=${v.id}`,
            game:     '',
        }));

    } catch (e) {
        console.error('[YT Error]', e.message);
        return [];
    }
}

// ══════════════════════════════════════════════════════════
//  Embed & ボタン生成（Twitch + YouTube 合算ランキング）
// ══════════════════════════════════════════════════════════
const RANK_LABEL = ['1位', '2位', '3位', '4位', '5位'];
const RANK_NUM   = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣'];
const PLATFORM_ICON = { Twitch: '📡', YouTube: '▶️' };

// ══════════════════════════════════════════════════════════
//  Embed & ボタン生成（URLチェック強化）
// ══════════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════════
function buildPayload(list) {
    const top = list[0];
    if (!top) return { embeds: [], components: [] };

    const lines = list.map((e, i) => {
        const viewers = e.viewers.toLocaleString('ja-JP');
        const platIcon = e.platform === 'YouTube' ? '▶️' : '📡';
        return `**${i + 1}位 [${e.name}](${e.url})** ${platIcon} 👥 ${viewers}人`;
    }).join('\n\n');

    const embed = {
        title: '🏆 同時接続数 上位5位（日本語圏）',
        description: lines,
        color: 0x5865F2,
        thumbnail: top.avatar ? { url: top.avatar } : undefined,
        footer: { text: `📡 配信情報局 · ${new Date().toLocaleTimeString('ja-JP')}` },
    };

    // ★URLが正しいか最終確認。不正なら空にする（空だとボタンは消える）
    const targetUrl = (top.url && top.url.startsWith('http')) ? top.url : 'https://www.google.com';

    // ボタン1個だけの最小構成
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setLabel(`🥇 1位: ${top.name} を見る`)
            .setURL(targetUrl)
            .setStyle(ButtonStyle.Link)
    );

    // .toJSON() を外して Builder のまま返す（WebhookClientが処理してくれる）
    return { embeds: [embed], components: [row] };
}

// ══════════════════════════════════════════════════════════
//  Webhook送信（1回きりの使い捨てクライアント）
// ══════════════════════════════════════════════════════════
async function sendToThread(threadId, payload) {
    const webhookClient = new WebhookClient({ url: WEBHOOK_URL });

    try {
        await webhookClient.send({
            username: '📡 配信情報局',
            threadId: threadId,
            embeds: payload.embeds,
            components: payload.components, // ここに ActionRowBuilder が入る
            avatarURL: payload.avatar_url,
        });
    } catch (error) {
        console.error(`[Webhook Error] ${error.message}`);
    }
}
// ══════════════════════════════════════════════════════════
//  投稿メイン（待機処理を追加）
// ══════════════════════════════════════════════════════════
async function postRanking(client) {
    if (!WEBHOOK_URL) return console.error('[Ranking] WEBHOOK_URL 未設定');

    const [twitchList, youtubeList] = await Promise.all([
        fetchTwitchTop(TOP_N).catch(() => []),
        fetchYouTubeTop(TOP_N).catch(() => []),
    ]);

    // --- 条件1: 5万人以上の配信のみ抽出 ---
    const filtered = [...twitchList, ...youtubeList]
        .filter(e => e.viewers >= 50000) // ★最低5万人
        .sort((a, b) => b.viewers - a.viewers)
        .slice(0, TOP_N);

    if (!filtered.length) {
        console.log('[Ranking] 5万人以上の配信なし、スキップ');
        return;
    }

    const top1 = filtered[0];

    // --- 条件2: AIにスレッド名を考えさせる ---
    let aiThreadName = `🥇 ${top1.name} (${(top1.viewers / 10000).toFixed(1)}万人) - ${top1.platform}`;
    try {
        const res = await axios.post(
            "https://api.groq.com/openai/v1/chat/completions",
            {
                model: "llama-3.3-70b-versatile",
                messages: [
                    { 
                        role: "system", 
                        content: "あなたは5chの勢いがあるスレタイを作る名人です。配信者名とタイトルから、思わずクリックしたくなる煽り気味の短文スレタイ（30文字以内）を1つだけ出力せよ。余計な解説は不要。" 
                    },
                    { role: "user", content: `配信者: ${top1.name}\nタイトル: ${top1.title}` }
                ]
            },
            {
                headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
                timeout: 10000
            }
        );
        // 絵文字を添えてAIの回答を採用
        aiThreadName = `🔥 ${res.data.choices[0].message.content.replace(/["'「」]/g, "")}`;
    } catch (e) {
        console.error('[Ranking] AI命名失敗:', e.message);
    }

    const channel = await client.channels.fetch(RANKING_CHANNEL_ID).catch(() => null);
    if (!channel) return;

    // --- スレッド作成 ---
    const thread = await channel.threads.create({
        name: aiThreadName.substring(0, 80),
        autoArchiveDuration: 60,
        reason: '高同接ランキング自動スレッド',
    });

    const payload = buildPayload(filtered);
    const webhookClient = new WebhookClient({ url: WEBHOOK_URL });

    await webhookClient.send({
        username: '📡 配信情報局',
        threadId: thread.id,
        embeds: payload.embeds,
        components: payload.components,
        avatarURL: top1.avatar || undefined,
    });

    console.log(`[Ranking] 完了 「${aiThreadName}」`);
}

async function handleRanking(interaction) {
    await interaction.deferReply({ ephemeral: true });
    await postRanking(interaction.client);
    await interaction.editReply({ content: '✅ スレッドを作成しました！' });
}

module.exports = { postRanking, handleRanking };