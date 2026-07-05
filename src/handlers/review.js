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
  if (interaction.isModalSubmit() && interaction.customId === 'submit-resource-modal') {
    await handleResourceSubmit(interaction);
    return;
  }

  if (interaction.isButton()) {
    const [action, submitterId] = interaction.customId.split(':');
    
    if (action === 'approve') {
      await handleApprove(interaction, submitterId);
      return;
    }
    
    if (action === 'reject') {
      await handleRejectClick(interaction, submitterId);
      return;
    }
  }

  if (interaction.isModalSubmit() && interaction.customId.startsWith('reject-modal:')) {
    const [, submitterId, messageId] = interaction.customId.split(':');
    await handleRejectSubmit(interaction, submitterId, messageId);
    return;
  }
}

async function handleResourceSubmit(interaction) {
  const title = interaction.fields.getTextInputValue('resource-title');
  let url = interaction.fields.getTextInputValue('resource-url').trim();
  const description = interaction.fields.getTextInputValue('resource-desc');

  if (!/^https?:\/\//i.test(url)) {
    url = 'https://' + url;
  }

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
      { name: 'URL / Link', value: url, inline: false },
      { name: 'Description', value: description, inline: false },
      { name: 'Submitted By', value: `${interaction.user.tag} (${interaction.user.id})`, inline: true }
    )
    .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
    .setFooter({ text: `Oasis Resource Bot • Pending Review` })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`approve:${interaction.user.id}`)
      .setLabel('Approve & Publish')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`reject:${interaction.user.id}`)
      .setLabel('Reject')
      .setStyle(ButtonStyle.Danger)
  );

  await reviewChannel.send({ embeds: [reviewEmbed], components: [row] });

  await interaction.reply({ 
    content: 'Thank you! Your resource has been submitted to the moderators for review.', 
    ephemeral: true 
  });
}

async function handleApprove(interaction, submitterId) {
  if (!interaction.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
    await interaction.reply({ content: 'You do not have permission to review resources.', ephemeral: true });
    return;
  }

  await interaction.deferUpdate();

  const originalEmbed = interaction.message.embeds[0];
  const title = originalEmbed.fields.find(f => f.name === 'Title').value;
  const url = originalEmbed.fields.find(f => f.name === 'URL / Link').value;
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
    .setURL(url)
    .setColor('#2ecc71')
    .setDescription(description)
    .addFields(
      { name: 'Link', value: `[Visit Resource](${url})`, inline: true },
      { name: 'Contributor', value: `<@${submitterId}>`, inline: true }
    )
    .setFooter({ text: `Published via Oasis` })
    .setTimestamp();

  try {
    if (isForum) {
      await publicChannel.threads.create({
        name: title.length > 95 ? title.substring(0, 95) + '...' : title,
        message: {
          embeds: [publicEmbed]
        }
      });
    } else {
      await publicChannel.send({ embeds: [publicEmbed] });
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
      .addFields({ name: 'Link', value: url })
      .setTimestamp();
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

async function handleRejectClick(interaction, submitterId) {
  if (!interaction.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
    await interaction.reply({ content: 'You do not have permission to review resources.', ephemeral: true });
    return;
  }

  const modal = new ModalBuilder()
    .setCustomId(`reject-modal:${submitterId}:${interaction.message.id}`)
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

async function handleRejectSubmit(interaction, submitterId, messageId) {
  await interaction.deferUpdate();

  const reason = interaction.fields.getTextInputValue('reject-reason');
  const reviewChannel = interaction.channel;
  
  const originalMessage = await reviewChannel.messages.fetch(messageId).catch(() => null);
  if (!originalMessage) {
    await interaction.followUp({ content: 'Original review message could not be found.', ephemeral: true });
    return;
  }

  const originalEmbed = originalMessage.embeds[0];
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
