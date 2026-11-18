 chatForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const text = msgInput.value.trim();
        if (!text) return;
        addMessage(text, 'me');
        msgInput.value = '';
        await api('/api/chat', { text });
    });
</script>
</body>
</html>`;

app.get('/', (req, res) => {
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
    waitingQueue = waitingQueue.filter(cid => cid !== id);
}

function disconnectPartner(id) {
    const partnerId = pairs.get(id);
    if (partnerId) {
        pairs.delete(id);
        pairs.delete(partnerId);
        pushEvent(partnerId, { type: 'partner_disconnected' });
    }
}

setInterval(() => {
    const now = Date.now();
    for (const [id, u] of users.entries()) {
        if (now - u.lastSeen > 10000) {
            users.delete(id);
            removeFromQueue(id);
            disconnectPartner(id);
        }
    }
}, 4000);

app.post('/api/poll', (req, res) => {
    const { id } = req.body || {};
    if (!id) return res.status(400).end();
    const u = ensureUser(id);
    const events = u.events.splice(0, u.events.length);
    res.json({ online: users.size, events });
});

app.post('/api/find', (req, res) => {
    const { id } = req.body || {};
    if (!id) return res.status(400).end();
    ensureUser(id);
    disconnectPartner(id);
    removeFromQueue(id);

    waitingQueue = waitingQueue.filter(cid => users.has(cid) && cid !== id);

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

app.post('/api/signal', (req, res) => {
    const { id, signal } = req.body || {};
    const partnerId = pairs.get(id);
    if (partnerId && signal) {
        pushEvent(partnerId, { type: 'signal', signal });
    }
    res.json({ ok: true });
});

app.post('/api/chat', (req, res) => {
    const { id, text } = req.body || {};
    const partnerId = pairs.get(id);
    if (partnerId && typeof text === 'string') {
        pushEvent(partnerId, { type: 'chat_message', text: text.slice(0, 500) });
    }
    res.json({ ok: true });
});

app.post('/api/stop', (req, res) => {
    const { id } = req.body || {};
    if (id) {
        removeFromQueue(id);
        disconnectPartner(id);
    }
    res.json({ ok: true });
});

app.post('/api/leave', express.text({ type: '*/*' }), (req, res) => {
    try {
        const { id } = JSON.parse(req.body || '{}');
        if (id) {
            users.delete(id);
            removeFromQueue(id);
            disconnectPartner(id);
        }
    } catch (e) {}
    res.status(204).end();
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log('Likodopt запущен на порту ' + PORT);
});addMessage('Собеседник покинул чат. Нажмите «Далее»', 'sys');
}
}
window.addEventListener('beforeunload', () => {
navigator.sendBeacon('/api/leave', JSON.stringify({ id: myId }));
});
pollLoop();
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
statusEl.textContent = 'Разрешите доступ к микрофону!';
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
if (audioContext) audioContext.close().catch(() => {});
partnerAvatar.classList.remove('speaking');
}
function createPeerConnection() {
peerConnection = new RTCPeerConnection(rtcConfig);
localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
peerConnection.ontrack = (event) => {
const stream = event.streams;
if (stream) {
remoteAudio.srcObject = stream;
remoteAudio.play().catch(() => {});
startVoiceDetector(stream);
}
};
peerConnection.onicecandidate = (event) => {
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
btnNext.addEventListener('click', async () => {
await initAudio();
closeCall();
messagesEl.innerHTML = '';
btnStop.disabled = false;
statusEl.textContent = 'Ищем собеседника...';
await api('/api/find');
});
btnStop.addEventListener('click', async () => {
closeCall();
await api('/api/stop');
btnStop.disabled = true;
statusEl.textContent = 'Поиск остановлен';
addMessage('Вы завершили диалог', 'sys');
});
btnMute.addEventListener('click', () => {
if (!localStream) return;
isMuted = !isMuted;
localStream.getAudioTracks().enabled = !isMuted;
btnMute.textContent = isMuted ? 'Включить микрофон' : 'Выключить микрофон';
btnMute.classList.toggle('muted', isMuted);
});
chatForm.addEventListener('submit', async (e) => {
e.preventDefault();
const text = msgInput.value.trim();
if (!text) return;
addMessage(text, 'me');
msgInput.value = '';
await api('/api/chat', { text });
});


`;
app.get('/', (req, res) => {
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
waitingQueue = waitingQueue.filter(cid => cid !== id);
}
function disconnectPartner(id) {
const partnerId = pairs.get(id);
if (partnerId) {
pairs.delete(id);
pairs.delete(partnerId);
pushEvent(partnerId, { type: 'partner_disconnected' });
}
}
setInterval(() => {
const now = Date.now();
for (const [id, u] of users.entries()) {
if (now - u.lastSeen > 10000) {
users.delete(id);
removeFromQueue(id);
disconnectPartner(id);
}
}
}, 4000);
app.post('/api/poll', (req, res) => {
const { id } = req.body || {};
if (!id) return res.status(400).end();
const u = ensureUser(id);
const events = u.events.splice(0, u.events.length);
res.json({ online: users.size, events });
});
app.post('/api/find', (req, res) => {
const { id } = req.body || {};
if (!id) return res.status(400).end();
ensureUser(id);
disconnectPartner(id);
removeFromQueue(id);
waitingQueue = waitingQueue.filter(cid => users.has(cid) && cid !== id);
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
app.post('/api/signal', (req, res) => {
const { id, signal } = req.body || {};
const partnerId = pairs.get(id);
if (partnerId && signal) {
pushEvent(partnerId, { type: 'signal', signal });
}
res.json({ ok: true });
});
app.post('/api/chat', (req, res) => {
const { id, text } = req.body || {};
const partnerId = pairs.get(id);
if (partnerId && typeof text === 'string') {
pushEvent(partnerId, { type: 'chat_message', text: text.slice(0, 500) });
}
res.json({ ok: true });
});
app.post('/api/stop', (req, res) => {
const { id } = req.body || {};
if (id) {
removeFromQueue(id);
disconnectPartner(id);
}
res.json({ ok: true });
});
app.post('/api/leave', express.text({ type: '/' }), (req, res) => {
try {
const { id } = JSON.parse(req.body || '{}');
if (id) {
users.delete(id);
removeFromQueue(id);
disconnectPartner(id);
}
} catch (e) {}
res.status(204).end();
});
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
console.log('Likodopt запущен на порту ' + PORT);
});
