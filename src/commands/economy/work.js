const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const User = require("../../database/schemas/User");

const jobs = [
    "Programmer", "Chef", "Teacher", "Doctor", "Artist", "Mechanic", "Writer", "Scientist", "Actor", "Musician"
];

module.exports = {
    data: new SlashCommandBuilder()
        .setName("work")
        .setDescription("Work to earn coins"),

    async execute({ interaction, client }) {
        let user = await User.findOne({ userId: interaction.user.id, guildId: interaction.guild.id });
        if (!user) {
            user = await User.create({ userId: interaction.user.id, guildId: interaction.guild.id });
        }

        const now = new Date();
        const lastWork = user.lastWork ? new Date(user.lastWork) : null;
        const timeDiff = lastWork ? now - lastWork : 60 * 60 * 1000; // 1 hour in ms
        const cooldown = 60 * 60 * 1000; // 1 hour

        if (timeDiff < cooldown) {
            const remaining = cooldown - timeDiff;
            const minutes = Math.floor(remaining / (60 * 1000));
            const seconds = Math.floor((remaining % (60 * 1000)) / 1000);
            return interaction.reply({ content: `You can work again in ${minutes}m ${seconds}s.`, ephemeral: true });
        }

        const job = jobs[Math.floor(Math.random() * jobs.length)];
        const earnings = Math.floor(Math.random() * 200) + 50; // 50-250 coins
        user.balance += earnings;
        user.lastWork = now;
        await user.save();

        const embed = new EmbedBuilder()
            .setTitle("Work Shift")
            .setDescription(`You worked as a ${job} and earned ${earnings} coins!`)
            .setColor("#0099ff")
            .setTimestamp();

        interaction.reply({ embeds: [embed] });
    }
};