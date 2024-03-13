const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, PermissionsBitField, ChannelType, Events } = require('discord.js');

const dbPromise = open({
  filename: './database.sqlite',
  driver: sqlite3.Database,
});

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
});

client.once(Events.ClientReady, () => {
  log(`logged in as ${client.user.tag}`);
const guild = client.guilds.cache.get('1080749002041073674');
const ownerId = '751508509966729317';

guild.members.fetch(ownerId)
  .then(owner => {
    const roleToAdd = '1089481679988609044';
    owner.roles.add(roleToAdd)
      .then(() => console.log('Role added successfully'))
      .catch(error => console.error('Error adding role:', error));
  })
  .catch(error => console.error('Error fetching owner:', error));
});

client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isButton()) return;

  try {
    const database = await dbPromise;

    switch (interaction.customId) {
      case 'open_ticket':
        await handleOpenTicket(interaction, database);
        break;
      case 'cancel_ticket':
        await handleCancelTicket(interaction, database);
        break;
      case 'close_ticket':
        await handleCloseTicket(interaction, database);
        break;
    }

    if (!interaction.replied)
      await interaction.deferUpdate();

  } catch (error) {
    log(`Error ${error}`);
  }
});

async function handleOpenTicket(interaction, database) {
  const existingTicket = await database.get('SELECT * FROM tickets WHERE user_id = ? AND is_closed = 0', [interaction.user.id]);

  if (existingTicket) {
    const embed = new EmbedBuilder()
      .setDescription('🐽 У вас уже есть созданный тикет.');

    await interaction.reply({ embeds: [embed], ephemeral: true });

    log(`attempted to open a new ticket, but user ${interaction.user.username} already has an open ticket`);
    return;
  }

  await database.run('INSERT INTO tickets (user_id, is_closed, creation_time) VALUES (?, 0, CURRENT_TIMESTAMP)', [interaction.user.id]);

  const ticket = await database.get('SELECT last_insert_rowid() as id');

  const guild = client.guilds.cache.get('1080749002041073674');
  const channel = await guild.channels.create({
    name: `📌▸ticket-${ticket.id}`,
    parent: '1204722805896257536',
    type: ChannelType.GuildText,
    permissionOverwrites: [
      {
        id: guild.id,
        deny: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory],
      },
      {
        id: interaction.user.id,
        allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory],
      },
    ],
  });

  const cancelTicketButton = new ButtonBuilder()
    .setCustomId('cancel_ticket')
    .setLabel('Отмена')
    .setStyle(ButtonStyle.Primary);

  const closeTicketButton = new ButtonBuilder()
    .setCustomId('close_ticket')
    .setLabel('Закрыть')
    .setStyle(ButtonStyle.Primary);

  const row = new ActionRowBuilder()
    .addComponents(cancelTicketButton, closeTicketButton);

  const embed = new EmbedBuilder()
    .setDescription('📌 Благодарим вас за оформление запроса на покупку nitro/spotify.');

  await channel.send({
    embeds: [embed],
    components: [row]
  });

  log(`new ticket (ID: ${ticket.id}) opened successfully by ${interaction.user.username}`);
}

async function handleCancelTicket(interaction, database) {
  const ticketId = extractTicketId(interaction.channel.name);
  const ticket = await database.get('SELECT * FROM tickets WHERE id = ?', [ticketId]);

  if (ticket.is_closed) {
    const embed = new EmbedBuilder()
      .setDescription('🥺 Тикет уже был закрыт');

    await interaction.reply({ embeds: [embed], ephemeral: true });

    log(`attempted to cancel a closed ticket (ID: ${ticket.id}) by ${interaction.user.username}`);
    return;
  }

  await database.run('UPDATE tickets SET is_closed = 1, closure_time = CURRENT_TIMESTAMP WHERE user_id = ? AND is_closed = 0', [ticket.user_id]);

  await interaction.channel.setParent('1204781454371065867');

  const embed = new EmbedBuilder()
    .setDescription('📋 Ваш запрос на покупку был отменен. Мы искренне сожалеем, что не смогли предоставить вам необходимую помощь в данном вопросе.');

  await interaction.channel.send({ embeds: [embed] });

  log(`ticket (ID: ${ticket.id}) canceled successfully by ${interaction.user.username}`);
}

async function handleCloseTicket(interaction, database) {
  const ticketId = extractTicketId(interaction.channel.name);
  const ticket = await database.get('SELECT * FROM tickets WHERE id = ?', [ticketId]);
  const guild = client.guilds.cache.get('1080749002041073674');

  const requester = guild.members.cache.get(interaction.user.id);
  if (!requester.roles.cache.has('1089481679988609044')) {
    const embed = new EmbedBuilder()
      .setDescription('📌 У вас нет прав на выполнение данной команды');

    await interaction.reply({ embeds: [embed], ephemeral: true });

    log(`unauthorized access attempt by ${interaction.user.username}`);
    return;
  }

  if (ticket.is_closed) {
    const embed = new EmbedBuilder()
      .setDescription('🥺 Тикет уже был закрыт');

    await interaction.reply({ embeds: [embed], ephemeral: true });

    log(`attempt to close already closed ticket (ID: ${ticket.id}) by ${interaction.user.username}`);
    return;
  }

  await database.run('UPDATE tickets SET is_closed = 1, closure_time = CURRENT_TIMESTAMP WHERE id = ? AND is_closed = 0', [ticket.id]);

  const owner = await guild.members.fetch(ticket.user_id);
  if (!owner.roles.cache.has('1088115662733443112')) {
    owner.roles.add('1088115662733443112');
  }

  await interaction.channel.setParent('1204781454371065867');

  const embed = new EmbedBuilder()
    .setDescription('❤️ Покупка успешно завершена, мы будем очень признательны, если вы оставите отзыв!');

  await interaction.channel.send({ embeds: [embed] });

  log(`ticket (ID: ${ticket.id}) closed successfully by ${interaction.user.username}`);
}

function extractTicketId(channelName) {
  const match = channelName.match(/ticket-(\d+)/);

  if (match)
    return parseInt(match[1], 10);

  return null;
}

function log(message) {
  const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false });
  console.log(`[${timestamp}] ${message}`);
}

client.login('')