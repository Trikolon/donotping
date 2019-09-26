const Discord = require('discord.js');

const client = new Discord.Client();
const Keyv = require('keyv');

const config = require('../config.json');

let userDB;

async function getServerSet(user) {
  if (!user || (!(user instanceof Discord.GuildMember)
                && !(user instanceof Discord.User))) {
    throw new Error('Invalid arg user');
  }
  const result = await userDB.get(user.id.toString());
  if (!result) {
    return new Set();
  }
  try {
    return new Set(JSON.parse(result));
  } catch (error) {
    console.warn('Error while parsing database query', error.message);
    console.debug(error);
    return new Set();
  }
}

function setServerSet(user, serverSet) {
  if (!user || !(user instanceof Discord.User)) {
    throw new Error('Invalid arg user');
  }
  if (!serverSet || !(serverSet instanceof Set)) {
    throw new Error('Invalid arg serverSet');
  }
  if (serverSet.size === 0) {
    return userDB.delete(user.id.toString());
  }
  return userDB.set(user.id.toString(), JSON.stringify(Array.from(serverSet)));
}

async function toggleMention(user, guild) {
  const guildKey = guild.id.toString();

  const serverSet = await getServerSet(user);
  let enabledMention;

  if (serverSet.has(guildKey)) {
    serverSet.delete(guildKey);
    enabledMention = false;
  } else {
    serverSet.add(guildKey);
    enabledMention = true;
  }
  await setServerSet(user, serverSet);
  return enabledMention;
}

async function commandHandler(message) {
  const state = await toggleMention(message.author, message.guild);
  return message.reply(`Ping warning **${state ? 'enabled' : 'disabled'}**.`);
}

async function getAffectedUsers(message) {
  const affectedUsers = message.mentions.members.map(async (user) => {
    const serverSet = await getServerSet(user);
    if (serverSet.has(message.guild.id)) {
      return user;
    }
    return false;
  });
  return (await Promise.all(affectedUsers)).filter((result) => !!result);
}

function usersToString(users) {
  return users.reduce((str, user) => `${str} ${user instanceof Discord.GuildMember ? user.displayName : user.username},`, '')
    .slice(0, -1);
}

async function chatHandler(message) {
  const affectedUsers = await getAffectedUsers(message);

  if (affectedUsers.length > 0) {
    let userPrefix;
    if (affectedUsers.length === 1) {
      userPrefix = `**${usersToString(affectedUsers)}** has`;
    } else {
      userPrefix = `**${usersToString(affectedUsers)}** have`;
    }

    if (!config.action.deleteMessage && config.action.reactEmoji) {
      await message.react(config.action.reactEmoji);
    }
    await message.reply(`${userPrefix} mentions disabled. Please don't ping them!`);
    if (config.action.deleteMessage && message.deletable) {
      await message.delete();
    }
  }

  // Messages pings bot itself, reply with custom string defined in config
  if (config.botPingMessage && message.mentions.users.has(client.user.id)) {
    await message.reply(config.botPingMessage.replace('{cmdPrefix}', config.command.prefix));
  }
}

let botToken = process.env.BOTTOKEN;
if (!botToken) {
  botToken = config && config.api && config.api.token;
}

if (!botToken) {
  console.error('Missing bot token! Please add it to config.json');
  process.exit(1);
}

client.on('error', (e) => console.error(e));
client.on('warn', (e) => console.warn(e));

client.on('ready', () => {
  console.info(`Logged in as ${client.user.tag}!`);
  if (config.api.appId) {
    console.info(
      `Add this bot to a server: https://discordapp.com/oauth2/authorize?client_id=${config.api.appId}&scope=bot`,
    );
  }
});

client.on('message', (message) => {
  if (message.author.bot || !message.guild) {
    return;
  }

  if (message.content.startsWith(config.command.prefix)) {
    commandHandler(message);
    return;
  }

  chatHandler(message);
});

userDB = new Keyv(config.database, { namespace: 'users' });
userDB.on('error', (err) => {
  console.error('Database connection error:', err);
  process.exit(1);
});


client.login(botToken)
  .catch((error) => {
    console.error('Error autenticating with Discord! Check your bot token.', error.message);
    console.debug(error);
    process.exit(1);
  });
