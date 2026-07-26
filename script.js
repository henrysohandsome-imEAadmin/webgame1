const playDemo = document.getElementById('playDemo');
const modal = document.getElementById('modal');
const closeModal = document.getElementById('closeModal');
const canvas = document.getElementById('gameCanvas');
let ctx = null;
if (canvas && typeof canvas.getContext === 'function') ctx = canvas.getContext('2d');
let running = false;
// expose a debugging handle so callers can inspect running state from DevTools
Object.defineProperty(window, 'arcadeRunning', {
  get() { return running; }
});
// simple input map
let keys = {};

// game state (player, bullets, enemies, HUD)
let state = 'menu'; // menu, playing, stageComplete, gameover
let score = 0;
let lives = 3;
let stage = 1;

const hudScore = document.getElementById('score');
const hudLives = document.getElementById('lives');
const hudStage = document.getElementById('stage');
const overlay = document.getElementById('overlay');
const menuPane = document.getElementById('menu');
const startBtn = document.getElementById('startBtn');
const gameOverPane = document.getElementById('gameOver');
const gameOverTitle = document.getElementById('gameOverTitle');
const gameOverScore = document.getElementById('gameOverScore');
const restartBtn = document.getElementById('restartBtn');
const stageCompletePane = document.getElementById('stageComplete');
const nextStageBtn = document.getElementById('nextStageBtn');

const player = {w:80,h:20,x:0,y:0,speed:260,cooldown:0};
let bullets = [];
let enemies = [];
let lastSpawn = 0;

function openModal(){modal.classList.remove('hidden'); showMenu(); fitCanvas();}
function closeModalFn(){modal.classList.add('hidden'); stopDemo();}

playDemo.addEventListener('click', openModal);
closeModal.addEventListener('click', closeModalFn);
document.querySelectorAll('.launch').forEach(b=>b.addEventListener('click', openModal));

window.addEventListener('keydown', e=>{ keys[e.key]=true; keys[e.code]=true; });
window.addEventListener('keyup', e=>{ keys[e.key]=false; keys[e.code]=false; });

function update(dt){
  if (state !== 'playing') return;
  player.cooldown = Math.max(0, player.cooldown - dt);
  let dx = 0;
  if(keys['ArrowLeft']) dx = -player.speed;
  if(keys['ArrowRight']) dx = player.speed;
  player.x += dx * dt;
  player.x = Math.max(0, Math.min(canvas.width - player.w, player.x));

  // shooting
  if ((keys[' '] || keys['Space']) && player.cooldown <= 0) {
    bullets.push({x: player.x + player.w/2 - 4, y: player.y - 12, w:8, h:12, dy:-420});
    player.cooldown = 0.28;
  }

  bullets.forEach(b=> b.y += b.dy * dt);
  bullets = bullets.filter(b => b.y + b.h > 0);

  enemies.forEach(en => en.y += en.dy * dt);
  enemies.forEach(en => { if (!en.entered && en.y > 0) en.entered = true; });
  let missed = enemies.filter(e => e.entered && e.y > canvas.height + 20);
  if (missed.length) missed.forEach(() => loseLife());
  enemies = enemies.filter(e => e.y <= canvas.height + 20 && !e.dead);

  bullets.forEach(b => {
    enemies.forEach(en => {
      if (!en.dead && rectsOverlap(b, en)){
        en.dead = true;
        b._hit = true;
        score += 10;
      }
    });
  });
  bullets = bullets.filter(b => !b._hit);

  enemies.forEach(en => {
    if (!en.dead && rectsOverlap(en, player)){
      en.dead = true;
      loseLife();
    }
  });

  lastSpawn += dt;
  const spawnInterval = Math.max(0.6 - stage*0.05, 0.35);
  if (lastSpawn > spawnInterval && enemies.length < stage * 6) {
    spawnEnemy();
    lastSpawn = 0;
  }

  if (enemies.length === 0 && score >= stage * 100) {
    if (stage >= 3) {
      gameOver(true);
    } else {
      state = 'stageComplete';
      showStageComplete();
      stopDemo();
    }
  }
}

function draw(){
  if (!ctx) return;
  ctx.clearRect(0,0,canvas.width,canvas.height);
  for(let i=0;i<80;i++){
    ctx.fillStyle = i%7===0?'#ffb86b':'#9fb0ff';
    ctx.fillRect((i*77)%canvas.width, (i*31)%canvas.height, 2,2);
  }
  ctx.fillStyle = '#ff6b6b';
  ctx.fillRect(player.x, player.y, player.w, player.h);
  ctx.fillStyle = '#ffdcb1';
  bullets.forEach(b => ctx.fillRect(b.x, b.y, b.w, b.h));
  ctx.fillStyle = '#9ff2a6';
  enemies.forEach(en => { if (!en.dead) ctx.fillRect(en.x, en.y, en.w, en.h); });
  ctx.fillStyle = '#dbe9ff';
  ctx.font = '14px sans-serif';
  ctx.fillText(`Score: ${score}`, 10, canvas.height - 10);
}

let lastTime=0;
function loop(ts){
  if(!running) return;
  try {
    const dt = Math.min(0.05,(ts-lastTime)/1000);
    update(dt);
    draw();
    lastTime = ts;
    requestAnimationFrame(loop);
  } catch (err) {
    console.error('Game loop error:', err);
    running = false;
  }
}

function startDemo(){
  if(running) return;
  // ensure we have a valid rendering context before starting
  if (!ctx && canvas && typeof canvas.getContext === 'function') ctx = canvas.getContext('2d');
  if (!ctx) {
    console.error('Cannot start demo: 2D canvas context is unavailable');
    return;
  }
  // initialize gameplay state
  bullets = [];
  enemies = [];
  lastSpawn = 0;
  player.x = Math.floor((canvas.width - player.w) / 2);
  player.y = canvas.height - player.h - 18;
  updateHUD();
  if (overlay) overlay.classList.add('hidden');

  // expose debug object
  window.game = {
    get score(){return score},
    get lives(){return lives},
    get stage(){return stage},
    get enemies(){return enemies},
    get bullets(){return bullets},
    get player(){return player}
  };

  running = true;
  lastTime = performance.now();
  requestAnimationFrame(loop);
}
function stopDemo(){running=false}

// resize canvas to be responsive
function fitCanvas(){
  const ratio = 16/9;
  const maxW = Math.min(window.innerWidth - 80, 1000);
  canvas.width = Math.floor(Math.min(800, maxW));
  canvas.height = Math.floor(canvas.width / ratio);
}
window.addEventListener('resize', fitCanvas);
fitCanvas();

// helpers
function rectsOverlap(a,b){
  return a.x < b.x + b.w && a.x + (a.w||0) > b.x && a.y < b.y + b.h && a.y + (a.h||0) > b.y;
}

function spawnEnemy(){
  const w = 40; const h = 24;
  const x = Math.random() * (canvas.width - w);
  const y = -20 - Math.random()*60;
  const dy = 40 + 20*stage + Math.random()*40;
  enemies.push({x,y,w,h,dy,dead:false,entered:false});
}

function loseLife(){
  lives = Math.max(0, lives-1);
  updateHUD();
  if (lives <= 0) gameOver(false);
}

function updateHUD(){
  if (hudScore) hudScore.textContent = `Score: ${score}`;
  if (hudLives) hudLives.textContent = `Lives: ${lives}`;
  if (hudStage) hudStage.textContent = `Stage: ${stage}`;
}

function gameOver(victory){
  state = 'gameover';
  stopDemo();
  menuPane.classList.add('hidden');
  stageCompletePane.classList.add('hidden');
  gameOverPane.classList.remove('hidden');
  gameOverTitle.textContent = victory ? 'You Win!' : 'Game Over';
  gameOverScore.textContent = `Score: ${score}`;
  overlay.classList.remove('hidden');
}

function showMenu(){
  state = 'menu';
  overlay.classList.remove('hidden');
  menuPane.classList.remove('hidden');
  gameOverPane.classList.add('hidden');
  stageCompletePane.classList.add('hidden');
}

function showStageComplete(){
  overlay.classList.remove('hidden');
  menuPane.classList.add('hidden');
  gameOverPane.classList.add('hidden');
  stageCompletePane.classList.remove('hidden');
  updateHUD();
}

// UI hooks (only wire if elements exist)
if (startBtn) startBtn.addEventListener('click', ()=>{
  overlay.classList.add('hidden');
  state = 'playing';
  score = 0; lives = 3; stage = 1; updateHUD();
  startDemo();
});
if (nextStageBtn) nextStageBtn.addEventListener('click', ()=>{
  stage = Math.min(3, stage+1);
  state = 'playing';
  overlay.classList.add('hidden');
  updateHUD();
  startDemo();
});
if (restartBtn) restartBtn.addEventListener('click', ()=>{
  score = 0; lives = 3; stage = 1; updateHUD();
  overlay.classList.add('hidden');
  state = 'playing';
  startDemo();
});

// update HUD initially
updateHUD();