import { 
  EmbedBuilder, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  ModalBuilder, 
  TextInputBuilder, 
  TextInputStyle,
  PermissionFlagsBits 
} from 'discord.js';

export async function handleInteraction(interaction) {
  if (interaction.isButton()) {
    const action = interaction.customId;
    
    if (action === 'approve') {
      await handleApprove(interaction);
      return;
    }
    
    if (action === 'reject') {
      await handleRejectClick(interaction);
      return;
    }
  }

  if (interaction.isModalSubmit() && interaction.customId.startsWith('reject-modal:')) {
    const [, messageId] = interaction.customId.split(':');
    await handleRejectSubmit(interaction, messageId);
    return;
  }
}

export async function submitResource(interaction, { type, title, description, url, file }) {
  const reviewChannelId = process.env.REVIEW_CHANNEL_ID;
  const reviewChannel = await interaction.client.channels.fetch(reviewChannelId).catch(() => null);

  if (!reviewChannel) {
    await interaction.reply({ 
      content: 'Error: The moderator review channel is not configured correctly. Please contact an administrator.', 
      ephemeral: true 
    });
    return;
  }

  const reviewEmbed = new EmbedBuilder()
    .setTitle('New Resource Submission')
    .setColor('#3498db')
    .setDescription(`A new resource has been submitted for review.`)
    .addFields(
      { name: 'Title', value: title, inline: false },
      { name: 'Description', value: description, inline: false }
    )
    .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
    .setFooter({ text: `Oasis • Type: ${type} • Submitter: ${interaction.user.id}` })
    .setTimestamp();

  if (type === 'link') {
    reviewEmbed.addFields({ name: 'URL / Link', value: url, inline: false });
  } else if (type === 'file') {
    reviewEmbed.addFields({ name: 'File Name', value: file.name, inline: false });
  }

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('approve')
      .setLabel('Approve & Publish')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('reject')
      .setLabel('Reject')
      .setStyle(ButtonStyle.Danger)
  );

  const messageOptions = { embeds: [reviewEmbed], components: [row] };
  if (type === 'file') {
    messageOptions.files = [file];
  }

  await reviewChannel.send(messageOptions);

  await interaction.reply({ 
    content: 'Thank you! Your resource has been submitted to the moderators for review.', 
    ephemeral: true 
  });
}

async function handleApprove(interaction) {
  if (!interaction.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
    await interaction.reply({ content: 'You do not have permission to review resources.', ephemeral: true });
    return;
  }

  await interaction.deferUpdate();

  const originalEmbed = interaction.message.embeds[0];
  const footerText = originalEmbed.footer.text;

  const typeMatch = footerText.match(/Type: (link|file)/);
  const submitterMatch = footerText.match(/Submitter: (\d+)/);

  const type = typeMatch ? typeMatch[1] : 'link';
  const submitterId = submitterMatch ? submitterMatch[1] : null;

  const title = originalEmbed.fields.find(f => f.name === 'Title').value;
  const description = originalEmbed.fields.find(f => f.name === 'Description').value;

  const publicChannelId = process.env.PUBLIC_CHANNEL_ID;
  const isForum = process.env.IS_FORUM === 'true';
  const publicChannel = await interaction.client.channels.fetch(publicChannelId).catch(() => null);

  if (!publicChannel) {
    await interaction.followUp({ content: 'Error: Public channel not found. Could not publish.', ephemeral: true });
    return;
  }

  const publicEmbed = new EmbedBuilder()
    .setTitle(title)
    .setColor('#2ecc71')
    .setDescription(description)
    .addFields(
      { name: 'Contributor', value: `<@${submitterId}>`, inline: true }
    )
    .setFooter({ text: `Published via Oasis` })
    .setTimestamp();

  let attachment = null;
  const filesOption = [];

  if (type === 'link') {
    const url = originalEmbed.fields.find(f => f.name === 'URL / Link').value;
    publicEmbed.setURL(url);
    publicEmbed.addFields({ name: 'Link', value: `[Visit Resource](${url})`, inline: true });
  } else if (type === 'file') {
    attachment = interaction.message.attachments.first();
    if (attachment) {
      const isImage = attachment.contentType?.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp)$/i.test(attachment.name);
      if (isImage) {
        publicEmbed.setImage(attachment.url);
      } else {
        publicEmbed.addFields({ name: 'Attachment', value: `[Download ${attachment.name}](${attachment.url})`, inline: true });
      }
      filesOption.push(attachment);
    }
  }

  try {
    const messagePayload = { embeds: [publicEmbed] };
    if (filesOption.length > 0) {
      messagePayload.files = filesOption;
    }

    if (isForum) {
      await publicChannel.threads.create({
        name: title.length > 95 ? title.substring(0, 95) + '...' : title,
        message: messagePayload
      });
    } else {
      await publicChannel.send(messagePayload);
    }
  } catch (error) {
    console.error('Error publishing resource:', error);
    await interaction.followUp({ content: 'Failed to publish to the public channel. Check bot permissions.', ephemeral: true });
    return;
  }

  const submitter = await interaction.client.users.fetch(submitterId).catch(() => null);
  if (submitter) {
    const dmEmbed = new EmbedBuilder()
      .setTitle('Resource Approved & Published!')
      .setColor('#2ecc71')
      .setDescription(`Your submission **"${title}"** has been approved and published to the resource channel!`)
      .setTimestamp();

    if (type === 'link') {
      const url = originalEmbed.fields.find(f => f.name === 'URL / Link').value;
      dmEmbed.addFields({ name: 'Link', value: url });
    }

    await submitter.send({ embeds: [dmEmbed] }).catch(() => console.log(`Could not DM user ${submitterId}`));
  }

  const approvedEmbed = EmbedBuilder.from(originalEmbed)
    .setColor('#2ecc71')
    .setTitle('Resource Approved')
    .setDescription(`This resource was approved and published by ${interaction.user.tag}.`)
    .setFooter({ text: `Approved by ${interaction.user.tag}` });

  await interaction.editReply({
    embeds: [approvedEmbed],
    components: [],
    files: []
  });
}

async function handleRejectClick(interaction) {
  if (!interaction.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
    await interaction.reply({ content: 'You do not have permission to review resources.', ephemeral: true });
    return;
  }

  const modal = new ModalBuilder()
    .setCustomId(`reject-modal:${interaction.message.id}`)
    .setTitle('Reject Resource Submission');

  const reasonInput = new TextInputBuilder()
    .setCustomId('reject-reason')
    .setLabel('Reason for Rejection')
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder('Enter why this resource is being rejected (sent to submitter)...')
    .setRequired(true)
    .setMaxLength(500);

  const row = new ActionRowBuilder().addComponents(reasonInput);
  modal.addComponents(row);

  await interaction.showModal(modal);
}

async function handleRejectSubmit(interaction, messageId) {
  await interaction.deferUpdate();

  const reason = interaction.fields.getTextInputValue('reject-reason');
  const reviewChannel = interaction.channel;
  
  const originalMessage = await reviewChannel.messages.fetch(messageId).catch(() => null);
  if (!originalMessage) {
    await interaction.followUp({ content: 'Original review message could not be found.', ephemeral: true });
    return;
  }

  const originalEmbed = originalMessage.embeds[0];
  const footerText = originalEmbed.footer.text;

  const submitterMatch = footerText.match(/Submitter: (\d+)/);
  const submitterId = submitterMatch ? submitterMatch[1] : null;

  const title = originalEmbed.fields.find(f => f.name === 'Title').value;

  const submitter = await interaction.client.users.fetch(submitterId).catch(() => null);
  if (submitter) {
    const dmEmbed = new EmbedBuilder()
      .setTitle('Resource Submission Update')
      .setColor('#e74c3c')
      .setDescription(`Your resource submission **"${title}"** was rejected by the moderators.`)
      .addFields({ name: 'Reason', value: reason })
      .setTimestamp();
    await submitter.send({ embeds: [dmEmbed] }).catch(() => console.log(`Could not DM user ${submitterId}`));
  }

  const rejectedEmbed = EmbedBuilder.from(originalEmbed)
    .setColor('#e74c3c')
    .setTitle('Resource Rejected')
    .setDescription(`This resource was rejected by ${interaction.user.tag}.`)
    .addFields({ name: 'Rejection Reason', value: reason })
    .setFooter({ text: `Rejected by ${interaction.user.tag}` });

  await originalMessage.edit({
    embeds: [rejectedEmbed],
    components: [],
    files: []
  });
}
