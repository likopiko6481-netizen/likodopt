const express = require('express');
const path = require('path');

const app = express();
app.use(express.json());

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
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
    const id = req.body && req.body.id;
    if (!id) return res.status(400).end();
    const u = ensureUser(id);
    const events = u.events.splice(0, u.events.length);
    res.json({ online: users.size, events });
});

app.post('/api/find', (req, res) => {
    const id = req.body && req.body.id;
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
    if (partnerId && signal) pushEvent(partnerId, { type: 'signal', signal });
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log('Likodopt запущен на порту ' + PORT);
});
