const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" },
    transports: ['websocket', 'polling']
});

const HTML_PAGE = `<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Likodopt — Голосовая чат-рулетка</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            background: #0f1115;
            color: #fff;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            padding: 15px;
        }
        .app {
            background: #181b22;
            width: 100%;
            max-width: 460px;
            border-radius: 20px;
            padding: 25px;
            box-shadow: 0 12px 40px rgba(0,0,0,0.6);
            border: 1px solid #262a35;
        }
        .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 20px;
        }
        .logo {
            font-size: 1.5rem;
            font-weight: 800;
            color: #00e676;
            letter-spacing: 1px;
        }
        .online-badge {
            background: #232834;
            padding: 6px 12px;
            border-radius: 20px;
            font-size: 0.85rem;
            color: #a0aab8;
            display: flex;
            align-items: center;
        }
        .online-dot {
            display: inline-block;
            width: 8px;
            height: 8px;
            background: #ff5252;
            border-radius: 50%;
            margin-right: 6px;
            transition: background 0.3s;
        }
        .online-dot.connected {
            background: #00e676;
        }
        .voice-box {
            background: #12141a;
            border-radius: 16px;
            padding: 25px 15px;
            text-align: center;
            margin-bottom: 15px;
            border: 1px solid #222630;
        }
        .avatar {
            width: 72px;
            height: 72px;
            border-radius: 50%;
            background: #232834;
            margin: 0 auto 15px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 2rem;
            transition: box-shadow 0.15s ease;
        }
        .avatar.speaking {
            box-shadow: 0 0 0 6px rgba(0, 230, 118, 0.35);
            background: #1c382c;
        }
        #status {
            font-size: 1rem;
            color: #cfd8e3;
            font-weight: 500;
        }
        .chat-box {
            background: #12141a;
            border-radius: 14px;
            height: 180px;
            display: flex;
            flex-direction: column;
            margin-bottom: 15px;
            border: 1px solid #222630;
            overflow: hidden;
        }
        #messages {
            flex: 1;
            padding: 12px;
            overflow-y: auto;
            font-size: 0.9rem;
            display: flex;
            flex-direction: column;
            gap: 8px;
        }
        .msg { padding: 8px 12px; border-radius: 10px; max-width: 82%; word-wrap: break-word; }
        .msg.me { background: #00e676; color: #000; align-self: flex-end; font-weight: 500; }
        .msg.partner { background: #262b38; color: #fff; align-self: flex-start; }
        .msg.sys { background: transparent; color: #788292; align-self: center; font-size: 0.8rem; text-align: center; }
        .chat-input {
            display: flex;
            border-top: 1px solid #222630;
        }
        .chat-input input {
            flex: 1;
            background: transparent;
            border: none;
            padding: 12px;
            color: #fff;
            outline: none;
            font-size: 0.9rem;
        }
        .chat-input button {
            background: transparent;
            border: none;
            color: #00e676;
            font-weight: bold;
            padding: 0 16px;
            cursor: pointer;
        }
        .chat-input button:disabled { color: #555; cursor: not-allowed; }
        .controls {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 10px;
        }
        .btn {
            padding: 14px;
            border: none;
            border-radius: 12px;
            font-size: 1rem;
            font-weight: 700;
            cursor: pointer;
            transition: transform 0.1s, opacity 0.2s;
        }
        .btn:active { transform: scale(0.98); }
        .btn:disabled { opacity: 0.4; cursor: not-allowed; }
        #btnNext { background: #00e676; color: #000; }
        #btnStop { background: #ff5252; color: #fff; }
        #btnMute {
            grid-column: span 2;
            background: #262b38;
            color: #fff;
            font-weight: 600;
        }
        #btnMute.muted { background: #ff9800; color: #000; }
    </style>
</head>
<body>

<div class="app">
    <div class="header">
        <div class="logo">LIKODOPT</div>
        <div class="online-badge"><span class="online-dot" id="connDot"></span>Онлайн: <span id="onlineCount">0</span></div>
    </div>

    <div class="voice-box">
        <div class="avatar" id="partnerAvatar">🎙️</div>
        <div id="status">Подключение к серверу...</div>
    </div>

    <div class="chat-box">
        <div id="messages"></div>
        <form class="chat-input" id="chatForm">
            <input type="text" id="msgInput" placeholder="Написать сообщение..." disabled autocomplete="off">
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

<script src="/socket.io/socket.io.js"></script>
<script>
    const socket = io({
        transports: ['websocket', 'polling']
    });

    const statusEl = document.getElementById('status');
    const onlineCountEl = document.getElementById('onlineCount');
    const connDot = document.getElementById('connDot');
    const partnerAvatar = document.getElementById('partnerAvatar');
    const messagesEl = document.getElementById('messages');
    const chatForm = document.getElementById('chatForm');
    const msgInput = document.getElementById('msgInput');
    const btnSend = document.getElementById('btnSend');
    const btnNext = document.getElementById('btnNext');
    const btnStop = document.getElementById('btnStop');
    const btnMute = document.getElementById('btnMute');
    const remoteAudio = document.getElementById('remoteAudio');

    let localStream = null;
    let peerConnection = null;
    let isMuted = false;
    let audioContext = null;
    let analyserInterval = null;

    const rtcConfig = {
        iceServers: [
            { urls: 'stun:://google.com' },
            { urls: 'stun:://google.com' },
            { urls: 'stun:://google.com' }
        ]
    };

    socket.on('connect', () => {
        connDot.classList.add('connected');
        btnNext.disabled = false;
        statusEl.textContent = 'Нажмите «Найти / Далее»';
    });

    socket.on('disconnect', () => {
        connDot.classList.remove('connected');
        btnNext.disabled = true;
        btnStop.disabled = true;
        statusEl.textContent = 'Переподключение к серверу...';
        closeCall();
    });

    function addMessage(text, type) {
        const div = document.createElement('div');
        div.className = 'msg ' + type;
        div.textContent = text;
        messagesEl.appendChild(div);
        messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    function setChatEnabled(enabled) {
        msgInput.disabled = !enabled;
        btnSend.disabled = !enabled;
        if (!enabled) msgInput.value = '';
    }

    async function initAudio() {
        if (!localStream) {
            try {
                localStream = await navigator.mediaDevices.getUserMedia({
                    audio: { echoCancellation: true, noiseSuppression: true },
                    video: false
                });
                btnMute.disabled = false;
            } catch (err) {
                statusEl.textContent = 'Разрешите доступ к микрофону в браузере!';
                addMessage('Ошибка: браузер заблокировал микрофон', 'sys');
                throw err;
            }
        }
    }

    function startVoiceDetector(stream) {
        stopVoiceDetector();
        try {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const source = audioContext.createMediaStreamSource(stream);
            const analyser = audioContext.createAnalyser();
            analyser.fftSize = 256;
            source.connect(analyser);
            const data = new Uint8Array(analyser.frequencyBinCount);

            analyserInterval = setInterval(() => {
                analyser.getByteFrequencyData(data);
                let sum = 0;
                for (let i = 0; i < data.length; i++) sum += data[i];
                const avg = sum / data.length;
                if (avg > 12) {
                    partnerAvatar.classList.add('speaking');
                } else {
                    partnerAvatar.classList.remove('speaking');
                }
            }, 100);
        } catch (e) {}
    }

    function stopVoiceDetector() {
        if (analyserInterval) clearInterval(analyserInterval);
Use code with caution.
if (audioContext) audioContext.close().catch(() => {});
partnerAvatar.classList.remove('speaking');
}
function createPeerConnection() {
peerConnection = new RTCPeerConnection(rtcConfig);
localStream.getTracks().forEach(track => {
peerConnection.addTrack(track, localStream);
});
peerConnection.ontrack = (event) => {
const stream = event.streams[0];
if (stream) {
remoteAudio.srcObject = stream;
remoteAudio.play().catch(() => {});
startVoiceDetector(stream);
}
};
peerConnection.onicecandidate = (event) => {
if (event.candidate) {
socket.emit('signal', { type: 'candidate', candidate: event.candidate });
}
};
}
function closeCall() {
stopVoiceDetector();
if (peerConnection) {
peerConnection.close();
peerConnection = null;
}
remoteAudio.srcObject = null;
setChatEnabled(false);
}
btnNext.addEventListener('click', async () => {
await initAudio();
closeCall();
messagesEl.innerHTML = '';
btnStop.disabled = false;
statusEl.textContent = 'Ищем собеседника...';
socket.emit('find_partner');
});
btnStop.addEventListener('click', () => {
closeCall();
socket.emit('stop');
btnStop.disabled = true;
statusEl.textContent = 'Поиск остановлен';
addMessage('Вы завершили диалог', 'sys');
});
btnMute.addEventListener('click', () => {
if (!localStream) return;
isMuted = !isMuted;
localStream.getAudioTracks()[0].enabled = !isMuted;
btnMute.textContent = isMuted ? 'Включить микрофон' : 'Выключить микрофон';
btnMute.classList.toggle('muted', isMuted);
});
chatForm.addEventListener('submit', (e) => {
e.preventDefault();
const text = msgInput.value.trim();
if (!text) return;
addMessage(text, 'me');
socket.emit('chat_message', text);
msgInput.value = '';
});
socket.on('online_count', (count) => {
onlineCountEl.textContent = count;
});
socket.on('waiting', () => {
statusEl.textContent = 'Поиск собеседника...';
addMessage('Ожидание свободного собеседника...', 'sys');
});
socket.on('partner_found', async ({ initiator }) => {
statusEl.textContent = 'Собеседник на связи!';
messagesEl.innerHTML = '';
addMessage('Соединение установлено. Поздоровайтесь!', 'sys');
setChatEnabled(true);
createPeerConnection();
if (initiator) {
const offer = await peerConnection.createOffer();
await peerConnection.setLocalDescription(offer);
socket.emit('signal', { type: 'offer', offer });
}
});
socket.on('signal', async (data) => {
if (!peerConnection) return;
try {
if (data.type === 'offer') {
await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
const answer = await peerConnection.createAnswer();
await peerConnection.setLocalDescription(answer);
socket.emit('signal', { type: 'answer', answer });
} else if (data.type === 'answer') {
await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
} else if (data.type === 'candidate') {
await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
}
} catch (err) {
console.error('Ошибка сигнала:', err);
}
});
socket.on('chat_message', (text) => {
addMessage(text, 'partner');
});
socket.on('partner_disconnected', () => {
closeCall();
statusEl.textContent = 'Собеседник отключился';
addMessage('Собеседник покинул чат. Нажмите «Далее»', 'sys');
});


`;
app.get('/', (req, res) => {
res.send(HTML_PAGE);
});
let waitingQueue = [];
const pairs = new Map();
function broadcastOnline() {
io.emit('online_count', io.of('/').sockets.size);
}
function removeFromQueue(socketId) {
waitingQueue = waitingQueue.filter(s => s.id !== socketId);
}
io.on('connection', (socket) => {
broadcastOnline();
socket.on('find_partner', () => {
disconnectPartner(socket);
removeFromQueue(socket.id);
// Очищаем очередь от отключившихся пользователей
waitingQueue = waitingQueue.filter(s => s.connected && s.id !== socket.id);
if (waitingQueue.length > 0) {
const partner = waitingQueue.shift();
pairs.set(socket.id, partner.id);
pairs.set(partner.id, socket.id);
socket.emit('partner_found', { initiator: true });
partner.emit('partner_found', { initiator: false });
} else {
waitingQueue.push(socket);
socket.emit('waiting');
}
});
socket.on('signal', (data) => {
const partnerId = pairs.get(socket.id);
if (partnerId) io.to(partnerId).emit('signal', data);
});
socket.on('chat_message', (text) => {
const partnerId = pairs.get(socket.id);
if (partnerId && typeof text === 'string') {
io.to(partnerId).emit('chat_message', text.slice(0, 500));
}
});
socket.on('stop', () => {
removeFromQueue(socket.id);
disconnectPartner(socket);
});
socket.on('disconnect', () => {
removeFromQueue(socket.id);
disconnectPartner(socket);
broadcastOnline();
});
function disconnectPartner(userSocket) {
const partnerId = pairs.get(userSocket.id);
if (partnerId) {
pairs.delete(userSocket.id);
pairs.delete(partnerId);
io.to(partnerId).emit('partner_disconnected');
}
}
});
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
console.log('Likodopt запущен на порту ' + PORT);
});
