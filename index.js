require('dotenv').config();
// v14 の正規の読み込み方法
const { 
    Client, 
    GatewayIntentBits, 
    Events, 
    MessageFlags, 
    PermissionFlagsBits 
} = require('discord.js'); 

const { OpenAI } = require('openai');
const { initScheduler } = require('./scheduler'); 
const { handleSay } = require('./say');
const { handleDeathmatch } = require('./deathmatch');
const { handleModerator } = require('./moderator'); 
const { handleAdmin } = require('./admin');

// 21行目：GatewayIntentBits を使用して初期化
const client = new Client({ 
    intents: [
        GatewayIntentBits.Guilds, 
        GatewayIntentBits.GuildMessages, 
        GatewayIntentBits.MessageContent, 
        GatewayIntentBits.GuildMembers
    ] 
});

const ALLOWED_ROLES = ['1476944370694488134', '1478715790575538359'];

function hasPermission(member) {
    if (!member) return false;
    // 管理者は常に許可
    if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
    return ALLOWED_ROLES.some(roleId => member.roles.cache.has(roleId));
}

client.once(Events.ClientReady, async (c) => {
    console.log(`✅ [Bot Ready] ${c.user.tag} 起動成功`);

    // OpenAI SDK 診断
    try {
        const testClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        await testClient.moderations.create({ input: "test" });
        console.log("✨ [OpenAI] SDK 正常稼働中");
    } catch (err) {
        console.error("❌ [OpenAI Error]:", err.message);
    }

    initScheduler(client); 
});

client.on(Events.MessageCreate, async m => {
    if (m.author.bot || !m.guild) return;
    
    // 検閲の実行 (OpenAI SDK)
    handleModerator(m).catch(err => console.error("[Mod Error]:", err.message));

    // 権限なしのメンション無視
    if (m.mentions.has(client.user) && !hasPermission(m.member)) return;
});

client.on(Events.InteractionCreate, async i => {
    if (!i.isChatInputCommand()) return;
    
    if (!hasPermission(i.member)) {
        return i.reply({ 
            content: "このボットを使用する権限がありません。", 
            flags: [MessageFlags.Ephemeral] 
        });
    }

    try {
        if (i.commandName === 'dice') await handleDeathmatch(i);
        if (i.commandName === 'say') await handleSay(i);
        if (i.commandName === 'admin') await handleAdmin(i);
    } catch (error) {
        console.error("Interaction Error:", error);
    }
});

client.login(process.env.DISCORD_TOKEN);