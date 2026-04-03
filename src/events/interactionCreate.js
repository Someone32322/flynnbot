const { MessageFlags, ChannelType, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const Ticket = require("../database/schemas/Ticket");
const { getGuildSettings } = require("../utils/guildSettings");

module.exports = {
    name: "interactionCreate",
    async execute(interaction, client) {
        console.log("Interaction received: " + interaction.type);

        if (!interaction.isChatInputCommand() && interaction.type !== 3) return;

        // Handle buttons first
        if (interaction.type === 3 && !interaction.customId.startsWith("suggestion_")) {
            console.log("Handling button: " + interaction.customId);
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });

            const settings = await getGuildSettings(interaction.guild.id);
            console.log("Settings:", settings);

            if (interaction.customId === "create_ticket") {
                if (!settings.ticketChannelId || !settings.supportRoleId) {
                    return interaction.editReply({ content: "Ticket system not properly configured." });
                }

                // Check if user already has an open ticket
                const existingTicket = await Ticket.findOne({ guildId: interaction.guild.id, userId: interaction.user.id, status: "open" });
                if (existingTicket) {
                    return interaction.editReply({ content: "You already have an open ticket!" });
                }

                // Generate ticket ID
                const ticketCount = await Ticket.countDocuments({ guildId: interaction.guild.id });
                const ticketId = `ticket-${(ticketCount + 1).toString().padStart(3, '0')}`;

                // Create ticket channel
                const supportRole = interaction.guild.roles.cache.get(settings.supportRoleId);
                if (!supportRole) {
                    return interaction.editReply({ content: "Support role not found." });
                }

                try {
                    const ticketChannel = await interaction.guild.channels.create({
                        name: ticketId,
                        type: ChannelType.GuildText,
                        parent: interaction.channel.parentId ? interaction.channel.parentId : null,
                        permissionOverwrites: [
                            {
                                id: interaction.guild.id,
                                deny: [PermissionFlagsBits.ViewChannel],
                            },
                            {
                                id: interaction.user.id,
                                allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages],
                            },
                            {
                                id: supportRole.id,
                                allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages],
                            },
                        ],
                    });

                    // Save ticket to DB
                    await Ticket.create({
                        guildId: interaction.guild.id,
                        channelId: ticketChannel.id,
                        userId: interaction.user.id,
                        ticketId,
                    });

                    // Send welcome message
                    const embed = new EmbedBuilder()
                        .setTitle(`Ticket ${ticketId}`)
                        .setDescription(`Hello ${interaction.user}! A support member will assist you shortly.\n\nPlease describe your issue in detail.`)
                        .setColor("#00ff00")
                        .setTimestamp();

                    const buttons = new ActionRowBuilder()
                        .addComponents(
                            new ButtonBuilder()
                                .setCustomId("close_ticket")
                                .setLabel("Close Ticket")
                                .setStyle(ButtonStyle.Danger),
                            new ButtonBuilder()
                                .setCustomId("claim_ticket")
                                .setLabel("Claim Ticket")
                                .setStyle(ButtonStyle.Secondary),
                            new ButtonBuilder()
                                .setCustomId("lock_ticket")
                                .setLabel("Lock Ticket")
                                .setStyle(ButtonStyle.Secondary),
                            new ButtonBuilder()
                                .setCustomId("unlock_ticket")
                                .setLabel("Unlock Ticket")
                                .setStyle(ButtonStyle.Success),
                            new ButtonBuilder()
                                .setCustomId("transcript_ticket")
                                .setLabel("Send Transcript")
                                .setStyle(ButtonStyle.Primary)
                        );

                    await ticketChannel.send({ content: `${supportRole}`, embeds: [embed], components: [buttons] });

                    interaction.editReply({ content: `✅ Ticket created: ${ticketChannel}` });
                } catch (error) {
                    console.error("Error creating ticket:", error);
                    interaction.editReply({ content: "❌ Failed to create ticket. Check bot permissions." });
                }

            } else if (interaction.customId === "close_ticket") {
                if (!settings.supportRoleId || !interaction.member.roles.cache.has(settings.supportRoleId)) {
                    return interaction.editReply({ content: "You don't have permission to close tickets." });
                }

                const ticket = await Ticket.findOne({ channelId: interaction.channel.id, status: "open" });
                if (!ticket) {
                    return interaction.editReply({ content: "This is not an open ticket." });
                }

                // Generate transcript
                if (settings.transcriptChannelId) {
                    const transcriptChannel = interaction.guild.channels.cache.get(settings.transcriptChannelId);
                    if (transcriptChannel) {
                        try {
                            const messages = await interaction.channel.messages.fetch({ limit: 100 });
                            const transcript = messages.reverse().map(msg => {
                                const timestamp = `<t:${Math.floor(msg.createdTimestamp / 1000)}:f>`;
                                return `[${timestamp}] ${msg.author.tag}: ${msg.content || (msg.embeds.length ? '[Embed]' : '[Attachment]')}`;
                            }).join('\n');

                            const transcriptEmbed = new EmbedBuilder()
                                .setTitle(`Ticket Transcript - ${ticket.ticketId}`)
                                .setDescription(`Closed by ${interaction.user.tag}\n\n${transcript.length > 4000 ? transcript.substring(0, 4000) + '...' : transcript}`)
                                .setColor("#ff0000")
                                .setTimestamp();

                            await transcriptChannel.send({ embeds: [transcriptEmbed] });
                        } catch (error) {
                            console.error("Error generating transcript:", error);
                        }
                    }
                }

                // Close ticket
                await Ticket.findByIdAndUpdate(ticket._id, { status: "closed", closedAt: new Date() });

                const embed = new EmbedBuilder()
                    .setTitle("Ticket Closed")
                    .setDescription("This ticket has been closed. You can no longer send messages here.")
                    .setColor("#ff0000")
                    .setTimestamp();

                await interaction.channel.send({ embeds: [embed] });

                // Delete channel after 5 seconds
                setTimeout(() => {
                    interaction.channel.delete().catch(console.error);
                }, 5000);

                interaction.editReply({ content: "✅ Ticket closed. Channel will be deleted in 5 seconds." });

            } else if (interaction.customId === "claim_ticket") {
                if (!settings.supportRoleId || !interaction.member.roles.cache.has(settings.supportRoleId)) {
                    return interaction.editReply({ content: "You don't have permission to claim tickets." });
                }

                const ticket = await Ticket.findOne({ channelId: interaction.channel.id, status: "open" });
                if (!ticket) {
                    return interaction.editReply({ content: "This is not an open ticket." });
                }

                if (ticket.claimedBy) {
                    return interaction.editReply({ content: "This ticket is already claimed." });
                }

                await Ticket.findByIdAndUpdate(ticket._id, { claimedBy: interaction.user.id });

                const embed = new EmbedBuilder()
                    .setTitle("Ticket Claimed")
                    .setDescription(`${interaction.user} has claimed this ticket.`)
                    .setColor("#ffff00")
                    .setTimestamp();

                await interaction.channel.send({ embeds: [embed] });

                interaction.editReply({ content: "✅ Ticket claimed!" });

            } else if (interaction.customId === "lock_ticket") {
                if (!settings.supportRoleId || !interaction.member.roles.cache.has(settings.supportRoleId)) {
                    return interaction.editReply({ content: "You don't have permission to manage tickets." });
                }

                const ticket = await Ticket.findOne({ channelId: interaction.channel.id, status: "open" });
                if (!ticket) {
                    return interaction.editReply({ content: "This is not an open ticket." });
                }

                try {
                    await interaction.channel.permissionOverwrites.edit(ticket.userId, { SendMessages: false });

                    const embed = new EmbedBuilder()
                        .setTitle("Ticket Locked")
                        .setDescription("The ticket has been locked. The user can no longer send messages.")
                        .setColor("#ffa500")
                        .setTimestamp();

                    await interaction.channel.send({ embeds: [embed] });

                    interaction.editReply({ content: "✅ Ticket locked!" });
                } catch (error) {
                    console.error("Error locking ticket:", error);
                    interaction.editReply({ content: "❌ Failed to lock ticket." });
                }

            } else if (interaction.customId === "transcript_ticket") {
                if (!settings.supportRoleId || !interaction.member.roles.cache.has(settings.supportRoleId)) {
                    return interaction.editReply({ content: "You don't have permission to manage tickets." });
                }

                if (!settings.transcriptChannelId) {
                    return interaction.editReply({ content: "Transcript channel not set." });
                }

                const transcriptChannel = interaction.guild.channels.cache.get(settings.transcriptChannelId);
                if (!transcriptChannel) {
                    return interaction.editReply({ content: "Transcript channel not found." });
                }

                try {
                    const messages = await interaction.channel.messages.fetch({ limit: 100 });
                    const transcript = messages.reverse().map(msg => {
                        const timestamp = `<t:${Math.floor(msg.createdTimestamp / 1000)}:f>`;
                        return `[${timestamp}] ${msg.author.tag}: ${msg.content || (msg.embeds.length ? '[Embed]' : '[Attachment]')}`;
                    }).join('\n');

                    const transcriptEmbed = new EmbedBuilder()
                        .setTitle(`Ticket Transcript - ${interaction.channel.name}`)
                        .setDescription(`${transcript.length > 4000 ? transcript.substring(0, 4000) + '...' : transcript}`)
                        .setColor("#0099ff")
                        .setTimestamp();

                    await transcriptChannel.send({ embeds: [transcriptEmbed] });

                    interaction.editReply({ content: "✅ Transcript sent!" });
                } catch (error) {
                    console.error("Error sending transcript:", error);
                    interaction.editReply({ content: "❌ Failed to send transcript." });
                }

            } else if (interaction.customId === "unlock_ticket") {
                if (!settings.supportRoleId || !interaction.member.roles.cache.has(settings.supportRoleId)) {
                    return interaction.editReply({ content: "You don't have permission to manage tickets." });
                }

                const ticket = await Ticket.findOne({ channelId: interaction.channel.id, status: "open" });
                if (!ticket) {
                    return interaction.editReply({ content: "This is not an open ticket." });
                }

                try {
                    await interaction.channel.permissionOverwrites.edit(ticket.userId, { SendMessages: true });

                    const embed = new EmbedBuilder()
                        .setTitle("Ticket Unlocked")
                        .setDescription("The ticket has been unlocked. The user can send messages again.")
                        .setColor("#00ff00")
                        .setTimestamp();

                    await interaction.channel.send({ embeds: [embed] });

                    interaction.editReply({ content: "✅ Ticket unlocked!" });
                } catch (error) {
                    console.error("Error unlocking ticket:", error);
                    interaction.editReply({ content: "❌ Failed to unlock ticket." });
                }

            } else if (interaction.customId === "enter_giveaway") {
                const Giveaway = require("../database/schemas/Giveaway");

                const giveaway = await Giveaway.findOne({ messageId: interaction.message.id });
                if (!giveaway) {
                    return interaction.editReply({ content: "Giveaway not found." });
                }

                if (giveaway.ended) {
                    return interaction.editReply({ content: "This giveaway has ended." });
                }

                const userId = interaction.user.id;
                const isParticipating = giveaway.participants.includes(userId);

                if (isParticipating) {
                    // Remove user from giveaway
                    giveaway.participants = giveaway.participants.filter(id => id !== userId);
                    await giveaway.save();

                    // Update embed
                    const embed = EmbedBuilder.from(interaction.message.embeds[0]);
                    const description = embed.data.description.replace(/\*\*Participants:\*\* \d+/, `**Participants:** ${giveaway.participants.length}`);
                    embed.setDescription(description);

                    await interaction.message.edit({ embeds: [embed] });

                    interaction.editReply({ content: "❌ You left the giveaway." });
                } else {
                    // Add user to giveaway
                    giveaway.participants.push(userId);
                    await giveaway.save();

                    // Update embed
                    const embed = EmbedBuilder.from(interaction.message.embeds[0]);
                    const description = embed.data.description.replace(/\*\*Participants:\*\* \d+/, `**Participants:** ${giveaway.participants.length}`);
                    embed.setDescription(description);

                    await interaction.message.edit({ embeds: [embed] });

                    interaction.editReply({ content: "✅ You entered the giveaway!" });
                }
            }
        }

        // Handle suggestion buttons
        if (interaction.type === 3 && interaction.customId.startsWith("suggestion_")) {
            const Suggestion = require("../database/schemas/Suggestion");
            const parts = interaction.customId.split("_");
            const action = parts[1];
            const suggestionId = parts[2];

            await interaction.deferUpdate();

            const suggestion = await Suggestion.findOne({ suggestionId, guildId: interaction.guild.id });
            if (!suggestion) {
                return interaction.followUp({ content: "Suggestion not found.", flags: MessageFlags.Ephemeral });
            }

            const userId = interaction.user.id;

            if (action === "upvote") {
                if (suggestion.upvotes.includes(userId)) {
                    // Remove upvote
                    suggestion.upvotes = suggestion.upvotes.filter(id => id !== userId);
                    await interaction.followUp({ content: "❌ Removed your upvote.", flags: MessageFlags.Ephemeral });
                } else {
                    // Add upvote, remove downvote if exists
                    suggestion.upvotes.push(userId);
                    suggestion.downvotes = suggestion.downvotes.filter(id => id !== userId);
                    await interaction.followUp({ content: "👍 Upvoted!", flags: MessageFlags.Ephemeral });
                }
            } else if (action === "downvote") {
                if (suggestion.downvotes.includes(userId)) {
                    // Remove downvote
                    suggestion.downvotes = suggestion.downvotes.filter(id => id !== userId);
                    await interaction.followUp({ content: "❌ Removed your downvote.", flags: MessageFlags.Ephemeral });
                } else {
                    // Add downvote, remove upvote if exists
                    suggestion.downvotes.push(userId);
                    suggestion.upvotes = suggestion.upvotes.filter(id => id !== userId);
                    await interaction.followUp({ content: "👎 Downvoted!", flags: MessageFlags.Ephemeral });
                }
            } else if (action === "info") {
                const embed = new EmbedBuilder()
                    .setTitle(`Suggestion Info: ${suggestion.suggestionId}`)
                    .setDescription(`**Title:** ${suggestion.title}\n**Description:** ${suggestion.description}`)
                    .addFields(
                        { name: "Status", value: suggestion.status, inline: true },
                        { name: "Author", value: `<@${suggestion.authorId}>`, inline: true },
                        { name: "Upvotes", value: suggestion.upvotes.length.toString(), inline: true },
                        { name: "Downvotes", value: suggestion.downvotes.length.toString(), inline: true },
                        { name: "Created", value: `<t:${Math.floor(suggestion.createdAt.getTime() / 1000)}:F>`, inline: false }
                    )
                    .setColor("#0099ff")
                    .setTimestamp();

                if (suggestion.status !== 'pending') {
                    const actionUser = suggestion.approvedBy || suggestion.rejectedBy || suggestion.implementedBy;
                    const actionType = suggestion.status === 'approved' ? 'Approved' : suggestion.status === 'rejected' ? 'Rejected' : 'Implemented';
                    embed.addFields({ name: `${actionType} By`, value: `<@${actionUser}>`, inline: true });
                    if (suggestion.reason) {
                        embed.addFields({ name: "Reason", value: suggestion.reason, inline: false });
                    }
                }

                return interaction.followUp({ embeds: [embed], flags: MessageFlags.Ephemeral });
            }

            await suggestion.save();

            // Update the embed
            try {
                const channel = await client.channels.fetch(suggestion.channelId);
                const message = await channel.messages.fetch(suggestion.messageId);
                const embed = EmbedBuilder.from(message.embeds[0]);

                // Update vote counts in embed
                embed.data.fields[3].value = suggestion.upvotes.length.toString(); // Upvotes
                embed.data.fields[4].value = suggestion.downvotes.length.toString(); // Downvotes

                await message.edit({ embeds: [embed] });
            } catch (error) {
                console.log("Could not update suggestion embed:", error);
            }
        }

        // Handle commands
        const command = client.commands.get(interaction.commandName);

        if (!command) return;

        try {
            await command.execute({ interaction, client });
        } catch (error) {

            console.error(error);

            await interaction.reply({
                content: "There was an error executing this command.",
                flags: MessageFlags.Ephemeral
            });
        }
    }
};