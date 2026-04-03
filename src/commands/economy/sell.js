const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const User = require("../../database/schemas/User");
const Item = require("../../database/schemas/Item");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("sell")
        .setDescription("Sell an item from your inventory")
        .addStringOption(option =>
            option.setName("item")
                  .setDescription("Item to sell")
                  .setRequired(true)
        )
        .addIntegerOption(option =>
            option.setName("quantity")
                  .setDescription("Quantity to sell (default 1)")
                  .setRequired(false)
                  .setMinValue(1)
        ),

    async execute({ interaction, client }) {
        const itemName = interaction.options.getString("item");
        const quantity = interaction.options.getInteger("quantity") || 1;

        const item = await Item.findOne({ name: { $regex: new RegExp(`^${itemName}$`, 'i') }, guildId: interaction.guild.id });
        if (!item) {
            return interaction.reply({ content: "Item not found in the shop.", ephemeral: true });
        }

        let user = await User.findOne({ userId: interaction.user.id, guildId: interaction.guild.id });
        if (!user) {
            user = await User.create({ userId: interaction.user.id, guildId: interaction.guild.id });
        }

        const currentQuantity = user.inventory.get(item.name) || 0;
        if (currentQuantity < quantity) {
            return interaction.reply({ content: `You don't have enough ${item.name}. You have ${currentQuantity}.`, ephemeral: true });
        }

        const sellPrice = item.sellPrice || Math.floor(item.price * 0.8); // Use sellPrice if set, else 80% of buy price
        const totalEarned = sellPrice * quantity;

        user.balance += totalEarned;
        user.inventory.set(item.name, currentQuantity - quantity);
        if (user.inventory.get(item.name) <= 0) {
            user.inventory.delete(item.name);
        }
        await user.save();

        const embed = new EmbedBuilder()
            .setTitle("Sale Successful")
            .setDescription(`You sold ${quantity}x ${item.emoji} ${item.name} for ${totalEarned} coins!`)
            .setColor("#00ff00")
            .setTimestamp();

        interaction.reply({ embeds: [embed] });
    }
};