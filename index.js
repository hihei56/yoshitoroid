require('dotenv').config();
const { Client, GatewayIntentBits, Events } = require('discord.js');
const { handleSay } = require('./say');
const { handleDeathmatch } = require('./deathmatch');
const { handleModerator } = require('./moderator');
const { initScheduler } = require('./scheduler');
const { handleAdmin } = require('./admin');

const client = new Client({ 
    intents: [
        GatewayIntentBits.Guilds, 
        GatewayIntentBits.GuildMessages, 
        GatewayIntentBits.MessageContent, 
        GatewayIntentBits.GuildMembers
    ] 
});

// Webhookキャッシュ（再作成を防ぐ）
const webhookCache = new Map();

client.once(Events.ClientReady, (c) => {
    console.log(`✅ [yoshitoroid] 爆速起動: ${c.user.tag}`);
    initScheduler(client); 
});

client.on(Events.MessageCreate, async m => {
    if (m.author.bot || !m.guild) return;

    // 非同期で実行（これらが終わるのを待たずに次に進む）
    handleModerator(m).catch(console.error);
    handleDeathmatch(m).catch(console.error);

    if (m.mentions.has(client.user) && !m.mentions.everyone) {
        const attachments = m.attachments;
        if (attachments.size > 0) {
            try {
                // 1. Webhookの取得（キャッシュ優先）
                let webhook = webhookCache.get(m.channel.id);
                if (!webhook) {
                    const webhooks = await m.channel.fetchWebhooks();
                    webhook = webhooks.find(wh => wh.owner.id === client.user.id);
                    if (!webhook) {
                        webhook = await m.channel.createWebhook({ name: 'FastProxy' });
                    }
                    webhookCache.set(m.channel.id, webhook);
                }

                let cleanContent = m.content.replace(/<@!?\d+>/g, '').trim();
                const files = attachments.map(a => a.url);

                let replyPrefix = "";
                if (m.reference) {
                    // ここをキャッシュから取れるならもっと速くなる
                    const repliedMsg = await m.channel.messages.fetch(m.reference.messageId);
                    const msgUrl = `https://discord.com/channels/${m.guild.id}/${m.channel.id}/${repliedMsg.id}`;
                    replyPrefix = `**[Reply to](${msgUrl}) : <@${repliedMsg.author.id}>**\n`;
                }

                // 送信（awaitを最小限に）
                await webhook.send({
                    content: replyPrefix + cleanContent,
                    username: m.member.displayName,
                    avatarURL: m.author.displayAvatarURL({ forceStatic: false }),
                    files: files
                });

                // 元メッセージの削除は最後でOK
                m.delete().catch(() => {});

            } catch (err) { console.error('Proxy Error:', err); }
        }
    }
});

client.on(Events.InteractionCreate, async i => {
    if (!i.isChatInputCommand()) return;
    try {
        if (i.commandName === 'say') await handleSay(i);
        if (i.commandName === 'admin') await handleAdmin(i);
    } catch (err) { console.error(err); }
});

client.login(process.env.DISCORD_TOKEN);