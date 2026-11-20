import {
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  LabelBuilder,
  StringSelectMenuBuilder,
  PermissionFlagsBits,
  MessageFlags,
  ChannelType
} from 'discord.js';
import {
  getGuildConfig,
  getDraft,
  saveSubmission,
  claimSubmission,
  finishSubmission,
  releaseSubmission,
  recordPublished,
  findDuplicates,
  nextResourceNumber,
  updateResource
} from '../database.js';
import { legacyDraft, legacySubmission, legacyApproved, legacyRejected, legacyPublicEmbed } from '../legacy.js';
import { reviewView, publicView, dmView, notice } from '../ui.js';
import { bannerFile } from '../banner.js';
import { linksOf } from '../links.js';

const MAX_TAGS = 5;
const MAX_ATTACH_SIZE = 10 * 1024 * 1024;
const IMAGE = /\.(jpg|jpeg|png|gif|webp)$/i;
const safeName = (name) => String(name).replace(/[^\w.-]/g, '_').slice(-80);
const isImage = (attachment) => attachment.contentType?.startsWith('image/') || IMAGE.test(attachment.name);

export async function handleInteraction(interaction) {
  if (interaction.isButton()) {
    const [action, type, draftId] = interaction.customId.split(':');

    if (action === 'write-desc') {
      await handleWriteDescClick(interaction, type, draftId);
      return;
    }

    if (interaction.customId === 'approve') {
      await handleApprove(interaction);
      return;
    }

    if (interaction.customId === 'reject') {
      await handleRejectClick(interaction);
      return;
    }
  }

  if (interaction.isModalSubmit()) {
    if (interaction.customId.startsWith('desc-modal:')) {
      const [, type, draftId] = interaction.customId.split(':');
      await handleDescSubmit(interaction, type, draftId);
      return;
    }

    if (interaction.customId.startsWith('reject-modal:')) {
      const [, messageId] = interaction.customId.split(':');
      await handleRejectSubmit(interaction, messageId);
      return;
    }
  }
}

// the interaction webhook can be throttled on shared hosts, so notices go through the channel
const tell = (interaction, content) => interaction.channel?.send({ content: `${interaction.user}: ${content}`, allowedMentions: { parse: [] } }).catch(err => console.error('notice failed:', err.message));
const iconOf = (interaction) => interaction.guild?.iconURL({ extension: 'png', size: 256 });
const canReview = (interaction) => interaction.member?.permissions?.has(PermissionFlagsBits.ManageMessages);

// containers can be refused in dms, so fall back to plain text
async function dm(user, view, fallbackText) {
  await user.send({ ...view, files: [bannerFile()] }).catch(async () => {
    await user.send({ content: fallbackText }).catch(() => console.log(`Could not DM user ${user.id}`));
  });
}

async function handleWriteDescClick(interaction, type, draftId) {
  const modal = new ModalBuilder()
    .setCustomId(`desc-modal:${type}:${draftId ?? ''}`)
    .setTitle('Resource Description');

  const descInput = new TextInputBuilder()
    .setCustomId('resource-desc')
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder('add a description; markdown / linebreaks / bullets are allowed')
    .setRequired(true)
    .setMaxLength(1000);

  modal.addLabelComponents(
    new LabelBuilder().setLabel('Description').setTextInputComponent(descInput)
  );

  const config = await getGuildConfig(interaction.guildId);
  const publicChannel = config?.publicChannelId
    ? await interaction.client.channels.fetch(config.publicChannelId).catch(() => null)
    : null;
  const availableTags = publicChannel?.type === ChannelType.GuildForum ? publicChannel.availableTags : [];

  if (availableTags.length > 0) {
    const tagSelect = new StringSelectMenuBuilder()
      .setCustomId('resource-tags')
      .setPlaceholder('select one or more tags')
      .setMinValues(1)
      .setMaxValues(Math.min(MAX_TAGS, availableTags.length))
      .setRequired(true)
      .setOptions(availableTags.slice(0, 25).map(tag => ({ label: tag.name, value: tag.id })));

    modal.addLabelComponents(
      new LabelBuilder().setLabel('Tags').setStringSelectMenuComponent(tagSelect)
    );
  }

  await interaction.showModal(modal);
}

async function handleDescSubmit(interaction, type, draftId) {
  const description = interaction.fields.getTextInputValue('resource-desc');
  const tagIds = interaction.fields.fields.has('resource-tags')
    ? interaction.fields.getStringSelectValues('resource-tags')
    : [];

  const legacy = interaction.message.embeds.length > 0;
  const draft = legacy
    ? legacyDraft(interaction.message.embeds[0], type)
    : (draftId ? await getDraft(draftId) : null);

  if (!draft || (draft.userId && draft.userId !== interaction.user.id)) {
    await interaction.reply({
      content: 'Error: This draft has expired. Please run `/submit` again.',
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  const config = await getGuildConfig(interaction.guildId);
  const reviewChannelId = config?.reviewChannelId;
  const publicChannelId = config?.publicChannelId;
  const reviewChannel = reviewChannelId ? await interaction.client.channels.fetch(reviewChannelId).catch(() => null) : null;

  if (!reviewChannel) {
    await interaction.reply({
      content: 'Error: The moderator review channel is not configured correctly. Please contact an administrator.',
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  const thanks = 'Thank you! Your resource has been submitted to the moderators for review.';
  await interaction.update(legacy ? { content: thanks, embeds: [], components: [] } : notice(thanks));

  let tagNames = [];
  let validTagIds = [];
  if (tagIds.length > 0 && publicChannelId) {
    const publicChannel = await interaction.client.channels.fetch(publicChannelId).catch(() => null);
    if (publicChannel && publicChannel.type === ChannelType.GuildForum) {
      const tags = tagIds.map(id => publicChannel.availableTags.find(t => t.id === id)).filter(Boolean);
      tagNames = tags.map(t => t.name);
      validTagIds = tags.map(t => t.id);
    }
  }

  const files = (draft.files ?? []).map(f => ({ name: f.name, url: f.url, size: f.size, attached: f.size <= MAX_ATTACH_SIZE }));
  const sub = {
    type,
    guildId: interaction.guildId,
    submitterId: interaction.user.id,
    title: draft.title,
    description,
    tags: tagNames,
    tagIds: validTagIds,
    ...(type === 'link' ? { url: linksOf(draft)[0], urls: linksOf(draft) } : { files })
  };

  const duplicates = await findDuplicates(interaction.guildId, sub);
  if (duplicates.length) {
    sub.duplicates = duplicates.map(d => ({
      title: d.title,
      status: d.status,
      link: d.link ?? (d.status === 'approved' ? null : `https://discord.com/channels/${interaction.guildId}/${reviewChannelId}/${d.id}`)
    }));
  }

  const uploads = type === 'file'
    ? files.map((f, i) => (f.attached ? { attachment: f.url, name: `file-${i + 1}-${safeName(f.name)}` } : null)).filter(Boolean)
    : [];

  const view = reviewView(sub, {
    avatarUrl: interaction.user.displayAvatarURL({ extension: 'png', size: 256 }),
    attached: uploads.map(u => u.name),
    ping: config.reviewerRoleId
  });

  try {
    // the role ping is the one mention allowed through
    const sent = await reviewChannel.send({
      ...view,
      ...(config.reviewerRoleId ? { allowedMentions: { parse: [], roles: [config.reviewerRoleId] } } : {}),
      ...(uploads.length > 0 ? { files: uploads } : {})
    });
    if (!await saveSubmission(sent.id, sub)) {
      await sent.delete().catch(() => null);
      throw new Error('could not save the submission');
    }
    if (duplicates.length) {
      const guildName = interaction.guild?.name || 'the server';
      await dm(interaction.user, dmView('duplicate', { title: sub.title, guildName, guildIconUrl: iconOf(interaction), duplicates: sub.duplicates }),
        `Your submission "${sub.title}" in ${guildName} looks like a resource that already exists. It was still sent to the moderators, who will decide whether to publish it.`);
    }
  } catch (error) {
    console.error('Error sending submission to review channel:', error);
    await tell(interaction, 'Error: Failed to deliver your submission to the moderators. Please try again.');
  }
}

function attachmentsFor(sub, message, legacy) {
  const attachments = [...message.attachments.values()];
  let next = 0;
  return (sub.files ?? []).map(file => {
    const attachment = legacy ? attachments.find(a => a.name === file.name) : (file.attached ? attachments[next++] : null);
    return { ...file, attachment: attachment ?? null };
  });
}

async function handleApprove(interaction) {
  if (!canReview(interaction)) {
    await interaction.reply({ content: 'You do not have permission to review resources.', flags: MessageFlags.Ephemeral });
    return;
  }

  await interaction.deferUpdate();

  const legacy = interaction.message.embeds.length > 0;
  const messageId = interaction.message.id;
  let sub;
  if (legacy) {
    sub = legacySubmission(interaction.message.embeds[0]);
  } else {
    sub = await claimSubmission(messageId);
    if (!sub) {
      await tell(interaction, 'This submission was already handled, or its data could not be found.');
      return;
    }
  }
  if (!sub.number) {
    sub.number = await nextResourceNumber(interaction.guildId);
    if (sub.number && !legacy) await updateResource(messageId, { number: sub.number });
  }
  const release = () => (legacy ? null : releaseSubmission(messageId));

  const config = await getGuildConfig(interaction.guildId);
  const publicChannelId = config?.publicChannelId;
  const publicChannel = publicChannelId ? await interaction.client.channels.fetch(publicChannelId).catch(() => null) : null;

  if (!publicChannel) {
    await release();
    await tell(interaction, 'Error: Public channel not found. Could not publish.');
    return;
  }

  const isForum = publicChannel.type === ChannelType.GuildForum;
  const tagIds = isForum
    ? (sub.tagIds?.length
      ? sub.tagIds
      : publicChannel.availableTags.filter(t => sub.tags.includes(t.name)).map(t => t.id))
    : [];

  const submitter = await interaction.client.users.fetch(sub.submitterId).catch(() => null);
  const resolved = sub.type === 'file' ? attachmentsFor(sub, interaction.message, legacy) : [];

  const images = [];
  const attached = [];
  const large = [];
  const uploads = [];
  resolved.forEach((file, i) => {
    if (!file.attachment) {
      large.push(file);
      return;
    }
    const name = `file-${i + 1}-${safeName(file.attachment.name)}`;
    uploads.push({ attachment: file.attachment.url, name });
    (isImage(file.attachment) ? images : attached).push(name);
  });

  const v2 = publicView({ ...sub, files: resolved.length > 0 ? resolved : sub.files }, {
    avatarUrl: submitter?.displayAvatarURL({ extension: 'png', size: 256 }),
    images,
    attached,
    large,
    bookmarkId: messageId
  });
  const v2Payload = { ...v2, ...(uploads.length > 0 ? { files: uploads } : {}) };

  const publish = async (payload) => {
    if (isForum) {
      const thread = await publicChannel.threads.create({
        name: sub.title.length > 95 ? sub.title.substring(0, 95) + '...' : sub.title,
        message: payload,
        ...(tagIds.length > 0 ? { appliedTags: tagIds } : {})
      });
      return { url: thread.url, threadId: thread.id, messageId: thread.id };
    }
    const sent = await publicChannel.send(payload);
    return { url: sent.url, messageId: sent.id };
  };

  // containers can be refused as a thread starter, so retry as an embed
  let posted = null;
  let v2Post = true;
  try {
    posted = await publish(v2Payload);
  } catch (error) {
    console.error('Publishing with the v2 layout failed, retrying as an embed:', error.message);
    try {
      const { embed, filesOption } = legacyPublicEmbed(sub, resolved.filter(f => f.attachment).map(f => ({ name: f.name, url: f.attachment.url, contentType: f.attachment.contentType })));
      posted = await publish({ embeds: [embed], ...(filesOption.length > 0 ? { files: filesOption } : {}) });
      v2Post = false;
    } catch (fallbackError) {
      console.error('Error publishing resource:', fallbackError);
      await release();
      await tell(interaction, 'Failed to publish to the public channel. Check bot permissions.');
      return;
    }
  }

  const publishedUrl = posted.url;
  const post = {
    channelId: publicChannel.id,
    threadId: posted.threadId ?? null,
    messageId: posted.messageId,
    v2: v2Post,
    images,
    attached,
    large: resolved.map((f, i) => (f.attachment ? null : i)).filter(i => i !== null)
  };

  const reviewed = { ...sub, files: resolved.map(f => ({ name: f.name, size: f.size, url: f.attachment?.url ?? f.url })) };

  if (submitter) {
    const guildName = interaction.guild?.name || 'the server';
    await dm(submitter, dmView('approved', {
      title: sub.title,
      guildName,
      guildIconUrl: iconOf(interaction),
      publishedUrl,
      urls: sub.type === 'link' ? linksOf(sub) : [],
      files: reviewed.files
    }), `Your submission "${sub.title}" has been approved and published in ${guildName}! ${publishedUrl ?? ''}`.trim());
  }

  if (legacy) {
    await interaction.message.edit({ embeds: [legacyApproved(interaction.message.embeds[0], interaction.user.tag)], components: [] });
    await recordPublished(messageId, { ...reviewed, guildId: interaction.guildId, publishedUrl, post, reviewedBy: interaction.user.id });
  } else {
    await interaction.message.edit(reviewView(reviewed, { status: 'approved', by: interaction.user.tag }));
    await finishSubmission(messageId, 'approved', { publishedUrl, post, reviewedBy: interaction.user.id, files: reviewed.files });
  }
}

async function handleRejectClick(interaction) {
  if (!canReview(interaction)) {
    await interaction.reply({ content: 'You do not have permission to review resources.', flags: MessageFlags.Ephemeral });
    return;
  }

  const modal = new ModalBuilder()
    .setCustomId(`reject-modal:${interaction.message.id}`)
    .setTitle('Reject Resource Submission');

  const reasonInput = new TextInputBuilder()
    .setCustomId('reject-reason')
    .setLabel('Reason for Rejection')
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder('reason the rejection (sent to contributor)')
    .setRequired(true)
    .setMaxLength(500);

  const row = new ActionRowBuilder().addComponents(reasonInput);
  modal.addComponents(row);

  await interaction.showModal(modal);
}

async function handleRejectSubmit(interaction, messageId) {
  if (!canReview(interaction)) {
    await interaction.reply({ content: 'You do not have permission to review resources.', flags: MessageFlags.Ephemeral });
    return;
  }

  await interaction.deferUpdate();

  const reason = interaction.fields.getTextInputValue('reject-reason');
  const originalMessage = await interaction.channel.messages.fetch(messageId).catch(() => null);
  if (!originalMessage) {
    await tell(interaction, 'Original review message could not be found.');
    return;
  }

  const legacy = originalMessage.embeds.length > 0;
  let sub;
  if (legacy) {
    sub = legacySubmission(originalMessage.embeds[0]);
  } else {
    sub = await claimSubmission(messageId);
    if (!sub) {
      await tell(interaction, 'This submission was already handled, or its data could not be found.');
      return;
    }
  }

  const submitter = await interaction.client.users.fetch(sub.submitterId).catch(() => null);
  if (submitter) {
    const guildName = interaction.guild?.name || 'the server';
    await dm(submitter, dmView('rejected', { title: sub.title, guildName, guildIconUrl: iconOf(interaction), reason }),
      `Your resource submission "${sub.title}" in ${guildName} was rejected by the moderators. Reason: ${reason}`);
  }

  if (legacy) {
    await originalMessage.edit({ embeds: [legacyRejected(originalMessage.embeds[0], interaction.user.tag, reason)], components: [] });
    return;
  }

  const resolved = attachmentsFor(sub, originalMessage, false);
  const reviewed = { ...sub, files: resolved.map(f => ({ name: f.name, size: f.size, url: f.attachment?.url ?? f.url })) };
  await originalMessage.edit(reviewView(reviewed, { status: 'rejected', by: interaction.user.tag, reason }));
  await finishSubmission(messageId, 'rejected', { reason, reviewedBy: interaction.user.id });
}
