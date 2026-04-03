const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const User = require("../../database/schemas/User");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("inventory")
        .setDescription("View your inventory"),

    async execute({ interaction, client }) {
        let user = await User.findOne({ userId: interaction.user.id, guildId: interaction.guild.id });
        if (!user) {
            user = await User.create({ userId: interaction.user.id, guildId: interaction.guild.id });
        }

        const inventory = user.inventory;
        if (inventory.size === 0) {
            return interaction.reply({ content: "Your inventory is empty.", ephemeral: true });
        }

        const items = Array.from(inventory.entries()).map(([name, quantity]) => `${name}: ${quantity}`).join('\n');

        const embed = new EmbedBuilder()
            .setTitle(`${interaction.user.username}'s Inventory`)
            .setDescription(items)
            .setColor("#0099ff")
            .setTimestamp();

        interaction.reply({ embeds: [embed] });
    }
};