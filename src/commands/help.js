import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('help')
  .setDescription('Display the list of available commands and usage instructions');

export async function execute(interaction) {
  const helpEmbed = new EmbedBuilder()
    .setTitle('Oasis 101')
    .setColor('#ffffff')
    .setDescription('here is a list of all available commands and how to use them:')
    .addFields(
      { 
        name: '<:files:1523716237748732005> `/submit file`', 
        value: 'submit file attachments (up to 5 files at once) for moderator review. you will be prompted to add a description after uploading.', 
        inline: false 
      },
      { 
        name: '<:link:1523716241662021743> `/submit link`', 
        value: 'submit a URL or web link for moderator review. you will be prompted to add a description after entering the URL.', 
        inline: false 
      },
      { 
        name: '<:configure:1523716239690698762> `/configure`', 
        value: 'set up the review channel and public resources channel for this server. (requires **Manage Channels**).', 
        inline: false 
      },
      { 
        name: '<:pong:1523716243868221631> `/ping`', 
        value: 'check the bot\'s websocket heartbeat and response latency.', 
        inline: false 
      },
      { 
        name: '<:questionmark:1523716245952794848> `/help`', 
        value: 'shows this help embed.', 
        inline: false 
      }
    )
    .setFooter({ text: 'Oasis' })
    .setTimestamp();

  await interaction.reply({ embeds: [helpEmbed] });
}
