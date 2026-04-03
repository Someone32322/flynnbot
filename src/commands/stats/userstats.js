const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("userstats")
        .setDescription("View user statistics")
        .addUserOption(option =>
            option.setName("user")
                  .setDescription("User to view stats for (default: yourself)")
                  .setRequired(false)),

    async execute({ interaction, client }) {
        const targetUser = interaction.options.getUser("user") || interaction.user;
        const member = await interaction.guild.members.fetch(targetUser.id);

        // Get user info
        const joinedAt = member.joinedAt;
        const createdAt = targetUser.createdAt;
        const roles = member.roles.cache.filter(role => role.id !== interaction.guild.id);
        const highestRole = member.roles.highest;

        // Calculate account age
        const accountAge = Math.floor((Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24));
        const serverAge = Math.floor((Date.now() - joinedAt.getTime()) / (1000 * 60 * 60 * 24));

        // Get permissions
        const permissions = member.permissions.toArray();
        const keyPermissions = ['Administrator', 'ManageGuild', 'ManageRoles', 'ManageChannels', 'KickMembers', 'BanMembers', 'ManageMessages'];

        const hasKeyPerms = keyPermissions.some(perm => permissions.includes(perm));

        // Get status
        const presence = member.presence;
        const status = presence?.status || 'offline';
        const activities = presence?.activities || [];

        const statusEmojis = {
            online: '🟢',
            idle: '🟡',
            dnd: '🔴',
            offline: '⚫'
        };

        const embed = new EmbedBuilder()
            .setTitle(`📊 ${targetUser.username}'s Statistics`)
            .setThumbnail(targetUser.displayAvatarURL({ dynamic: true, size: 256 }))
            .setColor(member.displayHexColor || "#0099ff")
            .addFields(
                {
                    name: "👤 User Info",
                    value: `**Username:** ${targetUser.username}\n**Discriminator:** #${targetUser.discriminator}\n**ID:** ${targetUser.id}\n**Bot:** ${targetUser.bot ? 'Yes' : 'No'}`,
                    inline: true
                },
                {
                    name: "📅 Dates",
                    value: `**Joined Discord:** <t:${Math.floor(createdAt.getTime() / 1000)}:F> (${accountAge} days ago)\n**Joined Server:** <t:${Math.floor(joinedAt.getTime() / 1000)}:F> (${serverAge} days ago)`,
                    inline: true
                },
                {
                    name: "🎭 Roles & Status",
                    value: `**Highest Role:** ${highestRole}\n**Role Count:** ${roles.size}\n**Status:** ${statusEmojis[status]} ${status.charAt(0).toUpperCase() + status.slice(1)}\n**Key Permissions:** ${hasKeyPerms ? 'Yes' : 'No'}`,
                    inline: true
                }
            )
            .setTimestamp();

        // Add roles if not too many
        if (roles.size > 0 && roles.size <= 10) {
            const roleList = roles.map(role => role.toString()).join(', ');
            embed.addFields({ name: "🏷️ Roles", value: roleList, inline: false });
        } else if (roles.size > 10) {
            embed.addFields({ name: "🏷️ Roles", value: `${roles.size} roles`, inline: false });
        }

        // Add activities if any
        if (activities.length > 0) {
            const activityText = activities.map(activity => {
                if (activity.type === 0) return `🎮 Playing ${activity.name}`;
                if (activity.type === 1) return `🎥 Streaming ${activity.name}`;
                if (activity.type === 2) return `🎧 Listening to ${activity.name}`;
                if (activity.type === 3) return `📺 Watching ${activity.name}`;
                if (activity.type === 4) return `🏆 Competing in ${activity.name}`;
                return activity.name;
            }).join('\n');

            embed.addFields({ name: "🎪 Activities", value: activityText, inline: false });
        }

        interaction.reply({ embeds: [embed] });
    }
};