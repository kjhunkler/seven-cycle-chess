import { DbConnection, tables } from './bindings/index';

const form = document.querySelector('#join');
const nameInput = document.querySelector('#name');
const joinButton = document.querySelector('#join-button');
const disconnect = document.querySelector('#disconnect');
const status = document.querySelector('#status');
const players = document.querySelector('#players');
const incoming = document.querySelector('#incoming');
const outgoing = document.querySelector('#outgoing');

let connection;
let token;
let identity;
let ready = false;

function showStatus(message) {
  status.textContent = message;
}

function reset(message) {
  connection = undefined;
  ready = false;
  joinButton.disabled = false;
  disconnect.disabled = true;
  nameInput.disabled = false;
  for (const list of [players, incoming, outgoing]) list.replaceChildren();
  showStatus(message);
}

function action(label, run, disabled = false) {
  const button = document.createElement('button');
  button.textContent = label;
  button.disabled = disabled;
  button.addEventListener('click', async () => {
    button.disabled = true;
    try {
      await run();
    } catch (error) {
      showStatus(error.message);
    } finally {
      if (ready) render();
    }
  });
  return button;
}

function row(list, label, ...actions) {
  const item = document.createElement('li');
  item.append(label, ...actions);
  list.append(item);
}

function render() {
  if (!ready) return;
  const conn = connection;
  for (const list of [players, incoming, outgoing]) list.replaceChildren();
  const sent = [...conn.db.outgoing.iter()];
  for (const player of conn.db.player.iter()) {
    const id = player.identity.toHexString();
    if (id === identity) {
      row(players, player.name + ' (you)');
    } else {
      const pending = sent.some(invite => invite.recipient.toHexString() === id && invite.status === 'pending');
      row(players, player.name, action('Invite', () => conn.reducers.invite({ to: player.identity }), pending));
    }
  }
  for (const invite of conn.db.incoming.iter()) {
    const label = invite.senderName + ' — ' + invite.status;
    if (invite.status === 'pending') {
      row(incoming, label,
        action('Accept', () => conn.reducers.respond({ id: invite.id, accept: true })),
        action('Decline', () => conn.reducers.respond({ id: invite.id, accept: false })));
    } else {
      row(incoming, label);
    }
  }
  for (const invite of sent) row(outgoing, invite.recipientName + ' — ' + invite.status);
}

form.addEventListener('submit', event => {
  event.preventDefault();
  if (connection) return;
  const name = nameInput.value.trim();
  if (!name) {
    showStatus('Enter a display name.');
    return;
  }

  joinButton.disabled = true;
  nameInput.disabled = true;
  showStatus('Connecting…');
  const builder = DbConnection.builder()
    .withUri('ws://127.0.0.1:3107')
    .withDatabaseName('fruit-wars-lobby-demo')
    .onConnect((conn, sender, authToken) => {
      identity = sender.toHexString();
      token = authToken;
      for (const table of [conn.db.player, conn.db.incoming, conn.db.outgoing]) {
        table.onInsert(render);
        table.onDelete(render);
        table.onUpdate?.(render);
      }
      conn.subscriptionBuilder()
        .onError(() => {
          reset('Could not subscribe to the lobby.');
          conn.disconnect();
        })
        .onApplied(async () => {
          try {
            await conn.reducers.join({ name });
            if (connection !== conn) return;
            ready = true;
            disconnect.disabled = false;
            showStatus('Connected');
            render();
          } catch (error) {
            if (connection !== conn) return;
            reset(error.message);
            conn.disconnect();
          }
        })
        .subscribe([tables.player, tables.incoming, tables.outgoing]);
    })
    .onConnectError((_ctx, error) => reset(error.message))
    .onDisconnect(ctx => {
      if (ctx === connection) reset('Disconnected');
    });
  if (token) builder.withToken(token);
  connection = builder.build();
});

disconnect.addEventListener('click', () => {
  const conn = connection;
  reset('Disconnected');
  conn.disconnect();
});
