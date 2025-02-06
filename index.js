// index.js : Main bot file

const fs = require("fs");
const path = require("path");
const { Client, GatewayIntentBits, Partials, EmbedBuilder, Collection, MessageFlags } = require("discord.js");
const Parser = require("rss-parser");
const parser = new Parser();

// Chargement de la configuration
const configPath = path.join(__dirname, "config.json");
const config = JSON.parse(fs.readFileSync(configPath));

const dataPath = path.join(__dirname, "data", "channels.json");

// Fonction utilitaire pour charger la configuration dynamique
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
    console.error("Erreur lors du parsing JSON dans loadData :", error);
    return { youtubeChannels: {} };
  }
}

// Fonction utilitaire pour sauvegarder la configuration dynamique
function saveData(data) {
  // S'assurer que le dossier 'data' existe
  const directory = path.dirname(dataPath);
  if (!fs.existsSync(directory)) {
    fs.mkdirSync(directory, { recursive: true });
  }
  fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));
}

// Création du client Discord
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
  partials: [Partials.Channel]
});

client.commands = new Collection();

// Définition des commandes slash mises à jour
const commands = [
  {
    name: "addyoutube",
    description: "Ajoute une chaîne YouTube à surveiller et définit son salon de notifications",
    options: [
      {
        name: "channel_id",
        type: 3, // STRING
        description: "L'identifiant de la chaîne YouTube",
        required: true
      },
      {
        name: "discord_channel",
        type: 7, // CHANNEL
        description: "Salon Discord pour notifications (optionnel)",
        required: false
      }
    ]
  },
  {
    name: "removeyoutube",
    description: "Supprime une chaîne YouTube de la surveillance",
    options: [
      {
        name: "channel_id",
        type: 3, // STRING
        description: "L'identifiant de la chaîne YouTube à supprimer",
        required: true
      }
    ]
  },
  {
    name: "listyoutube",
    description: "Liste les chaînes YouTube actuellement surveillées"
  }
];

// Dès que le bot est prêt
client.once("ready", async () => {
  console.log(`Connecté en tant que ${client.user.tag}`);

  // Enregistrement des commandes dans le serveur (guild)
  const guild = client.guilds.cache.get(config.guildId);
  if (guild) {
    await guild.commands.set(commands);
    console.log("Commandes slash enregistrées dans le serveur.");
  } else {
    console.error("Le guildId indiqué dans config.json est invalide.");
  }

  // Lancement de la vérification périodique des chaînes
  setInterval(checkYouTubeChannels, config.checkInterval);
});

// Gestion des interactions slash
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isCommand()) return;

  const data = loadData();

  if (interaction.commandName === "addyoutube") {
    const ytChannelId = interaction.options.getString("channel_id");
    // Récupère le salon fourni ou utilise celui de la commande
    const discordChannel = interaction.options.getChannel("discord_channel") || interaction.channel;

    if (data.youtubeChannels[ytChannelId]) {
      return interaction.reply({ content: "Cette chaîne est déjà surveillée.", flags: MessageFlags.EPHEMERAL });
    }

    try {
      // Récupération du flux RSS pour obtenir le nom de la chaîne et la date de la dernière vidéo
      const feed = await parser.parseURL(`https://www.youtube.com/feeds/videos.xml?channel_id=${ytChannelId}`);
      let lastPubDate = "";
      if (feed.items && feed.items.length > 0) {
        lastPubDate = feed.items[0].pubDate;
      }
      // Stockage des informations avec le salon où la commande est exécutée par défaut
      data.youtubeChannels[ytChannelId] = {
        lastVideoDate: lastPubDate,
        title: feed.title || "Nom non disponible",
        notifChannel: discordChannel.id
      };
      saveData(data);
      return interaction.reply({
        content: `Chaîne YouTube **${feed.title || ytChannelId}** ajoutée avec succès ! Les notifications seront envoyées dans ${discordChannel}.`,
        flags: MessageFlags.EPHEMERAL
      });
    } catch (error) {
      console.error(error);
      return interaction.reply({
        content: "Impossible d'ajouter la chaîne. Vérifiez l'ID ou réessayez plus tard.",
        flags: MessageFlags.EPHEMERAL
      });
    }
  }

  if (interaction.commandName === "removeyoutube") {
    const ytChannelId = interaction.options.getString("channel_id");

    if (!data.youtubeChannels[ytChannelId]) {
      return interaction.reply({ content: "Cette chaîne n'est pas surveillée.", flags: MessageFlags.EPHEMERAL });
    }

    delete data.youtubeChannels[ytChannelId];
    saveData(data);
    return interaction.reply({ content: `Chaîne YouTube ${ytChannelId} supprimée.`, flags: MessageFlags.EPHEMERAL });
  }

  if (interaction.commandName === "listyoutube") {
    const ytChannels = Object.entries(data.youtubeChannels);
    if (ytChannels.length === 0) {
      return interaction.reply({ content: "Aucune chaîne n'est actuellement surveillée.", flags: MessageFlags.EPHEMERAL });
    }
    let response = `Chaînes surveillées (${ytChannels.length}) :\n`;
    ytChannels.forEach(([id, info]) => {
      const title = info.title || "Nom inconnu";
      const notifChannel = info.notifChannel ? `<#${info.notifChannel}>` : "Non défini";
      response += `${title} (${id}) - Notifie dans : ${notifChannel}\n`;
    });
    return interaction.reply({ content: response, flags: MessageFlags.EPHEMERAL });
  }
});

// Fonction de vérification des chaînes YouTube
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
        // Mise à jour de la dernière date connue
        data.youtubeChannels[ytChannelId].lastVideoDate = latestVideo.pubDate;
        saveData(data);

        // Détermine le salon de notification à utiliser
        const notifChannelId = channelData.notifChannel || config.notificationChannel;
        if (!notifChannelId) {
          console.error(`Aucun salon de notification défini pour la chaîne ${ytChannelId}`);
          continue;
        }

        const discordChannel = await client.channels.fetch(notifChannelId).catch(() => null);
        if (!discordChannel) {
          console.error("Salon de notification introuvable :", notifChannelId);
          continue;
        }
        
        // Crée l'embed de notification
        const embed = new EmbedBuilder()
          .setTitle(`Nouvelle vidéo de ${channelData.title}`)
          .setDescription(latestVideo.title)
          .setColor(0xff0000)
          .setTimestamp(new Date(latestVideo.pubDate));

        // Message contenant uniquement le lien brut (pour générer l'aperçu Discord)
        const linkMessage = latestVideo.link;

        // Envoi d'un seul message avec le lien en 'content' et l'embed
        await discordChannel.send({
          content: linkMessage,
          embeds: [embed]
        });

        console.log(`Nouvelle vidéo détectée sur ${channelData.title} : ${latestVideo.link}`);
      }
    } catch (error) {
      console.error(`Erreur lors de la vérification de la chaîne ${ytChannelId}: `, error);
    }
  }
}

// Connexion du bot
client.login(config.token); 