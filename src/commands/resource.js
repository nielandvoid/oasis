import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags, ChannelType, EmbedBuilder } from 'discord.js';
import { findResource, updateResource } from '../database.js';
import { publicView, unpublishView, notice, escapeMd, V2 } from '../ui.js';

const MAX_TAGS = 5;
const EPHEMERAL_V2 = MessageFlags.Ephemeral | MessageFlags.IsComponentsV2;

export const data = new SlashCommandBuilder()
  .setName('resource')
  .setDescription('Edit or unpublish a published resource')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
  .setContexts(0)
  .addSubcommand(sub => sub
    .setName('edit')
    .setDescription('Change the title, description or tags of a published resource')
    .addStringOption(option => option.setName('resource').setDescription('Start typing a title').setRequired(true).setAutocomplete(true))
    .addStringOption(option => option.setName('title').setDescription('New title').setMaxLength(100))
    .addStringOption(option => option.setName('description').setDescription('New description').setMaxLength(1000))
    .addStringOption(option => option.setName('tags').setDescription('New tags for a forum, separated by commas').setMaxLength(200).setAutocomplete(true)))
  .addSubcommand(sub => sub
    .setName('unpublish')
    .setDescription('Delete a published resource from the public channel')
    .addStringOption(option => option.setName('resource').setDescription('Start typing a title').setRequired(true).setAutocomplete(true)));

const canManage = (interaction) => interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages);
const say = (content) => ({ ...notice(content), flags: EPHEMERAL_V2 });

async function locate(client, post) {
  const channel = await client.channels.fetch(post.channelId).catch(() => null);
  if (!channel) return {};
  if (post.threadId) {
    const thread = await client.channels.fetch(post.threadId).catch(() => null);
    const message = thread ? await thread.fetchStarterMessage().catch(() => null) : null;
    return { channel, thread, message };
  }
  return { channel, message: await channel.messages.fetch(post.messageId).catch(() => null) };
}

const IMAGE = /\.(jpg|jpeg|png|gif|webp)$/i;

// old embed posts are rebuilt as containers; the embed edit is the fallback
async function upgradeEmbed(message, next, { avatarUrl, id }) {
  const atts = [...(message.attachments?.values?.() ?? [])];
  const isImage = (a) => a.contentType?.startsWith('image/') || IMAGE.test(a.name);
  const kept = atts.map(a => ({ name: a.name, size: a.size ?? 0, url: a.url }));
  const missing = next.type === 'file' ? (next.files ?? []).filter(f => !kept.some(k => k.name === f.name)) : [];
  const files = next.type === 'file' ? [...kept, ...missing] : [];
  const post = {
    ...next.post,
    v2: true,
    images: atts.filter(isImage).map(a => a.name),
    attached: atts.filter(a => !isImage(a)).map(a => a.name),
    large: missing.map(m => files.indexOf(m))
  };
  try {
    await message.edit({
      ...publicView({ ...next, files }, {
        avatarUrl,
        images: post.images,
        attached: post.attached,
        large: missing,
        publishedAt: next.doneAt,
        edited: true,
        bookmarkId: id
      }),
      content: '',
      embeds: []
    });
    return { post, ...(next.type === 'file' ? { files } : {}) };
  } catch (error) {
    console.error('Could not convert an embed post to the new layout, editing the embed instead:', error.message);
    await message.edit({ embeds: [EmbedBuilder.from(message.embeds[0]).setTitle(next.title).setDescription(next.description)] });
    return null;
  }
}

async function find(interaction, id) {
  return findResource(interaction.guildId, id);
}

export async function execute(interaction) {
  if (!interaction.guildId || !canManage(interaction)) {
    await interaction.reply({ content: 'You need the **Manage Messages** permission to use this command.', flags: MessageFlags.Ephemeral });
    return;
  }
  const resource = await find(interaction, interaction.options.getString('resource', true));
  const id = resource?._id;
  if (!resource) {
    await interaction.reply(say('That resource could not be found. Pick one from the suggestions.'));
    return;
  }

  if (interaction.options.getSubcommand() === 'unpublish') {
    await interaction.reply(unpublishView(resource.title, id));
    return;
  }

  const title = interaction.options.getString('title');
  const description = interaction.options.getString('description');
  const tagInput = interaction.options.getString('tags');
  if (!title && !description && !tagInput) {
    await interaction.reply(say('Give at least one of `title`, `description` or `tags` to change.'));
    return;
  }
  if (!resource.post) {
    await interaction.reply(say('This resource was published before edits were supported, so its post cannot be found. Unpublish it and submit it again.'));
    return;
  }

  const { thread, channel, message } = await locate(interaction.client, resource.post);
  if (!message) {
    await interaction.reply({ ...notice('The post could not be found. It may have been deleted; use `/resource unpublish` to remove it from search.'), flags: EPHEMERAL_V2 });
    return;
  }

  const changes = {};
  if (title) changes.title = title;
  if (description) changes.description = description;
  let tagIds = null;
  if (tagInput) {
    const names = [...new Set(tagInput.split(',').map(t => t.trim()).filter(Boolean))];
    if (channel.type !== ChannelType.GuildForum) {
      await interaction.reply({ ...notice('Tags can only be edited on resources published in a forum.'), flags: EPHEMERAL_V2 });
      return;
    }
    const found = names.map(name => channel.availableTags.find(t => t.name.toLowerCase() === name.toLowerCase()));
    const missing = names.filter((_, i) => !found[i]);
    if (missing.length || names.length > MAX_TAGS) {
      await interaction.reply({
        ...notice(missing.length ? `Unknown tag${missing.length > 1 ? 's' : ''}: ${missing.map(t => `\`${t}\``).join(', ')}. Pick from the suggestions.` : `A resource can have at most ${MAX_TAGS} tags.`),
        flags: EPHEMERAL_V2
      });
      return;
    }
    changes.tags = found.map(t => t.name);
    tagIds = found.map(t => t.id);
  }

  const next = { ...resource, ...changes };
  const submitter = await interaction.client.users.fetch(resource.submitterId).catch(() => null);
  const avatarUrl = submitter?.displayAvatarURL({ extension: 'png', size: 256 });
  let upgrade = null;
  try {
    if (resource.post.v2) {
      const files = resource.files ?? [];
      await message.edit(publicView(next, {
        avatarUrl,
        images: resource.post.images ?? [],
        attached: resource.post.attached ?? [],
        large: files.filter((_, i) => (resource.post.large ?? []).includes(i)),
        publishedAt: resource.doneAt,
        edited: true,
        bookmarkId: id
      }));
    } else if (message.embeds?.length) {
      upgrade = await upgradeEmbed(message, next, { avatarUrl, id });
    }
    if (thread) {
      if (title) await thread.setName(title.length > 95 ? `${title.slice(0, 95)}...` : title);
      if (tagIds) await thread.setAppliedTags(tagIds);
    }
  } catch (error) {
    console.error('Error editing resource post:', error);
    await interaction.reply({ ...notice('Could not edit the post. Check that the bot can manage it.'), flags: EPHEMERAL_V2 });
    return;
  }

  await updateResource(id, { ...changes, ...(upgrade ?? {}) });
  await interaction.reply({ ...notice(`Updated **${escapeMd(next.title)}**${resource.publishedUrl ? `: ${resource.publishedUrl}` : ''}`), flags: EPHEMERAL_V2 });
}

export async function handleUnpublish(interaction) {
  const [, answer, id] = interaction.customId.split(':');
  if (!canManage(interaction)) {
    await interaction.reply(say('You need the **Manage Messages** permission to do this.'));
    return;
  }
  if (answer !== 'yes') {
    await interaction.update(notice('Cancelled. The resource is still published.'));
    return;
  }
  const resource = await find(interaction, id);
  if (!resource) {
    await interaction.update(notice('That resource is no longer published.'));
    return;
  }

  if (resource.post) {
    const { thread, message } = await locate(interaction.client, resource.post);
    try {
      if (thread) await thread.delete();
      else if (message) await message.delete();
    } catch (error) {
      console.error('Error deleting resource post:', error);
      await interaction.update(notice('Could not delete the post. Check that the bot can manage messages and threads there.'));
      return;
    }
  }
  await updateResource(resource._id, { status: 'unpublished', unpublishedAt: new Date(), unpublishedBy: interaction.user.id });
  await interaction.update(notice(`**${escapeMd(resource.title)}** was unpublished and removed from search.`));
}
