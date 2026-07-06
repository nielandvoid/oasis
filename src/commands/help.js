import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('help')
  .setDescription('Display the list of available commands and usage instructions');

export async function execute(interaction) {
  const helpEmbed = new EmbedBuilder()
    .setTitle('Oasis Command Help')
    .setColor('#3498db')
    .setDescription('Here is a list of all available commands and how to use them:')
    .addFields(
      { 
        name: '📁 `/submit file`', 
        value: 'Submit file attachments (up to 5 files at once) for moderator review. You will be prompted to add a description after uploading.', 
        inline: false 
      },
      { 
        name: '🔗 `/submit link`', 
        value: 'Submit a URL or web link for moderator review. You will be prompted to add a description after entering the URL.', 
        inline: false 
      },
      { 
        name: '⚙️ `/configure`', 
        value: 'Set up the review channel and public resources channel for this server. (Requires *Manage Channels* permission).', 
        inline: false 
      },
      { 
        name: '🏓 `/ping`', 
        value: 'Check the bot\'s websocket heartbeat and response latency.', 
        inline: false 
      },
      { 
        name: '❓ `/help`', 
        value: 'Shows this help message.', 
        inline: false 
      }
    )
    .setFooter({ text: 'Oasis Bot' })
    .setTimestamp();

  await interaction.reply({ embeds: [helpEmbed] });
}
