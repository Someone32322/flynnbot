const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const User = require("../../database/schemas/User");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("withdraw")
        .setDescription("Withdraw coins from your bank")
        .addStringOption(option =>
            option.setName("amount")
                  .setDescription("Amount to withdraw (or 'all' for everything)")
                  .setRequired(true)
        ),

    async execute({ interaction, client }) {
        const amountInput = interaction.options.getString("amount");

        let user = await User.findOne({ userId: interaction.user.id, guildId: interaction.guild.id });
        if (!user) {
            user = await User.create({ userId: interaction.user.id, guildId: interaction.guild.id });
        }

        let amount;
        if (amountInput.toLowerCase() === "all") {
            amount = user.bank;
        } else {
            amount = parseInt(amountInput);
            if (isNaN(amount) || amount <= 0) {
                return interaction.reply({ content: "Invalid amount.", ephemeral: true });
            }
        }

        if (user.bank < amount) {
            return interaction.reply({ content: "You don't have enough coins in your bank to withdraw that amount.", ephemeral: true });
        }

        user.balance += amount;
        user.bank -= amount;
        await user.save();

        const embed = new EmbedBuilder()
            .setTitle("Withdrawal Successful")
            .setDescription(`You withdrew ${amount} coins from your bank.`)
            .addFields(
                { name: "Wallet", value: `${user.balance} coins`, inline: true },
                { name: "Bank", value: `${user.bank} coins`, inline: true }
            )
            .setColor("#00ff00")
            .setTimestamp();

        interaction.reply({ embeds: [embed] });
    }
};