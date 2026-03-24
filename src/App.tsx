/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Volume2, VolumeX } from 'lucide-react';

// --- Sound Management ---
const SOUND_URLS = {
  bgm: 'https://assets.mixkit.co/music/preview/mixkit-tech-house-vibes-130.mp3',
  dash: 'https://assets.mixkit.co/sfx/preview/mixkit-fast-whoosh-1185.mp3',
  shield: 'https://assets.mixkit.co/sfx/preview/mixkit-magic-marimba-2821.mp3',
  slowmo: 'https://assets.mixkit.co/sfx/preview/mixkit-low-impact-hit-1490.mp3',
  powerup: 'https://assets.mixkit.co/sfx/preview/mixkit-arcade-game-jump-coin-246.mp3',
  gameover: 'https://assets.mixkit.co/sfx/preview/mixkit-explosion-with-debris-2188.mp3'
};

class SoundManager {
  bgm: HTMLAudioElement;
  sounds: Record<string, HTMLAudioElement>;
  muted: boolean = false;

  constructor() {
    this.bgm = new Audio(SOUND_URLS.bgm);
    this.bgm.loop = true;
    this.bgm.volume = 0.15;
    
    this.sounds = {
      dash: new Audio(SOUND_URLS.dash),
      shield: new Audio(SOUND_URLS.shield),
      slowmo: new Audio(SOUND_URLS.slowmo),
      powerup: new Audio(SOUND_URLS.powerup),
      gameover: new Audio(SOUND_URLS.gameover)
    };

    // Pre-set volumes
    this.sounds.dash.volume = 0.4;
    this.sounds.shield.volume = 0.4;
    this.sounds.slowmo.volume = 0.3;
    this.sounds.powerup.volume = 0.4;
    this.sounds.gameover.volume = 0.5;
  }

  playBGM() {
    if (this.muted) return;
    this.bgm.play().catch(() => {
      // Browser blocked autoplay, will try again on user interaction
    });
  }

  stopBGM() {
    this.bgm.pause();
    this.bgm.currentTime = 0;
  }

  playSFX(name: keyof typeof SOUND_URLS) {
    if (this.muted || name === 'bgm') return;
    const sound = this.sounds[name];
    if (sound) {
      sound.currentTime = 0;
      sound.play().catch(() => {});
    }
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.muted) {
      this.bgm.pause();
    } else {
      this.bgm.play().catch(() => {});
    }
    return this.muted;
  }
}

// --- Constants & Types ---
const PLAYER_RADIUS = 30;
const ENEMY_MIN_RADIUS = 10;
const ENEMY_MAX_RADIUS = 25;
const INITIAL_SPAWN_RATE = 1000; // ms
const MIN_SPAWN_RATE = 200;
const DIFFICULTY_INCREMENT = 0.98; // Multiply spawn rate every few seconds
const PLAYER_SPEED = 300; // pixels per second

// Ability Constants
const DASH_COOLDOWN = 2500; // ms
const DASH_FORCE = 1500; // pixels per second during dash
const DASH_DURATION = 150; // ms

const SHIELD_COOLDOWN = 8000; // ms
const SHIELD_DURATION = 3000; // ms

const SLOWMO_COOLDOWN = 10000; // ms
const SLOWMO_DURATION = 3000; // ms
const SLOWMO_FACTOR = 0.3; // Enemies move at 30% speed

// Power-Up Constants
const POWERUP_SPAWN_RATE = 5000; // ms
const POWERUP_LIFESPAN = 5000; // ms
const POWERUP_DURATION = 5000; // ms
const MAGNET_RANGE = 200;

enum PowerUpType {
  SHIELD = 'SHIELD',
  SLOW = 'SLOW',
  DOUBLE_SCORE = 'DOUBLE_SCORE',
  MAGNET = 'MAGNET'
}

const POWERUP_CONFIG = {
  [PowerUpType.SHIELD]: { color: '#4ade80', label: 'Shield' },
  [PowerUpType.SLOW]: { color: '#60a5fa', label: 'Slow' },
  [PowerUpType.DOUBLE_SCORE]: { color: '#c084fc', label: '2x Score' },
  [PowerUpType.MAGNET]: { color: '#fbbf24', label: 'Magnet' }
};

type GameState = 'START' | 'PLAYING' | 'GAMEOVER';

interface Point {
  x: number;
  y: number;
}

interface AbilityState {
  cooldown: number; // current cooldown timer
  maxCooldown: number;
  active: boolean;
  duration: number; // current active timer
  maxDuration: number;
}

interface ActivePowerUp {
  type: PowerUpType;
  duration: number;
  maxDuration: number;
}

class Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
  alpha: number;
  decay: number;

  constructor(x: number, y: number, color: string, isExplosion = false, vx?: number, vy?: number) {
    this.x = x;
    this.y = y;
    this.color = color;
    this.radius = isExplosion ? Math.random() * 3 + 1 : Math.random() * 2 + 1;
    this.alpha = 1;
    this.decay = isExplosion ? Math.random() * 0.015 + 0.005 : Math.random() * 0.03 + 0.01; // Slower decay for smoother trails
    
    if (vx !== undefined && vy !== undefined) {
      this.vx = vx;
      this.vy = vy;
    } else {
      const angle = Math.random() * Math.PI * 2;
      const force = isExplosion ? Math.random() * 5 + 2 : Math.random() * 1;
      this.vx = Math.cos(angle) * force;
      this.vy = Math.sin(angle) * force;
    }
  }

  update() {
    this.x += this.vx;
    this.y += this.vy;
    this.alpha -= this.decay;
  }

  draw(ctx: CanvasRenderingContext2D) {
    ctx.save();
    ctx.globalAlpha = this.alpha;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fillStyle = this.color;
    ctx.shadowBlur = 10;
    ctx.shadowColor = this.color;
    ctx.fill();
    ctx.restore();
  }
}

class PowerUp {
  x: number;
  y: number;
  type: PowerUpType;
  radius: number = 12;
  lifespan: number = POWERUP_LIFESPAN;
  pulse: number = 0;

  constructor(canvasWidth: number, canvasHeight: number) {
    this.x = Math.random() * (canvasWidth - 100) + 50;
    this.y = Math.random() * (canvasHeight - 100) + 50;
    const types = Object.values(PowerUpType);
    this.type = types[Math.floor(Math.random() * types.length)];
  }

  update(dt: number, playerX: number, playerY: number, magnetActive: boolean, particles: Particle[]) {
    this.lifespan -= dt * 1000;
    this.pulse += dt * 5;

    // Subtle trail for power-ups
    if (Math.random() > 0.7) {
      particles.push(new Particle(this.x, this.y, POWERUP_CONFIG[this.type].color));
    }

    if (magnetActive) {
      const dx = playerX - this.x;
      const dy = playerY - this.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < MAGNET_RANGE) {
        this.x += (dx / dist) * 300 * dt;
        this.y += (dy / dist) * 300 * dt;
      }
    }
  }

  draw(ctx: CanvasRenderingContext2D) {
    const config = POWERUP_CONFIG[this.type];
    const pulseScale = 1 + Math.sin(this.pulse) * 0.2;
    
    ctx.save();
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius * pulseScale, 0, Math.PI * 2);
    ctx.fillStyle = config.color;
    ctx.shadowBlur = 20;
    ctx.shadowColor = config.color;
    ctx.fill();
    
    // Inner icon
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius * 0.5, 0, Math.PI * 2);
    ctx.fillStyle = 'white';
    ctx.fill();
    ctx.restore();
  }
}

class Enemy {
  x: number;
  y: number;
  radius: number;
  color: string;
  speed: number;
  pulse: number = Math.random() * Math.PI * 2; // Random starting phase for pulse
  imgIndex: number;

  constructor(canvasWidth: number, canvasHeight: number, speed: number) {
    this.radius = Math.random() * (ENEMY_MAX_RADIUS - ENEMY_MIN_RADIUS) + ENEMY_MIN_RADIUS;
    this.color = `hsl(${Math.random() * 30 + 0}, 80%, 60%)`; // Reddish/Orange
    this.speed = speed;
    this.imgIndex = Math.floor(Math.random() * 5); // 0 to 4

    // Spawn from edges
    const side = Math.floor(Math.random() * 4);
    if (side === 0) { // Top
      this.x = Math.random() * canvasWidth;
      this.y = -this.radius;
    } else if (side === 1) { // Right
      this.x = canvasWidth + this.radius;
      this.y = Math.random() * canvasHeight;
    } else if (side === 2) { // Bottom
      this.x = Math.random() * canvasWidth;
      this.y = canvasHeight + this.radius;
    } else { // Left
      this.x = -this.radius;
      this.y = Math.random() * canvasHeight;
    }
  }

  update(playerX: number, playerY: number, dt: number, isSlowMo: boolean, isPowerUpSlow: boolean) {
    const dx = playerX - this.x;
    const dy = playerY - this.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    
    let currentSpeed = this.speed;
    if (isSlowMo) currentSpeed *= SLOWMO_FACTOR;
    if (isPowerUpSlow) currentSpeed *= 0.5;
    
    this.x += (dx / dist) * currentSpeed * dt;
    this.y += (dy / dist) * currentSpeed * dt;
    
    // Update pulse phase
    this.pulse += dt * 3;
  }

  draw(ctx: CanvasRenderingContext2D, images: HTMLImageElement[]) {
    // Pulse scale effect
    const pulseScale = 1 + Math.sin(this.pulse) * 0.1;
    const currentRadius = this.radius * pulseScale;

    ctx.save();
    
    const img = images[this.imgIndex];
    if (img && img.complete) {
      const size = currentRadius * 2.5;
      ctx.shadowBlur = 15 + Math.sin(this.pulse) * 5;
      ctx.shadowColor = this.color;
      ctx.drawImage(img, this.x - size / 2, this.y - size / 2, size, size);
    } else {
      ctx.beginPath();
      ctx.arc(this.x, this.y, currentRadius, 0, Math.PI * 2);
      ctx.fillStyle = this.color;
      ctx.shadowBlur = 15 + Math.sin(this.pulse) * 5;
      ctx.shadowColor = this.color;
      ctx.fill();
    }
    ctx.restore();
  }
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [gameState, setGameState] = useState<GameState>('START');
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const soundManager = useRef<SoundManager | null>(null);
  
  // UI State for abilities
  const [dashStatus, setDashStatus] = useState<AbilityState>({ cooldown: 0, maxCooldown: DASH_COOLDOWN, active: false, duration: 0, maxDuration: DASH_DURATION });
  const [shieldStatus, setShieldStatus] = useState<AbilityState>({ cooldown: 0, maxCooldown: SHIELD_COOLDOWN, active: false, duration: 0, maxDuration: SHIELD_DURATION });
  const [slowMoStatus, setSlowMoStatus] = useState<AbilityState>({ cooldown: 0, maxCooldown: SLOWMO_COOLDOWN, active: false, duration: 0, maxDuration: SLOWMO_DURATION });

  // UI State for power-ups
  const [activePowerUps, setActivePowerUps] = useState<ActivePowerUp[]>([]);
  // Game state refs for the loop
  const playerImg = useRef<HTMLImageElement | null>(null);
  const shieldImg = useRef<HTMLImageElement | null>(null);
  const enemyImgs = useRef<HTMLImageElement[]>([]);
  const [hitFlash, setHitFlash] = useState(false);

  // Game state refs for the loop
  const gameRef = useRef({
    player: { x: 0, y: 0, radius: PLAYER_RADIUS, lastDx: 0, lastDy: 0, hasShield: false },
    enemies: [] as Enemy[],
    powerUps: [] as PowerUp[],
    particles: [] as Particle[],
    keys: {} as Record<string, boolean>,
    lastTime: 0,
    spawnTimer: 0,
    powerUpTimer: 0,
    currentSpawnRate: INITIAL_SPAWN_RATE,
    enemySpeed: 100,
    score: 0,
    shake: 0,
    deathTimer: 0, // Timer for death slow-mo
    abilities: {
      dash: { cooldown: 0, active: false, duration: 0 },
      shield: { cooldown: 0, active: false, duration: 0 },
      slowMo: { cooldown: 0, active: false, duration: 0 }
    },
    activePowerUps: [] as ActivePowerUp[]
  });

  useEffect(() => {
    const saved = localStorage.getItem('dodge_survive_highscore');
    if (saved) setHighScore(parseInt(saved));

    if (!soundManager.current) {
      soundManager.current = new SoundManager();
    }

    // Load assets
    const pImg = new Image();
    pImg.src = 'assets/player.png.png';
    playerImg.current = pImg;

    const sImg = new Image();
    sImg.src = 'assets/shield.png.png';
    shieldImg.current = sImg;

    // Load enemy images
    const eImgs: HTMLImageElement[] = [];
    for (let i = 1; i <= 5; i++) {
        const img = new Image();
        img.src = `assets/enemy${i}.png.png`;
        eImgs.push(img);
    }
    enemyImgs.current = eImgs;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const handleResize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      if (gameState === 'START') {
        gameRef.current.player.x = canvas.width / 2;
        gameRef.current.player.y = canvas.height / 2;
      }
    };

    window.addEventListener('resize', handleResize);
    handleResize();

    const handleKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      gameRef.current.keys[key] = true;
      gameRef.current.keys[e.code] = true;

      if (gameState === 'PLAYING') {
        // Trigger Abilities
        if (key === ' ' || e.code === 'Space') {
          triggerDash();
        }
        if (key === 'shift') {
          triggerShield();
        }
        if (key === 'e') {
          triggerSlowMo();
        }
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      gameRef.current.keys[e.key.toLowerCase()] = false;
      gameRef.current.keys[e.code] = false;
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    const triggerDash = () => {
      const { dash } = gameRef.current.abilities;
      if (dash.cooldown <= 0 && !dash.active) {
        dash.active = true;
        dash.duration = DASH_DURATION;
        dash.cooldown = DASH_COOLDOWN;
        soundManager.current?.playSFX('dash');
      }
    };

    const triggerShield = () => {
      const { shield } = gameRef.current.abilities;
      if (shield.cooldown <= 0 && !shield.active) {
        shield.active = true;
        gameRef.current.player.hasShield = true;
        shield.duration = SHIELD_DURATION;
        shield.cooldown = SHIELD_COOLDOWN;
        soundManager.current?.playSFX('shield');
      }
    };

    const triggerSlowMo = () => {
      const { slowMo } = gameRef.current.abilities;
      if (slowMo.cooldown <= 0 && !slowMo.active) {
        slowMo.active = true;
        slowMo.duration = SLOWMO_DURATION;
        slowMo.cooldown = SLOWMO_COOLDOWN;
        soundManager.current?.playSFX('slowmo');
      }
    };

    let animationFrameId: number;

    const loop = (time: number) => {
      let dt = (time - gameRef.current.lastTime) / 1000;
      gameRef.current.lastTime = time;

      // Death slow-mo effect
      if (gameRef.current.deathTimer > 0) {
        gameRef.current.deathTimer -= dt;
        dt *= 0.05; // Slow down the game significantly
        if (gameRef.current.deathTimer <= 0) {
          triggerGameOver();
        }
      }

      if (gameState === 'PLAYING' || gameRef.current.deathTimer > 0) {
        update(dt);
      }
      draw();

      animationFrameId = requestAnimationFrame(loop);
    };

    const update = (dt: number) => {
      if (dt > 0.1) return; // Cap dt to prevent huge jumps

      const { keys, player, enemies, powerUps, particles, abilities, activePowerUps: currentPowerUps } = gameRef.current;

      // Update Cooldowns & Durations
      const dtMs = dt * 1000;
      
      // Dash
      if (abilities.dash.active) {
        abilities.dash.duration -= dtMs;
        if (abilities.dash.duration <= 0) {
          abilities.dash.active = false;
          gameRef.current.shake = 8; // Increased shake at end of dash for juice
          // Dash end particles
          for (let i = 0; i < 15; i++) {
            particles.push(new Particle(player.x, player.y, '#ffffff', true));
          }
        }
      } else if (abilities.dash.cooldown > 0) {
        abilities.dash.cooldown -= dtMs;
      }

      // Shield
      if (abilities.shield.active) {
        abilities.shield.duration -= dtMs;
        if (abilities.shield.duration <= 0) {
          abilities.shield.active = false;
          player.hasShield = false;
        }
      } else if (abilities.shield.cooldown > 0) {
        abilities.shield.cooldown -= dtMs;
      }

      // Slow Mo
      if (abilities.slowMo.active) {
        abilities.slowMo.duration -= dtMs;
        if (abilities.slowMo.duration <= 0) {
          abilities.slowMo.active = false;
        }
      } else if (abilities.slowMo.cooldown > 0) {
        abilities.slowMo.cooldown -= dtMs;
      }

      // Update Active Power-Ups
      for (let i = currentPowerUps.length - 1; i >= 0; i--) {
        currentPowerUps[i].duration -= dtMs;
        if (currentPowerUps[i].duration <= 0) {
          currentPowerUps.splice(i, 1);
        }
      }
      setActivePowerUps([...currentPowerUps]);

      // Sync UI State
      setDashStatus({ cooldown: abilities.dash.cooldown, maxCooldown: DASH_COOLDOWN, active: abilities.dash.active, duration: abilities.dash.duration, maxDuration: DASH_DURATION });
      setShieldStatus({ cooldown: abilities.shield.cooldown, maxCooldown: SHIELD_COOLDOWN, active: abilities.shield.active, duration: abilities.shield.duration, maxDuration: SHIELD_DURATION });
      setSlowMoStatus({ cooldown: abilities.slowMo.cooldown, maxCooldown: SLOWMO_COOLDOWN, active: abilities.slowMo.active, duration: abilities.slowMo.duration, maxDuration: SLOWMO_DURATION });

      // Player movement
      let dx = 0;
      let dy = 0;
      if (keys['w'] || keys['arrowup']) dy -= 1;
      if (keys['s'] || keys['arrowdown']) dy += 1;
      if (keys['a'] || keys['arrowleft']) dx -= 1;
      if (keys['d'] || keys['arrowright']) dx += 1;

      if (dx !== 0 || dy !== 0) {
        const mag = Math.sqrt(dx * dx + dy * dy);
        player.lastDx = dx / mag;
        player.lastDy = dy / mag;
      }

      const speed = abilities.dash.active ? DASH_FORCE : PLAYER_SPEED;
      
      // If dashing but no keys pressed, dash in last direction
      const moveDx = (dx === 0 && dy === 0 && abilities.dash.active) ? player.lastDx : dx;
      const moveDy = (dx === 0 && dy === 0 && abilities.dash.active) ? player.lastDy : dy;

      if (moveDx !== 0 || moveDy !== 0) {
        const mag = Math.sqrt(moveDx * moveDx + moveDy * moveDy);
        player.x += (moveDx / mag) * speed * dt;
        player.y += (moveDy / mag) * speed * dt;

        // Keep in bounds
        player.x = Math.max(player.radius, Math.min(canvas.width - player.radius, player.x));
        player.y = Math.max(player.radius, Math.min(canvas.height - player.radius, player.y));

        // Trail particles
        const particleCount = abilities.dash.active ? 5 : 1;
        for (let i = 0; i < particleCount; i++) {
          if (Math.random() > 0.5) {
            particles.push(new Particle(player.x, player.y, abilities.dash.active ? '#ffffff' : '#00f2fe'));
          }
        }
      }

      // Spawning Enemies
      gameRef.current.spawnTimer += dt * 1000;
      if (gameRef.current.spawnTimer > gameRef.current.currentSpawnRate) {
        enemies.push(new Enemy(canvas.width, canvas.height, gameRef.current.enemySpeed));
        gameRef.current.spawnTimer = 0;
        
        // Increase difficulty
        gameRef.current.currentSpawnRate = Math.max(MIN_SPAWN_RATE, gameRef.current.currentSpawnRate * DIFFICULTY_INCREMENT);
        gameRef.current.enemySpeed += 2;
      }

      // Spawning Power-Ups
      gameRef.current.powerUpTimer += dt * 1000;
      if (gameRef.current.powerUpTimer > POWERUP_SPAWN_RATE) {
        powerUps.push(new PowerUp(canvas.width, canvas.height));
        gameRef.current.powerUpTimer = 0;
        
        // Sparkle effect on spawn
        const lastPU = powerUps[powerUps.length - 1];
        for (let i = 0; i < 10; i++) {
          particles.push(new Particle(lastPU.x, lastPU.y, 'white', true));
        }
      }

      // Update Power-Ups
      const magnetActive = currentPowerUps.some(p => p.type === PowerUpType.MAGNET);
      for (let i = powerUps.length - 1; i >= 0; i--) {
        const pu = powerUps[i];
        pu.update(dt, player.x, player.y, magnetActive, particles);

        // Collision with player
        const dist = Math.sqrt((player.x - pu.x) ** 2 + (player.y - pu.y) ** 2);
        if (dist < player.radius + pu.radius) {
          soundManager.current?.playSFX('powerup');
          collectPowerUp(pu.type);
          powerUps.splice(i, 1);
          continue;
        }

        if (pu.lifespan <= 0) {
          powerUps.splice(i, 1);
        }
      }

      // Update enemies
      const isPowerUpSlow = currentPowerUps.some(p => p.type === PowerUpType.SLOW);
      for (let i = enemies.length - 1; i >= 0; i--) {
        const enemy = enemies[i];
        enemy.update(player.x, player.y, dt, abilities.slowMo.active, isPowerUpSlow);

        // Collision detection
        const dist = Math.sqrt((player.x - enemy.x) ** 2 + (player.y - enemy.y) ** 2);
        if (dist < (player.radius + (player.hasShield ? 15 : 0)) + enemy.radius) {
          if (abilities.shield.active) {
            // Shield absorbs collision
            abilities.shield.active = false;
            gameRef.current.player.hasShield = false;
            abilities.shield.duration = 0;
            enemies.splice(i, 1);
            gameRef.current.shake = 8;
            // Explosion at impact
            for (let j = 0; j < 10; j++) {
              particles.push(new Particle(enemy.x, enemy.y, '#00f2fe', true));
            }
          } else if (!abilities.dash.active && gameRef.current.deathTimer <= 0) {
            // Dash provides invulnerability during movement
            // Start death slow-mo
            gameRef.current.deathTimer = 0.3;
            gameRef.current.shake = 20;
            setHitFlash(true);
            setTimeout(() => setHitFlash(false), 100);
            
            // Initial impact particles
            for (let j = 0; j < 20; j++) {
              particles.push(new Particle(player.x, player.y, '#00f2fe', true));
            }
          }
        }
      }

      // Update particles
      for (let i = particles.length - 1; i >= 0; i--) {
        particles[i].update();
        if (particles[i].alpha <= 0) {
          particles.splice(i, 1);
        }
      }

      // Update score
      const isDoubleScore = currentPowerUps.some(p => p.type === PowerUpType.DOUBLE_SCORE);
      const multiplier = (abilities.slowMo.active ? 0.5 : 1) * (isDoubleScore ? 2 : 1);
      gameRef.current.score += dt * 10 * multiplier;
      setScore(Math.floor(gameRef.current.score));

      // Screen shake
      if (gameRef.current.shake > 0) {
        gameRef.current.shake -= dt * 10;
      }
    };

    const collectPowerUp = (type: PowerUpType) => {
      const { abilities, activePowerUps: currentPowerUps } = gameRef.current;
      
      // Visual feedback
      for (let i = 0; i < 15; i++) {
        gameRef.current.particles.push(new Particle(gameRef.current.player.x, gameRef.current.player.y, POWERUP_CONFIG[type].color, true));
      }

      if (type === PowerUpType.SHIELD) {
        abilities.shield.active = true;
        gameRef.current.player.hasShield = true;
        abilities.shield.duration = SHIELD_DURATION;
        abilities.shield.cooldown = SHIELD_COOLDOWN;
      } else {
        const existing = currentPowerUps.find(p => p.type === type);
        if (existing) {
          existing.duration = POWERUP_DURATION;
        } else {
          currentPowerUps.push({ type, duration: POWERUP_DURATION, maxDuration: POWERUP_DURATION });
        }
      }
    };

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      ctx.save();
      if (gameRef.current.shake > 0) {
        ctx.translate(Math.random() * gameRef.current.shake - gameRef.current.shake / 2, Math.random() * gameRef.current.shake - gameRef.current.shake / 2);
      }

      // Draw particles
      gameRef.current.particles.forEach(p => p.draw(ctx));

      // Draw Power-Ups
      gameRef.current.powerUps.forEach(pu => pu.draw(ctx));

      // Draw player
      if (gameState !== 'GAMEOVER') {
        const { player, abilities, activePowerUps: currentPowerUps } = gameRef.current;
        const time = performance.now() / 1000;
        
        // Shield Visuals (Wheelchair & Aura)
        if (player.hasShield) {
          const pulse = Math.sin(time * 10) * 0.1;
          const scale = 1.1 + pulse;
          
          ctx.save();
          // Glowing aura
          ctx.beginPath();
          ctx.arc(player.x, player.y, player.radius * 2.5, 0, Math.PI * 2);
          const auraGradient = ctx.createRadialGradient(player.x, player.y, player.radius, player.x, player.y, player.radius * 2.5);
          auraGradient.addColorStop(0, 'rgba(0, 242, 254, 0.4)');
          auraGradient.addColorStop(1, 'transparent');
          ctx.fillStyle = auraGradient;
          ctx.shadowBlur = 30;
          ctx.shadowColor = '#00f2fe';
          ctx.fill();
          
          // Draw wheelchair (shield.png)
          if (shieldImg.current) {
            const w = player.radius * 4 * scale;
            const h = player.radius * 4 * scale;
            // Positioned slightly below player for natural look
            ctx.drawImage(shieldImg.current, player.x - w / 2, player.y - h / 2 + 10, w, h);
          }
          ctx.restore();
        }

        // Power-up active glow
        if (currentPowerUps.length > 0) {
          ctx.beginPath();
          ctx.arc(player.x, player.y, player.radius + 5, 0, Math.PI * 2);
          const gradient = ctx.createRadialGradient(player.x, player.y, player.radius, player.x, player.y, player.radius + 10);
          gradient.addColorStop(0, 'rgba(255, 255, 255, 0.3)');
          gradient.addColorStop(1, 'transparent');
          ctx.fillStyle = gradient;
          ctx.fill();
        }

        // Draw player base (player.png)
        if (playerImg.current) {
          const size = player.radius * 2.5;
          ctx.save();
          if (abilities.dash.active) {
            ctx.shadowBlur = 30;
            ctx.shadowColor = '#ffffff';
          } else {
            ctx.shadowBlur = 20;
            ctx.shadowColor = '#00f2fe';
          }
          ctx.drawImage(playerImg.current, player.x - size / 2, player.y - size / 2, size, size);
          ctx.restore();
        } else {
          // Fallback to circle if image not loaded
          ctx.beginPath();
          ctx.arc(player.x, player.y, player.radius, 0, Math.PI * 2);
          ctx.fillStyle = abilities.dash.active ? '#ffffff' : '#00f2fe';
          ctx.shadowBlur = 20;
          ctx.shadowColor = '#00f2fe';
          ctx.fill();
        }
      }

      // Draw enemies
      gameRef.current.enemies.forEach(e => e.draw(ctx, enemyImgs.current));
      
      ctx.restore();
    };

    const gameOver = () => {
      // This is now handled by triggerGameOver after deathTimer
    };

    const triggerGameOver = () => {
      setGameState('GAMEOVER');
      gameRef.current.shake = 15;
      soundManager.current?.stopBGM();
      soundManager.current?.playSFX('gameover');
      
      // Explosion particles
      for (let i = 0; i < 50; i++) {
        gameRef.current.particles.push(new Particle(gameRef.current.player.x, gameRef.current.player.y, '#00f2fe', true));
      }

      const finalScore = Math.floor(gameRef.current.score);
      if (finalScore > highScore) {
        setHighScore(finalScore);
        localStorage.setItem('dodge_survive_highscore', finalScore.toString());
      }
    };

    animationFrameId = requestAnimationFrame(loop);

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      cancelAnimationFrame(animationFrameId);
    };
  }, [gameState, highScore]);

  const startGame = () => {
    gameRef.current = {
      player: { x: window.innerWidth / 2, y: window.innerHeight / 2, radius: PLAYER_RADIUS, lastDx: 0, lastDy: 0, hasShield: false },
      enemies: [],
      powerUps: [],
      particles: [],
      keys: {},
      lastTime: performance.now(),
      spawnTimer: 0,
      powerUpTimer: 0,
      currentSpawnRate: INITIAL_SPAWN_RATE,
      enemySpeed: 100,
      score: 0,
      shake: 0,
      deathTimer: 0,
      abilities: {
        dash: { cooldown: 0, active: false, duration: 0 },
        shield: { cooldown: 0, active: false, duration: 0 },
        slowMo: { cooldown: 0, active: false, duration: 0 }
      },
      activePowerUps: []
    };
    setScore(0);
    setActivePowerUps([]);
    setGameState('PLAYING');
    soundManager.current?.playBGM();
  };

  return (
    <div id="game-container" className={slowMoStatus.active ? 'slow-mo-active' : ''}>
      <div className="animated-bg" />
      <div className="slow-mo-overlay" />
      <div className={`hit-flash ${hitFlash ? 'active' : ''}`} />
      
      <canvas ref={canvasRef} />

      {gameState === 'PLAYING' && (
        <>
          <div className="score-display">SCORE: {score}</div>
          <div className="high-score-display">BEST: {highScore}</div>
          
          <button 
            className="sound-toggle"
            onClick={() => setIsMuted(soundManager.current?.toggleMute() || false)}
            title={isMuted ? "Unmute" : "Mute"}
          >
            {isMuted ? <VolumeX size={20} /> : <Volume2 size={20} />}
          </button>

          <div className="active-powerups-container">
            {activePowerUps.map((pu, idx) => (
              <motion.div 
                key={pu.type + idx}
                className="powerup-timer-item"
                initial={{ x: -20, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: -20, opacity: 0 }}
              >
                <div className="powerup-icon-small" style={{ backgroundColor: POWERUP_CONFIG[pu.type].color }} />
                <div className="text-[10px] font-bold uppercase tracking-wider">{POWERUP_CONFIG[pu.type].label}</div>
                <div className="powerup-timer-bar-bg">
                  <div 
                    className="powerup-timer-bar-fill" 
                    style={{ 
                      width: `${(pu.duration / pu.maxDuration) * 100}%`,
                      backgroundColor: POWERUP_CONFIG[pu.type].color
                    }} 
                  />
                </div>
              </motion.div>
            ))}
          </div>

          <div className="abilities-container">
            <div className={`ability-icon ${dashStatus.active ? 'active' : dashStatus.cooldown <= 0 ? 'ready' : 'cooldown'}`}>
              <div className="ability-key">SPACE</div>
              <div className="ability-name">Dash</div>
              {dashStatus.cooldown > 0 && !dashStatus.active && (
                <div className="cooldown-overlay" style={{ height: `${(dashStatus.cooldown / dashStatus.maxCooldown) * 100}%` }} />
              )}
            </div>
            <div className={`ability-icon ${shieldStatus.active ? 'active' : shieldStatus.cooldown <= 0 ? 'ready' : 'cooldown'}`}>
              <div className="ability-key">SHIFT</div>
              <div className="ability-name">Shield</div>
              {shieldStatus.cooldown > 0 && !shieldStatus.active && (
                <div className="cooldown-overlay" style={{ height: `${(shieldStatus.cooldown / shieldStatus.maxCooldown) * 100}%` }} />
              )}
            </div>
            <div className={`ability-icon ${slowMoStatus.active ? 'active' : slowMoStatus.cooldown <= 0 ? 'ready' : 'cooldown'}`}>
              <div className="ability-key">E</div>
              <div className="ability-name">Slow</div>
              {slowMoStatus.cooldown > 0 && !slowMoStatus.active && (
                <div className="cooldown-overlay" style={{ height: `${(slowMoStatus.cooldown / slowMoStatus.maxCooldown) * 100}%` }} />
              )}
            </div>
          </div>
        </>
      )}

      <AnimatePresence>
        {gameState === 'START' && (
          <motion.div 
            className="ui-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="glass-panel">
              <h1 className="text-5xl font-black mb-2 tracking-tighter italic text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-600">
                DODGE & SURVIVE
              </h1>
              <p className="text-gray-400 mb-8 uppercase tracking-widest text-sm">Avoid the red orbs. Stay alive.</p>
              
              <div className="grid grid-cols-3 gap-4 mb-8">
                <div className="text-center">
                  <div className="text-cyan-400 font-bold text-xs mb-1">SPACE</div>
                  <div className="text-white text-xs font-mono">DASH</div>
                </div>
                <div className="text-center">
                  <div className="text-cyan-400 font-bold text-xs mb-1">SHIFT</div>
                  <div className="text-white text-xs font-mono">SHIELD</div>
                </div>
                <div className="text-center">
                  <div className="text-cyan-400 font-bold text-xs mb-1">E</div>
                  <div className="text-white text-xs font-mono">SLOW</div>
                </div>
              </div>

              <button className="btn-primary" onClick={startGame}>
                Start Game
              </button>
              <div className="mt-8 text-xs text-gray-500 font-mono">
                WASD / ARROWS TO MOVE
              </div>
            </div>
          </motion.div>
        )}

        {gameState === 'GAMEOVER' && (
          <motion.div 
            className="ui-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="glass-panel">
              <h2 className="text-4xl font-black mb-2 text-red-500 italic">GAME OVER</h2>
              <div className="text-6xl font-bold mb-1 text-white">{score}</div>
              <p className="text-gray-400 mb-8 uppercase tracking-widest text-sm">Final Score</p>
              
              {score >= highScore && score > 0 && (
                <div className="mb-6 text-cyan-400 font-bold animate-pulse">NEW HIGH SCORE!</div>
              )}

              <button className="btn-primary" onClick={startGame}>
                Try Again
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
