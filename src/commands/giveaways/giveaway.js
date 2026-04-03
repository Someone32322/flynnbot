const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } = require("discord.js");
const Giveaway = require("../../database/schemas/Giveaway");
const { endGiveaway } = require("../../utils/giveawayUtils");
const ms = require("ms");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("giveaway")
        .setDescription("Manage giveaways")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand(subcommand =>
            subcommand
                .setName("create")
                .setDescription("Create a new giveaway")
                .addStringOption(option =>
                    option.setName("duration")
                          .setDescription("Duration (e.g., 1d, 2h, 30m)")
                          .setRequired(true))
                .addStringOption(option =>
                    option.setName("prize")
                          .setDescription("Prize to give away")
                          .setRequired(true))
                .addIntegerOption(option =>
                    option.setName("winners")
                          .setDescription("Number of winners (default: 1)")
                          .setRequired(false)
                          .setMinValue(1)
                          .setMaxValue(10))
                .addChannelOption(option =>
                    option.setName("channel")
                          .setDescription("Channel to host the giveaway (default: current)")
                          .setRequired(false)))
        .addSubcommand(subcommand =>
            subcommand
                .setName("end")
                .setDescription("End a giveaway early")
                .addStringOption(option =>
                    option.setName("message_id")
                          .setDescription("Message ID of the giveaway")
                          .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName("cancel")
                .setDescription("Cancel a giveaway")
                .addStringOption(option =>
                    option.setName("message_id")
                          .setDescription("Message ID of the giveaway")
                          .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName("reroll")
                .setDescription("Reroll giveaway winners")
                .addStringOption(option =>
                    option.setName("message_id")
                          .setDescription("Message ID of the giveaway")
                          .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName("list")
                .setDescription("List active giveaways")),

    async execute({ interaction, client }) {
        const subcommand = interaction.options.getSubcommand();

        switch (subcommand) {
            case "create":
                await handleCreate(interaction, client);
                break;
            case "end":
                await handleEnd(interaction, client);
                break;
            case "cancel":
                await handleCancel(interaction, client);
                break;
            case "reroll":
                await handleReroll(interaction, client);
                break;
            case "list":
                await handleList(interaction, client);
                break;
        }
    }
};

async function handleCreate(interaction, client) {
    const duration = interaction.options.getString("duration");
    const prize = interaction.options.getString("prize");
    const winnerCount = interaction.options.getInteger("winners") || 1;
    const channel = interaction.options.getChannel("channel") || interaction.channel;

    // Parse duration
    const durationMs = ms(duration);
    if (!durationMs || durationMs < 10000) { // Minimum 10 seconds
        return interaction.reply({ content: "Invalid duration. Use formats like 1d, 2h, 30m, 45s.", ephemeral: true });
    }

    const endTime = new Date(Date.now() + durationMs);

    // Create embed
    const embed = new EmbedBuilder()
        .setTitle("🎉 Giveaway!")
        .setDescription(`**Prize:** ${prize}\n**Winners:** ${winnerCount}\n**Participants:** 0\n**Ends:** <t:${Math.floor(endTime.getTime() / 1000)}:R>\n**Hosted by:** ${interaction.user}`)
        .setColor("#ff6b6b")
        .setFooter({ text: "Click the button below to enter!" })
        .setTimestamp(endTime);

    // Create button
    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId("enter_giveaway")
                .setLabel("🎉 Enter Giveaway")
                .setStyle(ButtonStyle.Primary)
        );

    // Send message
    const message = await channel.send({ embeds: [embed], components: [row] });

    // Save to database
    await Giveaway.create({
        messageId: message.id,
        channelId: channel.id,
        guildId: interaction.guild.id,
        hostId: interaction.user.id,
        prize,
        winnerCount,
        endTime,
        participants: []
    });

    // Set timeout for ending giveaway
    setTimeout(async () => {
        await endGiveaway(client, message.id);
    }, durationMs);

    interaction.reply({ content: `Giveaway created in ${channel}!`, ephemeral: true });
}

async function handleEnd(interaction, client) {
    const messageId = interaction.options.getString("message_id");

    const giveaway = await Giveaway.findOne({ messageId, guildId: interaction.guild.id });
    if (!giveaway) {
        return interaction.reply({ content: "Giveaway not found.", ephemeral: true });
    }

    if (giveaway.ended) {
        return interaction.reply({ content: "This giveaway has already ended.", ephemeral: true });
    }

    await endGiveaway(client, messageId);
    interaction.reply({ content: "Giveaway ended!", ephemeral: true });
}

async function handleCancel(interaction, client) {
    const messageId = interaction.options.getString("message_id");

    const giveaway = await Giveaway.findOneAndDelete({ messageId, guildId: interaction.guild.id });
    if (!giveaway) {
        return interaction.reply({ content: "Giveaway not found.", ephemeral: true });
    }

    if (giveaway.ended) {
        return interaction.reply({ content: "Cannot cancel an ended giveaway.", ephemeral: true });
    }

    try {
        const channel = await client.channels.fetch(giveaway.channelId);
        const message = await channel.messages.fetch(messageId);

        const embed = EmbedBuilder.from(message.embeds[0])
            .setTitle("❌ Giveaway Cancelled")
            .setColor("#ff4757")
            .setFooter({ text: "Giveaway cancelled by host" });

        await message.edit({ embeds: [embed], components: [] });
    } catch (error) {
        console.log("Could not update cancelled giveaway message:", error);
    }

    interaction.reply({ content: "Giveaway cancelled!", ephemeral: true });
}

async function handleReroll(interaction, client) {
    const messageId = interaction.options.getString("message_id");

    const giveaway = await Giveaway.findOne({ messageId, guildId: interaction.guild.id });
    if (!giveaway) {
        return interaction.reply({ content: "Giveaway not found.", ephemeral: true });
    }

    if (!giveaway.ended) {
        return interaction.reply({ content: "This giveaway hasn't ended yet.", ephemeral: true });
    }

    if (giveaway.participants.length === 0) {
        return interaction.reply({ content: "No participants to reroll from.", ephemeral: true });
    }

    // Select new winners
    const newWinners = [];
    const participants = [...giveaway.participants];

    for (let i = 0; i < Math.min(giveaway.winnerCount, participants.length); i++) {
        const randomIndex = Math.floor(Math.random() * participants.length);
        newWinners.push(participants.splice(randomIndex, 1)[0]);
    }

    giveaway.winners = newWinners;
    await giveaway.save();

    try {
        const channel = await client.channels.fetch(giveaway.channelId);
        const message = await channel.messages.fetch(messageId);

        const winnerMentions = newWinners.map(id => `<@${id}>`).join(", ");
        const embed = EmbedBuilder.from(message.embeds[0])
            .setDescription(`**Prize:** ${giveaway.prize}\n**Winners:** ${winnerMentions}\n**Ended:** <t:${Math.floor(giveaway.endTime.getTime() / 1000)}:R>\n**Hosted by:** <@${giveaway.hostId}>`)
            .setFooter({ text: "Giveaway rerolled!" });

        await message.edit({ embeds: [embed], components: [] });

        await channel.send(`🎉 **Giveaway Rerolled!**\n**Prize:** ${giveaway.prize}\n**New Winners:** ${winnerMentions}`);
    } catch (error) {
        console.log("Could not update rerolled giveaway message:", error);
    }

    interaction.reply({ content: "Giveaway rerolled!", ephemeral: true });
}

async function handleList(interaction, client) {
    const giveaways = await Giveaway.find({ guildId: interaction.guild.id, ended: false });

    if (giveaways.length === 0) {
        return interaction.reply({ content: "No active giveaways in this server.", ephemeral: true });
    }

    const embed = new EmbedBuilder()
        .setTitle("Active Giveaways")
        .setColor("#3742fa")
        .setTimestamp();

    for (const giveaway of giveaways) {
        const channel = interaction.guild.channels.cache.get(giveaway.channelId);
        const channelName = channel ? `#${channel.name}` : "Unknown Channel";

        embed.addFields({
            name: giveaway.prize,
            value: `Channel: ${channelName}\nEnds: <t:${Math.floor(giveaway.endTime.getTime() / 1000)}:R>\nParticipants: ${giveaway.participants.length}`,
            inline: true
        });
    }

    interaction.reply({ embeds: [embed], ephemeral: true });
}