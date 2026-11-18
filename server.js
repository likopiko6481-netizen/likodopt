const express = require('express');
const { ExpressPeerServer } = require('peer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

const activePeers = new Map();
const searchingPeers = new Map();

const HTML_PAGE = `<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>Likodopt — Голосовая чат-рулетка</title>
    <script src="https://unpkg.com"></script>
    <style>
        :root {
            --bg: #0c0d12;
            --surface: rgba(22, 24, 34, 0.85);
            --elevated: #1f2230;
            --accent: #ff6ec7;
            --accent-glow: rgba(255, 110, 199, 0.35);
            --success: #00e676;
            --danger: #ff4b5c;
            --text: #f4f4f8;
            --muted: #989cb0;
        }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            background: url('/background-image') no-repeat center center fixed,
                        radial-gradient(circle at top, #361c42 0%, var(--bg) 80%);
            background-size: cover;
            color: var(--text);
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            padding: 12px;
        }
        .app {
            background: var(--surface);
            backdrop-filter: blur(12px);
            width: 100%; max-width: 440px;
            border-radius: 24px; padding: 22px;
            box-shadow: 0 16px 48px rgba(0,0,0,0.75);
            border: 1px solid rgba(255,255,255,0.12);
            display: flex; flex-direction: column; gap: 14px;
        }
        .header { display: flex; justify-content: space-between; align-items: center; }
        .logo { font-size: 1.4rem; font-weight: 900; color: var(--accent); letter-spacing: 1px; }
        .status-pill {
            background: var(--elevated); padding: 6px 12px; border-radius: 20px;
            font-size: 0.82rem; color: var(--text); display: flex; align-items: center; gap: 6px;
        }
        .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--danger); }
        .dot.on { background: var(--success); box-shadow: 0 0 8px var(--success); }
        .voice-card {
            background: rgba(14, 15, 22, 0.72); border-radius: 18px; padding: 22px 15px;
            text-align: center; border: 1px solid rgba(255,255,255,0.07);
        }
        .avatar {
            width: 68px; height: 68px; border-radius: 50%; background: var(--elevated);
            margin: 0 auto 12px; display: flex; align-items: center; justify-content: center;
            font-size: 1.9rem; transition: all 0.2s ease;
        }
        .avatar.active { box-shadow: 0 0 0 6px var(--accent-glow); background: #3b1d36; }
        #statusText { font-size: 0.98rem; font-weight: 600; color: var(--text); }
        .chat-box {
            background: rgba(14, 15, 22, 0.72); border-radius: 16px; height: 190px;
            display: flex; flex-direction: column; border: 1px solid rgba(255,255,255,0.07); overflow: hidden;
        }
        #messages {
            flex: 1; padding: 12px; overflow-y: auto; display: flex; flex-direction: column; gap: 8px;
            font-size: 0.9rem;
        }
        .msg { padding: 8px 13px; border-radius: 14px; max-width: 82%; word-wrap: break-word; line-height: 1.35; }
        .msg.me { background: var(--accent); color: #000; align-self: flex-end; font-weight: 600; border-bottom-right-radius: 4px; }
        .msg.partner { background: var(--elevated); color: var(--text); align-self: flex-start; border-bottom-left-radius: 4px; }
        .msg.sys { background: transparent; color: var(--muted); align-self: center; font-size: 0.8rem; text-align: center; }
        .chat-form { display: flex; border-top: 1px solid rgba(255,255,255,0.08); }
        .chat-form input {
            flex: 1; background: transparent; border: none; padding: 12px;
            color: #fff; outline: none; font-size: 0.9rem;
        }
        .chat-form button {
            background: transparent; border: none; color: var(--accent);
            font-weight: bold; padding: 0 16px; font-size: 1.1rem; cursor: pointer;
        }
        .chat-form button:disabled { color: #555; }
        .controls { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .btn {
            padding: 14px; border: none; border-radius: 14px; font-size: 0.95rem;
            font-weight: 700; cursor: pointer;
        }
        .btn:disabled { opacity: 0.35; cursor: not-allowed; }
        #btnNext { background: var(--accent); color: #000; }
        #btnStop { background: var(--danger); color: #fff; }
        #btnMute { grid-column: span 2; background: var(--elevated); color: var(--text); }
        #btnMute.muted { background: #ff9800; color: #000; }
    </style>
</head>
<body>

<div class="app">
    <div class="header">
        <span class="logo">LIKODOPT</span>
        <div class="status-pill"><span class="dot" id="netDot"></span>Онлайн: <span id="onlineCount">0</span></div>
    </div>

    <div class="voice-card">
        <div class="avatar" id="avatar">🎧</div>
        <div id="statusText">Подключение к Peer-серверу...</div>
    </div>

    <div class="chat-box">
        <div id="messages"></div>
        <form class="chat-form" id="chatForm">
            <input type="text" id="msgInput" placeholder="Сообщение..." disabled autocomplete="off">
            <button type="submit" id="btnSend" disabled>➤</button>
        </form>
    </div>

    <div class="controls">
        <button class="btn" id="btnNext" disabled>Найти / Далее</button>
        <button class="btn" id="btnStop" disabled>Стоп</button>
        <button class="btn" id="btnMute" disabled>Выключить микрофон</button>
    </div>

    <audio id="remoteAudio" autoplay playsinline></audio>
</div>

<script>
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
        const div = document.createElement('div');
        div.className = 'msg ' + cls;
        div.textContent = text;
        messages.appendChild(div);
        messages.scrollTop = messages.scrollHeight;
    }

    function setChatActive(active) {
        msgInput.disabled = !active;
        btnSend.disabled = !active;
        if (!active) msgInput.value = '';
    }

    function initPeer() {
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
            netDot.classList.add('on');
            btnNext.disabled = false;
            statusText.textContent = 'Нажмите «Найти / Далее»';
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
            netDot.classList.remove('on');
            statusText.textContent = 'Переподключение...';
            peer.reconnect();
        });

        peer.on('error', (err) => {
            statusText.textContent = 'Ошибка соединения: ' + err.type;
        });
    }

    async function pingServer() {
        if (!myPeerId) return;
        try {
            const res = await fetch('/ping?peerId=' + encodeURIComponent(myPeerId));
            const data = await res.json();
            if (data.online !== undefined) onlineCountEl.textContent = data.online;
        } catch (e) {}
    }

    initPeer();

    async function initMic() {
        if (!localStream) {
            try {
                localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
                btnMute.disabled = false;
            } catch (err) {
                statusText.textContent = 'Разрешите доступ к микрофону!';
                throw err;
            }
        }
    }
function stopSearchLoop() {
isSearching = false;
clearInterval(searchTimer);
if (myPeerId) fetch('/stop-search?myId=' + encodeURIComponent(myPeerId)).catch(() => {});
}
function closeCall() {
stopSearchLoop();
avatar.classList.remove('active');
setChatActive(false);
if (currentCall) { try { currentCall.close(); } catch (e) {} currentCall = null; }
if (dataConn) { try { dataConn.close(); } catch (e) {} dataConn = null; }
remoteAudio.srcObject = null;
}
function onConnected() {
stopSearchLoop();
statusText.textContent = 'Собеседник на связи!';
messages.innerHTML = '';
addMsg('Соединение установлено. Поздоровайтесь!', 'sys');
avatar.classList.add('active');
setChatActive(true);
}
function setupCall(call) {
currentCall = call;
call.on('stream', (remoteStream) => {
onConnected();
remoteAudio.srcObject = remoteStream;
remoteAudio.play().catch(() => {});
});
call.on('close', () => {
closeCall();
statusText.textContent = 'Собеседник отключился';
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
statusText.textContent = 'Собеседник отключился';
addMsg('Собеседник покинул чат. Нажмите «Далее»', 'sys');
});
}
async function findPartnerStep() {
if (!isSearching || !myPeerId) return;
try {
const res = await fetch('/find-partner?myId=' + encodeURIComponent(myPeerId));
const data = await res.json();
if (data.online !== undefined) onlineCountEl.textContent = data.online;
if (data.partnerId && isSearching) {
stopSearchLoop();
statusText.textContent = 'Соединение с собеседником...';
const conn = peer.connect(data.partnerId, { reliable: true });
const call = peer.call(data.partnerId, localStream);
setupData(conn);
setupCall(call);
}
} catch (e) {}
}
btnNext.addEventListener('click', async () => {
await initMic();
closeCall();
isSearching = true;
btnStop.disabled = false;
messages.innerHTML = '';
statusText.textContent = 'Поиск собеседника...';
addMsg('Ищем свободного собеседника...', 'sys');
findPartnerStep();
searchTimer = setInterval(findPartnerStep, 2000);
});
btnStop.addEventListener('click', () => {
closeCall();
btnStop.disabled = true;
statusText.textContent = 'Поиск остановлен';
addMsg('Вы завершили диалог', 'sys');
});
btnMute.addEventListener('click', () => {
if (!localStream) return;
isMuted = !isMuted;
localStream.getAudioTracks().forEach(t => t.enabled = !isMuted);
btnMute.textContent = isMuted ? 'Включить микрофон' : 'Выключить микрофон';
btnMute.classList.toggle('muted', isMuted);
});
chatForm.addEventListener('submit', (e) => {
e.preventDefault();
const text = msgInput.value.trim();
if (!text || !dataConn || !dataConn.open) return;
addMsg(text, 'me');
dataConn.send(text);
msgInput.value = '';
});


`;
const server = app.listen(PORT, '0.0.0.0', () => {
console.log('Likodopt запущен на порту ' + PORT);
});
const peerServer = ExpressPeerServer(server, {
path: '/',
proxied: true,
allow_discovery: true
});
app.use('/peerjs', peerServer);
peerServer.on('connection', (client) => {
activePeers.set(client.id, Date.now());
});
peerServer.on('disconnect', (client) => {
activePeers.delete(client.id);
searchingPeers.delete(client.id);
});
setInterval(() => {
const now = Date.now();
activePeers.forEach((lastActive, peerId) => {
if (now - lastActive > 25000) {
activePeers.delete(peerId);
searchingPeers.delete(peerId);
}
});
searchingPeers.forEach((lastSearch, peerId) => {
if (now - lastSearch > 15000) {
searchingPeers.delete(peerId);
}
});
}, 15000);
app.get('/background-image', (req, res) => {
const names = ['bg.png', 'bg.jpg', 'bg.jpeg', 'bg.webp'];
for (const name of names) {
const fullPath = path.join(__dirname, name);
if (fs.existsSync(fullPath)) {
return res.sendFile(fullPath);
}
}
res.status(404).end();
});
app.get('/ping', (req, res) => {
const peerId = req.query.peerId;
if (peerId) {
activePeers.set(peerId, Date.now());
}
res.json({
status: 'OK',
online: activePeers.size
});
});
app.get('/find-partner', (req, res) => {
const myId = req.query.myId;
if (!myId) {
return res.status(400).json({ error: 'Требуется параметр myId' });
}
const now = Date.now();
activePeers.set(myId, now);
searchingPeers.set(myId, now);
const availablePeers = [];
searchingPeers.forEach((lastSearch, peerId) => {
if (peerId !== myId && (now - lastSearch) < 12000) {
availablePeers.push(peerId);
}
});
if (availablePeers.length === 0) {
return res.json({
code: 'NO_PARTNERS',
online: activePeers.size
});
}
const partnerId = availablePeers[Math.floor(Math.random() * availablePeers.length)];
searchingPeers.delete(myId);
searchingPeers.delete(partnerId);
res.json({
partnerId,
online: activePeers.size
});
});
app.get('/stop-search', (req, res) => {
const myId = req.query.myId;
if (myId) {
searchingPeers.delete(myId);
}
res.json({ ok: true });
});
app.get('*', (req, res) => {
res.send(HTML_PAGE);
});
