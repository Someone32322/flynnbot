const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("serverstats")
        .setDescription("View server statistics"),

    async execute({ interaction, client }) {
        const guild = interaction.guild;

        // Get member stats
        const totalMembers = guild.memberCount;
        const onlineMembers = guild.members.cache.filter(member => member.presence?.status === 'online').size;
        const botCount = guild.members.cache.filter(member => member.user.bot).size;
        const humanCount = totalMembers - botCount;

        // Get channel stats
        const textChannels = guild.channels.cache.filter(channel => channel.type === 0).size;
        const voiceChannels = guild.channels.cache.filter(channel => channel.type === 2).size;
        const categoryChannels = guild.channels.cache.filter(channel => channel.type === 4).size;

        // Get role stats
        const roleCount = guild.roles.cache.size;

        // Get emoji stats
        const emojiCount = guild.emojis.cache.size;
        const animatedEmojis = guild.emojis.cache.filter(emoji => emoji.animated).size;
        const staticEmojis = emojiCount - animatedEmojis;

        // Get boost stats
        const boostLevel = guild.premiumTier;
        const boostCount = guild.premiumSubscriptionCount;

        const embed = new EmbedBuilder()
            .setTitle(`📊 ${guild.name} Statistics`)
            .setThumbnail(guild.iconURL({ dynamic: true, size: 256 }))
            .setColor("#00ff88")
            .addFields(
                {
                    name: "👥 Members",
                    value: `**Total:** ${totalMembers}\n**Humans:** ${humanCount}\n**Bots:** ${botCount}\n**Online:** ${onlineMembers}`,
                    inline: true
                },
                {
                    name: "📺 Channels",
                    value: `**Text:** ${textChannels}\n**Voice:** ${voiceChannels}\n**Categories:** ${categoryChannels}\n**Total:** ${textChannels + voiceChannels + categoryChannels}`,
                    inline: true
                },
                {
                    name: "🎭 Roles & Emojis",
                    value: `**Roles:** ${roleCount}\n**Emojis:** ${emojiCount}\n**Animated:** ${animatedEmojis}\n**Static:** ${staticEmojis}`,
                    inline: true
                },
                {
                    name: "🚀 Server Info",
                    value: `**Created:** <t:${Math.floor(guild.createdTimestamp / 1000)}:F>\n**Boost Level:** ${boostLevel}\n**Boosts:** ${boostCount}\n**Verification:** ${guild.verificationLevel}`,
                    inline: true
                }
            )
            .setFooter({ text: `Server ID: ${guild.id}` })
            .setTimestamp();

        interaction.reply({ embeds: [embed] });
    }
};