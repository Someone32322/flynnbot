const { HealthStatus } = require("../models/HealthStatus");

module.exports = {
  name: "ready",
  once: false, // This can fire multiple times on reconnect
  async execute(client) {
    const FLYNN_SUPPORT_GUILD_ID = process.env.FLYNN_SUPPORT_GUILD_ID || "1272158852606324766";
    const FLYNN_SUPPORT_CHANNEL_ID = "1272158892318785577";

    try {
      // Update health status to online
      let healthDoc = await HealthStatus.findOne({ guildId: FLYNN_SUPPORT_GUILD_ID });
      if (!healthDoc) {
        healthDoc = await HealthStatus.create({
          guildId: FLYNN_SUPPORT_GUILD_ID,
          channelId: FLYNN_SUPPORT_CHANNEL_ID,
          botStatus: "online",
          websiteStatus: "online",
        });
      }

      const wasOffline = healthDoc.botStatus === "offline";
      healthDoc.botStatus = "online";
      healthDoc.lastBotStatusChange = new Date();
      await healthDoc.save();

      console.log("[HealthCheck] Bot came online");

      // If bot was previously offline, send status update
      if (wasOffline) {
        const channel =
          client.channels.cache.get(FLYNN_SUPPORT_CHANNEL_ID) ||
          (await client.channels.fetch(FLYNN_SUPPORT_CHANNEL_ID).catch(() => null));

        if (channel && channel.isTextBased()) {
          const SAPPHIRE = 0x0f52ba;
          const embed = {
            color: SAPPHIRE,
            title: "Flynn Bot & Website Status",
            fields: [
              {
                name: "Discord Bot",
                value: "✅ Online",
                inline: true,
              },
              {
                name: "Website",
                value: healthDoc.websiteStatus === "online" ? "✅ Online" : "❌ Offline",
                inline: true,
              },
            ],
            footer: {
              text: "Health Check Monitor",
            },
            timestamp: new Date(),
          };

          if (healthDoc.messageId) {
            try {
              const msg = await channel.messages.fetch(healthDoc.messageId).catch(() => null);
              if (msg) {
                await msg.edit({ embeds: [embed] }).catch(() => {});
              } else {
                // Message was deleted, post new one
                const sent = await channel.send({ embeds: [embed] }).catch(() => null);
                if (sent) {
                  healthDoc.messageId = sent.id;
                  await healthDoc.save();
                }
              }
            } catch (error) {
              console.warn(`[HealthCheck] Failed to update message on reconnect: ${error.message}`);
            }
          } else {
            // Post new message
            const sent = await channel.send({ embeds: [embed] }).catch(() => null);
            if (sent) {
              healthDoc.messageId = sent.id;
              await healthDoc.save();
            }
          }
        }
      }
    } catch (error) {
      console.error(`[HealthCheck] Error on ready: ${error.message}`);
    }
  },
};
