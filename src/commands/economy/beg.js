const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const User = require("../../database/schemas/User");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("beg")
        .setDescription("Beg for coins"),

    async execute({ interaction, client }) {
        let user = await User.findOne({ userId: interaction.user.id, guildId: interaction.guild.id });
        if (!user) {
            user = await User.create({ userId: interaction.user.id, guildId: interaction.guild.id });
        }

        const now = new Date();
        const lastBeg = user.lastBeg ? new Date(user.lastBeg) : null;
        const timeDiff = lastBeg ? now - lastBeg : 30 * 60 * 1000; // 30 minutes in ms
        const cooldown = 30 * 60 * 1000; // 30 minutes

        if (timeDiff < cooldown) {
            const remaining = cooldown - timeDiff;
            const minutes = Math.floor(remaining / (60 * 1000));
            const seconds = Math.floor((remaining % (60 * 1000)) / 1000);
            return interaction.reply({ content: `You can beg again in ${minutes}m ${seconds}s.`, ephemeral: true });
        }

        const success = Math.random() > 0.3; // 70% success rate
        if (!success) {
            user.lastBeg = now;
            await user.save();
            return interaction.reply({ content: "No one gave you money this time. Try again later!", ephemeral: true });
        }

        const amount = Math.floor(Math.random() * 50) + 10; // 10-60 coins
        user.balance += amount;
        user.lastBeg = now;
        await user.save();

        const embed = new EmbedBuilder()
            .setTitle("Begging")
            .setDescription(`Someone gave you ${amount} coins!`)
            .setColor("#ff9900")
            .setTimestamp();

        interaction.reply({ embeds: [embed] });
    }
};