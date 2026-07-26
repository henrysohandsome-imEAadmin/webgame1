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
const nextStageInfo = document.getElementById('nextStageInfo');

const player = {w:80,h:20,x:0,y:0,speed:260,cooldown:0};
let bullets = [];
let enemies = [];
let lastSpawn = 0;
let particles = [];
let stars = [];
let timeTick = 0;
let muzzleFlash = 0;

function openModal(){modal.classList.remove('hidden'); showMenu(); fitCanvas();}
function closeModalFn(){modal.classList.add('hidden'); stopDemo();}

playDemo.addEventListener('click', openModal);
closeModal.addEventListener('click', closeModalFn);
document.querySelectorAll('.launch').forEach(b=>b.addEventListener('click', openModal));

window.addEventListener('keydown', e=>{ keys[e.key]=true; keys[e.code]=true; });
window.addEventListener('keyup', e=>{ keys[e.key]=false; keys[e.code]=false; });

function update(dt){
  if (state !== 'playing') return;
  timeTick += dt;
  player.cooldown = Math.max(0, player.cooldown - dt);
  muzzleFlash = Math.max(0, muzzleFlash - dt * 4);
  let dx = 0;
  if(keys['ArrowLeft']) dx = -player.speed;
  if(keys['ArrowRight']) dx = player.speed;
  player.x += dx * dt;
  player.x = Math.max(0, Math.min(canvas.width - player.w, player.x));

  // shooting
  if ((keys[' '] || keys['Space']) && player.cooldown <= 0) {
    bullets.push({x: player.x + player.w/2 - 4, y: player.y - 12, w:8, h:12, dy:-420});
    player.cooldown = 0.28;
    muzzleFlash = 1;
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
        createExplosion(en.x + en.w/2, en.y + en.h/2, '#9ff2a6');
      }
    });
  });
  bullets = bullets.filter(b => !b._hit);

  enemies.forEach(en => {
    if (!en.dead && rectsOverlap(en, player)){
      en.dead = true;
      createExplosion(player.x + player.w/2, player.y + player.h/2, '#ff6b6b');
      loseLife();
    }
  });

  particles.forEach(p => {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.life -= dt;
    p.vy += 90 * dt;
  });
  particles = particles.filter(p => p.life > 0);

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
  drawStarfield();

  // draw player ship (with bobbing)
  const bob = Math.sin(timeTick * 8) * 1.5;
  const px = player.x;
  const py = player.y + bob;
  ctx.fillStyle = '#ff6b6b';
  ctx.beginPath();
  ctx.moveTo(px + player.w * 0.5, py);
  ctx.lineTo(px + player.w * 0.92, py + player.h);
  ctx.lineTo(px + player.w * 0.08, py + player.h);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#ffd8d8';
  ctx.fillRect(px + player.w * 0.45, py + player.h * 0.2, player.w * 0.1, player.h * 0.7);
  if (muzzleFlash > 0) {
    ctx.fillStyle = `rgba(255, 210, 125, ${0.35 + muzzleFlash * 0.45})`;
    ctx.beginPath();
    ctx.arc(px + player.w * 0.5, py - 4, 8 + muzzleFlash * 8, 0, Math.PI * 2);
    ctx.fill();
  }

  // bullets with glow
  bullets.forEach(b => {
    ctx.fillStyle = '#ffdcb1';
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = 'rgba(255, 220, 177, 0.35)';
    ctx.fillRect(b.x - 2, b.y + b.h, b.w + 4, 8);
  });

  // enemies with pulsing eye
  enemies.forEach(en => {
    if (!en.dead) {
      const wobble = Math.sin(timeTick * en.wobbleSpeed + en.phase) * 6;
      const ex = en.x + wobble;
      ctx.fillStyle = '#9ff2a6';
      ctx.fillRect(ex, en.y, en.w, en.h);
      ctx.fillStyle = '#11341b';
      ctx.fillRect(ex + 8, en.y + 8, 7, 7);
      ctx.fillRect(ex + en.w - 15, en.y + 8, 7, 7);
      ctx.fillStyle = 'rgba(173,255,186,0.25)';
      ctx.fillRect(ex - 3, en.y - 3, en.w + 6, 4);
    }
  });

  // explosion particles
  particles.forEach(p => {
    const alpha = Math.max(0, p.life / p.maxLife);
    ctx.fillStyle = colorWithAlpha(p.color, alpha);
    ctx.fillRect(p.x, p.y, p.size, p.size);
  });

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
  particles = [];
  lastSpawn = 0;
  initStars();
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
  initStars();
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
  enemies.push({x,y,w,h,dy,dead:false,entered:false,phase:Math.random()*Math.PI*2,wobbleSpeed:1.8 + Math.random()*2.2});
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
  if (nextStageInfo) nextStageInfo.textContent = stage >= 3 ? 'Final wave cleared!' : `Get ready for stage ${stage + 1}`;
  updateHUD();
}

function initStars(){
  stars = [];
  const total = Math.max(60, Math.floor(canvas.width / 8));
  for (let i = 0; i < total; i++) {
    stars.push({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      size: Math.random() < 0.12 ? 2.4 : 1.3,
      speed: 20 + Math.random() * 85,
      twinkle: Math.random() * Math.PI * 2
    });
  }
}

function drawStarfield(){
  for (let i = 0; i < stars.length; i++) {
    const s = stars[i];
    s.y += s.speed * (1 / 60);
    if (s.y > canvas.height + 3) {
      s.y = -3;
      s.x = Math.random() * canvas.width;
    }
    const alpha = 0.35 + (Math.sin(timeTick * 2 + s.twinkle) + 1) * 0.25;
    ctx.fillStyle = `rgba(163, 193, 255, ${alpha})`;
    ctx.fillRect(s.x, s.y, s.size, s.size);
  }
}

function createExplosion(x, y, color){
  const count = 14;
  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count;
    const speed = 40 + Math.random() * 130;
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 0.35 + Math.random() * 0.25,
      maxLife: 0.6,
      color,
      size: 2 + Math.random() * 3
    });
  }
}

function colorWithAlpha(hex, alpha){
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
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