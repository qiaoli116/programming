const ROOM = "chat/room1";
const TOPIC_MESSAGES = `${ROOM}/messages`;
const TOPIC_PRESENCE = `${ROOM}/presence`;

const clientId = crypto.randomUUID();
let nickname = "Guest";
let client = null;

const connectPanel = document.getElementById("connect-panel");
const chatPanel = document.getElementById("chat-panel");
const connectError = document.getElementById("connect-error");
const messagesEl = document.getElementById("messages");

function addLine(el) {
  messagesEl.appendChild(el);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function renderMessage(data) {
  const line = document.createElement("div");
  line.className = "message" + (data.id === clientId ? " mine" : "");

  const meta = document.createElement("span");
  meta.className = "meta";
  meta.textContent = `${data.name}: `;

  line.appendChild(meta);
  line.appendChild(document.createTextNode(data.text));
  addLine(line);
}

function renderPresence(data) {
  const line = document.createElement("div");
  line.className = "presence";
  line.textContent = data.type === "joined"
    ? `${data.name} joined the room`
    : `${data.name} left the room`;
  addLine(line);
}

function connect() {
  connectError.textContent = "";

  const url = document.getElementById("broker-url").value.trim();
  const username = document.getElementById("broker-username").value.trim();
  const password = document.getElementById("broker-password").value;
  const typedName = document.getElementById("nickname").value.trim();
  nickname = typedName || `Guest-${clientId.slice(0, 4)}`;

  client = mqtt.connect(url, {
    clientId: `chat-${clientId}`,
    username: username || undefined,
    password: password || undefined,
    clean: true,
    will: {
      topic: TOPIC_PRESENCE,
      payload: JSON.stringify({ type: "left", id: clientId, name: nickname }),
      qos: 0,
      retain: false,
    },
  });

  client.on("connect", () => {
    client.subscribe(TOPIC_MESSAGES);
    client.subscribe(TOPIC_PRESENCE);
    client.publish(TOPIC_PRESENCE, JSON.stringify({ type: "joined", id: clientId, name: nickname }));

    connectPanel.hidden = true;
    chatPanel.hidden = false;
    document.getElementById("message-input").focus();
  });

  client.on("message", (topic, payload) => {
    const data = JSON.parse(payload.toString());
    if (topic === TOPIC_MESSAGES) {
      renderMessage(data);
    } else if (topic === TOPIC_PRESENCE) {
      renderPresence(data);
    }
  });

  client.on("error", (err) => {
    connectError.textContent = `Connection error: ${err.message}`;
  });
}

function sendMessage(text) {
  client.publish(TOPIC_MESSAGES, JSON.stringify({
    id: clientId,
    name: nickname,
    text,
    ts: Date.now(),
  }));
}

document.getElementById("btn-connect").addEventListener("click", connect);

document.getElementById("send-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const input = document.getElementById("message-input");
  const text = input.value.trim();
  if (!text) return;

  sendMessage(text);
  input.value = "";
});
