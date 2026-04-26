const fs = require("node:fs");
const path = require("node:path");
const dotenv = require("dotenv");
const { REST, Routes } = require("discord.js");

dotenv.config({ path: path.resolve(__dirname, "../.env") });
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

process.env.DISCORD_BOT_TOKEN =
  process.env.DISCORD_BOT_TOKEN || process.env.BOT_TOKEN || process.env.TOKEN;
process.env.DISCORD_CLIENT_ID =
  process.env.DISCORD_CLIENT_ID || process.env.CLIENT_ID;

const requiredEnv = ["DISCORD_BOT_TOKEN", "DISCORD_CLIENT_ID"];
const missingEnv = requiredEnv.filter((name) => !process.env[name]);

if (missingEnv.length > 0) {
  console.error(`Missing required env vars: ${missingEnv.join(", ")}`);
  process.exit(1);
}

function parseCliArgs(argv) {
  return argv.reduce((acc, entry) => {
    if (!entry.startsWith("--")) {
      return acc;
    }

    const [key, value] = entry.slice(2).split("=");
    acc[key] = value ?? true;
    return acc;
  }, {});
}

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

function loadCommandBody(helpOnly = false) {
  const files = getJsFilesFrom("./commands");
  return files
    .filter((filePath) => {
      const baseName = path.basename(filePath);
      if (baseName.startsWith("_") || baseName === "meta.js") {
        return false;
      }
      if (!helpOnly) return true;
      // When deploying globally, only include /help
      return filePath.endsWith('help.js');
    })
    .map((filePath) => {
      delete require.cache[require.resolve(filePath)];
      const command = require(filePath);

      if (!command?.data?.toJSON || typeof command.execute !== "function") {
        return null;
      }

      return command.data.toJSON();
    })
    .filter(Boolean);
}

async function main() {
  const args = parseCliArgs(process.argv.slice(2));
  const scope = args.scope || "global";
  const guildId = args.guild;
  const helpOnly = args['help-only'] === true || args['help-only'] === 'true';
  const body = loadCommandBody(helpOnly);

  const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_BOT_TOKEN);

  if (scope === "guild") {
    if (!guildId) {
      throw new Error("Guild scope requires --guild=<GUILD_ID>");
    }

    await rest.put(
      Routes.applicationGuildCommands(process.env.DISCORD_CLIENT_ID, guildId),
      { body }
    );
    console.log(`Deployed ${body.length} commands to guild ${guildId}.`);
    return;
  }

  await rest.put(Routes.applicationCommands(process.env.DISCORD_CLIENT_ID), { body });
  console.log(`Deployed ${body.length} global commands.`);
}

main().catch((error) => {
  console.error("Command deployment failed:", error);
  process.exit(1);
});
