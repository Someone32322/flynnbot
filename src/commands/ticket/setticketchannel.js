const { SlashCommandBuilder, MessageFlags } = require("discord.js");
const GuildSettings = require("../../database/schemas/GuildSettings");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("setticketchannel")
        .setDescription("Set the ticket channel for this server (Owner only)")
        .addChannelOption(option =>
            option.setName("channel")
                  .setDescription("Channel for ticket creation")
                  .setRequired(true)
        ),

    async execute({ interaction, client }) {
        if (interaction.user.id !== interaction.guild.ownerId) {
            return interaction.reply({ content: "Only the server owner can use this command.", flags: MessageFlags.Ephemeral });
        }

        const channel = interaction.options.getChannel("channel");

        if (channel.type !== 0) { // TEXT CHANNEL
            return interaction.reply({ content: "Please select a text channel.", flags: MessageFlags.Ephemeral });
        }

        try {
            await GuildSettings.findOneAndUpdate(
                { guildId: interaction.guild.id },
                { ticketChannelId: channel.id },
                { upsert: true, returnDocument: 'after' }
            );

            interaction.reply({ content: `✅ Ticket channel set to ${channel}.`, flags: MessageFlags.Ephemeral });
        } catch (err) {
            console.error(err);
            interaction.reply({ content: "❌ Failed to set ticket channel.", flags: MessageFlags.Ephemeral });
        }
    }
};