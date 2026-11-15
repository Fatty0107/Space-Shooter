import './style.css';

const canvas = document.querySelector('#game-canvas');
const ctx = canvas.getContext('2d');
const $ = (selector) => document.querySelector(selector);
const scoreEl = $('#score-value');
const bestEl = $('#best-value');
const heartsEl = $('#hearts');
const scoreList = $('#high-score-list');
const STORE_KEY = 'starfall-high-scores-v1';
const W = 960;
const H = 540;
const HEART_ICON = '<svg class="heart" viewBox="0 0 20 18" aria-hidden="true"><path d="M10 16.2 2.6 9.1C-1.2 5.5 1 1 5 .9c2.1-.1 3.5 1.1 5 3 1.5-1.9 2.9-3.1 5-3 4 .1 6.2 4.6 2.4 8.2L10 16.2Z"/></svg>';

let mode = 'ready';
let soundEnabled = true;
let audioContext;
let lastTime = 0;
let animationFrame;
let bestScores = loadScores();
let pointer = { down: false, x: 140, y: 270 };
let keys = new Set();
let game = createGame();
let stars = Array.from({ length: 115 }, () => ({ x: Math.random() * W, y: Math.random() * H, z: .2 + Math.random() * .9, size: .3 + Math.random() * 1.2, phase: Math.random() * 6 }));

function createGame() {
  return {
    time: 0, score: 0, lives: 5, player: { x: 135, y: H / 2, invulnerable: 0, fireDelay: 0, rapid: 0, shield: 0 },
    bullets: [], enemyBullets: [], enemies: [], rocks: [], pickups: [], particles: [], texts: [],
    spawnTimer: .7, rockTimer: 1.3, pickupTimer: 8, nextBoss: 34, shake: 0,
  };
}

function loadScores() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY) || '[]').filter((item) => Number.isFinite(item.score)); }
  catch { return []; }
}

function saveScores() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(bestScores.slice(0, 5))); } catch { /* Local scores still work for this run. */ }
}

function formatScore(score) { return String(Math.max(0, Math.floor(score))).padStart(6, '0'); }
function renderHearts() {
  heartsEl.innerHTML = Array.from({ length: 5 }, (_, index) => HEART_ICON.replace('class="heart"', `class="heart${index >= game.lives ? ' is-empty' : ''}"`)).join('');
  heartsEl.setAttribute('aria-label', `${game.lives} of 5 hearts`);
}

function renderLeaderboard() {
  const best = bestScores[0]?.score || 0;
  bestEl.textContent = formatScore(best);
  $('#brief-best').textContent = formatScore(best);
  scoreList.innerHTML = bestScores.slice(0, 5).map((entry) => `<li><span class="score-date">${escapeText(entry.date || 'PILOT')}</span><span class="score-number">${formatScore(entry.score)}</span></li>`).join('');
  $('#leaderboard-empty').hidden = bestScores.length > 0;
}

function escapeText(value) { return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]); }

function setMode(next) {
  mode = next;
  $('#start-screen').classList.toggle('is-visible', next === 'ready');
  $('#pause-screen').classList.toggle('is-visible', next === 'paused');
  $('#over-screen').classList.toggle('is-visible', next === 'over');
  $('#pause-button').disabled = next === 'ready' || next === 'over';
  $('#canvas-hint').style.opacity = next === 'ready' || next === 'over' ? '.7' : '0';
}

function startGame() {
  if (mode === 'playing') return;
  game = createGame();
  keys.clear();
  pointer.down = false;
  scoreEl.textContent = formatScore(0);
  renderHearts();
  setMode('playing');
  playTone(420, .11, 'sine', .045);
  lastTime = performance.now();
}

function pauseGame() {
  if (mode === 'playing') { setMode('paused'); pointer.down = false; }
  else if (mode === 'paused') { setMode('playing'); lastTime = performance.now(); }
}

function endGame() {
  if (mode === 'over') return;
  setMode('over');
  const oldBest = bestScores[0]?.score || 0;
  if (game.score > 0) {
    bestScores.push({ score: game.score, date: new Intl.DateTimeFormat(undefined, { month: 'short', day: '2-digit' }).format(new Date()).toUpperCase() });
    bestScores.sort((a, b) => b.score - a.score);
    bestScores = bestScores.slice(0, 5);
    saveScores();
  }
  renderLeaderboard();
  $('#final-score').textContent = formatScore(game.score);
  $('#final-best').textContent = formatScore(bestScores[0]?.score || 0);
  $('#record-message').textContent = game.score > oldBest && game.score > 0 ? 'NEW PERSONAL BEST. THE GALAXY KNOWS YOUR NAME.' : 'The stars will remember.';
  playTone(180, .45, 'sawtooth', .04);
}

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.max(1, Math.round(rect.width * dpr));
  canvas.height = Math.max(1, Math.round(rect.height * dpr));
  ctx.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
}

function playTone(frequency, duration = .06, type = 'triangle', volume = .025) {
  if (!soundEnabled) return;
  try {
    audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
    if (audioContext.state === 'suspended') audioContext.resume();
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(55, frequency * .72), audioContext.currentTime + duration);
    gain.gain.setValueAtTime(volume, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(.001, audioContext.currentTime + duration);
    oscillator.connect(gain).connect(audioContext.destination);
    oscillator.start(); oscillator.stop(audioContext.currentTime + duration);
  } catch { /* Sound is optional. */ }
}

function addText(x, y, value, color = '#fff') {
  game.texts.push({ x, y, value, color, life: .75, maxLife: .75 });
}

function burst(x, y, color, amount = 12, power = 150) {
  for (let i = 0; i < amount; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 35 + Math.random() * power;
    game.particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: .35 + Math.random() * .55, maxLife: .9, size: 1.5 + Math.random() * 3, color });
  }
}

function spawnEnemy() {
  const roll = Math.random();
  const type = roll < .26 ? 'scout' : roll < .55 ? 'swooper' : 'fighter';
  const y = 38 + Math.random() * (H - 76);
  const difficulty = Math.min(game.time / 100, 1.2);
  game.enemies.push({ type, x: W + 38, y, baseY: y, age: 0, hp: type === 'fighter' ? 2 : 1, speed: 112 + Math.random() * 40 + difficulty * 43, fire: 1.8 + Math.random() * 1.5, phase: Math.random() * 7, r: type === 'fighter' ? 22 : 19 });
}

function spawnRock() {
  const radius = 17 + Math.random() * 22;
  const sides = 8 + Math.floor(Math.random() * 4);
  const points = Array.from({ length: sides }, (_, index) => {
    const angle = (index / sides) * Math.PI * 2;
    const distance = radius * (.72 + Math.random() * .34);
    return [Math.cos(angle) * distance, Math.sin(angle) * distance];
  });
  game.rocks.push({ x: W + radius, y: Math.random() * (H - 34) + 17, r: radius, points, angle: Math.random() * 6, spin: (Math.random() - .5) * 1.4, speed: 50 + Math.random() * 80, hp: radius > 31 ? 3 : 2, maxHp: radius > 31 ? 3 : 2 });
}

function spawnBoss() {
  game.enemies.push({ type: 'boss', x: W + 64, y: H / 2, baseY: H / 2, age: 0, hp: 25 + Math.floor(game.time / 80) * 5, maxHp: 25 + Math.floor(game.time / 80) * 5, speed: 52, fire: 1.2, phase: 0, r: 42, entered: false });
  addText(W - 40, 60, '⚠ COMMANDER INBOUND', '#ff888c');
  game.nextBoss += 48;
  playTone(115, .5, 'sawtooth', .04);
}

function spawnPickup(x, y, forcedType) {
  const type = forcedType || (Math.random() < .44 ? 'heart' : Math.random() < .6 ? 'rapid' : 'shield');
  game.pickups.push({ x, y, type, age: 0, phase: Math.random() * 7, speed: 74, r: 13 });
}

function shoot() {
  const p = game.player;
  const rapid = p.rapid > 0;
  p.fireDelay = rapid ? .1 : .18;
  const spread = p.rapid > 0 ? [-8, 0, 8] : [0];
  for (const dy of spread) game.bullets.push({ x: p.x + 27, y: p.y + dy, vx: 680, vy: dy * 1.8, r: 4, damage: 1 });
  playTone(rapid ? 590 : 480, .05, 'triangle', .017);
}

function update(dt) {
  game.time += dt;
  game.shake = Math.max(0, game.shake - dt * 22);
  const player = game.player;
  player.invulnerable = Math.max(0, player.invulnerable - dt);
  player.rapid = Math.max(0, player.rapid - dt);
  player.shield = Math.max(0, player.shield - dt);
  player.fireDelay = Math.max(0, player.fireDelay - dt);
  const speed = 280;
  let dx = (keys.has('ArrowRight') || keys.has('d') ? 1 : 0) - (keys.has('ArrowLeft') || keys.has('a') ? 1 : 0);
  let dy = (keys.has('ArrowDown') || keys.has('s') ? 1 : 0) - (keys.has('ArrowUp') || keys.has('w') ? 1 : 0);
  if (dx && dy) { dx *= .707; dy *= .707; }
  player.x += dx * speed * dt; player.y += dy * speed * dt;
  if (pointer.down) {
    const ease = Math.min(1, dt * 10);
    player.x += (pointer.x - player.x) * ease;
    player.y += (pointer.y - player.y) * ease;
  }
  player.x = Math.max(48, Math.min(W - 80, player.x));
  player.y = Math.max(35, Math.min(H - 35, player.y));
  if ((keys.has(' ') || pointer.down) && player.fireDelay <= 0) shoot();

  game.spawnTimer -= dt;
  if (game.spawnTimer <= 0) { spawnEnemy(); game.spawnTimer = Math.max(.38, 1.25 - game.time * .007) * (.75 + Math.random() * .5); }
  game.rockTimer -= dt;
  if (game.rockTimer <= 0) { spawnRock(); game.rockTimer = Math.max(.48, 1.55 - game.time * .003) * (.8 + Math.random() * .5); }
  game.pickupTimer -= dt;
  if (game.pickupTimer <= 0) { spawnPickup(W + 10, 35 + Math.random() * (H - 70)); game.pickupTimer = 12 + Math.random() * 6; }
  if (game.time > game.nextBoss) spawnBoss();

  game.bullets.forEach((b) => { b.x += b.vx * dt; b.y += b.vy * dt; });
  game.enemyBullets.forEach((b) => { b.x += b.vx * dt; b.y += b.vy * dt; });
  game.enemies.forEach((e) => {
    e.age += dt;
    if (e.type === 'boss') {
      if (!e.entered) { e.x -= e.speed * dt; if (e.x < W - 125) e.entered = true; }
      else e.y = H / 2 + Math.sin(e.age * 1.2) * 130;
      e.fire -= dt;
      if (e.fire <= 0 && e.entered) {
        const angle = Math.atan2(player.y - e.y, player.x - e.x);
        for (const offset of [-.24, 0, .24]) game.enemyBullets.push({ x: e.x - 34, y: e.y, vx: Math.cos(angle + Math.PI + offset) * 245, vy: Math.sin(angle + Math.PI + offset) * 245, r: 6 });
        e.fire = .9;
      }
    } else {
      e.x -= e.speed * dt;
      e.y = e.baseY + Math.sin(e.age * (e.type === 'swooper' ? 3 : 1.8) + e.phase) * (e.type === 'swooper' ? 54 : 22);
      e.fire -= dt;
      if (e.fire <= 0 && e.x < W - 70 && Math.random() < .75) {
        const angle = Math.atan2(player.y - e.y, player.x - e.x);
        game.enemyBullets.push({ x: e.x - 10, y: e.y, vx: Math.cos(angle) * 205, vy: Math.sin(angle) * 205, r: 4.5 });
        e.fire = 2.2 + Math.random() * 1.5;
      }
    }
  });
  game.rocks.forEach((r) => { r.x -= r.speed * dt; r.angle += r.spin * dt; });
  game.pickups.forEach((item) => { item.age += dt; item.x -= item.speed * dt; item.y += Math.sin(item.age * 2.4 + item.phase) * 15 * dt; });

  for (let bi = game.bullets.length - 1; bi >= 0; bi--) {
    const bullet = game.bullets[bi]; let used = false;
    for (let ei = game.enemies.length - 1; ei >= 0; ei--) {
      const enemy = game.enemies[ei];
      if (Math.hypot(bullet.x - enemy.x, bullet.y - enemy.y) < enemy.r + bullet.r) {
        enemy.hp -= bullet.damage; burst(bullet.x, bullet.y, '#6ee7f4', 4, 50); game.bullets.splice(bi, 1); used = true;
        if (enemy.hp <= 0) {
          const isBoss = enemy.type === 'boss';
          const points = isBoss ? 1200 : enemy.type === 'fighter' ? 150 : enemy.type === 'swooper' ? 125 : 100;
          game.score += points; addText(enemy.x, enemy.y, `+${points}`, isBoss ? '#ffd278' : '#73e0f0'); burst(enemy.x, enemy.y, isBoss ? '#ff9778' : '#ff6374', isBoss ? 45 : 17, isBoss ? 280 : 175); game.enemies.splice(ei, 1);
          if (Math.random() < (isBoss ? .85 : .12)) spawnPickup(enemy.x, enemy.y, Math.random() < .55 ? 'heart' : 'rapid');
          playTone(isBoss ? 250 : 300, .13, 'sawtooth', .028);
        } else playTone(720, .04, 'sine', .012);
        break;
      }
    }
    if (used) continue;
    for (let ri = game.rocks.length - 1; ri >= 0; ri--) {
      const rock = game.rocks[ri];
      if (Math.hypot(bullet.x - rock.x, bullet.y - rock.y) < rock.r + bullet.r) {
        rock.hp--; game.bullets.splice(bi, 1); used = true; burst(bullet.x, bullet.y, '#edbd92', 3, 45);
        if (rock.hp <= 0) { game.score += 35; addText(rock.x, rock.y, '+35', '#e8bd8e'); burst(rock.x, rock.y, '#bd9677', 19, 160); game.rocks.splice(ri, 1); playTone(235, .12, 'triangle', .025); }
        break;
      }
    }
  }

  const hit = () => {
    if (player.invulnerable > 0) return;
    if (player.shield > 0) { player.shield = 0; player.invulnerable = .55; burst(player.x, player.y, '#70dcff', 15, 180); playTone(260, .2, 'sawtooth', .03); return; }
    game.lives--; player.invulnerable = 1.35; game.shake = 10; burst(player.x, player.y, '#ff6477', 21, 190); renderHearts(); playTone(155, .25, 'sawtooth', .05);
    $('#game-frame').classList.remove('shake'); void $('#game-frame').offsetWidth; $('#game-frame').classList.add('shake');
    if (game.lives <= 0) endGame();
  };
  for (let i = game.enemyBullets.length - 1; i >= 0; i--) {
    const bullet = game.enemyBullets[i];
    if (Math.hypot(bullet.x - player.x, bullet.y - player.y) < bullet.r + 16) { game.enemyBullets.splice(i, 1); hit(); }
  }
  for (let i = game.enemies.length - 1; i >= 0; i--) {
    const enemy = game.enemies[i];
    if (Math.hypot(enemy.x - player.x, enemy.y - player.y) < enemy.r + 18) { if (enemy.type !== 'boss') game.enemies.splice(i, 1); hit(); }
  }
  for (let i = game.rocks.length - 1; i >= 0; i--) {
    const rock = game.rocks[i];
    if (Math.hypot(rock.x - player.x, rock.y - player.y) < rock.r + 15) { game.rocks.splice(i, 1); hit(); }
  }
  for (let i = game.pickups.length - 1; i >= 0; i--) {
    const item = game.pickups[i];
    if (Math.hypot(item.x - player.x, item.y - player.y) < 29) {
      game.pickups.splice(i, 1); game.score += 50;
      if (item.type === 'heart') { if (game.lives < 5) { game.lives++; addText(player.x, player.y - 25, 'HULL +1', '#ff8793'); } else addText(player.x, player.y - 25, 'FULL HULL +50', '#ff8793'); renderHearts(); }
      if (item.type === 'rapid') { player.rapid = 8; addText(player.x, player.y - 25, 'RAPID FIRE!', '#ffd178'); }
      if (item.type === 'shield') { player.shield = 7; addText(player.x, player.y - 25, 'SHIELD UP!', '#77dff5'); }
      playTone(740, .18, 'sine', .04); burst(item.x, item.y, item.type === 'heart' ? '#ff7485' : '#ffd275', 15, 125);
    }
  }
  game.score = Math.floor(game.score);
  scoreEl.textContent = formatScore(game.score);
  $('#wave-text').textContent = `SECTOR ${String(1 + Math.floor(game.time / 25)).padStart(2, '0')}`;
  game.bullets = game.bullets.filter((b) => b.x < W + 20 && b.y > -20 && b.y < H + 20);
  game.enemyBullets = game.enemyBullets.filter((b) => b.x > -20 && b.x < W + 20 && b.y > -20 && b.y < H + 20);
  game.enemies = game.enemies.filter((e) => e.x > -90);
  game.rocks = game.rocks.filter((r) => r.x > -r.r - 5);
  game.pickups = game.pickups.filter((p) => p.x > -30);
  game.particles.forEach((p) => { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= Math.pow(.1, dt); p.vy *= Math.pow(.1, dt); p.life -= dt; });
  game.particles = game.particles.filter((p) => p.life > 0);
  game.texts.forEach((t) => { t.y -= 28 * dt; t.life -= dt; });
  game.texts = game.texts.filter((t) => t.life > 0);
}

function polygon(points, fill, stroke, lineWidth = 1) {
  ctx.beginPath(); points.forEach(([x, y], index) => index ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath();
  ctx.fillStyle = fill; ctx.fill(); if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lineWidth; ctx.stroke(); }
}

function drawBackground(dt) {
  ctx.fillStyle = '#111a24'; ctx.fillRect(0, 0, W, H);
  const haze = ctx.createRadialGradient(645, 260, 30, 645, 260, 520); haze.addColorStop(0, 'rgba(55,93,112,.14)'); haze.addColorStop(.55, 'rgba(47,66,83,.07)'); haze.addColorStop(1, 'rgba(9,14,24,0)'); ctx.fillStyle = haze; ctx.fillRect(0, 0, W, H);
  for (let index = 0; index < stars.length; index++) {
    const star = stars[index];
    if (mode === 'playing') star.x -= (11 + star.z * 36) * dt;
    if (star.x < -3) { star.x = W + 2; star.y = Math.random() * H; }
    const glow = .2 + (Math.sin(game.time * 1.6 + star.phase) + 1) * .17;
    ctx.globalAlpha = glow * star.z; ctx.fillStyle = index % 11 === 0 ? '#94d9ef' : '#c3ccda'; ctx.beginPath(); ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.strokeStyle = 'rgba(178,207,230,.025)'; ctx.lineWidth = 1;
  for (let x = 30; x < W; x += 42) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
  for (let y = 23; y < H; y += 42) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
}

function drawShip(x, y, scale = 1, flame = true) {
  ctx.save(); ctx.translate(x, y); ctx.scale(scale, scale);
  if (flame) {
    const flicker = 13 + Math.random() * 9;
    const flameGrad = ctx.createLinearGradient(-37, 0, -14, 0); flameGrad.addColorStop(0, 'rgba(255,152,91,0)'); flameGrad.addColorStop(.7, '#ffba68'); flameGrad.addColorStop(1, '#fff3bd');
    polygon([[-20, -7], [-flicker - 17, 0], [-20, 7]], flameGrad, null);
  }
  ctx.shadowColor = 'rgba(85,214,241,.45)'; ctx.shadowBlur = 10;
  polygon([[-21, -13], [1, -17], [11, -39], [23, -42], [21, -16], [38, 0], [21, 16], [23, 42], [11, 39], [1, 17], [-21, 13], [-28, 0]], '#cad9de', '#f4faf6', 1.4);
  ctx.shadowBlur = 0;
  polygon([[-17, -12], [-3, -14], [12, -31], [14, -34], [14, -14]], '#4c7384', '#98deea', 1);
  polygon([[-17, 12], [-3, 14], [12, 31], [14, 34], [14, 14]], '#4c7384', '#98deea', 1);
  polygon([[5, -8], [22, -10], [31, 0], [22, 10], [5, 8]], '#28bdd9', '#a1f2ff', 1);
  polygon([[-19, -11], [-11, -10], [-11, -4], [-20, -5]], '#f0bf55', null);
  polygon([[-19, 11], [-11, 10], [-11, 4], [-20, 5]], '#f0bf55', null);
  ctx.restore();
}

function drawEnemy(enemy) {
  ctx.save(); ctx.translate(enemy.x, enemy.y); ctx.scale(-1, 1);
  if (enemy.type === 'boss') {
    ctx.shadowColor = 'rgba(255,80,109,.5)'; ctx.shadowBlur = 18;
    polygon([[-42,-17],[-24,-31],[4,-27],[17,-40],[38,-31],[50,-13],[43,0],[50,13],[38,31],[17,40],[4,27],[-24,31],[-42,17],[-33,0]], '#823f52', '#ff9b91', 2);
    ctx.shadowBlur = 0;
    polygon([[-23,-13],[3,-17],[19,-9],[19,9],[3,17],[-23,13],[-31,0]], '#ed5f69', '#ffc084', 1);
    ctx.fillStyle = '#fff2d8'; ctx.beginPath(); ctx.ellipse(-1,0,5,11,0,0,Math.PI*2); ctx.fill();
    for (let i = 0; i < 3; i++) { ctx.fillStyle = '#ffc478'; ctx.beginPath(); ctx.arc(28, -17 + i * 17, 3, 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
    ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(enemy.x - 45, enemy.y - 56, 90, 5); ctx.fillStyle = '#ff747d'; ctx.fillRect(enemy.x - 44, enemy.y - 55, 88 * enemy.hp / enemy.maxHp, 3); return;
  }
  if (enemy.type === 'scout') {
    ctx.shadowColor = 'rgba(255,68,88,.5)'; ctx.shadowBlur = 10;
    polygon([[-23,-10],[-8,-17],[8,-16],[20,-8],[23,0],[20,8],[8,16],[-8,17],[-23,10],[-14,0]], '#be3647', '#ff8588', 1.5);
    polygon([[-6,-8],[10,-5],[16,0],[10,5],[-6,8],[-12,0]], '#631f32', '#ff8b82', 1);
    polygon([[-15,-9],[-30,-19],[-28,-6]], '#f06b66', null); polygon([[-15,9],[-30,19],[-28,6]], '#f06b66', null);
  } else if (enemy.type === 'swooper') {
    ctx.shadowColor = 'rgba(247,148,100,.45)'; ctx.shadowBlur = 9;
    polygon([[-22,-11],[-3,-17],[7,-11],[20,-24],[18,-5],[25,0],[18,5],[20,24],[7,11],[-3,17],[-22,11],[-13,0]], '#9c4b41', '#ffc087', 1.5);
    polygon([[-1,-7],[11,-5],[16,0],[11,5],[-1,7],[-8,0]], '#512d3c', '#ffd19a', 1);
  } else {
    ctx.shadowColor = 'rgba(201,101,179,.5)'; ctx.shadowBlur = 9;
    polygon([[-23,-10],[-6,-15],[10,-13],[23,-8],[22,8],[10,13],[-6,15],[-23,10],[-14,0]], '#66518b', '#d7a7f5', 1.5);
    polygon([[-7,-8],[8,-5],[16,0],[8,5],[-7,8],[-14,0]], '#242940', '#eca9ed', 1);
    ctx.fillStyle = '#ffdc8a'; ctx.fillRect(10,-2,4,4);
  }
  ctx.restore();
}

function drawRock(rock) {
  ctx.save(); ctx.translate(rock.x, rock.y); ctx.rotate(rock.angle);
  const points = rock.points;
  ctx.shadowColor = 'rgba(239,177,122,.16)'; ctx.shadowBlur = 9;
  polygon(points, '#765b50', '#a88269', 2);
  ctx.shadowBlur = 0;
  ctx.fillStyle = 'rgba(188,146,111,.26)';
  for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.ellipse(Math.sin(i * 4 + rock.angle) * rock.r * .3, Math.cos(i * 3 + rock.angle) * rock.r * .26, rock.r * .11, rock.r * .075, .4, 0, Math.PI * 2); ctx.fill(); }
  ctx.restore();
  if (rock.hp < rock.maxHp) {
    ctx.fillStyle = 'rgba(0,0,0,.48)'; ctx.fillRect(rock.x - 15, rock.y + rock.r + 7, 30, 3);
    ctx.fillStyle = '#f0bd91'; ctx.fillRect(rock.x - 14, rock.y + rock.r + 8, 28 * rock.hp / rock.maxHp, 1);
  }
}

function drawPickup(item) {
  const bob = Math.sin(item.age * 4 + item.phase) * 3;
  const color = item.type === 'heart' ? '#ff7989' : item.type === 'rapid' ? '#ffd275' : '#6cdbf2';
  ctx.save(); ctx.translate(item.x, item.y + bob);
  ctx.globalAlpha = .2 + .12 * (Math.sin(item.age * 6) + 1); ctx.fillStyle = color; ctx.beginPath(); ctx.arc(0, 0, 20, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
  ctx.shadowColor = color; ctx.shadowBlur = 13;
  if (item.type === 'heart') {
    ctx.beginPath(); ctx.moveTo(0, 9); ctx.bezierCurveTo(-18,-2,-7,-12,0,-5); ctx.bezierCurveTo(8,-13,18,-1,0,9); ctx.closePath(); ctx.fillStyle = color; ctx.fill();
  } else if (item.type === 'rapid') {
    polygon([[1,-12],[-7,1],[-1,1],[-4,12],[8,-3],[2,-3]], color, '#fff1bd', 1);
  } else {
    ctx.beginPath(); ctx.arc(0,0,9,0,Math.PI*2); ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.stroke();
    polygon([[0,-13],[4,-7],[11,-9],[8,-2],[13,2],[5,4],[4,12],[0,7],[-5,12],[-5,5],[-12,3],[-7,-2],[-10,-8],[-3,-7]], color, null);
  }
  ctx.restore();
}

function draw(dt) {
  drawBackground(dt);
  ctx.save();
  if (game.shake > 0) ctx.translate((Math.random() - .5) * game.shake, (Math.random() - .5) * game.shake);
  for (const rock of game.rocks) drawRock(rock);
  for (const pickup of game.pickups) drawPickup(pickup);
  for (const enemy of game.enemies) drawEnemy(enemy);
  for (const bullet of game.bullets) {
    ctx.save(); ctx.shadowColor = '#68e4ff'; ctx.shadowBlur = 12; ctx.strokeStyle = '#78e8ff'; ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(bullet.x - 15, bullet.y); ctx.lineTo(bullet.x + 4, bullet.y); ctx.stroke(); ctx.strokeStyle = '#edffff'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(bullet.x - 13, bullet.y); ctx.lineTo(bullet.x + 1, bullet.y); ctx.stroke(); ctx.restore();
  }
  for (const bullet of game.enemyBullets) {
    ctx.save(); ctx.shadowColor = '#ff596e'; ctx.shadowBlur = 12; ctx.fillStyle = '#ff6d76'; ctx.beginPath(); ctx.arc(bullet.x, bullet.y, bullet.r, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#fff0cc'; ctx.beginPath(); ctx.arc(bullet.x, bullet.y, bullet.r * .35, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  }
  for (const particle of game.particles) { ctx.globalAlpha = Math.max(0, particle.life / particle.maxLife); ctx.fillStyle = particle.color; ctx.beginPath(); ctx.arc(particle.x, particle.y, particle.size * (particle.life / particle.maxLife), 0, Math.PI * 2); ctx.fill(); }
  ctx.globalAlpha = 1;
  for (const text of game.texts) { ctx.globalAlpha = Math.max(0, text.life / text.maxLife); ctx.fillStyle = text.color; ctx.font = '500 13px "DM Mono", monospace'; ctx.textAlign = 'center'; ctx.fillText(text.value, text.x, text.y); }
  ctx.globalAlpha = 1;
  const p = game.player;
  if (mode === 'playing' && !(p.invulnerable > 0 && Math.floor(game.time * 15) % 2 === 0)) drawShip(p.x, p.y, 1, true);
  if (p.shield > 0 && mode === 'playing') { ctx.beginPath(); ctx.arc(p.x, p.y, 30 + Math.sin(game.time * 8) * 2, 0, Math.PI * 2); ctx.strokeStyle = 'rgba(106,222,255,.8)'; ctx.lineWidth = 2; ctx.shadowColor = '#54cfff'; ctx.shadowBlur = 13; ctx.stroke(); ctx.shadowBlur = 0; }
  ctx.restore();
}

function loop(now) {
  const dt = Math.min(.035, Math.max(0, (now - lastTime) / 1000 || 0));
  lastTime = now;
  if (mode === 'playing') update(dt);
  draw(dt);
  animationFrame = requestAnimationFrame(loop);
}

function pointerPosition(event) {
  const rect = canvas.getBoundingClientRect();
  return { x: (event.clientX - rect.left) / rect.width * W, y: (event.clientY - rect.top) / rect.height * H };
}

canvas.addEventListener('pointerdown', (event) => {
  if (mode !== 'playing') return;
  pointer.down = true; Object.assign(pointer, pointerPosition(event)); canvas.setPointerCapture(event.pointerId); event.preventDefault();
});
canvas.addEventListener('pointermove', (event) => { if (pointer.down) Object.assign(pointer, pointerPosition(event)); });
canvas.addEventListener('pointerup', () => { pointer.down = false; });
canvas.addEventListener('pointercancel', () => { pointer.down = false; });
window.addEventListener('keydown', (event) => {
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(key)) event.preventDefault();
  if ((key === 'p' || key === 'Escape') && (mode === 'playing' || mode === 'paused')) { pauseGame(); return; }
  if ((key === 'Enter' || key === ' ') && (mode === 'ready' || mode === 'over')) { startGame(); return; }
  keys.add(key);
});
window.addEventListener('keyup', (event) => keys.delete(event.key.length === 1 ? event.key.toLowerCase() : event.key));
window.addEventListener('blur', () => { keys.clear(); pointer.down = false; if (mode === 'playing') setMode('paused'); });
window.addEventListener('resize', resizeCanvas);

$('#start-button').addEventListener('click', startGame);
$('#restart-button').addEventListener('click', startGame);
$('#resume-button').addEventListener('click', pauseGame);
$('#pause-button').addEventListener('click', pauseGame);
$('#sound-button').addEventListener('click', () => {
  soundEnabled = !soundEnabled;
  $('#sound-button').classList.toggle('muted', !soundEnabled);
  $('#sound-button').setAttribute('aria-label', soundEnabled ? 'Turn sound off' : 'Turn sound on');
  $('#sound-button').innerHTML = soundEnabled ? '<svg class="sound-on" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4Z"/><path d="M16 9a5 5 0 0 1 0 6M18.5 6.5a9 9 0 0 1 0 11"/></svg>' : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4Z"/><path d="m17 9 5 6m0-6-5 6"/></svg>';
  if (soundEnabled) playTone(600, .08, 'sine', .03);
});

resizeCanvas();
renderHearts();
renderLeaderboard();
lastTime = performance.now();
animationFrame = requestAnimationFrame(loop);
window.addEventListener('beforeunload', () => cancelAnimationFrame(animationFrame));
