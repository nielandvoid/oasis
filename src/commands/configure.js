import { SlashCommandBuilder, InteractionContextType, PermissionFlagsBits, ChannelType, MessageFlags } from 'discord.js';
import { setGuildConfig, getGuildConfig, numberResources } from '../database.js';
import { configView } from '../ui.js';
import { backfill } from '../backfill.js';

export const data = new SlashCommandBuilder()
  .setName('configure')
  .setDescription('Configure Oasis settings for this server')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .setContexts(InteractionContextType.Guild)
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
      .setName('reviewer-role')
      .setDescription('Set the role that is pinged when a submission needs review')
      .addRoleOption(option =>
        option
          .setName('role')
          .setDescription('The reviewer role (leave empty to stop pinging)')
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('view')
      .setDescription('View the current configurations for this server')
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('reindex')
      .setDescription('Add resources published before /search existed to the search index')
  );

export async function execute(interaction) {
  if (!interaction.guildId || !interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    await interaction.reply({ content: 'You need the **Manage Server** permission to use this command.', flags: MessageFlags.Ephemeral });
    return;
  }

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
  } else if (subcommand === 'reviewer-role') {
    const role = interaction.options.getRole('role');
    const success = await setGuildConfig(guildId, { reviewerRoleId: role?.id ?? null });
    await interaction.reply({
      content: !success ? 'Failed to save configuration. Database error.'
        : role ? `Submissions will now ping ${role} in the review channel.` : 'Submissions will no longer ping a role.',
      flags: MessageFlags.Ephemeral
    });
  } else if (subcommand === 'view') {
    const config = await getGuildConfig(guildId);

    await interaction.reply(configView(config, interaction.guild.iconURL({ extension: 'png', size: 256 })));
  } else if (subcommand === 'reindex') {
    const config = await getGuildConfig(guildId);
    const channel = config?.publicChannelId ? await interaction.client.channels.fetch(config.publicChannelId).catch(() => null) : null;
    if (!channel) {
      await interaction.reply({ content: 'Set a public channel first with `/configure public-channel`.', flags: MessageFlags.Ephemeral });
      return;
    }
    await interaction.reply({ content: 'Reindexing started. The result is posted here when it finishes.', flags: MessageFlags.Ephemeral });
    const done = (content) => interaction.channel.send({ content, allowedMentions: { parse: [] } }).catch(err => console.error('reindex report failed:', err.message));
    try {
      const { added, skipped } = await backfill(channel, guildId, interaction.client.user.id);
      const numbered = await numberResources(guildId);
      await done(`Indexed **${added}** resource${added === 1 ? '' : 's'} from ${channel}${skipped ? ` (${skipped} already indexed)` : ''} and gave **${numbered}** a resource number.`);
    } catch (error) {
      console.error('Error reindexing resources:', error);
      await done('Could not read the public channel. Check that the bot can view it and read its history.');
    }
  }
}
