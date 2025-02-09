// index.js: Main bot file

const fs = require("fs");
const path = require("path");
const { Client, GatewayIntentBits, Partials, EmbedBuilder, Collection, MessageFlags } = require("discord.js");
const Parser = require("rss-parser");
const parser = new Parser();

// Loading the configuration
const configPath = path.join(__dirname, "config.json");
const config = JSON.parse(fs.readFileSync(configPath));

const dataPath = path.join(__dirname, "data", "channels.json");

// Utility function to load dynamic configuration
function loadData() {
  if (!fs.existsSync(dataPath)) {
    return { youtubeChannels: {} };
  }
  
  const fileContent = fs.readFileSync(dataPath, 'utf8').trim();
  
  if (!fileContent) {
    return { youtubeChannels: {} };
  }
  
  try {
    return JSON.parse(fileContent);
  } catch (error) {
    console.error("Error parsing JSON in loadData:", error);
    return { youtubeChannels: {} };
  }
}

// Utility function to save dynamic configuration
function saveData(data) {
  // Ensure that the 'data' folder exists
  const directory = path.dirname(dataPath);
  if (!fs.existsSync(directory)) {
    fs.mkdirSync(directory, { recursive: true });
  }
  fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));
}

// Create the Discord client
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
  partials: [Partials.Channel]
});

client.commands = new Collection();

// Definition of updated slash commands
const commands = [
  {
    name: "addyoutube",
    description: "Add a YouTube channel to monitor and set its notification channel",
    options: [
      {
        name: "channel_id",
        type: 3, // STRING
        description: "The YouTube channel ID",
        required: true
      },
      {
        name: "discord_channel",
        type: 7, // CHANNEL
        description: "Discord channel for notifications (optional)",
        required: false
      }
    ]
  },
  {
    name: "removeyoutube",
    description: "Remove a YouTube channel from monitoring",
    options: [
      {
        name: "channel_id",
        type: 3, // STRING
        description: "The ID of the YouTube channel to remove",
        required: true
      }
    ]
  },
  {
    name: "listyoutube",
    description: "List the currently monitored YouTube channels"
  }
];

// Once the bot is ready
client.once("ready", async () => {
  console.log(`Logged in as ${client.user.tag}`);

  // Register commands in the guild (server)
  const guild = client.guilds.cache.get(config.guildId);
  if (guild) {
    await guild.commands.set(commands);
    console.log("Slash commands registered in the server.");
  } else {
    console.error("The guildId specified in config.json is invalid.");
  }

  // Start periodic checking of the channels
  setInterval(checkYouTubeChannels, config.checkInterval);
});

// Handling slash interactions
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isCommand()) return;

  const data = loadData();

  if (interaction.commandName === "addyoutube") {
    const ytChannelId = interaction.options.getString("channel_id");
    // Retrieve the provided channel or use the one from the command
    const discordChannel = interaction.options.getChannel("discord_channel") || interaction.channel;

    if (data.youtubeChannels[ytChannelId]) {
      return interaction.reply({ content: "This YouTube channel is already being monitored.", flags: MessageFlags.EPHEMERAL });
    }

    try {
      // Retrieve the RSS feed to get the channel name and the date of the last video
      const feed = await parser.parseURL(`https://www.youtube.com/feeds/videos.xml?channel_id=${ytChannelId}`);
      let lastPubDate = "";
      if (feed.items && feed.items.length > 0) {
        lastPubDate = feed.items[0].pubDate;
      }
      // Store the information using the channel where the command was executed by default
      data.youtubeChannels[ytChannelId] = {
        lastVideoDate: lastPubDate,
        title: feed.title || "Name not available",
        notifChannel: discordChannel.id
      };
      saveData(data);
      return interaction.reply({
        content: `YouTube channel **${feed.title || ytChannelId}** successfully added! Notifications will be sent in ${discordChannel}.`,
        flags: MessageFlags.EPHEMERAL
      });
    } catch (error) {
      console.error(error);
      return interaction.reply({
        content: "Unable to add the channel. Please check the channel ID or try again later.",
        flags: MessageFlags.EPHEMERAL
      });
    }
  }

  if (interaction.commandName === "removeyoutube") {
    const ytChannelId = interaction.options.getString("channel_id");

    if (!data.youtubeChannels[ytChannelId]) {
      return interaction.reply({ content: "This YouTube channel is not being monitored.", flags: MessageFlags.EPHEMERAL });
    }

    delete data.youtubeChannels[ytChannelId];
    saveData(data);
    return interaction.reply({ content: `YouTube channel ${ytChannelId} removed.`, flags: MessageFlags.EPHEMERAL });
  }

  if (interaction.commandName === "listyoutube") {
    const ytChannels = Object.entries(data.youtubeChannels);
    if (ytChannels.length === 0) {
      return interaction.reply({ content: "No YouTube channel is currently being monitored.", flags: MessageFlags.EPHEMERAL });
    }
    let response = `Monitored YouTube channels (${ytChannels.length}):\n`;
    ytChannels.forEach(([id, info]) => {
      const title = info.title || "Unknown name";
      const notifChannel = info.notifChannel ? `<#${info.notifChannel}>` : "Not defined";
      response += `${title} (${id}) - Notifications in: ${notifChannel}\n`;
    });
    return interaction.reply({ content: response, flags: MessageFlags.EPHEMERAL });
  }
});

// Function to check YouTube channels
async function checkYouTubeChannels() {
  const data = loadData();

  for (const [ytChannelId, channelData] of Object.entries(data.youtubeChannels)) {
    try {
      const feed = await parser.parseURL(`https://www.youtube.com/feeds/videos.xml?channel_id=${ytChannelId}`);
      if (!feed?.items || feed.items.length === 0) continue;

      const latestVideo = feed.items[0];
      const publishedDate = new Date(latestVideo.pubDate);
      const lastStoredDate = channelData.lastVideoDate ? new Date(channelData.lastVideoDate) : null;

      if (!lastStoredDate || publishedDate > lastStoredDate) {
        // Update the last known date
        data.youtubeChannels[ytChannelId].lastVideoDate = latestVideo.pubDate;
        saveData(data);

        // Determine the notification channel to use
        const notifChannelId = channelData.notifChannel || config.notificationChannel;
        if (!notifChannelId) {
          console.error(`No notification channel defined for channel ${ytChannelId}`);
          continue;
        }

        const discordChannel = await client.channels.fetch(notifChannelId).catch(() => null);
        if (!discordChannel) {
          console.error("Notification channel not found:", notifChannelId);
          continue;
        }
        
        const messageText = `New video from ${channelData.title}:\n${latestVideo.title}\n\nWatch it here: ${latestVideo.link}`;
        await discordChannel.send(messageText);

        console.log(`New video detected on ${channelData.title}: ${latestVideo.link}`);
      }
    } catch (error) {
      console.error(`Error checking channel ${ytChannelId}: `, error);
    }
  }
}

// Log the bot in
client.login(config.token);