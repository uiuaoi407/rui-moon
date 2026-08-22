const { Engine, Runner, Bodies, Composite, Events } = Matter;

const container = document.getElementById("game-container");
const scoreEl = document.getElementById("score");
const bestScoreEl = document.getElementById("best-score");
const bgm = document.getElementById("bgm");
const eventSound = document.getElementById("event-sound");
const playCountNumEl = document.getElementById("play-count-num");

// 전 세계 총 플레이 카운트 API 연동 (CounterAPI 활용)
const API_NAMESPACE = "jeongaseo_subak_game_2026";
const API_KEY = "total_plays";

function fetchAndUpdatePlayCount(increment = false) {
    const url = increment 
        ? `https://api.counterapi.dev/v1/${API_NAMESPACE}/${API_KEY}/up`
        : `https://api.counterapi.dev/v1/${API_NAMESPACE}/${API_KEY}`;

    fetch(url)
        .then(response => response.json())
        .then(data => {
            if (playCountNumEl && data && typeof data.count === 'number') {
                playCountNumEl.innerText = data.count.toLocaleString();
            }
        })
        .catch(() => {
            if (playCountNumEl) {
                playCountNumEl.innerText = "1,254+"; 
            }
        });
}

fetchAndUpdatePlayCount(false);

const fruitTypes = [
    { level: 1, radius: 18, score: 2, img: 'subak1.jpg' },  // 1단계: 여우인형
    { level: 2, radius: 25, score: 4, img: 'subak2.jpg' },  // 2단계: 원식재
    { level: 3, radius: 33, score: 8, img: 'subak3.jpg' },  // 3단계: 눈먼여우
    { level: 4, radius: 42, score: 16, img: 'subak4.jpg' }, // 4단계: 만만
    { level: 5, radius: 53, score: 32, img: 'subak5.jpg' }, // 5단계: 기령
    { level: 6, radius: 66, score: 64, img: 'subak6.jpg' }, // 6단계: 적찬
    { level: 7, radius: 82, score: 128, img: 'subak7.jpg' } // 7단계: 용신대인 (최종)
];

let score = 0;
let bestScore = localStorage.getItem('subak_best_score') || 0;
bestScoreEl.innerText = bestScore;

let isGameRunning = false;
let currentDropLevel = 0;
let canDrop = true;
let gameOverTimer = 0;

let eventIndex = 1;
let isEventActive = false;
let eventTimer = null;
let lastBgIndex = -1; // 직전에 나온 배경과 중복되는 것을 방지하기 위한 변수

let engine, runner;
let ballMap = new Map();

// 💡 배경 30장 중 500점마다 랜덤 변경 (직전 배경과 중복 회피 기능 추가!)
function updateBackground() {
    if (isEventActive) return;
    
    // 점수가 500점 오를 때마다 구간 변경 (0~499점: 1구간, 500~999점: 2구간...)
    let currentTier = Math.floor(score / 500);
    
    // 1부터 30까지의 랜덤 번호 뽑기 (직전에 나왔던 배경 번호와 같으면 안 겹치게 다시 뽑기)
    let bgIdx;
    do {
        bgIdx = Math.floor(Math.random() * 30) + 1;
    } while (bgIdx === lastBgIndex && 30 > 1);
    
    lastBgIndex = bgIdx;
    container.style.backgroundImage = `url('배경${bgIdx}.jpg')`;
}

function playBgm() { bgm.pause(); bgm.currentTime = 0; bgm.play().catch(() => {}); }

function firstStartGame() { 
    document.getElementById("start-screen").style.display = "none"; 
    fetchAndUpdatePlayCount(true);
    playBgm(); 
    runGame(); 
}

function restartGame() { 
    document.getElementById("game-over").style.display = "none"; 
    fetchAndUpdatePlayCount(true);
    playBgm(); 
    runGame(); 
}

function initPhysics() {
    if (engine) {
        Runner.stop(runner);
        Engine.clear(engine);
    }

    engine = Engine.create({
        gravity: { x: 0, y: 1.5 },
        positionIterations: 10,
        velocityIterations: 10
    });

    const width = container.clientWidth;
    const height = container.clientHeight;
    const wallOptions = { isStatic: true, restitution: 0, friction: 0.1 };

    const ground = Bodies.rectangle(width / 2, height + 30, width * 2, 60, wallOptions);
    const leftWall = Bodies.rectangle(-30, height / 2, 60, height * 2, wallOptions);
    const rightWall = Bodies.rectangle(width + 30, height / 2, 60, height * 2, wallOptions);

    Composite.add(engine.world, [ground, leftWall, rightWall]);

    runner = Runner.create();
    Runner.run(runner, engine);

    Events.on(engine, 'collisionStart', (event) => {
        if (!isGameRunning) return;
        const pairs = event.pairs;

        for (let pair of pairs) {
            const { bodyA, bodyB } = pair;
            if (bodyA.customLevel && bodyB.customLevel && bodyA.customLevel === bodyB.customLevel) {
                if (bodyA.isMerging || bodyB.isMerging) continue;
                
                bodyA.isMerging = true;
                bodyB.isMerging = true;

                const level = bodyA.customLevel;
                const midX = (bodyA.position.x + bodyB.position.x) / 2;
                const midY = (bodyA.position.y + bodyB.position.y) / 2;

                removeBall(bodyA);
                removeBall(bodyB);

                let oldTier = Math.floor(score / 500);
                score += fruitTypes[level - 1].score * 2;
                let newTier = Math.floor(score / 500);

                scoreEl.innerText = score;

                if (score > bestScore) {
                    bestScore = score;
                    bestScoreEl.innerText = bestScore;
                    localStorage.setItem('subak_best_score', bestScore);
                }

                if (level === 7) {
                    triggerEventCutscene();
                } else if (newTier > oldTier) {
                    // 점수 구간(500점 단위)이 바뀔 때마다 배경 랜덤 갱신!
                    updateBackground();
                }

                if (level < 7) {
                    setTimeout(() => {
                        createBall(midX, midY, fruitTypes[level]);
                    }, 10);
                }
            }
        }
    });

    Events.on(engine, 'afterUpdate', () => {
        if (!isGameRunning) return;

        let isOverflowing = false;
        const bodies = Composite.allBodies(engine.world);

        for (let body of bodies) {
            if (!body.isStatic && ballMap.has(body.id)) {
                const el = ballMap.get(body.id);
                el.style.left = body.position.x + "px";
                el.style.top = body.position.y + "px";

                if (body.position.y - body.circleRadius < 35 && Math.abs(body.velocity.y) < 0.2) {
                    isOverflowing = true;
                }
            }
        }

        if (isOverflowing) {
            gameOverTimer++;
            if (gameOverTimer > 90) {
                isGameRunning = false;
                bgm.pause();
                document.getElementById("final-score").innerText = `최종 점수 : ${score}점`;
                
                const newRecordNotice = document.getElementById("new-record-notice");
                if (score >= bestScore && score > 0) {
                    newRecordNotice.style.display = "block";
                } else {
                    newRecordNotice.style.display = "none";
                }

                document.getElementById("game-over").style.display = "flex";
            }
        } else {
            gameOverTimer = Math.max(0, gameOverTimer - 1);
        }
    });
}

function triggerEventCutscene() {
    isEventActive = true;
    
    container.classList.add("flash-effect");

    eventSound.currentTime = 0;
    eventSound.play().catch(() => {});

    container.style.backgroundImage = `url('event${eventIndex}.jpg')`;

    eventIndex = (eventIndex % 3) + 1;

    if (eventTimer) clearTimeout(eventTimer);

    eventTimer = setTimeout(() => {
        isEventActive = false;
        container.classList.remove("flash-effect");
        updateBackground();
    }, 5000);
}

function runGame() {
    score = 0;
    scoreEl.innerText = "0";
    isEventActive = false;
    container.classList.remove("flash-effect");
    if (eventTimer) clearTimeout(eventTimer);

    updateBackground();
    
    document.querySelectorAll('.fruit-drop').forEach(el => el.remove());
    ballMap.clear();

    initPhysics();
    isGameRunning = true;
    
    currentDropLevel = getRandomDropLevel();

    canDrop = true;
    gameOverTimer = 0;
}

function getRandomDropLevel() {
    const rand = Math.random();
    if (rand < 0.35) return 0; else if (rand < 0.75) return 1; else return 2;
}

container.addEventListener("click", (e) => {
    if (!isGameRunning || !canDrop) return;
    const rect = container.getBoundingClientRect();
    dropBall(e.clientX - rect.left);
});

container.addEventListener("touchend", (e) => {
    if (!isGameRunning || !canDrop) return;
    const rect = container.getBoundingClientRect();
    dropBall(e.changedTouches[0].clientX - rect.left);
    e.preventDefault();
}, {passive: false});

function dropBall(x) {
    canDrop = false;
    
    const type = fruitTypes[currentDropLevel];
    const clampX = Math.max(type.radius, Math.min(x, container.clientWidth - type.radius));
    createBall(clampX, type.radius + 5, type);

    currentDropLevel = getRandomDropLevel();

    setTimeout(() => { canDrop = true; }, 800);
}

function createBall(x, y, type) {
    const body = Bodies.circle(x, y, type.radius, {
        restitution: 0.001, 
        friction: 0.05,     
        frictionAir: 0,     
        slop: 0,             
        density: 0.005
    });

    body.customLevel = type.level;

    const el = document.createElement("div");
    el.className = "fruit-drop";
    el.style.width = (type.radius * 2) + "px";
    el.style.height = (type.radius * 2) + "px";
    el.style.backgroundImage = `url('${type.img}')`;
    container.appendChild(el);

    Composite.add(engine.world, body);
    ballMap.set(body.id, el);
}

function removeBall(body) {
    if (ballMap.has(body.id)) {
        ballMap.get(body.id).remove();
        ballMap.delete(body.id);
    }
    Composite.remove(engine.world, body);
}
