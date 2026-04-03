const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const Item = require("../../database/schemas/Item");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("shop")
        .setDescription("View the shop"),

    async execute({ interaction, client }) {
        const items = await Item.find({ guildId: interaction.guild.id });

        if (items.length === 0) {
            return interaction.reply({ content: "The shop is empty.", ephemeral: true });
        }

        const embed = new EmbedBuilder()
            .setTitle("🛒 Shop")
            .setDescription("Buy items with `/buy <item>`")
            .setColor("#ff00ff");

        items.forEach(item => {
            embed.addFields({
                name: `${item.emoji} ${item.name} - ${item.price} coins`,
                value: item.description,
                inline: true
            });
        });

        interaction.reply({ embeds: [embed] });
    }
};