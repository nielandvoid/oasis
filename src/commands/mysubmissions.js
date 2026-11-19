import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { listUserSubmissions } from '../database.js';
import { mySubmissionsView, notice } from '../ui.js';
import { bannerFile } from '../banner.js';

export const data = new SlashCommandBuilder()
  .setName('mysubmissions')
  .setDescription('See the status of everything you have submitted in this server')
  .setContexts(0);

async function render(guild, userId, page) {
  return mySubmissionsView({
    serverName: guild.name,
    serverIcon: guild.iconURL({ extension: 'png', size: 256 }),
    rows: await listUserSubmissions(guild.id, userId),
    page
  });
}

export async function execute(interaction) {
  if (!interaction.guild) {
    await interaction.reply({ ...notice('This command can only be used in a server.'), flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2 });
    return;
  }
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const view = await render(interaction.guild, interaction.user.id, 0);
  await interaction.editReply({ flags: view.flags & ~MessageFlags.Ephemeral, components: view.components, files: [bannerFile()] });
}

export async function paginate(interaction) {
  const view = await render(interaction.guild, interaction.user.id, Number(interaction.customId.split('|')[1]) || 0);
  await interaction.update({ components: view.components });
}
