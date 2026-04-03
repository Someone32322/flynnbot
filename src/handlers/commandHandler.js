const fs = require("fs");
const path = require("path");

module.exports = (client) => {

    const commandsPath = path.join(__dirname, "..", "commands");

    const commandFolders = fs.readdirSync(commandsPath);

    for (const folder of commandFolders) {

        const commandPath = path.join(commandsPath, folder);

        const commandFiles = fs.readdirSync(commandPath).filter(file => file.endsWith(".js"));

        for (const file of commandFiles) {

            const command = require(`${commandPath}/${file}`);

            client.commands.set(command.data.name, command);
        }
    }
};