# Oasis
a simple resource curation bot for Discord. members submit link/file -> mods approve/reject -> posts to text/forum channel.

built with node and discord.js.

## features
- `/submit link` & `/submit file` subcommands
- modal description box (supports linebreaks & md)
- auto-bypasses 10mb bot upload limit (links directly to cdn if >10mb)
- mod approval panel with buttons (approve/reject reason)
- zero deprecation warnings

## prerequisites
* **node.js** (v16.x or higher recommended)
* a discord bot token (with **Server Members Intent** and **Message Content Intent** enabled)

## self-host
1. clone the repo
2. configure `.env`:
   ```env
   DISCORD_TOKEN=
   CLIENT_ID=
   GUILD_ID=
   REVIEW_CHANNEL_ID=
   PUBLIC_CHANNEL_ID=
   IS_FORUM=false
   ```
3. run:
   ```bash
   npm i
   node src/index.js
   ```

## license
mit
