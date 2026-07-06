import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, ChannelType, MessageFlags } from 'discord.js';
import { setGuildConfig, getGuildConfig } from '../database.js';

export const data = new SlashCommandBuilder()
  .setName('configure')
  .setDescription('Configure Oasis settings for this server')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addSubcommand(subcommand =>
    subcommand
      .setName('review-channel')
      .setDescription('Set the channel where submissions are sent for moderator review')
      .addChannelOption(option =>
        option
          .setName('channel')
          .setDescription('Select the review channel')
          .setRequired(true)
          .addChannelTypes(ChannelType.GuildText)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('public-channel')
      .setDescription('Set the public channel or forum where approved resources are published')
      .addChannelOption(option =>
        option
          .setName('channel')
          .setDescription('Select the public channel or forum')
          .setRequired(true)
          .addChannelTypes(ChannelType.GuildText, ChannelType.GuildForum, ChannelType.GuildAnnouncement)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('view')
      .setDescription('View the current configurations for this server')
  );

export async function execute(interaction) {
  const subcommand = interaction.options.getSubcommand();
  const guildId = interaction.guildId;

  if (subcommand === 'review-channel') {
    const channel = interaction.options.getChannel('channel');
    
    const success = await setGuildConfig(guildId, { reviewChannelId: channel.id });
    if (success) {
      await interaction.reply({
        content: `Successfully set **${channel.name}** as the moderator review channel.`,
        flags: MessageFlags.Ephemeral
      });
    } else {
      await interaction.reply({
        content: 'Failed to save configuration. Database error.',
        flags: MessageFlags.Ephemeral
      });
    }
  } else if (subcommand === 'public-channel') {
    const channel = interaction.options.getChannel('channel');
    
    const success = await setGuildConfig(guildId, { publicChannelId: channel.id });
    if (success) {
      await interaction.reply({
        content: `Successfully set **${channel.name}** as the public publication channel.`,
        flags: MessageFlags.Ephemeral
      });
    } else {
      await interaction.reply({
        content: 'Failed to save configuration. Database error.',
        flags: MessageFlags.Ephemeral
      });
    }
  } else if (subcommand === 'view') {
    const config = await getGuildConfig(guildId);
    
    const embed = new EmbedBuilder()
      .setTitle('Oasis Configuration')
      .setColor('#ffffff')
      .setDescription('Current server configuration for Oasis:')
      .addFields(
        { 
          name: 'Review Channel', 
          value: config?.reviewChannelId ? `<#${config.reviewChannelId}>` : '❌ Not configured', 
          inline: true 
        },
        { 
          name: 'Public Channel', 
          value: config?.publicChannelId ? `<#${config.publicChannelId}>` : '❌ Not configured', 
          inline: true 
        }
      )
      .setTimestamp();

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }
}
