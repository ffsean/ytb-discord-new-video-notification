# Discord YouTube Notifications Bot

This bot notifies you when a new video is published on YouTube channels.  
It uses [discord.js](https://discord.js.org/) for interacting with Discord and [rss-parser](https://www.npmjs.com/package/rss-parser) to read YouTube RSS feeds.

## Features

- **Add a YouTube channel** to monitor using the `/addyoutube` command.
- **Remove a channel** using the `/removeyoutube` command.
- **List monitored channels** using the `/listyoutube` command.
- For each channel, the bot sends notifications in the Discord channel where the command was executed (or in a specified channel).

## Prerequisites

- [Node.js](https://nodejs.org/) (v14 or higher recommended)
- A Discord account and a [Discord bot](https://discord.com/developers/applications)
- [NPM](https://www.npmjs.com/) installed on your machine

## Installation

### 1. Clone or Download the Project

Clone this repository or copy the files into a directory on your machine.

### 2. Install Dependencies

Navigate to the project directory and run the following command:

```bash
npm install discord.js rss-parser
```

### 3. Configure the Bot

#### a) Create the `config.json` File

At the root of the project, create a `config.json` file with the following content. Replace the placeholders with your information:

```json
{
  "token": "YOUR_DISCORD_BOT_TOKEN",
  "clientId": "YOUR_CLIENT_ID",
  "guildId": "YOUR_SERVER_ID",
  "checkInterval": 60000
}
```

- **token**: Your Discord bot token.
- **clientId**: Your bot's identifier.
- **guildId**: The Discord server ID where slash commands will be registered.
- **checkInterval**: Interval in milliseconds to check for new videos (here 60000 ms = 1 minute).

#### b) Create the `data/channels.json` File

Create a folder named `data` at the root of the project.  
Inside this folder, create a file named `channels.json` with the following content:

```json
{
  "youtubeChannels": {}
}
```

This file will dynamically store the monitored YouTube channels.

## Running the Bot

In the project directory, run:

```bash
node index.js
```

The bot will connect to Discord, register the slash commands, and start monitoring the YouTube channels added via `/addyoutube`.

## Usage

### Adding a YouTube Channel

In Discord, use the command:

```
/addyoutube channel_id:<CHANNEL_ID> [discord_channel:<#channel>]
```

- **channel_id**: The YouTube channel ID (it usually starts with "UC").
- **discord_channel** *(optional)*: If not provided, the bot will use the channel where the command was executed.

### Removing a YouTube Channel

Use the command:

```
/removeyoutube channel_id:<CHANNEL_ID>
```

### Listing Monitored Channels

Use the command:

```
/listyoutube
```

The bot will display the names of the monitored channels, their IDs, and the Discord channel where notifications are sent.

## Docker Deployment

### A. Creating the Docker Image


 **Building the Image**  
   In the project directory, run the following command to build the Docker image:

   ```bash
   docker build -t discord-yt-bot .
   ```

## Troubleshooting

- **Commands not registered**:  
  Make sure the `guildId` property in `config.json` is correct.  
  Restart the bot after any changes to the configuration.

- **Issue with the RSS feed**:  
  Ensure that the YouTube channel ID is correct (it must start with "UC").  
  Test the following URL in your browser to verify access to the feed:  
  `https://www.youtube.com/feeds/videos.xml?channel_id=YOUR_ID`

- **Runtime errors**:  
  Check the console for error messages that can help identify the problem.

## Notes

- The bot checks for new videos at regular intervals defined by `checkInterval` (in milliseconds).
- Notifications include an embed displaying the video title, its link, the publication date, and the channel ID.
- If a notification channel is not defined for a channel, an error will be logged in the console.
