const axios = require('axios');

async function handleModerator(message) {
    if (process.env.HELL_MODE !== 'true') return;

    // 正規表現による招待リンクの即時検閲
    if (message.content.match(/(discord\.gg|discord\.com\/invite)\/[a-zA-Z0-9]+/g)) {
        return await message.delete().catch(() => {});
    }

    // OpenAIのModeration APIによる高度な負荷分散検閲
    if (message.content.length > 0) {
        try {
            const res = await axios.post('https://api.openai.com/v1/moderations', { input: message.content }, {
                headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` }
            });
            if (res.data.results[0].flagged) {
                await message.delete().catch(() => {});
                return message.channel.send({ content: "もちついて🤗", embeds: [{ image: { url: "https://placekitten.com/400/300" } }] });
            }
        } catch (e) {}
    }
}
module.exports = { handleModerator };