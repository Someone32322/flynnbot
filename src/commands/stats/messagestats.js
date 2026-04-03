const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("messagestats")
        .setDescription("View message statistics for a channel")
        .addChannelOption(option =>
            option.setName("channel")
                  .setDescription("Channel to analyze (default: current)")
                  .setRequired(false)),

    async execute({ interaction, client }) {
        const channel = interaction.options.getChannel("channel") || interaction.channel;

        if (channel.type !== 0) { // TEXT CHANNEL
            return interaction.reply({ content: "Please select a text channel.", ephemeral: true });
        }

        await interaction.deferReply();

        try {
            // Fetch recent messages (last 100)
            const messages = await channel.messages.fetch({ limit: 100 });

            if (messages.size === 0) {
                return interaction.editReply({ content: "No messages found in this channel.", embeds: [] });
            }

            // Analyze messages
            const messageStats = new Map();
            const userStats = new Map();
            let totalMessages = 0;
            let botMessages = 0;
            let humanMessages = 0;
            const hourlyStats = new Array(24).fill(0);

            for (const message of messages.values()) {
                totalMessages++;

                // User stats
                const userId = message.author.id;
                if (!userStats.has(userId)) {
                    userStats.set(userId, {
                        count: 0,
                        username: message.author.username,
                        bot: message.author.bot
                    });
                }
                userStats.get(userId).count++;

                // Bot vs Human
                if (message.author.bot) {
                    botMessages++;
                } else {
                    humanMessages++;
                }

                // Hourly distribution
                const hour = message.createdAt.getHours();
                hourlyStats[hour]++;

                // Message type stats
                const content = message.content.toLowerCase();
                if (content.includes('http') || content.includes('www.')) {
                    messageStats.set('links', (messageStats.get('links') || 0) + 1);
                }
                if (message.attachments.size > 0) {
                    messageStats.set('attachments', (messageStats.get('attachments') || 0) + 1);
                }
                if (message.embeds.length > 0) {
                    messageStats.set('embeds', (messageStats.get('embeds') || 0) + 1);
                }
                if (message.mentions.users.size > 0) {
                    messageStats.set('mentions', (messageStats.get('mentions') || 0) + 1);
                }
            }

            // Get top users
            const topUsers = Array.from(userStats.values())
                .filter(user => !user.bot) // Exclude bots
                .sort((a, b) => b.count - a.count)
                .slice(0, 5);

            // Find most active hour
            const mostActiveHour = hourlyStats.indexOf(Math.max(...hourlyStats));

            const embed = new EmbedBuilder()
                .setTitle(`📊 Message Statistics - #${channel.name}`)
                .setColor("#4ecdc4")
                .addFields(
                    {
                        name: "📈 General Stats",
                        value: `**Total Messages:** ${totalMessages}\n**Human Messages:** ${humanMessages}\n**Bot Messages:** ${botMessages}\n**Most Active Hour:** ${mostActiveHour}:00`,
                        inline: true
                    },
                    {
                        name: "📎 Content Types",
                        value: `**Links:** ${messageStats.get('links') || 0}\n**Attachments:** ${messageStats.get('attachments') || 0}\n**Embeds:** ${messageStats.get('embeds') || 0}\n**Mentions:** ${messageStats.get('mentions') || 0}`,
                        inline: true
                    }
                )
                .setTimestamp();

            if (topUsers.length > 0) {
                let topUsersText = "";
                for (let i = 0; i < topUsers.length; i++) {
                    topUsersText += `${i + 1}. ${topUsers[i].username} - ${topUsers[i].count} messages\n`;
                }
                embed.addFields({ name: "🏆 Top Contributors", value: topUsersText, inline: false });
            }

            // Add hourly chart (simple text-based)
            let hourlyChart = "";
            const maxHourly = Math.max(...hourlyStats);
            for (let i = 0; i < 24; i++) {
                const barLength = Math.round((hourlyStats[i] / maxHourly) * 10);
                const bar = '█'.repeat(barLength) || '░';
                hourlyChart += `${i.toString().padStart(2, '0')}:00 ${bar} ${hourlyStats[i]}\n`;
            }
            embed.addFields({ name: "📊 Hourly Activity", value: `\`\`\`${hourlyChart}\`\`\``, inline: false });

            interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error("Error fetching message stats:", error);
            interaction.editReply({ content: "❌ Failed to fetch message statistics. The bot may not have permission to read message history.", embeds: [] });
        }
    }
};