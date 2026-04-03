const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const User = require("../../database/schemas/User");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("daily")
        .setDescription("Claim your daily reward"),

    async execute({ interaction, client }) {
        let user = await User.findOne({ userId: interaction.user.id, guildId: interaction.guild.id });
        if (!user) {
            user = await User.create({ userId: interaction.user.id, guildId: interaction.guild.id });
        }

        const now = new Date();
        const lastDaily = user.lastDaily ? new Date(user.lastDaily) : null;
        const timeDiff = lastDaily ? now - lastDaily : 24 * 60 * 60 * 1000; // 24 hours in ms
        const cooldown = 24 * 60 * 60 * 1000; // 24 hours

        if (timeDiff < cooldown) {
            const remaining = cooldown - timeDiff;
            const hours = Math.floor(remaining / (60 * 60 * 1000));
            const minutes = Math.floor((remaining % (60 * 60 * 1000)) / (60 * 1000));
            return interaction.reply({ content: `You can claim your daily reward again in ${hours}h ${minutes}m.`, ephemeral: true });
        }

        const reward = Math.floor(Math.random() * 500) + 100; // 100-600 coins
        user.balance += reward;
        user.lastDaily = now;
        await user.save();

        const embed = new EmbedBuilder()
            .setTitle("Daily Reward")
            .setDescription(`You claimed ${reward} coins!`)
            .setColor("#ffff00")
            .setTimestamp();

        interaction.reply({ embeds: [embed] });
    }
};