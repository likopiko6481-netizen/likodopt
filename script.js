/*
  Likodopt — клиентский скрипт голосовой чат-рулетки
*/
console.log("Likodopt загружен 🎙️");

const netDot = document.getElementById('netDot');
const onlineCountEl = document.getElementById('onlineCount');
const avatar = document.getElementById('avatar');
const statusText = document.getElementById('statusText');
const messages = document.getElementById('messages');
const chatForm = document.getElementById('chatForm');
const msgInput = document.getElementById('msgInput');
const btnSend = document.getElementById('btnSend');
const btnNext = document.getElementById('btnNext');
const btnStop = document.getElementById('btnStop');
const btnMute = document.getElementById('btnMute');
const remoteAudio = document.getElementById('remoteAudio');

let peer = null;
let myPeerId = null;
let currentCall = null;
let dataConn = null;
let localStream = null;
let isMuted = false;
let isSearching = false;
let searchTimer = null;

function addMsg(text, cls) {
  if (!messages) return;
  const div = document.createElement('div');
  div.className = 'msg ' + cls;
  div.textContent = text;
  messages.appendChild(div);
  messages.scrollTop = messages.scrollHeight;
}

function setChatActive(active) {
  if (msgInput) {
    msgInput.disabled = !active;
    if (!active) msgInput.value = '';
  }
  if (btnSend) btnSend.disabled = !active;
}

function initPeer() {
  if (typeof Peer === 'undefined') {
    if (statusText) statusText.textContent = 'Ошибка: не подключена библиотека PeerJS';
    return;
  }

  const isHttps = window.location.protocol === 'https:';
  peer = new Peer({
    host: window.location.hostname,
    port: window.location.port || (isHttps ? 443 : 80),
    path: '/peerjs',
    secure: isHttps,
    config: {
      iceServers: [
        { urls: 'stun:://google.com' },
        { urls: 'stun:://google.com' },
        {
          urls: 'turn:openrelay.metered.ca:80',
          username: 'openrelayproject',
          credential: 'openrelayproject'
        }
      ]
    }
  });

  peer.on('open', (id) => {
    myPeerId = id;
    if (netDot) netDot.classList.add('on');
    if (btnNext) btnNext.disabled = false;
    if (statusText) statusText.textContent = 'Нажмите «Найти / Далее»';
    pingServer();
    setInterval(pingServer, 5000);
  });

  peer.on('call', (incomingCall) => {
    if (!isSearching && currentCall) {
      incomingCall.close();
      return;
    }
    stopSearchLoop();
    incomingCall.answer(localStream);
    setupCall(incomingCall);
  });

  peer.on('connection', (incomingConn) => {
    setupData(incomingConn);
  });

  peer.on('disconnected', () => {
    if (netDot) netDot.classList.remove('on');
    if (statusText) statusText.textContent = 'Переподключение...';
    peer.reconnect();
  });

  peer.on('error', (err) => {
    if (statusText) statusText.textContent = 'Ошибка связи: ' + err.type;
  });
}

async function pingServer() {
  if (!myPeerId) return;
  try {
    const res = await fetch('/ping?peerId=' + encodeURIComponent(myPeerId));
    const data = await res.json();
    if (data.online !== undefined && onlineCountEl) {
      onlineCountEl.textContent = data.online;
    }
  } catch (e) {}
}

async function initMic() {
  if (!localStream) {
    try {
      localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      if (btnMute) btnMute.disabled = false;
    } catch (err) {
      if (statusText) statusText.textContent = 'Разрешите доступ к микрофону!';
      throw err;
    }
  }
}

function stopSearchLoop() {
  isSearching = false;
  clearInterval(searchTimer);
  if (myPeerId) {
    fetch('/stop-search?myId=' + encodeURIComponent(myPeerId)).catch(() => {});
  }
}

function closeCall() {
  stopSearchLoop();
  if (avatar) avatar.classList.remove('active');
  setChatActive(false);
  if (currentCall) {
    try { currentCall.close(); } catch (e) {}
    currentCall = null;
  }
  if (dataConn) {
    try { dataConn.close(); } catch (e) {}
    dataConn = null;
  }
  if (remoteAudio) remoteAudio.srcObject = null;
}

function onConnected() {
  stopSearchLoop();
  if (statusText) statusText.textContent = 'Собеседник на связи!';
  if (messages) messages.innerHTML = '';
  addMsg('Соединение установлено. Поздоровайтесь!', 'sys');
  if (avatar) avatar.classList.add('active');
  setChatActive(true);
}

function setupCall(call) {
  currentCall = call;
  call.on('stream', (remoteStream) => {
    onConnected();
    if (remoteAudio) {
      remoteAudio.srcObject = remoteStream;
      remoteAudio.play().catch(() => {});
    }
  });
  call.on('close', () => {
    closeCall();
    if (statusText) statusText.textContent = 'Собеседник отключился';
    addMsg('Собеседник покинул чат. Нажмите «Далее»', 'sys');
  });
}

function setupData(conn) {
  dataConn = conn;
  conn.on('open', onConnected);
  conn.on('data', (text) => {
    if (typeof text === 'string') addMsg(text, 'partner');
  });
  conn.on('close', () => {
    closeCall();
    if (statusText) statusText.textContent = 'Собеседник отключился';
    addMsg('Собеседник покинул чат. Нажмите «Далее»', 'sys');
  });
}

async function findPartnerStep() {
  if (!isSearching || !myPeerId) return;
  try {
    const res = await fetch('/find-partner?myId=' + encodeURIComponent(myPeerId));
    const data = await res.json();
    if (data.online !== undefined && onlineCountEl) {
      onlineCountEl.textContent = data.online;
    }

    if (data.partnerId && isSearching) {
      stopSearchLoop();
      if (statusText) statusText.textContent = 'Соединение с собеседником...';
      const conn = peer.connect(data.partnerId, { reliable: true });
      const call = peer.call(data.partnerId, localStream);
      setupData(conn);
      setupCall(call);
    }
  } catch (e) {}
}

if (btnNext) {
  btnNext.addEventListener('click', async () => {
    await initMic();
    closeCall();
    isSearching = true;
    if (btnStop) btnStop.disabled = false;
    if (messages) messages.innerHTML = '';
    if (statusText) statusText.textContent = 'Поиск собеседника...';
    addMsg('Ищем свободного собеседника...', 'sys');

    findPartnerStep();
    searchTimer = setInterval(findPartnerStep, 2000);
  });
}

if (btnStop) {
  btnStop.addEventListener('click', () => {
    closeCall();
    btnStop.disabled = true;
    if (statusText) statusText.textContent = 'Поиск остановлен';
    addMsg('Вы завершили диалог', 'sys');
  });
}

if (btnMute) {
  btnMute.addEventListener('click', () => {
    if (!localStream) return;
    isMuted = !isMuted;
    localStream.getAudioTracks().forEach(t => { t.enabled = !isMuted; });
    btnMute.textContent = isMuted ? 'Включить микрофон' : 'Выключить микрофон';
    btnMute.classList.toggle('muted', isMuted);
  });
}

if (chatForm) {
  chatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!msgInput) return;
    const text = msgInput.value.trim();
    if (!text || !dataConn || !dataConn.open) return;
    addMsg(text, 'me');
    dataConn.send(text);
    msgInput.value = '';
  });
}

initPeer();
