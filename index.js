require('dotenv').config();
const { Client, GatewayIntentBits, Events } = require('discord.js');
const { initScheduler, sendYumeNews } = require('./scheduler'); 
const { handleSay } = require('./say');
const { handleDeathmatch } = require('./deathmatch');
const { handleModerator } = require('./moderator');
const { handleAdmin } = require('./admin');

const client = new Client({ 
    intents: [
        GatewayIntentBits.Guilds, 
        GatewayIntentBits.GuildMessages, 
        GatewayIntentBits.MessageContent, 
        GatewayIntentBits.GuildMembers
    ] 
});

client.once(Events.ClientReady, (c) => {
    console.log(`✅ [yoshitoroid] 起動したよぉ🤥: ${c.user.tag}`);
    initScheduler(client); 
    
    if (process.env.DEBUG_MODE === 'true') {
        setTimeout(() => {
            console.log("🤥 デバッグモード：時報を強制射出しちゃうよぉ！");
            sendYumeNews(client);
        }, 3000);
    }
});

client.on(Events.MessageCreate, async m => {
    if (m.author.bot || !m.guild) return;
    handleModerator(m).catch(() => {});
    handleDeathmatch(m).catch(() => {});
});

client.on(Events.InteractionCreate, async i => {
    if (!i.isChatInputCommand()) return;
    if (i.commandName === 'say') await handleSay(i);
    if (i.commandName === 'admin') await handleAdmin(i);
});

client.login(process.env.DISCORD_TOKEN);