const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const User = require("../../database/schemas/User");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("balance")
        .setDescription("Check your or another user's balance")
        .addUserOption(option =>
            option.setName("user")
                  .setDescription("User to check (defaults to you)")
                  .setRequired(false)
        ),

    async execute({ interaction, client }) {
        const target = interaction.options.getUser("user") || interaction.user;

        let user = await User.findOne({ userId: target.id, guildId: interaction.guild.id });
        if (!user) {
            user = await User.create({ userId: target.id, guildId: interaction.guild.id });
        }

        const embed = new EmbedBuilder()
            .setTitle(`${target.username}'s Balance`)
            .setThumbnail(target.displayAvatarURL({ dynamic: true }))
            .addFields(
                { name: "💰 Wallet", value: `${user.balance} coins`, inline: true },
                { name: "🏦 Bank", value: `${user.bank} coins`, inline: true },
                { name: "💵 Total", value: `${user.balance + user.bank} coins`, inline: true }
            )
            .setColor("#00ff00")
            .setTimestamp();

        interaction.reply({ embeds: [embed] });
    }
};