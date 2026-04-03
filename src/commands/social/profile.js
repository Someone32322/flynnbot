const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const Profile = require("../../database/schemas/Profile");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("profile")
        .setDescription("Manage your profile")
        .addSubcommand(subcommand =>
            subcommand
                .setName("view")
                .setDescription("View a user's profile")
                .addUserOption(option =>
                    option.setName("user")
                          .setDescription("User to view profile for (default: yourself)")
                          .setRequired(false)))
        .addSubcommand(subcommand =>
            subcommand
                .setName("set")
                .setDescription("Set profile information")
                .addStringOption(option =>
                    option.setName("bio")
                          .setDescription("Your bio (max 500 characters)")
                          .setRequired(false))
                .addStringOption(option =>
                    option.setName("color")
                          .setDescription("Your favorite color (hex code)")
                          .setRequired(false))
                .addStringOption(option =>
                    option.setName("game")
                          .setDescription("Your favorite game")
                          .setRequired(false))
                .addStringOption(option =>
                    option.setName("music")
                          .setDescription("Your favorite music/artist")
                          .setRequired(false)))
        .addSubcommand(subcommand =>
            subcommand
                .setName("social")
                .setDescription("Set social media links")
                .addStringOption(option =>
                    option.setName("platform")
                          .setDescription("Social platform")
                          .setRequired(true)
                          .addChoices(
                              { name: "Twitter", value: "twitter" },
                              { name: "Instagram", value: "instagram" },
                              { name: "YouTube", value: "youtube" },
                              { name: "Twitch", value: "twitch" },
                              { name: "Discord Server", value: "discord" }
                          ))
                .addStringOption(option =>
                    option.setName("link")
                          .setDescription("Link to your profile")
                          .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName("hobbies")
                .setDescription("Manage your hobbies")
                .addStringOption(option =>
                    option.setName("action")
                          .setDescription("Action to perform")
                          .setRequired(true)
                          .addChoices(
                              { name: "Add Hobby", value: "add" },
                              { name: "Remove Hobby", value: "remove" },
                              { name: "Clear All", value: "clear" }
                          ))
                .addStringOption(option =>
                    option.setName("hobby")
                          .setDescription("Hobby to add/remove")
                          .setRequired(false))),

    async execute({ interaction, client }) {
        const subcommand = interaction.options.getSubcommand();

        switch (subcommand) {
            case "view":
                await handleView(interaction, client);
                break;
            case "set":
                await handleSet(interaction, client);
                break;
            case "social":
                await handleSocial(interaction, client);
                break;
            case "hobbies":
                await handleHobbies(interaction, client);
                break;
        }
    }
};

async function handleView(interaction, client) {
    const targetUser = interaction.options.getUser("user") || interaction.user;

    let profile = await Profile.findOne({ userId: targetUser.id });
    if (!profile) {
        profile = await Profile.create({ userId: targetUser.id });
    }

    const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);

    const embed = new EmbedBuilder()
        .setTitle(`${targetUser.username}'s Profile`)
        .setThumbnail(targetUser.displayAvatarURL({ dynamic: true, size: 256 }))
        .setColor(profile.favoriteColor || "#0099ff")
        .setTimestamp();

    // Bio
    if (profile.bio) {
        embed.setDescription(profile.bio);
    }

    // Basic Info
    const basicInfo = [];
    if (profile.favoriteGame) basicInfo.push(`🎮 **Favorite Game:** ${profile.favoriteGame}`);
    if (profile.favoriteMusic) basicInfo.push(`🎵 **Favorite Music:** ${profile.favoriteMusic}`);
    if (member) {
        basicInfo.push(`📅 **Joined Server:** <t:${Math.floor(member.joinedAt.getTime() / 1000)}:F>`);
    }
    basicInfo.push(`📅 **Joined Discord:** <t:${Math.floor(targetUser.createdAt.getTime() / 1000)}:F>`);

    if (basicInfo.length > 0) {
        embed.addFields({ name: "ℹ️ Information", value: basicInfo.join('\n'), inline: false });
    }

    // Hobbies
    if (profile.hobbies && profile.hobbies.length > 0) {
        embed.addFields({ name: "🎯 Hobbies", value: profile.hobbies.map(h => `• ${h}`).join('\n'), inline: true });
    }

    // Social Links
    const socialLinks = [];
    if (profile.socialLinks.twitter) socialLinks.push(`[Twitter](${profile.socialLinks.twitter})`);
    if (profile.socialLinks.instagram) socialLinks.push(`[Instagram](${profile.socialLinks.instagram})`);
    if (profile.socialLinks.youtube) socialLinks.push(`[YouTube](${profile.socialLinks.youtube})`);
    if (profile.socialLinks.twitch) socialLinks.push(`[Twitch](${profile.socialLinks.twitch})`);
    if (profile.socialLinks.discord) socialLinks.push(`[Discord](${profile.socialLinks.discord})`);

    if (socialLinks.length > 0) {
        embed.addFields({ name: "🔗 Social Links", value: socialLinks.join(' • '), inline: true });
    }

    // Stats
    const stats = [];
    stats.push(`⭐ **Reputation:** ${profile.reputation}`);
    stats.push(`📊 **Level:** ${profile.level}`);
    stats.push(`⚡ **XP:** ${profile.xp}`);

    if (profile.badges && profile.badges.length > 0) {
        stats.push(`🏆 **Badges:** ${profile.badges.length}`);
    }

    embed.addFields({ name: "📈 Stats", value: stats.join('\n'), inline: true });

    // Badges
    if (profile.badges && profile.badges.length > 0) {
        embed.addFields({ name: "🏆 Badges", value: profile.badges.map(badge => `🏅 ${badge}`).join('\n'), inline: false });
    }

    interaction.reply({ embeds: [embed] });
}

async function handleSet(interaction, client) {
    const bio = interaction.options.getString("bio");
    const color = interaction.options.getString("color");
    const game = interaction.options.getString("game");
    const music = interaction.options.getString("music");

    let profile = await Profile.findOne({ userId: interaction.user.id });
    if (!profile) {
        profile = await Profile.create({ userId: interaction.user.id });
    }

    if (bio !== null) {
        if (bio.length > 500) {
            return interaction.reply({ content: "Bio must be 500 characters or less.", ephemeral: true });
        }
        profile.bio = bio;
    }

    if (color !== null) {
        if (!/^#[0-9A-F]{6}$/i.test(color)) {
            return interaction.reply({ content: "Please provide a valid hex color code (e.g., #FF0000).", ephemeral: true });
        }
        profile.favoriteColor = color;
    }

    if (game !== null) profile.favoriteGame = game;
    if (music !== null) profile.favoriteMusic = music;

    profile.updatedAt = new Date();
    await profile.save();

    interaction.reply({ content: "✅ Profile updated successfully!", ephemeral: true });
}

async function handleSocial(interaction, client) {
    const platform = interaction.options.getString("platform");
    const link = interaction.options.getString("link");

    let profile = await Profile.findOne({ userId: interaction.user.id });
    if (!profile) {
        profile = await Profile.create({ userId: interaction.user.id });
    }

    profile.socialLinks[platform] = link;
    profile.updatedAt = new Date();
    await profile.save();

    interaction.reply({ content: `✅ ${platform.charAt(0).toUpperCase() + platform.slice(1)} link updated!`, ephemeral: true });
}

async function handleHobbies(interaction, client) {
    const action = interaction.options.getString("action");
    const hobby = interaction.options.getString("hobby");

    let profile = await Profile.findOne({ userId: interaction.user.id });
    if (!profile) {
        profile = await Profile.create({ userId: interaction.user.id });
    }

    if (!profile.hobbies) profile.hobbies = [];

    switch (action) {
        case "add":
            if (!hobby) {
                return interaction.reply({ content: "Please specify a hobby to add.", ephemeral: true });
            }
            if (profile.hobbies.includes(hobby)) {
                return interaction.reply({ content: "You already have this hobby.", ephemeral: true });
            }
            if (profile.hobbies.length >= 10) {
                return interaction.reply({ content: "You can only have up to 10 hobbies.", ephemeral: true });
            }
            profile.hobbies.push(hobby);
            break;

        case "remove":
            if (!hobby) {
                return interaction.reply({ content: "Please specify a hobby to remove.", ephemeral: true });
            }
            const index = profile.hobbies.indexOf(hobby);
            if (index === -1) {
                return interaction.reply({ content: "You don't have this hobby.", ephemeral: true });
            }
            profile.hobbies.splice(index, 1);
            break;

        case "clear":
            profile.hobbies = [];
            break;
    }

    profile.updatedAt = new Date();
    await profile.save();

    interaction.reply({ content: "✅ Hobbies updated successfully!", ephemeral: true });
}