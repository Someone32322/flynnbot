const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const User = require("../../database/schemas/User");

const symbols = ["🍎", "🍊", "🍇", "🍓", "🍒"];

module.exports = {
    data: new SlashCommandBuilder()
        .setName("slots")
        .setDescription("Play slots and bet on the outcome")
        .addIntegerOption(option =>
            option.setName("amount")
                  .setDescription("Amount to bet")
                  .setRequired(true)
                  .setMinValue(1)
        ),

    async execute({ interaction, client }) {
        const amount = interaction.options.getInteger("amount");

        let user = await User.findOne({ userId: interaction.user.id, guildId: interaction.guild.id });
        if (!user) {
            user = await User.create({ userId: interaction.user.id, guildId: interaction.guild.id });
        }

        if (user.balance < amount) {
            return interaction.reply({ content: "You don't have enough coins to bet that amount.", ephemeral: true });
        }

        const slot1 = symbols[Math.floor(Math.random() * symbols.length)];
        const slot2 = symbols[Math.floor(Math.random() * symbols.length)];
        const slot3 = symbols[Math.floor(Math.random() * symbols.length)];

        let multiplier = 0;
        if (slot1 === slot2 && slot2 === slot3) {
            multiplier = 5; // Jackpot
        } else if (slot1 === slot2 || slot2 === slot3 || slot1 === slot3) {
            multiplier = 2; // Two matching
        }

        const winnings = amount * multiplier;
        user.balance += winnings - amount;
        await user.save();

        const embed = new EmbedBuilder()
            .setTitle("Slots")
            .setDescription(`${slot1} | ${slot2} | ${slot3}`)
            .addFields(
                { name: "Bet Amount", value: `${amount} coins`, inline: true },
                { name: "Winnings", value: `${winnings} coins`, inline: true },
                { name: "New Balance", value: `${user.balance} coins`, inline: true }
            )
            .setColor(multiplier > 0 ? "#00ff00" : "#ff0000")
            .setTimestamp();

        interaction.reply({ embeds: [embed] });
    }
};