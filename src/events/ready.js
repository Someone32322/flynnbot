const { ActivityType } = require("discord.js");

module.exports = {
    name: "clientReady",
    once: true,
    execute(client) {

        console.log(`${client.user.tag} is online`);

        const statuses = [
            { text: "your code fail", type: ActivityType.Watching },
            { text: "with JavaScript", type: ActivityType.Playing },
            { text: "the screams of developers", type: ActivityType.Listening },
            { text: "who breaks production first", type: ActivityType.Competing }
        ];

        let i = 0;

        function updateStatus() {
            const status = statuses[i];

            client.user.setPresence({
                status: "dnd",
                activities: [{
                    name: status.text,
                    type: status.type
                }]
            });

            i++;
            if (i >= statuses.length) i = 0;
        }

        setInterval(updateStatus, 15000);

        // Check for ended giveaways
        const Giveaway = require("../database/schemas/Giveaway");
        const { endGiveaway } = require("../utils/giveawayUtils");

        const checkGiveaways = async () => {
            const now = new Date();
            const endedGiveaways = await Giveaway.find({ endTime: { $lt: now }, ended: false });

            for (const giveaway of endedGiveaways) {
                try {
                    await endGiveaway(client, giveaway.messageId);
                } catch (error) {
                    console.log(`Could not end giveaway ${giveaway.messageId}:`, error);
                }
            }
        };

        // Check immediately and then every minute
        checkGiveaways();
        setInterval(checkGiveaways, 60000);
    }
};