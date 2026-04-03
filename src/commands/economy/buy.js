const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const User = require("../../database/schemas/User");
const Item = require("../../database/schemas/Item");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("buy")
        .setDescription("Buy an item from the shop")
        .addStringOption(option =>
            option.setName("item")
                  .setDescription("Item to buy")
                  .setRequired(true)
        )
        .addIntegerOption(option =>
            option.setName("quantity")
                  .setDescription("Quantity to buy (default 1)")
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

        const totalCost = item.price * quantity;
        if (user.balance < totalCost) {
            return interaction.reply({ content: `You don't have enough coins. You need ${totalCost} coins.`, ephemeral: true });
        }

        user.balance -= totalCost;
        user.inventory.set(item.name, (user.inventory.get(item.name) || 0) + quantity);
        await user.save();

        const embed = new EmbedBuilder()
            .setTitle("Purchase Successful")
            .setDescription(`You bought ${quantity}x ${item.emoji} ${item.name} for ${totalCost} coins!`)
            .setColor("#00ff00")
            .setTimestamp();

        interaction.reply({ embeds: [embed] });
    }
};