import { 
  EmbedBuilder, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  ModalBuilder, 
  TextInputBuilder, 
  TextInputStyle,
  PermissionFlagsBits,
  MessageFlags
} from 'discord.js';

export async function handleInteraction(interaction) {
  if (interaction.isButton()) {
    const [action, type] = interaction.customId.split(':');
    
    if (action === 'write-desc') {
      await handleWriteDescClick(interaction, type);
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
      const [, type] = interaction.customId.split(':');
      await handleDescSubmit(interaction, type);
      return;
    }
    
    if (interaction.customId.startsWith('reject-modal:')) {
      const [, messageId] = interaction.customId.split(':');
      await handleRejectSubmit(interaction, messageId);
      return;
    }
  }
}

async function handleWriteDescClick(interaction, type) {
  const modal = new ModalBuilder()
    .setCustomId(`desc-modal:${type}`)
    .setTitle('Resource Description');

  const descInput = new TextInputBuilder()
    .setCustomId('resource-desc')
    .setLabel('Description')
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder('Enter details about this resource...\nMarkdown, linebreaks, and bullet points are fully supported.')
    .setRequired(true)
    .setMaxLength(1000);

  const row = new ActionRowBuilder().addComponents(descInput);
  modal.addComponents(row);

  await interaction.showModal(modal);
}

async function handleDescSubmit(interaction, type) {
  const description = interaction.fields.getTextInputValue('resource-desc');
  const originalEmbed = interaction.message.embeds[0];
  const title = originalEmbed.title.replace('Draft: ', '');

  const reviewChannelId = process.env.REVIEW_CHANNEL_ID;
  const reviewChannel = await interaction.client.channels.fetch(reviewChannelId).catch(() => null);

  if (!reviewChannel) {
    await interaction.reply({ 
      content: 'Error: The moderator review channel is not configured correctly. Please contact an administrator.', 
      flags: MessageFlags.Ephemeral 
    });
    return;
  }

  await interaction.update({ 
    content: 'Thank you! Your resource has been submitted to the moderators for review.', 
    embeds: [],
    components: []
  });

  const reviewEmbed = new EmbedBuilder()
    .setTitle('New Resource Submission')
    .setColor('#3498db')
    .setDescription(`A new resource has been submitted for review.`)
    .addFields(
      { name: 'Title', value: title, inline: false },
      { name: 'Description', value: description, inline: false }
    )
    .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
    .setTimestamp();

  let url = null;
  let file = null;
  let fileSize = 0;

  if (type === 'link') {
    url = originalEmbed.fields.find(f => f.name === 'URL').value;
    reviewEmbed.addFields({ name: 'URL / Link', value: url, inline: false });
    reviewEmbed.setFooter({ text: `Oasis • Type: ${type} • Submitter: ${interaction.user.id}` });
  } else if (type === 'file') {
    const fileNameField = originalEmbed.fields.find(f => f.name === 'File Name');
    const fileUrlField = originalEmbed.fields.find(f => f.name === 'File URL');
    const fileSizeField = originalEmbed.fields.find(f => f.name === 'File Size');

    if (fileNameField && fileUrlField && fileSizeField) {
      fileSize = parseInt(fileSizeField.value) || 0;
      file = {
        name: fileNameField.value,
        url: fileUrlField.value,
        size: fileSize
      };
      
      reviewEmbed.addFields(
        { name: 'File Name', value: file.name, inline: false },
        { name: 'File URL', value: file.url, inline: false }
      );
      
      reviewEmbed.setFooter({ 
        text: `Oasis • Type: ${type} • Submitter: ${interaction.user.id} • Size: ${fileSize}` 
      });
    }
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
  
  const isLargeFile = type === 'file' && fileSize > 10 * 1024 * 1024;
  if (type === 'file' && file && !isLargeFile) {
    messageOptions.files = [{ attachment: file.url, name: file.name }];
  }

  try {
    await reviewChannel.send(messageOptions);
  } catch (error) {
    console.error('Error sending submission to review channel:', error);
    await interaction.followUp({ 
      content: 'Error: Failed to deliver your submission to the moderators. Please try again.', 
      flags: MessageFlags.Ephemeral 
    }).catch(() => null);
  }
}

async function handleApprove(interaction) {
  if (!interaction.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
    await interaction.reply({ content: 'You do not have permission to review resources.', flags: MessageFlags.Ephemeral });
    return;
  }

  await interaction.deferUpdate();

  const originalEmbed = interaction.message.embeds[0];
  const footerText = originalEmbed.footer.text;

  const typeMatch = footerText.match(/Type: (link|file)/);
  const submitterMatch = footerText.match(/Submitter: (\d+)/);
  const sizeMatch = footerText.match(/Size: (\d+)/);

  const type = typeMatch ? typeMatch[1] : 'link';
  const submitterId = submitterMatch ? submitterMatch[1] : null;
  const fileSize = sizeMatch ? parseInt(sizeMatch[1]) : 0;

  const title = originalEmbed.fields.find(f => f.name === 'Title').value;
  const description = originalEmbed.fields.find(f => f.name === 'Description').value;

  const publicChannelId = process.env.PUBLIC_CHANNEL_ID;
  const isForum = process.env.IS_FORUM === 'true';
  const publicChannel = await interaction.client.channels.fetch(publicChannelId).catch(() => null);

  if (!publicChannel) {
    await interaction.followUp({ content: 'Error: Public channel not found. Could not publish.', flags: MessageFlags.Ephemeral });
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

  const filesOption = [];
  const isLargeFile = type === 'file' && fileSize > 10 * 1024 * 1024;

  if (type === 'link') {
    const url = originalEmbed.fields.find(f => f.name === 'URL / Link').value;
    publicEmbed.setURL(url);
    publicEmbed.addFields({ name: 'Link', value: `[Visit Resource](${url})`, inline: true });
  } else if (type === 'file') {
    const fileName = originalEmbed.fields.find(f => f.name === 'File Name').value;
    const fileUrl = originalEmbed.fields.find(f => f.name === 'File URL').value;

    if (isLargeFile) {
      publicEmbed.addFields({ name: 'Attachment (Large File)', value: `[Download ${fileName}](${fileUrl})`, inline: true });
    } else {
      const attachment = interaction.message.attachments.first();
      if (attachment) {
        const isImage = attachment.contentType?.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp)$/i.test(attachment.name);
        if (isImage) {
          publicEmbed.setImage(`attachment://${attachment.name}`);
        } else {
          publicEmbed.addFields({ name: 'Attachment', value: `[Download ${attachment.name}](${attachment.url})`, inline: true });
        }
        filesOption.push({ attachment: attachment.url, name: attachment.name });
      } else {
        publicEmbed.addFields({ name: 'Attachment', value: `[Download ${fileName}](${fileUrl})`, inline: true });
      }
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
    await interaction.followUp({ content: 'Failed to publish to the public channel. Check bot permissions.', flags: MessageFlags.Ephemeral });
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
    } else if (type === 'file') {
      const fileName = originalEmbed.fields.find(f => f.name === 'File Name').value;
      const fileUrl = originalEmbed.fields.find(f => f.name === 'File URL').value;
      dmEmbed.addFields({ name: 'Attachment', value: `[Download ${fileName}](${fileUrl})` });
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
    components: []
  });
}

async function handleRejectClick(interaction) {
  if (!interaction.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
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
    await interaction.followUp({ content: 'Original review message could not be found.', flags: MessageFlags.Ephemeral });
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
    components: []
  });
}
