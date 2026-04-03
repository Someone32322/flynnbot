const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");

const actions = {
    hug: {
        messages: [
            "{user} hugs {target} tightly! 🤗",
            "{user} gives {target} a big warm hug! 🥰",
            "{user} wraps their arms around {target}! 🤗",
            "{user} squeezes {target} with a hug! 😊"
        ],
        gifs: [
            "https://media.giphy.com/media/l2QDM9Jnim1YVILXa/giphy.gif",
            "https://media.giphy.com/media/3o6MbdLXZqg6M8K7Ny/giphy.gif",
            "https://media.giphy.com/media/3o7abB06u9bNzA8lu8/giphy.gif",
            "https://media.giphy.com/media/xT8qBuhwq0OyL7U8qU/giphy.gif"
        ]
    },
    kiss: {
        messages: [
            "{user} kisses {target} passionately! 💋",
            "{user} plants a kiss on {target}'s cheek! 😘",
            "{user} gives {target} a sweet kiss! 💕",
            "{user} kisses {target} softly! 😍"
        ],
        gifs: [
            "https://media.giphy.com/media/3o6MbdUTeZZRZlkjHi/giphy.gif",
            "https://media.giphy.com/media/3o7abKhKEhS8EK4rC8/giphy.gif",
            "https://media.giphy.com/media/l4FB8dMDbBvgL9ytO/giphy.gif",
            "https://media.giphy.com/media/3o7abB5Q8zcdUOpO7O/giphy.gif"
        ]
    },
    slap: {
        messages: [
            "{user} slaps {target}! 👋",
            "{user} gives {target} a good slap! 😠",
            "{user} smacks {target}! 💥",
            "{user} delivers a slap to {target}! 🤚"
        ],
        gifs: [
            "https://media.giphy.com/media/3o7abKhO6ngJzTX2qE/giphy.gif",
            "https://media.giphy.com/media/3o7abB06u9bNzA8lu8/giphy.gif",
            "https://media.giphy.com/media/xT8qBuhwq0OyL7U8qU/giphy.gif",
            "https://media.giphy.com/media/3o6MbdUTeZZRZlkjHi/giphy.gif"
        ]
    },
    pat: {
        messages: [
            "{user} pats {target} on the head! 🥺",
            "{user} gives {target} a gentle pat! 😊",
            "{user} pats {target} softly! 🤗",
            "{user} ruffles {target}'s hair! 😄"
        ],
        gifs: [
            "https://media.giphy.com/media/3o7abKhO6ngJzTX2qE/giphy.gif",
            "https://media.giphy.com/media/l4FB8dMDbBvgL9ytO/giphy.gif",
            "https://media.giphy.com/media/3o7abB5Q8zcdUOpO7O/giphy.gif",
            "https://media.giphy.com/media/xT8qBuhwq0OyL7U8qU/giphy.gif"
        ]
    },
    cuddle: {
        messages: [
            "{user} cuddles with {target}! 🥰",
            "{user} snuggles up to {target}! 😴",
            "{user} cuddles {target} tightly! 🤗",
            "{user} enjoys a cuddle session with {target}! 💕"
        ],
        gifs: [
            "https://media.giphy.com/media/3o6MbdLXZqg6M8K7Ny/giphy.gif",
            "https://media.giphy.com/media/l2QDM9Jnim1YVILXa/giphy.gif",
            "https://media.giphy.com/media/3o7abB06u9bNzA8lu8/giphy.gif",
            "https://media.giphy.com/media/3o7abKhKEhS8EK4rC8/giphy.gif"
        ]
    }
};

module.exports = {
    data: new SlashCommandBuilder()
        .setName("interact")
        .setDescription("Interact with other users")
        .addSubcommand(subcommand =>
            subcommand
                .setName("hug")
                .setDescription("Hug someone")
                .addUserOption(option =>
                    option.setName("user")
                          .setDescription("User to hug")
                          .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName("kiss")
                .setDescription("Kiss someone")
                .addUserOption(option =>
                    option.setName("user")
                          .setDescription("User to kiss")
                          .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName("slap")
                .setDescription("Slap someone")
                .addUserOption(option =>
                    option.setName("user")
                          .setDescription("User to slap")
                          .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName("pat")
                .setDescription("Pat someone")
                .addUserOption(option =>
                    option.setName("user")
                          .setDescription("User to pat")
                          .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName("cuddle")
                .setDescription("Cuddle with someone")
                .addUserOption(option =>
                    option.setName("user")
                          .setDescription("User to cuddle")
                          .setRequired(true))),

    async execute({ interaction, client }) {
        const subcommand = interaction.options.getSubcommand();
        const targetUser = interaction.options.getUser("user");

        if (targetUser.id === interaction.user.id) {
            return interaction.reply({ content: "You can't interact with yourself!", ephemeral: true });
        }

        if (targetUser.bot) {
            return interaction.reply({ content: "You can't interact with bots!", ephemeral: true });
        }

        const action = actions[subcommand];
        const randomMessage = action.messages[Math.floor(Math.random() * action.messages.length)];
        const randomGif = action.gifs[Math.floor(Math.random() * action.gifs.length)];

        const message = randomMessage
            .replace("{user}", `**${interaction.user.username}**`)
            .replace("{target}", `**${targetUser.username}**`);

        const embed = new EmbedBuilder()
            .setDescription(message)
            .setImage(randomGif)
            .setColor("#ff69b4")
            .setTimestamp();

        interaction.reply({ embeds: [embed] });
    }
};