const path = require("node:path");
const fs = require("node:fs");
const dotenv = require("dotenv");

dotenv.config();
dotenv.config({ path: path.resolve(__dirname, ".env") });
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const { Client, GatewayIntentBits, Partials } = require("discord.js");
const { Collection } = require("discord.js");
const mongoose = require("mongoose");
const { startScheduler } = require("./src/lib/scheduler");

process.env.DISCORD_BOT_TOKEN =
  process.env.DISCORD_BOT_TOKEN || process.env.BOT_TOKEN || process.env.TOKEN;
process.env.DISCORD_CLIENT_ID =
  process.env.DISCORD_CLIENT_ID || process.env.CLIENT_ID;
process.env.MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;

const requiredEnv = ["DISCORD_BOT_TOKEN", "MONGO_URI"];
const missingEnv = requiredEnv.filter((name) => !process.env[name]);

if (missingEnv.length > 0) {
  console.error(`Missing required env vars: ${missingEnv.join(", ")}`);
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent, // privileged — must be enabled in Discord Developer Portal
    GatewayIntentBits.GuildEmojisAndStickers,
    GatewayIntentBits.GuildScheduledEvents,
    GatewayIntentBits.GuildInvites,
    GatewayIntentBits.AutoModerationConfiguration,
    GatewayIntentBits.AutoModerationExecution,
    GatewayIntentBits.GuildMessageReactions,
  ],
  partials: [
    Partials.User,
    Partials.Channel,
    Partials.Message,
    Partials.Reaction,
    Partials.GuildMember,
  ],
});
client.setMaxListeners(25);
client.on('error', (err) => console.error('[Discord Error]', err));
client.commands = new Collection();
client.paginationSessions = new Map();

function getJsFilesFrom(directoryPath) {
  const files = [];
  const absoluteDirectory = path.resolve(__dirname, directoryPath);

  function walk(currentPath) {
    for (const entry of fs.readdirSync(currentPath, { withFileTypes: true })) {
      const entryPath = path.join(currentPath, entry.name);
      if (entry.isDirectory()) {
        walk(entryPath);
        continue;
      }

      if (entry.isFile() && entry.name.endsWith(".js")) {
        files.push(entryPath);
      }
    }
  }

  walk(absoluteDirectory);
  return files;
}

function loadCommands() {
  const files = getJsFilesFrom("./src/commands");

  for (const filePath of files) {
    delete require.cache[require.resolve(filePath)];
    const command = require(filePath);
    // Skip non-command files (e.g. meta.js, helpers)
    if (!command?.data?.name || typeof command.execute !== "function") {
      continue;
    }

    client.commands.set(command.data.name, command);
  }
}

function loadEvents() {
  const files = getJsFilesFrom("./src/events");

  for (const filePath of files) {
    delete require.cache[require.resolve(filePath)];
    const event = require(filePath);
    if (!event?.name || typeof event.execute !== "function") {
      throw new Error(`Invalid event module: ${filePath}`);
    }

    const handler = (...args) => event.execute(...args, client);
    if (event.once) {
      client.once(event.name, handler);
    } else {
      client.on(event.name, handler);
    }
  }
}

try {
  loadCommands();
  loadEvents();
  console.log(`Loaded ${client.commands.size} commands.`);
} catch (error) {
  console.error("Failed to load commands/events:", error);
  process.exit(1);
}

const axios = require("axios");

const DISCORD_WEBHOOK = "https://discord.com/api/webhooks/1500783548670414919/AShRDmY5wG7K7gQFjnaLsoN6N9dXjDqZAmeirGTbDFEz6WrfMkyI8R0WWF0OBVmL3UJ-";

async function sendAlert(message) {
  try {
    await axios.post(DISCORD_WEBHOOK, {
      content: message
    });
  } catch (err) {
    console.log("Failed to send webhook:", err.message);
  }
}

process.on("uncaughtException", async (err) => {
  await sendAlert(`💥 BOT CRASHED (uncaughtException)\n\n${err.stack || err}`);
  process.exit(1);
});

process.on("unhandledRejection", async (err) => {
  await sendAlert(`⚠️ UNHANDLED PROMISE REJECTION\n\n${err}`);
});

async function bootstrap() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Connected to MongoDB.");

    await client.login(process.env.DISCORD_BOT_TOKEN);
    // Scheduler and logging are started by the clientReady event in src/events/ready.js
  } catch (error) {
    console.error("Bot startup failed:", error);
    process.exit(1);
  }
}

bootstrap();
