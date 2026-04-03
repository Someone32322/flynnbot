const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const Item = require("../../database/schemas/Item");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("additem")
        .setDescription("Add an item to the shop (Admin only)")
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addStringOption(option =>
            option.setName("name")
                  .setDescription("Item name")
                  .setRequired(true)
        )
        .addStringOption(option =>
            option.setName("description")
                  .setDescription("Item description")
                  .setRequired(true)
        )
        .addIntegerOption(option =>
            option.setName("price")
                  .setDescription("Item price")
                  .setRequired(true)
                  .setMinValue(1)
        )
        .addStringOption(option =>
            option.setName("emoji")
                  .setDescription("Item emoji")
                  .setRequired(false)
        )
        .addIntegerOption(option =>
            option.setName("sellprice")
                  .setDescription("Item sell price (optional, defaults to 80% of buy price)")
                  .setRequired(false)
                  .setMinValue(0)
        ),

    async execute({ interaction, client }) {
        const name = interaction.options.getString("name");
        const description = interaction.options.getString("description");
        const price = interaction.options.getInteger("price");
        const emoji = interaction.options.getString("emoji") || "";
        const sellPrice = interaction.options.getInteger("sellprice") || 0;

        // Check if item already exists
        const existingItem = await Item.findOne({ name: { $regex: new RegExp(`^${name}$`, 'i') }, guildId: interaction.guild.id });
        if (existingItem) {
            return interaction.reply({ content: "An item with this name already exists in the shop.", ephemeral: true });
        }

        const item = await Item.create({
            name,
            description,
            price,
            sellPrice,
            emoji,
            guildId: interaction.guild.id
        });

        const embed = new EmbedBuilder()
            .setTitle("Item Added")
            .setDescription(`Successfully added ${emoji} ${name} to the shop for ${price} coins!`)
            .setColor("#00ff00")
            .setTimestamp();

        interaction.reply({ embeds: [embed] });
    }
};