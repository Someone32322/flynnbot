/**
 * reset-guild-commands.js
 * Clears all guild-specific slash commands for every guild the bot is in,
 * then registers /help globally so it appears everywhere.
 *
 * Usage: node src/reset-guild-commands.js
 */

const path = require('node:path');
const dotenv = require('dotenv');
const { REST, Routes, Client, GatewayIntentBits } = require('discord.js');

dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

process.env.DISCORD_BOT_TOKEN =
  process.env.DISCORD_BOT_TOKEN || process.env.BOT_TOKEN || process.env.TOKEN;
process.env.DISCORD_CLIENT_ID =
  process.env.DISCORD_CLIENT_ID || process.env.CLIENT_ID;

const { DISCORD_BOT_TOKEN, DISCORD_CLIENT_ID } = process.env;

if (!DISCORD_BOT_TOKEN || !DISCORD_CLIENT_ID) {
  console.error('Missing DISCORD_BOT_TOKEN or DISCORD_CLIENT_ID');
  process.exit(1);
}

const rest = new REST({ version: '10' }).setToken(DISCORD_BOT_TOKEN);

// Load /help command body
const helpCommand = require('./commands/general/help');
const helpBody = [helpCommand.data.toJSON()];

async function main() {
  // Fetch all guilds the application has guild commands in
  console.log('Fetching guild list from Discord...');
  const client = new Client({ intents: [GatewayIntentBits.Guilds] });
  await client.login(DISCORD_BOT_TOKEN);

  await new Promise(resolve => client.once('ready', resolve));
  const guilds = [...client.guilds.cache.values()];
  await client.destroy();

  console.log(`Bot is in ${guilds.length} guild(s). Clearing guild commands...`);

  for (const guild of guilds) {
    try {
      await rest.put(
        Routes.applicationGuildCommands(DISCORD_CLIENT_ID, guild.id),
        { body: [] }
      );
      console.log(`  ✓ Cleared guild commands for: ${guild.name} (${guild.id})`);
    } catch (err) {
      console.error(`  ✗ Failed for ${guild.name} (${guild.id}): ${err.message}`);
    }
  }

  // Deploy /help globally
  console.log('\nDeploying /help globally...');
  await rest.put(
    Routes.applicationCommands(DISCORD_CLIENT_ID),
    { body: helpBody }
  );
  console.log('✓ /help deployed globally.');
  console.log('\nDone. All guild-specific commands cleared; /help is now global.');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
