const { EmbedBuilder } = require("discord.js");
const Giveaway = require("../database/schemas/Giveaway");

async function endGiveaway(client, messageId) {
    const giveaway = await Giveaway.findOne({ messageId });
    if (!giveaway || giveaway.ended) return;

    giveaway.ended = true;

    let winners = [];
    if (giveaway.participants.length > 0) {
        const participants = [...giveaway.participants];
        for (let i = 0; i < Math.min(giveaway.winnerCount, participants.length); i++) {
            const randomIndex = Math.floor(Math.random() * participants.length);
            winners.push(participants.splice(randomIndex, 1)[0]);
        }
    }

    giveaway.winners = winners;
    await giveaway.save();

    try {
        const channel = await client.channels.fetch(giveaway.channelId);
        const message = await channel.messages.fetch(messageId);

        let description;
        if (winners.length === 0) {
            description = `**Prize:** ${giveaway.prize}\n**Winners:** No valid participants\n**Participants:** ${giveaway.participants.length}\n**Ended:** <t:${Math.floor(giveaway.endTime.getTime() / 1000)}:R>\n**Hosted by:** <@${giveaway.hostId}>`;
        } else {
            const winnerMentions = winners.map(id => `<@${id}>`).join(", ");
            description = `**Prize:** ${giveaway.prize}\n**Winners:** ${winnerMentions}\n**Participants:** ${giveaway.participants.length}\n**Ended:** <t:${Math.floor(giveaway.endTime.getTime() / 1000)}:R>\n**Hosted by:** <@${giveaway.hostId}>`;
        }

        const embed = EmbedBuilder.from(message.embeds[0])
            .setTitle("🎉 Giveaway Ended!")
            .setDescription(description)
            .setColor("#2ed573")
            .setFooter({ text: "Giveaway has ended!" });

        await message.edit({ embeds: [embed], components: [] });

        if (winners.length > 0) {
            await channel.send(`🎉 **Congratulations ${winners.map(id => `<@${id}>`).join(", ")}!**\nYou won **${giveaway.prize}**!`);
        }
    } catch (error) {
        console.log("Could not update ended giveaway message:", error);
    }
}

module.exports = { endGiveaway };