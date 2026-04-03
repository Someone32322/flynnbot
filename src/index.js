require("dotenv").config();

const { Client, GatewayIntentBits, Collection } = require("discord.js");
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

client.commands = new Collection();

const handlersPath = path.join(__dirname, "handlers");

const handlerFiles = fs
  .readdirSync(handlersPath)
  .filter(file => file.endsWith(".js"));

for (const file of handlerFiles) {
    const handler = require(`./handlers/${file}`);

    if (typeof handler === "function") {
        handler(client);
    }
}

mongoose.connect(process.env.MONGO_URI).then(() => {
    console.log("Connected to MongoDB");
}).catch(err => {
    console.error("Failed to connect to MongoDB", err);
});

client.login(process.env.TOKEN);