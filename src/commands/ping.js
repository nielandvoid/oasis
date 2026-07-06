import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('ping')
  .setDescription('Check the bot latency and responsiveness');

export async function execute(interaction) {
  await interaction.deferReply();
  const sent = await interaction.fetchReply();
  const latency = sent.createdTimestamp - interaction.createdTimestamp;
  const apiLatency = Math.round(interaction.client.ws.ping);

  const embed = new EmbedBuilder()
    .setTitle('<:pong:1523716243868221631> Pong!')
    .setColor('#ffffff')
    .addFields(
      { name: 'Bot Latency', value: `${latency}ms`, inline: true },
      { name: 'API Latency', value: `${apiLatency}ms`, inline: true }
    )
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}
