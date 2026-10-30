const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');

const app = express();
const PORT = process.env.PORT || 3000;
const ALLOWED_DIFFICULTIES = ['easy', 'medium', 'hard'];
const MAX_SCORE_PER_ROUND = 300;
const allowedOrigins = [
    'https://lokeshmajeti.github.io',
    'http://localhost:3000',
    'http://127.0.0.1:3000'
];

app.use(cors({ origin: allowedOrigins, methods: ['GET', 'POST'], allowedHeaders: ['Content-Type'] }));
app.use(express.json({ limit: '10kb' }));

const postRateLimit = new Map();
const duplicateScoreCache = new Map();
app.use('/api/scores', (req, res, next) => {
    if (req.method !== 'POST') return next();

    const key = req.ip || 'unknown';
    const now = Date.now();
    const entry = postRateLimit.get(key);

    if (!entry || now - entry.startedAt >= 60_000) {
        postRateLimit.set(key, { startedAt: now, count: 1 });
        return next();
    }

    if (entry.count >= 10) {
        res.set('Retry-After', '60');
        return res.status(429).json({ error: 'Too many score submissions' });
    }

    entry.count++;
    next();
});

app.use(express.static(path.join(__dirname, '..', 'frontend')));

app.get('/api/health', (req, res) => {
    const databaseConnected = mongoose.connection.readyState === 1;
    res.status(databaseConnected ? 200 : 503).json({
        status: databaseConnected ? 'ok' : 'unavailable',
        database: databaseConnected ? 'connected' : 'disconnected'
    });
});

// --- DATABASE SCHEMA ---
const scoreSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true,
        minlength: 1,
        maxlength: 12
    },
    score: {
        type: Number,
        required: true,
        integer: true,
        min: 0,
        max: MAX_SCORE_PER_ROUND
    },
    difficulty: {
        type: String,
        required: true,
        enum: ALLOWED_DIFFICULTIES
    }
});
const Score = mongoose.model('Score', scoreSchema);

function requireDatabase(req, res) {
    if (mongoose.connection.readyState !== 1) {
        res.status(503).json({ error: 'Database is unavailable' });
        return false;
    }
    return true;
}

let httpServer;

function startHttpServer() {
    if (httpServer) return httpServer;

    httpServer = app.listen(PORT, () => {
        console.log(`Backend server is running on http://localhost:${PORT}`);
    });
    return httpServer;
}

// --- API ROUTES ---
app.get('/api/scores/:difficulty', async (req, res) => {
    if (!ALLOWED_DIFFICULTIES.includes(req.params.difficulty)) {
        return res.status(400).json({ error: 'Invalid difficulty' });
    }
    if (!requireDatabase(req, res)) return;

    try {
        const topScores = await Score.find({ difficulty: req.params.difficulty })
                                     .sort({ score: -1 })
                                     .limit(5);
        res.json(topScores);
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch scores" });
    }
});

app.post('/api/scores', async (req, res) => {
    const { name, score, difficulty } = req.body ?? {};
    const playerName = typeof name === 'string' ? name.trim() : '';

    if (!playerName || playerName.length > 12) {
        return res.status(400).json({ error: 'Name must be between 1 and 12 characters' });
    }
    if (!Number.isSafeInteger(score) || score < 0 || score > MAX_SCORE_PER_ROUND) {
        return res.status(400).json({ error: `Score must be an integer between 0 and ${MAX_SCORE_PER_ROUND}` });
    }
    if (!ALLOWED_DIFFICULTIES.includes(difficulty)) {
        return res.status(400).json({ error: 'Invalid difficulty' });
    }
    if (!requireDatabase(req, res)) return;

    const duplicateKey = `${req.ip}|${playerName}|${score}|${difficulty}`;
    const duplicateTime = duplicateScoreCache.get(duplicateKey);
    const now = Date.now();
    if (duplicateTime && now - duplicateTime < 30_000) {
        return res.status(200).json({ saved: false, message: 'Duplicate score submission ignored' });
    }

    try {
        const currentScores = await Score.find({ difficulty }).sort({ score: -1 }).limit(5);
        const lowestScore = currentScores.length < 5 ? null : currentScores[currentScores.length - 1].score;
        if (lowestScore !== null && score <= lowestScore) {
            return res.status(200).json({ saved: false, message: 'Score does not qualify for the top five' });
        }

        const newScore = new Score({ name: playerName, score, difficulty });
        await newScore.save();
        duplicateScoreCache.set(duplicateKey, now);
        res.json({ saved: true, message: 'Score saved globally!' });
    } catch (err) {
        res.status(500).json({ error: "Failed to save score" });
    }
});

async function startServer() {
    startHttpServer();

    if (!process.env.MONGO_URI) {
        console.error("MONGO_URI is missing. The API is running, but database features are unavailable.");
        return;
    }

    try {
        await mongoose.connect(process.env.MONGO_URI, {
            family: 4,
            serverSelectionTimeoutMS: 5000
        });
        console.log("Connected to Global Database!");
    } catch (error) {
        console.error(`Database connection failed: ${error.message}`);
        console.error("The API is running, but database features are unavailable.");
    }
}

if (require.main === module) {
    startServer().catch(error => {
        console.error("Server startup failed:", error.message);
        process.exitCode = 1;
    });
}

module.exports = { app, startServer };
