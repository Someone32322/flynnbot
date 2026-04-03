const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } = require("discord.js");
const Suggestion = require("../../database/schemas/Suggestion");
const { getGuildSettings } = require("../../utils/guildSettings");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("suggestion")
        .setDescription("Manage suggestions")
        .addSubcommand(subcommand =>
            subcommand
                .setName("create")
                .setDescription("Create a new suggestion")
                .addStringOption(option =>
                    option.setName("title")
                          .setDescription("Title of your suggestion")
                          .setRequired(true))
                .addStringOption(option =>
                    option.setName("description")
                          .setDescription("Detailed description of your suggestion")
                          .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName("approve")
                .setDescription("Approve a suggestion")
                .addStringOption(option =>
                    option.setName("suggestion_id")
                          .setDescription("ID of the suggestion to approve")
                          .setRequired(true))
                .addStringOption(option =>
                    option.setName("reason")
                          .setDescription("Reason for approval (optional)")
                          .setRequired(false)))
        .addSubcommand(subcommand =>
            subcommand
                .setName("reject")
                .setDescription("Reject a suggestion")
                .addStringOption(option =>
                    option.setName("suggestion_id")
                          .setDescription("ID of the suggestion to reject")
                          .setRequired(true))
                .addStringOption(option =>
                    option.setName("reason")
                          .setDescription("Reason for rejection")
                          .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName("implement")
                .setDescription("Mark a suggestion as implemented")
                .addStringOption(option =>
                    option.setName("suggestion_id")
                          .setDescription("ID of the suggestion to mark as implemented")
                          .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName("list")
                .setDescription("List suggestions")
                .addStringOption(option =>
                    option.setName("status")
                          .setDescription("Filter by status")
                          .setRequired(false)
                          .addChoices(
                              { name: "Pending", value: "pending" },
                              { name: "Approved", value: "approved" },
                              { name: "Rejected", value: "rejected" },
                              { name: "Implemented", value: "implemented" }
                          ))
                .addUserOption(option =>
                    option.setName("user")
                          .setDescription("Filter by user")
                          .setRequired(false)))
        .addSubcommand(subcommand =>
            subcommand
                .setName("setchannel")
                .setDescription("Set the suggestion channel")
                .addChannelOption(option =>
                    option.setName("channel")
                          .setDescription("Channel for suggestions")
                          .setRequired(true))),

    async execute({ interaction, client }) {
        const subcommand = interaction.options.getSubcommand();

        switch (subcommand) {
            case "create":
                await handleCreate(interaction, client);
                break;
            case "approve":
                await handleApprove(interaction, client);
                break;
            case "reject":
                await handleReject(interaction, client);
                break;
            case "implement":
                await handleImplement(interaction, client);
                break;
            case "list":
                await handleList(interaction, client);
                break;
            case "stats":
                await handleStats(interaction, client);
                break;
            case "setchannel":
                await handleSetChannel(interaction, client);
                break;
        }
    }
};

async function handleCreate(interaction, client) {
    const title = interaction.options.getString("title");
    const description = interaction.options.getString("description");

    // Check if dedicated suggestion channel is set
    const settings = await getGuildSettings(interaction.guild.id);
    let targetChannel = interaction.channel;

    if (settings.suggestionChannelId) {
        const suggestionChannel = interaction.guild.channels.cache.get(settings.suggestionChannelId);
        if (suggestionChannel) {
            targetChannel = suggestionChannel;
        }
    }

    // Generate suggestion ID
    const suggestionCount = await Suggestion.countDocuments({ guildId: interaction.guild.id });
    const suggestionId = `S-${(suggestionCount + 1).toString().padStart(4, '0')}`;

    // Create embed
    const embed = new EmbedBuilder()
        .setTitle(`💡 ${title}`)
        .setDescription(description)
        .setColor("#ffa726")
        .addFields(
            { name: "Status", value: "⏳ Pending", inline: true },
            { name: "Author", value: interaction.user.toString(), inline: true },
            { name: "ID", value: suggestionId, inline: true },
            { name: "Upvotes", value: "0", inline: true },
            { name: "Downvotes", value: "0", inline: true },
            { name: "Created", value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true }
        )
        .setFooter({ text: "Use the buttons below to vote!" })
        .setTimestamp();

    // Create buttons
    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(`suggestion_upvote_${suggestionId}`)
                .setLabel("👍 Upvote")
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId(`suggestion_downvote_${suggestionId}`)
                .setLabel("👎 Downvote")
                .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
                .setCustomId(`suggestion_info_${suggestionId}`)
                .setLabel("ℹ️ Info")
                .setStyle(ButtonStyle.Secondary)
        );

    // Send message
    const message = await targetChannel.send({ embeds: [embed], components: [row] });

    // Save to database
    await Suggestion.create({
        suggestionId,
        guildId: interaction.guild.id,
        channelId: targetChannel.id,
        messageId: message.id,
        authorId: interaction.user.id,
        title,
        description,
        upvotes: [],
        downvotes: []
    });

    const channelMention = targetChannel.id === interaction.channel.id ? "" : ` in ${targetChannel}`;
    interaction.reply({ content: `✅ Suggestion created with ID: **${suggestionId}**${channelMention}`, ephemeral: true });
}

async function handleApprove(interaction, client) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
        return interaction.reply({ content: "You need Manage Server permission to approve suggestions.", ephemeral: true });
    }

    const suggestionId = interaction.options.getString("suggestion_id");
    const reason = interaction.options.getString("reason") || "No reason provided";

    const suggestion = await Suggestion.findOne({ suggestionId, guildId: interaction.guild.id });
    if (!suggestion) {
        return interaction.reply({ content: "Suggestion not found.", ephemeral: true });
    }

    if (suggestion.status !== 'pending') {
        return interaction.reply({ content: "This suggestion is not pending.", ephemeral: true });
    }

    suggestion.status = 'approved';
    suggestion.approvedBy = interaction.user.id;
    suggestion.reason = reason;
    suggestion.updatedAt = new Date();
    await suggestion.save();

    // Update message - remove buttons and update embed
    try {
        const channel = await client.channels.fetch(suggestion.channelId);
        const message = await channel.messages.fetch(suggestion.messageId);

        let embed = EmbedBuilder.from(message.embeds[0])
            .setColor("#00ff00")
            .setFields(
                { name: "Status", value: "✅ Approved", inline: true },
                { name: "Author", value: `<@${suggestion.authorId}>`, inline: true },
                { name: "ID", value: suggestion.suggestionId, inline: true },
                { name: "Upvotes", value: suggestion.upvotes.length.toString(), inline: true },
                { name: "Downvotes", value: suggestion.downvotes.length.toString(), inline: true },
                { name: "Created", value: `<t:${Math.floor(suggestion.createdAt.getTime() / 1000)}:R>`, inline: true },
                { name: "Approved By", value: `<@${interaction.user.id}>`, inline: true }
            )
            .setFooter({ text: "This suggestion has been approved!" });

        if (reason) {
            embed.addFields({ name: "Reason", value: reason, inline: false });
        }

        embed.addFields({ name: "Updated", value: `<t:${Math.floor(suggestion.updatedAt.getTime() / 1000)}:R>`, inline: true });

        await message.edit({ embeds: [embed], components: [] });
    } catch (error) {
        console.log("Could not update suggestion message:", error);
    }

    interaction.reply({ content: `✅ Suggestion **${suggestionId}** has been approved!`, ephemeral: true });
}

async function handleReject(interaction, client) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
        return interaction.reply({ content: "You need Manage Server permission to reject suggestions.", ephemeral: true });
    }

    const suggestionId = interaction.options.getString("suggestion_id");
    const reason = interaction.options.getString("reason");

    const suggestion = await Suggestion.findOne({ suggestionId, guildId: interaction.guild.id });
    if (!suggestion) {
        return interaction.reply({ content: "Suggestion not found.", ephemeral: true });
    }

    if (suggestion.status !== 'pending') {
        return interaction.reply({ content: "This suggestion is not pending.", ephemeral: true });
    }

    suggestion.status = 'rejected';
    suggestion.rejectedBy = interaction.user.id;
    suggestion.reason = reason;
    suggestion.updatedAt = new Date();
    await suggestion.save();

    // Update message - remove buttons and update embed
    try {
        const channel = await client.channels.fetch(suggestion.channelId);
        const message = await channel.messages.fetch(suggestion.messageId);

        let embed = EmbedBuilder.from(message.embeds[0])
            .setColor("#ff0000")
            .setFields(
                { name: "Status", value: "❌ Rejected", inline: true },
                { name: "Author", value: `<@${suggestion.authorId}>`, inline: true },
                { name: "ID", value: suggestion.suggestionId, inline: true },
                { name: "Upvotes", value: suggestion.upvotes.length.toString(), inline: true },
                { name: "Downvotes", value: suggestion.downvotes.length.toString(), inline: true },
                { name: "Created", value: `<t:${Math.floor(suggestion.createdAt.getTime() / 1000)}:R>`, inline: true },
                { name: "Rejected By", value: `<@${interaction.user.id}>`, inline: true }
            )
            .setFooter({ text: "This suggestion has been rejected." });

        if (reason) {
            embed.addFields({ name: "Reason", value: reason, inline: false });
        }

        embed.addFields({ name: "Updated", value: `<t:${Math.floor(suggestion.updatedAt.getTime() / 1000)}:R>`, inline: true });

        await message.edit({ embeds: [embed], components: [] });
    } catch (error) {
        console.log("Could not update suggestion message:", error);
    }

    interaction.reply({ content: `❌ Suggestion **${suggestionId}** has been rejected!`, ephemeral: true });
}

async function handleImplement(interaction, client) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
        return interaction.reply({ content: "You need Manage Server permission to implement suggestions.", ephemeral: true });
    }

    const suggestionId = interaction.options.getString("suggestion_id");

    const suggestion = await Suggestion.findOne({ suggestionId, guildId: interaction.guild.id });
    if (!suggestion) {
        return interaction.reply({ content: "Suggestion not found.", ephemeral: true });
    }

    if (suggestion.status !== 'approved') {
        return interaction.reply({ content: "This suggestion must be approved first.", ephemeral: true });
    }

    suggestion.status = 'implemented';
    suggestion.implementedBy = interaction.user.id;
    suggestion.updatedAt = new Date();
    await suggestion.save();

    // Update message - remove buttons and update embed
    try {
        const channel = await client.channels.fetch(suggestion.channelId);
        const message = await channel.messages.fetch(suggestion.messageId);

        let embed = EmbedBuilder.from(message.embeds[0])
            .setColor("#ff6b6b")
            .setFields(
                { name: "Status", value: "🎉 Implemented", inline: true },
                { name: "Author", value: `<@${suggestion.authorId}>`, inline: true },
                { name: "ID", value: suggestion.suggestionId, inline: true },
                { name: "Upvotes", value: suggestion.upvotes.length.toString(), inline: true },
                { name: "Downvotes", value: suggestion.downvotes.length.toString(), inline: true },
                { name: "Created", value: `<t:${Math.floor(suggestion.createdAt.getTime() / 1000)}:R>`, inline: true },
                { name: "Approved By", value: `<@${suggestion.approvedBy}>`, inline: true },
                { name: "Implemented By", value: `<@${interaction.user.id}>`, inline: true }
            )
            .setFooter({ text: "This suggestion has been implemented!" });

        if (suggestion.reason) {
            embed.addFields({ name: "Approval Reason", value: suggestion.reason, inline: false });
        }

        embed.addFields({ name: "Updated", value: `<t:${Math.floor(suggestion.updatedAt.getTime() / 1000)}:R>`, inline: true });

        await message.edit({ embeds: [embed], components: [] });
    } catch (error) {
        console.log("Could not update suggestion message:", error);
    }

    interaction.reply({ content: `🎉 Suggestion **${suggestionId}** has been marked as implemented!`, ephemeral: true });
}

async function handleList(interaction, client) {
    const status = interaction.options.getString("status");
    const user = interaction.options.getUser("user");

    let filter = { guildId: interaction.guild.id };
    if (status) filter.status = status;
    if (user) filter.authorId = user.id;

    const suggestions = await Suggestion.find(filter).sort({ createdAt: -1 }).limit(10);

    if (suggestions.length === 0) {
        return interaction.reply({ content: "No suggestions found with the specified filters.", ephemeral: true });
    }

    const embed = new EmbedBuilder()
        .setTitle("📋 Suggestion List")
        .setColor("#0099ff")
        .setTimestamp();

    for (const suggestion of suggestions) {
        const statusEmoji = {
            pending: '⏳',
            approved: '✅',
            rejected: '❌',
            implemented: '🎉'
        };

        embed.addFields({
            name: `${statusEmoji[suggestion.status]} ${suggestion.suggestionId}: ${suggestion.title}`,
            value: `${suggestion.description.substring(0, 100)}${suggestion.description.length > 100 ? '...' : ''}\n**Status:** ${suggestion.status} | **Votes:** ${suggestion.upvotes.length}/${suggestion.downvotes.length}`,
            inline: false
        });
    }

    interaction.reply({ embeds: [embed], ephemeral: true });
}

async function handleStats(interaction, client) {
    const totalSuggestions = await Suggestion.countDocuments({ guildId: interaction.guild.id });
    const pending = await Suggestion.countDocuments({ guildId: interaction.guild.id, status: 'pending' });
    const approved = await Suggestion.countDocuments({ guildId: interaction.guild.id, status: 'approved' });
    const rejected = await Suggestion.countDocuments({ guildId: interaction.guild.id, status: 'rejected' });
    const implemented = await Suggestion.countDocuments({ guildId: interaction.guild.id, status: 'implemented' });

    // Get top contributors
    const topContributors = await Suggestion.aggregate([
        { $match: { guildId: interaction.guild.id } },
        { $group: { _id: "$authorId", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 5 }
    ]);

    const embed = new EmbedBuilder()
        .setTitle("📊 Suggestion Statistics")
        .setColor("#00ff88")
        .addFields(
            { name: "📈 Total Suggestions", value: totalSuggestions.toString(), inline: true },
            { name: "⏳ Pending", value: pending.toString(), inline: true },
            { name: "✅ Approved", value: approved.toString(), inline: true },
            { name: "❌ Rejected", value: rejected.toString(), inline: true },
            { name: "🎉 Implemented", value: implemented.toString(), inline: true },
            { name: "\u200B", value: "\u200B", inline: true }
        )
        .setTimestamp();

    if (topContributors.length > 0) {
        let contributorsText = "";
        for (let i = 0; i < topContributors.length; i++) {
            const user = await client.users.fetch(topContributors[i]._id).catch(() => null);
            const username = user ? user.username : "Unknown User";
            contributorsText += `${i + 1}. ${username} - ${topContributors[i].count} suggestions\n`;
        }
        embed.addFields({ name: "🏆 Top Contributors", value: contributorsText, inline: false });
    }

    interaction.reply({ embeds: [embed], ephemeral: true });
}

async function handleSetChannel(interaction, client) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
        return interaction.reply({ content: "You need Manage Server permission to set the suggestion channel.", ephemeral: true });
    }

    const channel = interaction.options.getChannel("channel");

    if (channel.type !== 0) { // TEXT CHANNEL
        return interaction.reply({ content: "Please select a text channel.", ephemeral: true });
    }

    // Update guild settings
    const settings = await getGuildSettings(interaction.guild.id);
    settings.suggestionChannelId = channel.id;
    await settings.save();

    interaction.reply({ content: `✅ Suggestion channel has been set to ${channel}!`, ephemeral: true });
}
