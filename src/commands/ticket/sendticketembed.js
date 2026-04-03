const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require("discord.js");
const { getGuildSettings } = require("../../utils/guildSettings");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("sendticketembed")
        .setDescription("Send the ticket creation embed (Owner only)"),

    async execute({ interaction, client }) {
        if (interaction.user.id !== interaction.guild.ownerId) {
            return interaction.reply({ content: "Only the server owner can use this command.", flags: MessageFlags.Ephemeral });
        }

        const settings = await getGuildSettings(interaction.guild.id);
        if (!settings.ticketChannelId) {
            return interaction.reply({ content: "Ticket channel not set. Use /setticketchannel first.", flags: MessageFlags.Ephemeral });
        }

        const channel = interaction.guild.channels.cache.get(settings.ticketChannelId);
        if (!channel) {
            return interaction.reply({ content: "Ticket channel not found.", flags: MessageFlags.Ephemeral });
        }

        const embed = new EmbedBuilder()
            .setTitle("🎫 Support Tickets")
            .setDescription("Need help? Click the button below to create a support ticket. Our team will assist you shortly!")
            .setColor("#00ff00")
            .setFooter({ text: "Ticket System" });

        const button = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId("create_ticket")
                    .setLabel("Create Ticket")
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji("🎫")
            );

        try {
            await channel.send({ embeds: [embed], components: [button] });
            interaction.reply({ content: "✅ Ticket embed sent!", flags: MessageFlags.Ephemeral });
        } catch (err) {
            console.error(err);
            interaction.reply({ content: "❌ Failed to send ticket embed.", flags: MessageFlags.Ephemeral });
        }
    }
};