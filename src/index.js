import { Client, GatewayIntentBits, REST, Routes } from 'discord.js';
import dotenv from 'dotenv';
import { data as submitCommand, execute as executeSubmit } from './commands/submit.js';
import { handleInteraction } from './handlers/review.js';

dotenv.config();

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.CLIENT_ID;
const guildId = process.env.GUILD_ID;

if (!token || !clientId) {
  console.error('Error: DISCORD_TOKEN and CLIENT_ID must be set in your .env file.');
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
  ]
});

client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}!`);

  const rest = new REST({ version: '10' }).setToken(token);

  try {
    const commands = [submitCommand.toJSON()];

    if (guildId) {
      console.log(`Registering guild commands for server ID: ${guildId}...`);
      await rest.put(
        Routes.applicationGuildCommands(clientId, guildId),
        { body: commands }
      );
      console.log('Guild commands registered successfully (instant propagation).');
    } else {
      console.log('Registering global commands...');
      await rest.put(
        Routes.applicationCommands(clientId),
        { body: commands }
      );
      console.log('Global commands registered successfully (may take up to 2-3 minutes).');
    }
  } catch (error) {
    console.error('Error registering slash commands:', error);
  }
});

client.on('interactionCreate', async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === 'submit') {
        await executeSubmit(interaction);
      }
      return;
    }

    await handleInteraction(interaction);

  } catch (error) {
    console.error('Error handling interaction:', error);
    
    if (interaction.isRepliable() || interaction.deferred) {
      const msg = { content: 'An error occurred while executing this action.', ephemeral: true };
      if (interaction.deferred) {
        await interaction.followUp(msg);
      } else {
        await interaction.reply(msg);
      }
    }
  }
});

client.login(token);
