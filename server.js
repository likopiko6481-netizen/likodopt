const express = require('express');
const app = express();
app.use(express.json());

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
        }
        .online-dot.connected { background: #00e676; }
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
        }
        .avatar.speaking {
            box-shadow: 0 0 0 6px rgba(0, 230, 118, 0.35);
            background: #1c382c;
        }
        #status { font-size: 1rem; color: #cfd8e3; font-weight: 500; }
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
        .chat-input { display: flex; border-top: 1px solid #222630; }
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
        .controls { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .btn {
            padding: 14px;
            border: none;
            border-radius: 12px;
            font-size: 1rem;
            font-weight: 700;
            cursor: pointer;
        }
        .btn:disabled { opacity: 0.4; cursor: not-allowed; }
        #btnNext { background: #00e676; color: #000; }
        #btnStop { background: #ff5252; color: #fff; }
        #btnMute { grid-column: span 2; background: #262b38; color: #fff; font-weight: 600; }
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
        <div id="status">Запуск интерфейса...</div>
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

<script>
    var statusEl = document.getElementById('status');
    var onlineCountEl = document.getElementById('onlineCount');
    var connDot = document.getElementById('connDot');
    var partnerAvatar = document.getElementById('partnerAvatar');
    var messagesEl = document.getElementById('messages');
    var chatForm = document.getElementById('chatForm');
    var msgInput = document.getElementById('msgInput');
    var btnSend = document.getElementById('btnSend');
    var btnNext = document.getElementById('btnNext');
    var btnStop = document.getElementById('btnStop');
    var btnMute = document.getElementById('btnMute');
    var remoteAudio = document.getElementById('remoteAudio');

    window.onerror = function(msg, url, line) {
        statusEl.textContent = 'Сбой скрипта (стр. ' + line + '): ' + msg;
    };

    var myId = 'u_' + Math.random().toString(36).substring(2) + Date.now().toString(36);
    var isConnected = false;
    var localStream = null;
    var peerConnection = null;
    var isMuted = false;
    var audioContext = null;
    var analyserInterval = null;

    var rtcConfig = {
        iceServers: [
            { urls: 'stun:://google.com' },
            { urls: 'stun:://google.com' }
        ]
    };

    function api(path, body) {
        var payload = Object.assign({ id: myId }, body || {});
        return fetch(path, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        }).then(function(res) { return res.json(); });
    }

    function pollLoop() {
        api('/api/poll', {}).then(function(data) {
            if (!isConnected) {
                isConnected = true;
                connDot.classList.add('connected');
                btnNext.disabled = false;
                statusEl.textContent = 'Нажмите «Найти / Далее»';
            }
            onlineCountEl.textContent = data.online;

            if (data.events && data.events.length > 0) {
                data.events.forEach(function(ev) {
                    handleEvent(ev);
                });
            }
            setTimeout(pollLoop, 800);
        }).catch(function(err) {
            isConnected = false;
            connDot.classList.remove('connected');
            statusEl.textContent = 'Нет связи с сервером: ' + err.message;
            setTimeout(pollLoop, 2000);
        });
    }

    async function handleEvent(data) {
        if (data.type === 'waiting') {
            statusEl.textContent = 'Поиск собеседника...';
            addMessage('Ожидание свободного собеседника...', 'sys');
        } else if (data.type === 'partner_found') {
            statusEl.textContent = 'Собеседник на связи!';
            messagesEl.innerHTML = '';
            addMessage('Соединение установлено. Поздоровайтесь!', 'sys');
            setChatEnabled(true);
            createPeerConnection();

            if (data.initiator) {
                var offer = await peerConnection.createOffer();
                await peerConnection.setLocalDescription(offer);
                api('/api/signal', { signal: { type: 'offer', offer: offer } });
            }
        } else if (data.type === 'signal') {
            if (!peerConnection) return;
            var sig = data.signal;
            if (sig.type === 'offer') {
                await peerConnection.setRemoteDescription(new RTCSessionDescription(sig.offer));
                var answer = await peerConnection.createAnswer();
                await peerConnection.setLocalDescription(answer);
                api('/api/signal', { signal: { type: 'answer', answer: answer } });
            } else if (sig.type === 'answer') {
                await peerConnection.setRemoteDescription(new RTCSessionDescription(sig.answer));
            } else if (sig.type === 'candidate') {
                await peerConnection.addIceCandidate(new RTCIceCandidate(sig.candidate));
            }
        } else if (data.type === 'chat_message') {
            addMessage(data.text, 'partner');
        } else if (data.type === 'partner_disconnected') {
            closeCall();
            statusEl.textContent = 'Собеседник отключился';
            addMessage('Собеседник покинул чат. Нажмите «Далее»', 'sys');
        }
    }

statusEl.textContent = 'Подключение к серверу...';
pollLoop();
function addMessage(text, type) {
var div = document.createElement('div');
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
statusEl.textContent = 'Разрешите доступ к микрофону!';
addMessage('Ошибка: браузер заблокировал микрофон', 'sys');
throw err;
}
}
}
function startVoiceDetector(stream) {
stopVoiceDetector();
try {
var AudioCtx = window.AudioContext || window.webkitAudioContext;
audioContext = new AudioCtx();
var source = audioContext.createMediaStreamSource(stream);
var analyser = audioContext.createAnalyser();
analyser.fftSize = 256;
source.connect(analyser);
var data = new Uint8Array(analyser.frequencyBinCount);
analyserInterval = setInterval(function() {
analyser.getByteFrequencyData(data);
var sum = 0;
for (var i = 0; i < data.length; i++) sum += data.at(i);
if ((sum / data.length) > 12) {
partnerAvatar.classList.add('speaking');
} else {
partnerAvatar.classList.remove('speaking');
}
}, 100);
} catch (e) {}
}
function stopVoiceDetector() {
if (analyserInterval) clearInterval(analyserInterval);
if (audioContext) audioContext.close().catch(function() {});
partnerAvatar.classList.remove('speaking');
}
function createPeerConnection() {
peerConnection = new RTCPeerConnection(rtcConfig);
localStream.getTracks().forEach(function(track) {
peerConnection.addTrack(track, localStream);
});
peerConnection.ontrack = function(event) {
var stream = event.streams.at(0);
if (stream) {
remoteAudio.srcObject = stream;
remoteAudio.play().catch(function() {});
startVoiceDetector(stream);
}
};
peerConnection.onicecandidate = function(event) {
if (event.candidate) {
api('/api/signal', { signal: { type: 'candidate', candidate: event.candidate } });
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
btnNext.addEventListener('click', async function() {
await initAudio();
closeCall();
messagesEl.innerHTML = '';
btnStop.disabled = false;
statusEl.textContent = 'Ищем собеседника...';
api('/api/find', {});
});
btnStop.addEventListener('click', function() {
closeCall();
api('/api/stop', {});
btnStop.disabled = true;
statusEl.textContent = 'Поиск остановлен';
addMessage('Вы завершили диалог', 'sys');
});
btnMute.addEventListener('click', function() {
if (!localStream) return;
isMuted = !isMuted;
var track = localStream.getAudioTracks().at(0);
if (track) track.enabled = !isMuted;
btnMute.textContent = isMuted ? 'Включить микрофон' : 'Выключить микрофон';
btnMute.classList.toggle('muted', isMuted);
});
chatForm.addEventListener('submit', function(e) {
e.preventDefault();
var text = msgInput.value.trim();
if (!text) return;
addMessage(text, 'me');
msgInput.value = '';
api('/api/chat', { text: text });
});


`;
app.get('/', function(req, res) {
res.send(HTML_PAGE);
});
const users = new Map();
let waitingQueue = [];
const pairs = new Map();
function ensureUser(id) {
if (!users.has(id)) {
users.set(id, { lastSeen: Date.now(), events: [] });
}
const u = users.get(id);
u.lastSeen = Date.now();
return u;
}
function pushEvent(id, ev) {
const u = users.get(id);
if (u) u.events.push(ev);
}
function removeFromQueue(id) {
waitingQueue = waitingQueue.filter(function(cid) { return cid !== id; });
}
function disconnectPartner(id) {
const partnerId = pairs.get(id);
if (partnerId) {
pairs.delete(id);
pairs.delete(partnerId);
pushEvent(partnerId, { type: 'partner_disconnected' });
}
}
setInterval(function() {
const now = Date.now();
for (const [id, u] of users.entries()) {
if (now - u.lastSeen > 10000) {
users.delete(id);
removeFromQueue(id);
disconnectPartner(id);
}
}
}, 4000);
app.post('/api/poll', function(req, res) {
const id = req.body && req.body.id;
if (!id) return res.status(400).end();
const u = ensureUser(id);
const events = u.events.splice(0, u.events.length);
res.json({ online: users.size, events: events });
});
app.post('/api/find', function(req, res) {
const id = req.body && req.body.id;
if (!id) return res.status(400).end();
ensureUser(id);
disconnectPartner(id);
removeFromQueue(id);
waitingQueue = waitingQueue.filter(function(cid) {
return users.has(cid) && cid !== id;
});
if (waitingQueue.length > 0) {
const partnerId = waitingQueue.shift();
pairs.set(id, partnerId);
pairs.set(partnerId, id);
pushEvent(id, { type: 'partner_found', initiator: true });
pushEvent(partnerId, { type: 'partner_found', initiator: false });
} else {
waitingQueue.push(id);
pushEvent(id, { type: 'waiting' });
}
res.json({ ok: true });
});
app.post('/api/signal', function(req, res) {
const id = req.body && req.body.id;
const signal = req.body && req.body.signal;
const partnerId = pairs.get(id);
if (partnerId && signal) {
pushEvent(partnerId, { type: 'signal', signal: signal });
}
res.json({ ok: true });
});
app.post('/api/chat', function(req, res) {
const id = req.body && req.body.id;
const text = req.body && req.body.text;
const partnerId = pairs.get(id);
if (partnerId && typeof text === 'string') {
pushEvent(partnerId, { type: 'chat_message', text: text.slice(0, 500) });
}
res.json({ ok: true });
});
app.post('/api/stop', function(req, res) {
const id = req.body && req.body.id;
if (id) {
removeFromQueue(id);
disconnectPartner(id);
}
res.json({ ok: true });
});
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', function() {
console.log('Likodopt запущен на порту ' + PORT);
});
