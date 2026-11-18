const express = require('express');
const path = require('path');

const app = express();
app.use(express.static(__dirname));
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            background: #0f1115 url('/bg.png') no-repeat center center fixed;
            background-size: cover;
            color: #fff;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            padding: 15px;
        }
        .app {
            background: rgba(24, 27, 34, 0.85);
            backdrop-filter: blur(8px);
            width: 100%;
            max-width: 460px;
            border-radius: 20px;
            padding: 25px;
            box-shadow: 0 12px 40px rgba(0,0,0,0.6);
            border: 1px solid rgba(255, 255, 255, 0.1);
        }

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

app.get('/api/poll', (req, res) => {
    const id = req.query.id;
    if (!id) return res.status(400).end();
    const u = ensureUser(id);
    const events = u.events.splice(0, u.events.length);
    res.json({ online: users.size, events });
});

app.get('/api/find', (req, res) => {
    const id = req.query.id;
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

app.post('/api/signal', express.json(), (req, res) => {
    const { id, signal } = req.body || {};
    const partnerId = pairs.get(id);
    if (partnerId && signal) pushEvent(partnerId, { type: 'signal', signal });
    res.json({ ok: true });
});

app.get('/api/chat', (req, res) => {
    const { id, text } = req.query;
    const partnerId = pairs.get(id);
    if (partnerId && typeof text === 'string') {
        pushEvent(partnerId, { type: 'chat_message', text: text.slice(0, 500) });
    }
    res.json({ ok: true });
});

app.get('/api/stop', (req, res) => {
    const id = req.query.id;
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
