import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { listResources, listBookmarks, addBookmark, removeBookmark, findResource } from '../database.js';
import { bookmarksView, notice } from '../ui.js';
import { bannerFile } from '../banner.js';

export const data = new SlashCommandBuilder()
  .setName('bookmark')
  .setDescription('Save resources to your account and see them again later')
  .setContexts(0)
  .addSubcommand(sub => sub
    .setName('add')
    .setDescription('Bookmark a resource')
    .addStringOption(option => option.setName('resource').setDescription('Resource id like 12 or #12, or start typing a title').setRequired(true).setAutocomplete(true)))
  .addSubcommand(sub => sub
    .setName('remove')
    .setDescription('Remove a bookmark')
    .addStringOption(option => option.setName('resource').setDescription('Resource id like 12 or #12, or start typing a title').setRequired(true).setAutocomplete(true)))
  .addSubcommand(sub => sub
    .setName('list')
    .setDescription('Show your bookmarks in this server'));

export async function savedResources(guildId, userId) {
  const [resources, bookmarks] = await Promise.all([listResources(guildId), listBookmarks(guildId, userId)]);
  const byId = new Map(resources.map(r => [r._id, r]));
  return bookmarks.map(b => byId.get(b.resourceId)).filter(Boolean);
}

async function render(guild, userId, page) {
  return bookmarksView({
    serverName: guild.name,
    serverIcon: guild.iconURL({ extension: 'png', size: 256 }),
    resources: await savedResources(guild.id, userId),
    page
  });
}

const reply = (interaction, content) => interaction.reply({ ...notice(content), flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2 });

export async function execute(interaction) {
  if (!interaction.guild) {
    await reply(interaction, 'This command can only be used in a server.');
    return;
  }
  const guildId = interaction.guild.id;
  const userId = interaction.user.id;
  const action = interaction.options.getSubcommand();

  if (action === 'list') {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const view = await render(interaction.guild, userId, 0);
    await interaction.editReply({ flags: MessageFlags.IsComponentsV2, components: view.components, files: [bannerFile()] });
    return;
  }

  const input = interaction.options.getString('resource', true);
  if (action === 'add') {
    const resource = await findResource(guildId, input);
    if (!resource) {
      await reply(interaction, 'That resource could not be found. Pick one from the suggestions or type its number.');
      return;
    }
    const result = await addBookmark(guildId, userId, resource._id);
    await reply(interaction, {
      added: `Bookmarked **${resource.title.replace(/[*_~`|]/g, '')}**. See your bookmarks with \`/bookmark list\`.`,
      exists: 'You already bookmarked that resource.',
      full: 'You have reached the limit of 100 bookmarks in this server. Remove one with `/bookmark remove` first.',
      error: 'Could not save your bookmark. Try again in a moment.'
    }[result]);
    return;
  }

  const removed = await removeBookmark(guildId, userId, (await findResource(guildId, input))?._id ?? input);
  await reply(interaction, removed ? 'Bookmark removed.' : 'That resource is not in your bookmarks.');
}

export async function toggle(interaction) {
  const id = interaction.customId.slice('bookmark:'.length);
  const guildId = interaction.guildId;
  const resource = (await listResources(guildId)).find(r => r._id === id);
  if (!resource) {
    await reply(interaction, 'This resource is no longer available.');
    return;
  }
  const result = await addBookmark(guildId, interaction.user.id, id);
  if (result === 'exists') {
    await removeBookmark(guildId, interaction.user.id, id);
    await reply(interaction, 'Bookmark removed.');
    return;
  }
  await reply(interaction, {
    added: 'Bookmarked. See your bookmarks with `/bookmark list`.',
    full: 'You have reached the limit of 100 bookmarks in this server. Remove one with `/bookmark remove` first.',
    error: 'Could not save your bookmark. Try again in a moment.'
  }[result]);
}

export async function paginate(interaction) {
  const view = await render(interaction.guild, interaction.user.id, Number(interaction.customId.split('|')[1]) || 0);
  await interaction.update({ components: view.components });
}
