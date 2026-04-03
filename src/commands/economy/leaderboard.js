const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const User = require("../../database/schemas/User");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("leaderboard")
        .setDescription("View the economy leaderboard"),

    async execute({ interaction, client }) {
        const users = await User.find({ guildId: interaction.guild.id }).sort({ balance: -1 }).limit(10);

        if (users.length === 0) {
            return interaction.reply({ content: "No users found in the leaderboard.", ephemeral: true });
        }

        const leaderboard = users.map((user, index) => {
            const member = interaction.guild.members.cache.get(user.userId);
            const username = member ? member.user.username : "Unknown User";
            return `${index + 1}. ${username} - ${user.balance} coins`;
        }).join('\n');

        const embed = new EmbedBuilder()
            .setTitle("Economy Leaderboard")
            .setDescription(leaderboard)
            .setColor("#0099ff")
            .setTimestamp();

        interaction.reply({ embeds: [embed] });
    }
};