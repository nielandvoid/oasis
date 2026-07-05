# Oasis
a simple, multi-server resource curation bot for Discord. members submit link/file -> mods approve/reject -> posts to text/forum channel.

built with node, discord.js, and mongodb.

## features
- `/submit link` & `/submit file` subcommands (with mandatory forum tags autocompleted dynamically)
- modal description box (supports linebreaks & md)
- auto-bypasses 10mb bot upload limit (links directly to cdn if >10mb)
- mod approval panel with buttons (approve/reject reason)
- multi-server configuration (`/configure` command for admins)
- zero deprecation warnings

## prerequisites
* **node.js** (v18.x or higher recommended)
* a discord bot token (with **Server Members Intent** and **Message Content Intent** enabled)
* a mongodb atlas database connection string

## self-host
1. clone the repo
2. configure `.env`:
   ```env
   DISCORD_TOKEN=
   CLIENT_ID=
   MONGODB_URI=
   ```
3. run:
   ```bash
   npm i
   node index.js
   ```

## configure in discord
1. invite the bot to your server
2. run admin setup commands:
   `/configure review-channel channel:#moderator-review`
   `/configure public-channel channel:#public-resources`
   `/configure view`

## license
mit
