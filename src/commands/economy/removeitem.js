const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const Item = require("../../database/schemas/Item");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("removeitem")
        .setDescription("Remove an item from the shop (Admin only)")
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addStringOption(option =>
            option.setName("name")
                  .setDescription("Item name to remove")
                  .setRequired(true)
        ),

    async execute({ interaction, client }) {
        const name = interaction.options.getString("name");

        const item = await Item.findOneAndDelete({ name: { $regex: new RegExp(`^${name}$`, 'i') }, guildId: interaction.guild.id });
        if (!item) {
            return interaction.reply({ content: "Item not found in the shop.", ephemeral: true });
        }

        const embed = new EmbedBuilder()
            .setTitle("Item Removed")
            .setDescription(`Successfully removed ${item.emoji} ${item.name} from the shop!`)
            .setColor("#ff0000")
            .setTimestamp();

        interaction.reply({ embeds: [embed] });
    }
};