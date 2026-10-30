// --- AUDIO SYNTHESIZER ---
const AudioContextClass = window.AudioContext || window.webkitAudioContext;
let audioCtx = null;

function playHitSound() {
    if (!AudioContextClass) return;
    if (!audioCtx) audioCtx = new AudioContextClass();

    const playTone = () => {
        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();

        oscillator.type = 'square';
        oscillator.frequency.setValueAtTime(800, audioCtx.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(100, audioCtx.currentTime + 0.1);

        gainNode.gain.setValueAtTime(0.5, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);

        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);

        oscillator.start();
        oscillator.stop(audioCtx.currentTime + 0.1);
    };

    if (audioCtx.state === 'suspended') {
        audioCtx.resume().then(playTone).catch(() => {});
    } else {
        playTone();
    }
}
// --------------------------

const arena = document.getElementById('arena');
const gameScreen = document.getElementById('game-screen');
const gameStatus = document.getElementById('game-status');
const scoreDisplay = document.getElementById('score');
const timerDisplay = document.getElementById('timer');
const startBtn = document.getElementById('start-btn');
const highScoreList = document.getElementById('high-score-list');
const closeModalBtn = document.getElementById('close-modal');
const nameModal = document.getElementById('name-modal');
const playerNameInput = document.getElementById('player-name');
const saveScoreBtn = document.getElementById('save-score-btn');
const finalScoreDisplay = document.getElementById('final-score-display');
const finalDiffDisplay = document.getElementById('final-diff-display');

let isMobileDevice = window.matchMedia('(max-width: 768px), (pointer: coarse)').matches;
window.addEventListener('resize', () => {
    isMobileDevice = window.matchMedia('(max-width: 768px), (pointer: coarse)').matches;
});

const diffButtons = document.querySelectorAll('.diff-btn');
const tabButtons = document.querySelectorAll('.tab-btn');

let targetMoveInterval;
let score = 0;
let timeLeft = 30;
let gameInterval;
let isGameRunning = false;
let pendingScore = 0;
let currentPlayDifficulty = 'easy';
let currentViewDifficulty = 'easy';

// Use the local Express server during development and Render for the live site.
const isLocalHost = ['localhost', '127.0.0.1'].includes(window.location.hostname);
const API_URL = isLocalHost
    ? '/api/scores'
    : 'https://aim-trainer-backend-jijv.onrender.com/api/scores';

// Fetch the global leaderboard immediately when the page loads
updateLeaderboard();

diffButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
        diffButtons.forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        currentPlayDifficulty = e.target.getAttribute('data-diff');
        document.querySelector(`.tab-btn[data-tab="${currentPlayDifficulty}"]`).click();
    });
});

tabButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
        tabButtons.forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        currentViewDifficulty = e.target.getAttribute('data-tab');
        updateLeaderboard();
    });
});

async function startGame() {
    gameStatus.hidden = true;
    isGameRunning = true;
    startBtn.disabled = true;
    diffButtons.forEach(button => {
        button.disabled = true;
    });

    if (gameScreen.requestFullscreen) {
        try {
            await gameScreen.requestFullscreen();
        } catch (error) {
            console.error('Could not enter fullscreen:', error);
            gameStatus.textContent = 'Fullscreen is unavailable; this drill is running in a window.';
            gameStatus.hidden = false;
        }
    } else {
        gameStatus.textContent = 'Fullscreen is not supported by this browser; this drill is running in a window.';
        gameStatus.hidden = false;
    }

    if (!isGameRunning) return;

    score = 0;
    timeLeft = 30;
    scoreDisplay.textContent = score;
    timerDisplay.textContent = timeLeft;
    arena.innerHTML = '';
    
    spawnTarget();
    
    gameInterval = setInterval(() => {
        timeLeft--;
        timerDisplay.textContent = timeLeft;
        if (timeLeft <= 0) {
            endGame();
        }
    }, 1000);
}

document.addEventListener('fullscreenchange', () => {
    if (isGameRunning && document.fullscreenElement !== gameScreen) {
        cancelGame();
    }
});

function cancelGame() {
    isGameRunning = false;
    clearInterval(gameInterval);
    clearInterval(targetMoveInterval);
    arena.innerHTML = '';
    startBtn.disabled = false;
    startBtn.textContent = 'Start Drill';
    diffButtons.forEach(button => {
        button.disabled = false;
    });
    gameStatus.textContent = 'Drill canceled because fullscreen was exited. Your score was not saved.';
    gameStatus.hidden = false;
}

function spawnTarget() {
    const target = document.createElement('div');
    target.classList.add('target');

    let size = isMobileDevice ? 56 : 40;
    let moveSpeed = 0;

    if (currentPlayDifficulty === 'easy') {
        size = isMobileDevice ? 62 : 50;
    } else if (currentPlayDifficulty === 'medium') {
        size = isMobileDevice ? 52 : 40;
        moveSpeed = 800;
    } else if (currentPlayDifficulty === 'hard') {
        size = isMobileDevice ? 38 : 25;
        moveSpeed = 500;
    }

    target.style.width = size + 'px';
    target.style.height = size + 'px';

    function moveTarget() {
        const maxX = Math.max(0, arena.clientWidth - size);
        const maxY = Math.max(0, arena.clientHeight - size);
        target.style.left = Math.floor(Math.random() * maxX) + 'px';
        target.style.top = Math.floor(Math.random() * maxY) + 'px';
    }

    moveTarget();
    if (moveSpeed > 0) targetMoveInterval = setInterval(moveTarget, moveSpeed);

    const handleTargetHit = () => {
        score++;
        scoreDisplay.textContent = score;
        playHitSound();
        clearInterval(targetMoveInterval);
        target.remove();
        spawnTarget();
    };

    target.addEventListener('pointerdown', handleTargetHit);

    arena.appendChild(target);
}

async function endGame() {
    isGameRunning = false;
    clearInterval(gameInterval);
    clearInterval(targetMoveInterval);
    arena.innerHTML = '';
    startBtn.disabled = false;
    startBtn.textContent = 'Play Again';
    diffButtons.forEach(button => {
        button.disabled = false;
    });

    if (document.fullscreenElement === gameScreen) {
        try {
            await document.exitFullscreen();
        } catch (error) {
            console.error('Could not exit fullscreen:', error);
            gameStatus.textContent = 'Drill complete. Press Esc to leave fullscreen.';
            gameStatus.hidden = false;
        }
    }

    checkHighScore(score);
}

// NEW: Checks the database to see if your score makes the top 5
async function checkHighScore(finalScore) {
    try {
        const response = await fetch(`${API_URL}/${currentPlayDifficulty}`);
        if (!response.ok) {
            throw new Error(`Backend returned HTTP ${response.status}`);
        }
        const topScores = await response.json();
        if (!Array.isArray(topScores)) {
            throw new Error('Backend returned an invalid scores response');
        }

        const lowestScore = topScores.length < 5 ? 0 : topScores[topScores.length - 1].score;

        if (finalScore > lowestScore || topScores.length < 5) {
            pendingScore = finalScore;
            finalScoreDisplay.textContent = finalScore;
            finalDiffDisplay.textContent = currentPlayDifficulty.toUpperCase();
            nameModal.classList.remove('hidden');
            playerNameInput.focus();
        } else {
            alert(`Time's up! Final Score: ${finalScore}. Keep practicing to hit the Global Top 5!`);
        }
    } catch (error) {
        console.error("Error connecting to database:", error);
        alert(`Time's up! Final Score: ${finalScore}. (Cannot connect to global server)`);
    }
}

// NEW: Saves the score to your MongoDB database
saveScoreBtn.addEventListener('click', async () => {
    const nameToSave = playerNameInput.value.trim() || 'Unknown';
    
    saveScoreBtn.disabled = true;
    saveScoreBtn.textContent = "Saving to Cloud...";

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: nameToSave,
                score: pendingScore,
                difficulty: currentPlayDifficulty
            })
        });
        if (!response.ok) {
            throw new Error(`Backend returned HTTP ${response.status}`);
        }
        
        await updateLeaderboard();
        nameModal.classList.add('hidden');
        playerNameInput.value = '';
    } catch (error) {
        console.error("Failed to save score:", error);
        alert("Could not save your score. Check that the backend and database are connected, then try again.");
    } finally {
        saveScoreBtn.disabled = false;
        saveScoreBtn.textContent = "Save Score";
    }
});

// NEW: Pulls the newest scores from the database and updates the screen
async function updateLeaderboard() {
    highScoreList.innerHTML = '<li style="justify-content: center; color: #555;">Loading global scores...</li>';

    try {
        const response = await fetch(`${API_URL}/${currentViewDifficulty}`);
        if (!response.ok) {
            throw new Error(`Backend returned HTTP ${response.status}`);
        }
        const topScores = await response.json();
        if (!Array.isArray(topScores)) {
            throw new Error('Backend returned an invalid scores response');
        }

        highScoreList.innerHTML = '';

        if (topScores.length === 0) {
            highScoreList.innerHTML = '<li style="justify-content: center; color: #555;">No records yet. Be the first!</li>';
            return;
        }

        topScores.forEach(entry => {
            const li = document.createElement('li');
            
            const nameSpan = document.createElement('span');
            nameSpan.classList.add('score-name');
            nameSpan.textContent = entry.name;

            const scoreSpan = document.createElement('span');
            scoreSpan.classList.add('score-value');
            scoreSpan.textContent = entry.score;

            li.appendChild(nameSpan);
            li.appendChild(scoreSpan);
            highScoreList.appendChild(li);
        });
    } catch (error) {
        console.error("Failed to load leaderboard:", error);
        highScoreList.innerHTML = '<li style="justify-content: center; color: #ff3366;">Cannot connect to backend server.</li>';
    }
}

closeModalBtn.addEventListener('click', () => {
    nameModal.classList.add('hidden');
    playerNameInput.value = '';
});

startBtn.addEventListener('click', startGame);