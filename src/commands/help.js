import { SlashCommandBuilder } from 'discord.js';
import { bannerFile } from '../banner.js';
import { helpView } from '../ui.js';

export const data = new SlashCommandBuilder()
  .setName('help')
  .setDescription('Display the list of available commands and usage instructions');

export async function execute(interaction) {
  const avatar = interaction.client.user.displayAvatarURL({ extension: 'png', size: 256 });
  await interaction.reply({
    ...helpView(avatar),
    files: [bannerFile()]
  });
}
