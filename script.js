const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbz0V9cbX5Y-_23GhuX0G52Cy3ND0XJbym7MattNAMPJ8H6_VU9TdZGVTdBz65tm-4KX/exec';

// --- DOM Elements ---
const nameModal = document.getElementById('name-modal');
const nameInput = document.getElementById('name-input');
const passwordInput = document.getElementById('password-input');
const startButton = document.getElementById('start-button');
const gameContainer = document.getElementById('game-container');
const userNameDisplay = document.getElementById('user-name');
const userPointsDisplay = document.getElementById('user-points');
const betAmountInput = document.getElementById('bet-amount');
const riskOptionButtons = document.querySelectorAll('.risk-option');
const spinButton = document.getElementById('spin-button');
const resultDisplay = document.getElementById('result-display');
const begButton = document.getElementById('beg-button');
const rankingBody = document.getElementById('ranking-body');

// --- Game State ---
let currentUser = null;
let selectedRisk = null;

// --- Event Listeners ---
document.addEventListener('DOMContentLoaded', init);
startButton.addEventListener('click', handleAuth);
spinButton.addEventListener('click', playGame);
begButton.addEventListener('click', handleBeg);

riskOptionButtons.forEach(button => {
    button.addEventListener('click', () => {
        selectedRisk = button.dataset.risk;
        riskOptionButtons.forEach(btn => btn.classList.remove('selected'));
        button.classList.add('selected');
        validateBet();
    });
});

betAmountInput.addEventListener('input', validateBet);

// --- Initialization ---
function init() {
    nameModal.style.display = 'flex';
    gameContainer.classList.add('hidden');
    // Fetch initial ranking on load
    updateRanking(); 
    setInterval(updateRanking, 15000); // Refresh ranking every 15 seconds
}

// --- API Communication ---
async function postData(action, payload) {
    showSpinner(true);
    try {
        const response = await fetch(GOOGLE_SCRIPT_URL, {
            method: 'POST',
            mode: 'cors',
            cache: 'no-cache',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({ action, payload }),
            redirect: 'follow'
        });
        const result = await response.json();
        showSpinner(false);
        return result;
    } catch (error) {
        console.error('Error communicating with Google Script:', error);
        alert('서버와 통신 중 오류가 발생했습니다.');
        showSpinner(false);
        return { success: false, error: error.message };
    }
}

// --- Authentication ---
async function handleAuth() {
    const name = nameInput.value.trim();
    const password = passwordInput.value.trim();

    if (!name || name.length < 2) {
        alert('이름은 2자 이상 입력해주세요.');
        return;
    }
    if (!password.match(/^\d{4}$/)) {
        alert('비밀번호는 숫자 4자리를 입력해주세요.');
        return;
    }

    const response = await postData('handleAuth', { name, password });

    if (response.success) {
        currentUser = response.data;
        const message = response.isNewUser 
            ? '새로운 도전을 환영합니다! 10,000p를 가지고 시작합니다.' 
            : `'${name}'님, 다시 오신 것을 환영합니다!`;
        alert(message);
        showGameScreen();
        updateUI();
        updateRanking();
    } else {
        alert(response.error || '인증에 실패했습니다.');
    }
}

function showGameScreen() {
    nameModal.style.display = 'none';
    gameContainer.classList.remove('hidden');
}

// --- Game Logic ---
function validateBet() {
    if (!currentUser) return;
    const betAmount = parseInt(betAmountInput.value, 10);
    spinButton.disabled = !(betAmount > 0 && betAmount <= currentUser.points && selectedRisk);
}

async function playGame() {
    const betAmount = parseInt(betAmountInput.value, 10);
    if (betAmount <= 0 || betAmount > currentUser.points || !selectedRisk) return;

    spinButton.disabled = true;

    let min, max;
    switch (selectedRisk) {
        case 'low': min = 0.7; max = 1.3; break;
        case 'medium': min = 0.5; max = 1.5; break;
        case 'high': min = 0.0; max = 2.0; break;
    }

    const rewardMultiplier = Math.random() * (max - min) + min;
    const reward = Math.ceil(betAmount * rewardMultiplier);
    const pointChange = reward - betAmount;
    
    currentUser.points += pointChange;

    // Bonus Round! 10% chance for 3000p
    if (Math.random() < 0.1) {
        const bonusPoints = 3000;
        currentUser.points += bonusPoints;
        setTimeout(() => {
            alert('🎉 보너스 당첨! 3,000p를 추가로 획득했습니다!');
        }, 300); // Show alert after effects
    }

    const logEntry = {
        name: currentUser.name,
        bet: betAmount,
        risk: selectedRisk,
        reward: reward,
        finalPoints: currentUser.points,
    };

    const response = await postData('logGameAndUpdate', { user: currentUser, log: logEntry });

    if (response.success) {
        triggerEffects(rewardMultiplier);
        displayResult(reward, pointChange);
        updateUI();
        updateRanking();
    } else {
        alert('게임 결과를 저장하는 데 실패했습니다. 페이지를 새로고침 해주세요.');
        currentUser.points -= pointChange; // Revert points on failure
    }
}

async function handleBeg() {
    if (currentUser.points < 5000 && !currentUser.hasBegged) {
        const pityPoints = Math.ceil(Math.random() * 1000);
        currentUser.points += pityPoints;
        currentUser.hasBegged = true;

        alert(`${pityPoints}p를 획득했습니다!`);

        // Use the same endpoint to update user data. Create a "beg" log entry.
        const logEntry = {
            name: currentUser.name, bet: 0, risk: 'beg',
            reward: pityPoints, finalPoints: currentUser.points
        };
        await postData('logGameAndUpdate', { user: currentUser, log: logEntry });
        
        updateUI();
        updateRanking();
    }
}

// --- UI & Effects ---
async function updateRanking() {
    const response = await postData('getRanking');
    if (response && response.success) {
        rankingBody.innerHTML = '';
        response.data.forEach((user, index) => {
            const rank = index + 1;
            const tr = document.createElement('tr');

            const rankTd = document.createElement('td');
            rankTd.textContent = rank;
            if (rank <= 3) rankTd.classList.add(`rank-${rank}`);

            const nameTd = document.createElement('td');
            nameTd.textContent = user.name;

            const pointsTd = document.createElement('td');
            pointsTd.textContent = `${Math.floor(user.points).toLocaleString()}p`;

            const gamesPlayedTd = document.createElement('td');
            gamesPlayedTd.textContent = user.gamesPlayed;

            tr.append(rankTd, nameTd, pointsTd, gamesPlayedTd);
            rankingBody.appendChild(tr);
        });
    }
}

function updateUI() {
    if (!currentUser) return;
    userNameDisplay.textContent = currentUser.name;
    userPointsDisplay.textContent = Math.floor(currentUser.points).toLocaleString();
    betAmountInput.max = currentUser.points;
    validateBet();
    begButton.classList.toggle('hidden', !(currentUser.points < 5000 && !currentUser.hasBegged));
}

function displayResult(reward, pointChange) {
    const sign = pointChange >= 0 ? '+' : '';
    resultDisplay.textContent = `획득: ${reward.toLocaleString()}p (${sign}${pointChange.toLocaleString()}p)`;
    
    resultDisplay.classList.remove('win', 'lose');
    void resultDisplay.offsetWidth; // Force reflow for animation restart

    resultDisplay.classList.add(pointChange >= 0 ? 'win' : 'lose');
    resultDisplay.style.color = pointChange >= 0 ? 'var(--success-color)' : 'var(--fail-color)';
}

function triggerEffects(multiplier) {
    setTimeout(() => {
        if (multiplier > 1.5) confetti({ particleCount: 200, spread: 100, origin: { y: 0.6 } });
        else if (multiplier > 1) confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
    }, 200);
}

function showSpinner(show) {
    startButton.disabled = show;
    startButton.textContent = show ? '처리 중...' : '시작 또는 로그인';
} 