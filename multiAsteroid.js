// noinspection JSUnusedGlobalSymbols

const {
  Server
} = require("socket.io");
require("util");
require("url");
const app = require("http").createServer(handler),
    io = new Server(app),
    https = require("https"),
    fs = require("fs"),
    FPS = 45,
    MAX_X = 3200,
    MAX_Y = 2400,
    NUM_ROCKS = 200,
    NUM_STARS = 1000,
    BULLET_DISTANCE = 300,
    MAX_PLAYERS = 25,
    port = process.env.PORT || 8125,
    starPositions = [];

app.listen(port);
console.log("starting app");
console.log("port : " + port);

// Logging utility with timestamps
function log(level, message, data = null) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] [${level}] ${message}`;
  
  if (data) {
    console.log(logMessage, data);
  } else {
    console.log(logMessage);
  }
}

// Log levels: INFO, DEBUG, WARN, ERROR
function logInfo(message, data) { log('INFO', message, data); }
function logDebug(message, data) { log('DEBUG', message, data); }
function logWarn(message, data) { log('WARN', message, data); }
function logError(message, data) { log('ERROR', message, data); }

var characterNames;

function initializeStarWarsCharacterNames() {
  fs.readFile('star_wars_character_names.txt', function(err, data) {
    if(err) {
      logError('Failed to load Star Wars character names', err);
      throw err;
    }
    characterNames = data.toString().split("\n");
    logInfo(`Loaded ${characterNames.length} character names for bots`);
});
}

function initializeStarsPositions() {
  for (let i = 0; i < NUM_STARS; i++) {
    const x = Math.round(Math.random() * MAX_X);
    const y = Math.round(Math.random() * MAX_Y);
    starPositions.push([x, y]);
  }
  logInfo(`Generated ${NUM_STARS} star positions for background`);
}

function addCommand(command, pos) {
  if (command[0] === "rp")
    io.sockets.emit("rp", {
      sId: command[1]["sessionId"]
    });
  else {
    for (let k in PlayerSession.all) {
      if (PlayerSession.all.hasOwnProperty(k)) {
        const ps = PlayerSession.all[k];
        if (ps.socket != null && (pos == null || ps.isVisibleTo(pos) === 1)) {
          //console.log("loc " + ps.turret.x + ", " + ps.turret.y);
          ps.pushCommand(command);
        }
      }
    }
  }
  //commandQueue.push(command);
}

function handler(req, res) {
  fs.readFile("multiAsteroid.html", "utf-8", function (err, data) {
    if (err) {
      res.writeHead(500);
      return res.end("Error loading game!");
    }

    res.writeHead(200, {
      "Content-Type": "text/html",
    });
    res.end(data);
  });
}

function createBOT() {
  const id = generateUUID();
  const turret = new Turret(
      Math.round(Math.random() * (MAX_X - 40)) + 20,
      Math.round(Math.random() * (MAX_Y - 40)) + 20,
      id
  );
  const playerSession = new PlayerSession(id, turret, 1, null);
  createBOTName(playerSession);
  // Removed BOT creation debug log for performance
}

function createBOTName(playerSession) {
  let n = characterNames.length;
  playerSession.name = characterNames[Math.floor(Math.random() * n)];
}

function createPlayerBOTSession(id, socket) {
  const turret = new Turret(
      Math.round(Math.random() * (MAX_X - 40)) + 20,
      Math.round(Math.random() * (MAX_Y - 40)) + 20,
      id
  );
  const playerSession = new PlayerSession(id, turret, 1, socket);
  createBOTName(playerSession);
  if (socket != null) {
    socket.emit("connected", {
      sessionId: id,
      x: turret.x,
      y: turret.y,
      color: turret.color,
      isNew: false,
      timeLeft: 0,
      life: turret.life,
      MAX_X: MAX_X,
      MAX_Y: MAX_Y,
    });
  }
  return playerSession;
}

function createPlayerSession(id, socket) {
  const turret = new Turret(
      Math.round(Math.random() * (MAX_X - 40)) + 20,
      Math.round(Math.random() * (MAX_Y - 40)) + 20,
      id
  );
  const playerSession = new PlayerSession(id, turret, 0, socket);
  playerSession.name = "NAME";
  if (socket != null) {
    socket.emit("connected", {
      sessionId: id,
      x: turret.x,
      y: turret.y,
      color: turret.color,
      isNew: playerSession.isNew(),
      timeLeft: 6000 - (new Date().getTime() - turret.date.getTime()),
      life: turret.life,
      MAX_X: MAX_X,
      MAX_Y: MAX_Y,
    });
    
    // Send current power-up state (or lack thereof)
    socket.emit("powerUp", {
      activePowerUp: playerSession.activePowerUp
    });
  }
  return playerSession;
}

io.on("connection", function (socket) {
  logInfo(`New connection from ${socket.handshake.address}, sessionId: ${socket.id}`);
  const sessionId = socket.id;
  
  socket.emit("stars", {
    stars: starPositions
  });

  socket.on("cps", function () {
    const sessionId = socket.id;
    logInfo(`Creating human player session for ${sessionId}`);
    createPlayerSession(sessionId, socket);
  });

  socket.on("cbs", function () {
    const sessionId = socket.id;
    logInfo(`Creating BOT player session for ${sessionId}`);
    createPlayerBOTSession(sessionId, socket);
  });

  socket.on("gb", function (data) {
    const id = data["id"];
    const bullet = Bullet.all[id];
    if (bullet != null) socket.emit("gb", bullet.serialize());
  });

  socket.on("gr", function (data) {
    const id = data["id"];
    const rock = Rock.all[id];
    if (rock != null) socket.emit("cr", rock.serialize());
  });

  socket.on("wr", function (data) {
    const sessId = data["sId"];
    const scale = data["s"];
    const width = data["w"];
    const height = data["h"];
    const ps = PlayerSession.all[sessId];
    if (ps != null) {
      ps.scale = scale;
      ps.canvasWidth = width;
      ps.canvasHeight = height;
    }
  });

  socket.on("disconnect", function (data) {
    const sessionId = socket.id;
    const playerSession = PlayerSession.all[sessionId];
    
    if (playerSession == null) {
      logWarn(`Disconnect event for unknown session: ${sessionId}`);
      return;
    }
    
    logInfo(`Player ${playerSession.name || 'Unnamed'} (${sessionId}) disconnected. Kills: ${playerSession.kills}`);
    playerSession.remove();
    
    addCommand(
      [
        "rp",
        {
          sessionId: sessionId,
        },
      ],
      [playerSession.turret.x, playerSession.turret.y]
    );
  });

  // Movement is now handled by mouse position - no keyboard movement handlers needed

  socket.on("mp", function (data) {
    const ps = PlayerSession.all[socket.id];
    if (ps == null) return;
    const turret = ps.turret;
    turret.mousePosX = data["mousePosX"];
    turret.mousePosY = data["mousePosY"];
  });

  socket.on("serverLog", function (data) {
    const log = data["log"];
    console.log("Server Log :" + log);
  });

  socket.on("md", function () {
    const ps = PlayerSession.all[socket.id];
    if (ps == null) return;
    ps.mouseDown = 1;
  });

  socket.on("mu", function () {
    const ps = PlayerSession.all[socket.id];
    if (ps == null) return;
    ps.mouseDown = 0;
  });

  socket.on("nickName", function (data) {
    if (!data["name"]) {
      logWarn(`Empty nickname received from ${socket.id}`);
      return;
    }
    
    const ps = PlayerSession.all[socket.id];
    if (ps == null) {
      logWarn(`Nickname change for unknown session: ${socket.id}`);
      return;
    }
    
    const oldName = ps.name;
    ps.name = data["name"];
    logInfo(`Player ${socket.id} changed name from "${oldName}" to "${ps.name}"`);
  });

  socket.on("syncPowerUp", function (data) {
    const ps = PlayerSession.all[socket.id];
    if (ps == null) return;
    
    // Send current server-side power-up state to client
    socket.emit("powerUp", {
      activePowerUp: ps.activePowerUp
    });
    
    // Removed power-up sync debug log for performance
  });
});

// Constructor
function Turret(x, y, sessionId) {
  this.x = x;
  this.y = y;
  this.length = 20;
  this.speed = 6;
  this.date = new Date();
  this.fillIdx = 0;
  this.hor = 0;
  this.ver = 0;
  this.color = nextTurretColor();
  this.recoil = 0;
  this.baseRadius = 10;
  this.mousePosX = MAX_X / 2;
  this.mousePosY = MAX_Y / 2;
  this.recoilX = 0;
  this.recoilY = 0;
  this.sessionId = sessionId;
  this.life = 100;
}

Turret.prototype = {
  move: function () {
    // Mouse-follow movement: ship smoothly moves toward mouse cursor position
    const targetX = this.mousePosX;
    const targetY = this.mousePosY;
    
    // Calculate distance to target
    const deltaX = targetX - this.x;
    const deltaY = targetY - this.y;
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    
    // Only move if we're not already very close to the target
    if (distance > 5) {
      // Smooth movement - move a percentage of the distance each frame
      const moveSpeed = Math.min(this.speed, distance * 0.15); // Adaptive speed
      const angle = Math.atan2(deltaY, deltaX);
      
      let newX = this.x + Math.cos(angle) * moveSpeed;
      let newY = this.y + Math.sin(angle) * moveSpeed;
      
      // Keep within bounds
      if (newX - this.baseRadius >= 0 && newX + this.baseRadius <= MAX_X) {
        this.x = newX;
      }
      if (newY - this.baseRadius >= 0 && newY + this.baseRadius <= MAX_Y) {
        this.y = newY;
      }
    }
    this.x = Math.round(this.x);
    this.y = Math.round(this.y);
    this.angle = Math.atan2(this.mousePosY - this.y, this.mousePosX - this.x);
    const recoilAngle = this.angle + Math.PI;
    this.recoilX = Math.round(this.x + this.recoil * Math.cos(recoilAngle));
    this.recoilY = Math.round(this.y + this.recoil * Math.sin(recoilAngle));
    if (this.recoil > 0) {
      this.recoil -= 1;
    }
    turretCollideTurret(this);
  },
};

const turretColors = [
  "orange",
  "red",
  "blue",
  "purple",
  "yellow",
  "green",
  "pink",
];

let currColorIdx = 0;

function nextTurretColor() {
  const colorIdx = currColorIdx;
  currColorIdx = (currColorIdx + 1) % turretColors.length;
  return turretColors[colorIdx];
}

function BSM() {
  this.state = "WANDER";
  this.destX = Math.round(Math.random() * MAX_X);
  this.destY = Math.round(Math.random() * MAX_Y);
  this.currVx = 0;
  this.currVy = 0;
  this.aheadX = 0;
  this.aheadY = 0;
  this.shortAheadX = 0;
  this.shortAheadY = 0;
  this.lastTicked = new Date();
  this.tickFreq = 2000;
  this.aheadDist = 100;
}

BSM.prototype = {
  getMostThreateningObstacle: function (sessionId) {
    let dist;
    let idx;
    let x = 0;
    let y = 0;
    let currMin = 1000000;
    for (idx in Rock.all) {
      const rock = Rock.all[idx];
      dist = this.getDistance(
        rock.x,
        rock.y,
        this.shortAheadX,
        this.shortAheadY
      );
      if (dist <= rock.r * 1.2 && dist < currMin) {
        currMin = dist;
        x = rock.x;
        y = rock.y;
      }
      dist = this.getDistance(rock.x, rock.y, this.aheadX, this.aheadY);
      if (dist <= rock.r * 1.2 && dist < currMin) {
        currMin = dist;
        x = rock.x;
        y = rock.y;
      }
    }

    for (idx in PlayerSession.all) {
      const turret = PlayerSession.all[idx].turret;
      if (turret.sessionId === sessionId) continue;
      dist = this.getDistance(
          turret.x,
          turret.y,
          this.shortAheadX,
          this.shortAheadY
      );
      if (dist <= 30 && dist < currMin) {
        currMin = dist;
        x = turret.x;
        y = turret.y;
      }
      dist = this.getDistance(turret.x, turret.y, this.aheadX, this.aheadY);
      if (dist <= 30 && dist < currMin) {
        currMin = dist;
        x = turret.x;
        y = turret.y;
      }
    }
    if (currMin < 10000) return [x, y];
    else return null;
  },
  getDistance: function (x1, y1, x2, y2) {
    return Math.sqrt((x1 - x2) * (x1 - x2) + (y1 - y2) * (y1 - y2));
  },
  calculateAheadVector: function (x, y) {
    const angle = Math.atan2(this.currVy, this.currVx);
    this.aheadX = x + Math.cos(angle) * this.aheadDist;
    this.aheadY = y + Math.sin(angle) * this.aheadDist;
    this.shortAheadX = x + Math.cos(angle) * 10;
    this.shortAheadY = y + Math.sin(angle) * 10;
  },
};

function PlayerSession(sessionId, turret, isBot, socket) {
  this.sessionId = sessionId;
  this.turret = turret;
  this.moved = false;
  this.mouseDown = 0;
  this.mouseDate = new Date();
  this.date = new Date();
  this.kills = 0;
  this.name = "";
  this.bsm = null;
  this.isBot = isBot;
  if (isBot === 1) {
    this.bsm = new BSM();
  }
  this.socket = socket;
  this.commandQueue = [];
  this.canvasWidth = 800;
  this.canvasHeight = 600;
  this.scale = 1;
  this.activePowerUp = null; // single active power-up: "rockets", "lasers", "spreadShot", "rapidFire", or null
  PlayerSession.all[this.sessionId] = this;
}

PlayerSession.all = {};

PlayerSession.prototype = {
  remove: function () {
    delete PlayerSession.all[this.sessionId];
  },
  isNew: function () {
    const now = new Date();
    return now - this.date < 6000;
  },
  findNearestTarget: function() {
    let nearestTarget = null;
    let nearestDistance = Infinity;
    const maxSeekRange = 400; // Auto-aim range
    const needsShield = this.turret.life < 50; // Prioritize shield regen when health is low
    
    // First priority: Shield regeneration asteroids if health is low
    if (needsShield) {
      for (const rockId in Rock.all) {
        const rock = Rock.all[rockId];
        if (rock.color === "lightblue") { // Shield regeneration asteroids
          const distance = Math.sqrt(
            (rock.x - this.turret.x) ** 2 + 
            (rock.y - this.turret.y) ** 2
          );
          
          if (distance <= maxSeekRange && distance < nearestDistance) {
            nearestDistance = distance;
            nearestTarget = { type: 'rock', target: rock, x: rock.x, y: rock.y };
          }
        }
      }
      
      // If we found a shield asteroid, return it immediately
      if (nearestTarget) return nearestTarget;
    }
    
    // Second priority: Enemy players
    for (const sessionId in PlayerSession.all) {
      const ps = PlayerSession.all[sessionId];
      
      // Skip self, invalid players, dead players, and new players
      if (!ps || !ps.turret || sessionId === this.sessionId) continue;
      if (ps.turret.life <= 0 || ps.isNew()) continue;
      
      const distance = Math.sqrt(
        (ps.turret.x - this.turret.x) ** 2 + 
        (ps.turret.y - this.turret.y) ** 2
      );
      
      // Only consider enemies within range
      if (distance <= maxSeekRange && distance < nearestDistance) {
        nearestDistance = distance;
        nearestTarget = { type: 'player', target: ps, x: ps.turret.x, y: ps.turret.y };
      }
    }
    
    // Third priority: Regular asteroids (only if no enemies found)
    if (!nearestTarget) {
      for (const rockId in Rock.all) {
        const rock = Rock.all[rockId];
        const distance = Math.sqrt(
          (rock.x - this.turret.x) ** 2 + 
          (rock.y - this.turret.y) ** 2
        );
        
        // Only target asteroids at closer range to avoid constantly shooting at distant rocks
        if (distance <= maxSeekRange * 0.7 && distance < nearestDistance) {
          nearestDistance = distance;
          nearestTarget = { type: 'rock', target: rock, x: rock.x, y: rock.y };
        }
      }
    }
    
    return nearestTarget;
  },
  shouldAutoFire: function() {
    // Auto-fire if there's a target in range (enemies, shield asteroids, etc.)
    const targetInfo = this.findNearestTarget();
    if (targetInfo) {
      // Update turret angle to aim at target for auto-firing
      this.turret.angle = Math.atan2(
        targetInfo.y - this.turret.y, 
        targetInfo.x - this.turret.x
      );
      return true;
    }
    return false;
  },
  tick: function () {
    this.wander();
    this.avoid();
    const angle = Math.atan2(this.bsm.currVy, this.bsm.currVx);
    this.turret.x = Math.round(
      this.turret.x + this.turret.speed * Math.cos(angle)
    );
    this.turret.y = Math.round(
      this.turret.y + this.turret.speed * Math.sin(angle)
    );
    const recoilAngle = this.turret.angle + Math.PI;
    this.turret.recoilX = Math.round(
      this.turret.x + this.turret.recoil * Math.cos(recoilAngle)
    );
    this.turret.recoilY = Math.round(
      this.turret.y + this.turret.recoil * Math.sin(recoilAngle)
    );
    if (this.turret.recoil > 0) {
      this.turret.recoil -= 1;
    }
    this.turret.mousePosX = this.bsm.destX;
    this.turret.mousePosY = this.bsm.destY;
    turretCollideTurret(this.turret);
  },
  wander: function () {
    const now = new Date();
    if (now - this.bsm.lastTicked > this.bsm.tickFreq) {
      this.bsm.destX = Math.round(Math.random() * MAX_X);
      this.bsm.destY = Math.round(Math.random() * MAX_Y);
      this.bsm.lastTicked = now;
    }
    const angle = Math.atan2(
        this.bsm.destY - this.turret.y,
        this.bsm.destX - this.turret.x
    );
    const destVx = Math.cos(angle);
    const destVy = Math.sin(angle);
    const dVx = (destVx - this.bsm.currVx) * 0.05;
    const dVy = (destVy - this.bsm.currVy) * 0.05;
    this.bsm.currVx = this.bsm.currVx + dVx;
    this.bsm.currVy = this.bsm.currVy + dVy;
    this.turret.angle = angle;
  },
  avoid: function () {
    this.bsm.calculateAheadVector(this.turret.x, this.turret.y);
    const pos = this.bsm.getMostThreateningObstacle(this.turret.sessionId);
    if (pos != null) {
      const angle = Math.atan2(
          this.bsm.aheadY - pos[1],
          this.bsm.aheadX - pos[0]
      );
      const avoidanceX = Math.cos(angle);
      const avoidanceY = Math.sin(angle);
      this.bsm.currVx = this.bsm.currVx + avoidanceX;
      this.bsm.currVy = this.bsm.currVy + avoidanceY;
      this.turret.angle = Math.atan2(pos[1] - this.turret.y, pos[0] - this.turret.x);
      this.mouseDown = 1;
    } else {
      this.mouseDown = 0;
    }
  },
  pushCommand: function (cmd) {
    this.commandQueue.push(cmd);
  },
  sendUpdate: function () {
    if (this.commandQueue.length === 0) return;
    if (this.socket != null) {
      //console.log("sendUpdate");
      this.socket.emit("uw", {
        updateWorld: this.commandQueue
      });
      this.commandQueue = [];
    }
  },
  isVisibleTo: function (pos) {
    //return 1;
    if (pos == null || pos.length !== 2) return 0;
    const xos = this.getXOffset();
    const yos = this.getYOffset();
    //console.log("here");
    //console.log("offset " + xos + ", " + yos);
    //console.log("net pos " + (pos[0] + xos) + ", " +  (pos[1] + yos));
    if (
      pos[0] + xos >= -150 &&
      pos[0] + xos <= 950 &&
      pos[1] + yos >= -150 &&
      pos[1] + yos <= 750
    ) {
      //console.log("here 3");
      return 1;
    }
    //console.log("here 2");
    return 0;
  },
  getXOffset: function () {
    //console.log("here");
    const negX = -1 * this.turret.x;
    const offset = negX + this.canvasWidth / 2 / this.scale;
    if (this.turret.x < this.canvasWidth / 2 / this.scale) {
      return 0;
    } else if (this.turret.x > MAX_X - this.canvasWidth / 2 / this.scale) {
      return -(MAX_X - this.canvasWidth / this.scale);
    }
    //console.log("here");
    return offset;
  },
  getYOffset: function () {
    const negY = -1 * this.turret.y;
    const offset = negY + this.canvasHeight / 2 / this.scale;
    if (this.turret.y < this.canvasHeight / 2 / this.scale) {
      return 0;
    } else if (this.turret.y > MAX_Y - this.canvasHeight / 2 / this.scale) {
      return -(MAX_Y - this.canvasHeight / this.scale);
    }
    return offset;
  },
  spawnPowerUpOnDeath: function() {
    // Spawn a random power-up at the player's death location
    const powerUpTypes = ['rockets', 'lasers', 'spreadShot', 'rapidFire'];
    const randomType = powerUpTypes[Math.floor(Math.random() * powerUpTypes.length)];
    
    // Add some randomness to the spawn position so they don't all stack
    const spawnX = this.turret.x + (Math.random() - 0.5) * 50;
    const spawnY = this.turret.y + (Math.random() - 0.5) * 50;
    
    // Make sure it's within bounds
    const clampedX = Math.max(20, Math.min(MAX_X - 20, spawnX));
    const clampedY = Math.max(20, Math.min(MAX_Y - 20, spawnY));
    
    const powerUp = new PowerUp(clampedX, clampedY, randomType);
    
    // Notify all clients about the new power-up
    addCommand(["cpu", powerUp.serialize()], [clampedX, clampedY]);
    
    logInfo(`${this.name} dropped ${randomType} power-up at (${Math.round(clampedX)}, ${Math.round(clampedY)})`);
  }
};

// Power-up weapon configurations
const WEAPON_CONFIGS = {
  normal: {
    speed: 12, // Slower bullets (was 16)
    size: 3,   // Smaller bullets (was 4)
    fireRate: 250,
    count: 1,
    spread: 0,
    color: 'inherit'
  },
  rockets: {
    speed: 1.0, // double the speed again
    size: 8,
    fireRate: 200, // 4x faster fire rate (800/4)
    count: 1,
    spread: 0,
    color: 'orange'
  },
  lasers: {
    speed: 24,
    size: 2,
    fireRate: 150,
    count: 1,
    spread: 0,
    color: 'cyan'
  },
  spreadShot: {
    speed: 14,
    size: 3,
    fireRate: 400,
    count: 5,
    spread: 0.5,
    color: 'yellow'
  },
  rapidFire: {
    speed: 18,
    size: 4,
    fireRate: 120, // faster fire rate
    count: 1,
    spread: 0,
    color: 'lime'
  }
};

initializeStarWarsCharacterNames();
initializeStarsPositions();

let lastPushTime = new Date();

//Tick the world
let tickCount = 0;
let lastPlayerCountLog = new Date();

setInterval(function () {
  tickCount++;
  
  if (Object.keys(PlayerSession.all).length < MAX_PLAYERS) {
    createBOT();
  }
  
  // Log player count every 30 seconds
  const currentTime = new Date();
  if (currentTime - lastPlayerCountLog > 30000) {
    const totalPlayers = Object.keys(PlayerSession.all).length;
    const humanPlayers = Object.values(PlayerSession.all).filter(ps => ps.isBot !== 1).length;
    const bots = totalPlayers - humanPlayers;
    logInfo(`Game stats - Total: ${totalPlayers}, Humans: ${humanPlayers}, Bots: ${bots}, Rocks: ${Object.keys(Rock.all).length}, Bullets: ${Object.keys(Bullet.all).length}`);
    lastPlayerCountLog = currentTime;
  }
  const scoreQueue = [];
  for (let key in PlayerSession.all) {
    if (PlayerSession.all.hasOwnProperty(key)) {
      const ps = PlayerSession.all[key];
      const sId = ps.sessionId;
      const turret = ps.turret;
      if (ps.isBot === 1) {
        ps.tick();
      } else {
        // Human player logic
        turret.move();
        
        // Auto-fire system for human players
        if (ps.shouldAutoFire()) {
          ps.mouseDown = 1;
        } else {
          ps.mouseDown = 0;
        }
      }
      scoreQueue.push({
        n: ps.name,
        s: ps.kills
      });
      const loc = [turret.x, turret.y];
      addCommand(
        [
          "tm",
          {
            sId: sId,
            x: turret.x,
            y: turret.y,
            c: turret.color,
            r: turret.recoil,
            mpx: turret.mousePosX,
            mpy: turret.mousePosY,
            rx: turret.recoilX,
            ry: turret.recoilY,
            a: turret.angle,
            tl: 6000 - (new Date().getTime() - turret.date.getTime()),
            k: ps.kills,
            n: ps.name,
            l: turret.life,
          },
        ],
        loc
      );
    }
  }
  moveBullets();
  createRocks();
  moveRocks();
  createAllBullets();
  updatePowerUps();
  emitWorld();
  //console.log("queue length = " + scoreQueue.length);
  const pushTime = new Date();
  if (pushTime.getTime() - lastPushTime.getTime() >= 2000) {
    io.sockets.emit("lb", {
      ss: scoreQueue
    });
    lastPushTime = pushTime;
  }
}, 1000 / FPS);

function emitWorld() {
  for (let k in PlayerSession.all) {
    //if (PlayerSession.all.hasOwnProperty(k)) {
    const ps = PlayerSession.all[k];
    //verifyUpdate(ps);
    ps.sendUpdate();
    //}
  }
}

// Constructor
function Bullet(x, y, r, color, sessionId) {
  this.ox = x;
  this.oy = y;
  this.x = x;
  this.y = y;
  this.r = r;
  this.vx = 0;
  this.vy = 0;
  this.sessionId = sessionId;
  this.color = color;
  this.type = "normal"; // power-up weapon type
  this.targetId = null; // for homing rockets
  
  // Rocket physics properties
  this.thrust = 0.2; // double the thrust again (0.1 * 2)
  this.maxSpeed = 3.0; // double the max speed again (1.5 * 2)
  this.turnRate = 0.4; // keep aggressive turning for good homing
  this.fuelTime = 4000; // 4 seconds of fuel for longer homing
  this.launchTime = Date.now(); // when rocket was fired
  this.lastTargetTime = Date.now(); // track when we last found a target
  this.noTargetTimeout = 5000; // remove after 5 seconds without target
  // No drag - rockets maintain their speed in space
  
  this.id = this.getId();
  Bullet.all[this.id] = this;
}
Bullet.all = {};

//Bullet.id = 0;

Bullet.prototype = {
  remove: function () {
    delete Bullet.all[this.id];
    addCommand(
      [
        "rb",
        {
          id: this.id,
        },
      ],
      [this.x, this.y]
    );
  },
  serialize: function () {
    return {
      x: this.x,
      y: this.y,
      r: this.r,
      vx: this.vx,
      vy: this.vy,
      sessionId: this.sessionId,
      color: this.color,
      type: this.type,
      id: this.id,
    };
  },
  getId: function () {
    return generateUUID();
  },
  findNearestTarget: function() {
    let nearestTarget = null;
    let nearestDistance = Infinity;
    
    // Get the shooter to check their health for prioritization
    const shooter = PlayerSession.all[this.sessionId];
    const shooterHealth = shooter && shooter.turret ? shooter.turret.life : 100;
    const needsShield = shooterHealth < 50; // Prioritize shield regen when health is low
    
    // First priority: Shield regeneration asteroids if health is low
    if (needsShield) {
      for (let rockId in Rock.all) {
        const rock = Rock.all[rockId];
        if (rock.color === "lightblue") { // Shield regeneration asteroids
          const dx = rock.x - this.x;
          const dy = rock.y - this.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          
          if (dist < nearestDistance) {
            nearestDistance = dist;
            nearestTarget = { type: 'rock', target: rock, x: rock.x, y: rock.y };
          }
        }
      }
      
      // If we found a shield asteroid, return it immediately
      if (nearestTarget) return nearestTarget;
    }
    
    // Second priority: Regular enemy players
    for (let sessionId in PlayerSession.all) {
      const ps = PlayerSession.all[sessionId];
      if (!ps || !ps.turret) continue;
      if (ps.sessionId === this.sessionId) continue; // don't target self
      if (ps.turret.life <= 0 || ps.isNew()) continue; // skip dead/new players
      
      const dx = ps.turret.x - this.x;
      const dy = ps.turret.y - this.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      
      if (dist < nearestDistance) {
        nearestDistance = dist;
        nearestTarget = { type: 'player', target: ps, x: ps.turret.x, y: ps.turret.y };
      }
    }
    
    // Third priority: Any asteroids (for general destruction)
    for (let rockId in Rock.all) {
      const rock = Rock.all[rockId];
      const dx = rock.x - this.x;
      const dy = rock.y - this.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      
      if (dist < nearestDistance) {
        nearestDistance = dist;
        nearestTarget = { type: 'rock', target: rock, x: rock.x, y: rock.y };
      }
    }
    
    return nearestTarget;
  },
  updateHoming: function() {
    if (this.type !== "rockets") return; // only rockets home
    
    const currentTime = Date.now();
    const age = currentTime - this.launchTime;
    const hasFuel = age < this.fuelTime;
    
    // Check for target timeout - remove rocket if no target found for too long
    const timeSinceLastTarget = currentTime - this.lastTargetTime;
    if (timeSinceLastTarget > this.noTargetTimeout) {
      logInfo(`Rocket ${this.id} removed - no target found for ${Math.round(timeSinceLastTarget/1000)}s`);
      this.remove();
      return;
    }
    
    if (hasFuel) {
      // Recalculate target every frame for dynamic homing
      const targetInfo = this.findNearestTarget();
      const currentSpeed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
      
      if (targetInfo) {
        // Update last target time since we found one
        this.lastTargetTime = currentTime;
        const targetName = targetInfo.type === 'player' ? targetInfo.target.name : 
                          (targetInfo.target.color === 'lightblue' ? 'Shield Asteroid' : 'Asteroid');
        // Removed debug log for performance
      } else {
        logWarn(`Rocket ${this.id} found NO targets! Time without target: ${Math.round(timeSinceLastTarget/1000)}s`);
      }
      
      if (targetInfo) {
        // Calculate desired direction to target
        const dx = targetInfo.x - this.x;
        const dy = targetInfo.y - this.y;
        const targetAngle = Math.atan2(dy, dx);
        
        // Current movement direction (or rocket facing if speed is very low)
        const currentAngle = currentSpeed > 0.5 ? 
          Math.atan2(this.vy, this.vx) : 
          Math.atan2(this.vy || 1, this.vx || 0);
        
        // Calculate angle difference
        let angleDiff = targetAngle - currentAngle;
        
        // Normalize angle difference to [-π, π]
        while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
        while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;
        
        // Turn rate decreases with speed but not as dramatically
        const speedFactor = Math.max(0.7, 1 - (currentSpeed / this.maxSpeed) * 0.3);
        const effectiveTurnRate = this.turnRate * speedFactor;
        
        // Limit turn rate
        if (Math.abs(angleDiff) > effectiveTurnRate) {
          angleDiff = angleDiff > 0 ? effectiveTurnRate : -effectiveTurnRate;
        }
        
        // Calculate thrust direction (where rocket wants to accelerate)
        const thrustAngle = currentAngle + angleDiff;
        
        // Apply thrust acceleration
        const thrustX = this.thrust * Math.cos(thrustAngle);
        const thrustY = this.thrust * Math.sin(thrustAngle);
        
        const oldVx = this.vx;
        const oldVy = this.vy;
        this.vx += thrustX;
        this.vy += thrustY;
        
        const distanceToTarget = Math.sqrt(dx * dx + dy * dy);
        const angleChange = Math.abs(angleDiff);
        // Removed verbose rocket movement debug log for performance
      } else {
        // No target - just thrust forward
        const currentAngle = Math.atan2(this.vy || 1, this.vx || 0);
        this.vx += this.thrust * Math.cos(currentAngle);
        this.vy += this.thrust * Math.sin(currentAngle);
      }
    }
    // No drag applied - rockets maintain their speed even without fuel
    
    // Cap maximum speed
    const currentSpeed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
    if (currentSpeed > this.maxSpeed) {
      const scale = this.maxSpeed / currentSpeed;
      this.vx *= scale;
      this.vy *= scale;
    }
  },
};

function PowerUp(x, y, type) {
  this.x = x;
  this.y = y;
  this.type = type; // "rockets", "lasers", "spreadShot", "rapidFire"
  this.id = generateUUID();
  this.spawnTime = Date.now();
  this.lifeTime = 15000; // 15 seconds before disappearing
  this.size = 12; // collision radius
  this.bobOffset = Math.random() * Math.PI * 2; // for floating animation
  
  // Slow drifting movement in space
  const driftSpeed = 0.3 + Math.random() * 0.4; // 0.3 to 0.7 pixels per frame
  const driftAngle = Math.random() * Math.PI * 2; // random direction
  this.vx = driftSpeed * Math.cos(driftAngle);
  this.vy = driftSpeed * Math.sin(driftAngle);
  this.rotationSpeed = (Math.random() - 0.5) * 0.02; // slow rotation
  this.rotation = 0;
  
  PowerUp.all[this.id] = this;
}

PowerUp.all = {};

PowerUp.prototype = {
  remove: function () {
    delete PowerUp.all[this.id];
    addCommand(["rpu", { id: this.id }], [this.x, this.y]);
  },
  update: function() {
    // Check if expired
    if (Date.now() - this.spawnTime > this.lifeTime) {
      this.remove();
      return;
    }
    
    // Update position (drifting in space)
    this.x += this.vx;
    this.y += this.vy;
    this.rotation += this.rotationSpeed;
    
    // Bounce off world boundaries (soft bounce)
    if (this.x <= this.size || this.x >= MAX_X - this.size) {
      this.vx *= -0.8; // reverse direction with some energy loss
      this.x = Math.max(this.size, Math.min(MAX_X - this.size, this.x));
    }
    if (this.y <= this.size || this.y >= MAX_Y - this.size) {
      this.vy *= -0.8; // reverse direction with some energy loss  
      this.y = Math.max(this.size, Math.min(MAX_Y - this.size, this.y));
    }
    
    // Send position update to clients (every few frames to reduce network traffic)
    if (Math.random() < 0.1) { // 10% chance each frame
      addCommand(["upu", {
        id: this.id,
        x: this.x,
        y: this.y,
        rotation: this.rotation
      }], [this.x, this.y]);
    }
    
    // Check collision with all players
    for (let sessionId in PlayerSession.all) {
      const ps = PlayerSession.all[sessionId];
      if (ps.isNew()) continue; // skip invulnerable new players
      
      const dist = distance(this.x, this.y, ps.turret.x, ps.turret.y);
      if (dist <= this.size + ps.turret.baseRadius) {
        // Player picked up power-up!
        this.applyToPlayer(ps);
        this.remove();
        return;
      }
    }
  },
  applyToPlayer: function(ps) {
    const oldPowerUp = ps.activePowerUp;
    ps.activePowerUp = this.type; // Replace current power-up
    
    // Send power-up update to client
    if (ps.socket != null) {
      ps.socket.emit("powerUp", {
        activePowerUp: ps.activePowerUp
      });
    }
    
    if (oldPowerUp !== ps.activePowerUp) {
      logInfo(`Player ${ps.name} picked up ${this.type} power-up (replaced ${oldPowerUp || 'normal'})`);
    }
  },
  serialize: function() {
    return {
      id: this.id,
      x: this.x,
      y: this.y,
      type: this.type,
      size: this.size,
      bobOffset: this.bobOffset,
      vx: this.vx,
      vy: this.vy,
      rotation: this.rotation,
      rotationSpeed: this.rotationSpeed
    };
  }
};

// Constructor
function Rock(x, y, r) {
  this.color = "white";
  this.x = x;
  this.y = y;
  this.r = r;
  this.angle = 0;
  this.vx = 0;
  this.vy = 0;
  this.jaggedNess = 10;
  this.coords = [];
  this.drawangle = 0;
  this.spinDirection = 1;
  this.numEdges = 18;
  this.id = this.getId();
  for (let idx = 1; idx <= this.numEdges; idx++) {
    const radius = this.r + (Math.random() - 1) * this.jaggedNess;
    const rx = radius * Math.cos(((2 * Math.PI) / this.numEdges) * idx);
    const ry = radius * Math.sin(((2 * Math.PI) / this.numEdges) * idx);
    const coord = [rx, ry];
    this.coords.push(coord);
  }
  //Rock.all.push(this);
  Rock.all[this.id] = this;
  //console.log("created rock " + this.id);
}

Rock.all = {};

Rock.id = 0;

Rock.prototype = {
  remove: function () {
    delete Rock.all[this.id];
    addCommand(
      [
        "rmr",
        {
          id: this.id,
        },
      ],
      [this.x, this.y]
    );
  },
  resize: function () {
    this.coords = [];
    for (let idx = 1; idx <= this.numEdges; idx++) {
      const radius = this.r + (Math.random() - 1) * this.jaggedNess;
      const rx = radius * Math.cos(((2 * Math.PI) / this.numEdges) * idx);
      const ry = radius * Math.sin(((2 * Math.PI) / this.numEdges) * idx);
      const coord = [rx, ry];
      this.coords.push(coord);
    }
    addCommand(["rr", this.serialize()], [this.x, this.y]);
  },
  serialize: function () {
    return {
      color: this.color,
      x: this.x,
      y: this.y,
      r: this.r,
      angle: this.angle,
      vx: this.vx,
      vy: this.vy,
      jaggedNess: this.jaggedNess,
      coords: this.coords,
      drawangle: this.drawangle,
      spinDirection: this.spinDirection,
      numEdges: this.numEdges,
      id: this.id,
    };
  },
  getId: function () {
    return generateUUID();
  },
};

function generateUUID() {
  let d = new Date().getTime();
  return "xxxxxxxx-xxxx-4xxx".replace(/[xy]/g, function (c) {
    const r = (d + Math.random() * 16) % 16 | 0;
    d = Math.floor(d / 16);
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function rndColor() {
  const simpleColors = ["grey", "silver", "lightblue"];
  return simpleColors[Math.floor(Math.random() * 3)];
}

let rockDate = new Date();

function createRocks() {
  const currDate = new Date();
  if (rockDate == null) {
    rockDate = currDate;
  } else {
    if (currDate - rockDate > 200 && Object.keys(Rock.all).length < NUM_ROCKS) {
      const side = Math.floor(Math.random() * 4);
      let startx = 0,
          starty = 0;
      switch (side) {
        case 0:
          startx = (MAX_X - 1) * Math.random();
          starty = 1;
          break;
        case 1:
          startx = (MAX_X - 1) * Math.random();
          starty = MAX_Y - 1;
          break;
        case 2:
          startx = 1;
          starty = (MAX_Y - 1) * Math.random();
          break;
        case 3:
          startx = MAX_X - 1;
          starty = (MAX_Y - 1) * Math.random();
          break;
      }
      const rock = new Rock(startx, starty, 45 * Math.random() + 15); // Smaller asteroids: 15-60 instead of 20-110
      rock.color = rndColor();
      const angle = Math.atan2(MAX_Y / 2 - rock.y, MAX_X / 2 - rock.x);
      const rockSpeed = 80 / rock.r;
      rock.vx = rockSpeed * Math.cos(angle);
      rock.vy = rockSpeed * Math.sin(angle);
      if (Math.random() > 0.5) {
        rock.spinDirection = -1;
      }
      // Removed rock creation debug log for performance
      rockDate = currDate;
    }
  }
}

function moveRocks() {
  for (let k in Rock.all) {
    if (Rock.all.hasOwnProperty(k)) {
      const rock = Rock.all[k];
      if (rock == null) continue;
      rock.x += rock.vx;
      rock.y += rock.vy;
      addCommand(
        ["ur", {
          id: rock.id,
          x: rock.x,
          y: rock.y
        }],
        [rock.x, rock.y]
      );
      for (let idx in PlayerSession.all) {
        if (PlayerSession.all.hasOwnProperty(idx)) {
          const ps = PlayerSession.all[idx];
          if (ps.isNew()) {
            continue;
          }
          rockCollideTurret(rock, ps);
        }
      }
      rockCollideRock(rock);
      if (
        rock.x <= 0 ||
        rock.y <= 0 ||
        rock.x % MAX_X !== rock.x ||
        rock.y % MAX_Y !== rock.y
      ) {
        rock.remove();
      }
    }
  }
}

//Rock to Turret collision
function rockCollideTurret(rock, ps) {
  if (distance(ps.turret.x, ps.turret.y, rock.x, rock.y) <= 5 + rock.r) {
    const damage = rock.r;
    if (ps.turret.life - damage <= 0) {
      logInfo(`${ps.name} was killed by asteroid collision (damage: ${Math.round(damage)})`);
      addCommand(
        [
          "rp",
          {
            sessionId: ps.sessionId,
          },
        ],
        [ps.turret.x, ps.turret.y]
      );
      ps.remove();
    } else {
      ps.turret.life = ps.turret.life - damage;
      // Removed asteroid collision debug log for performance
      addCommand(
        [
          "damagePlayer",
          {
            sessionId: ps.sessionId,
            life: ps.turret.life,
          },
        ],
        [ps.turret.x, ps.turret.y]
      );
    }
    rock.remove();
  }
}

function bulletCollideTurret(bullet) {
  for (let idx in PlayerSession.all) {
    if (PlayerSession.all.hasOwnProperty(idx)) {
      const ps = PlayerSession.all[idx];
      if (ps.isNew()) {
        continue;
      }
      
      // Prevent rockets from hitting their own shooter
      if (bullet.type === "rockets" && bullet.sessionId === ps.sessionId) {
        continue;
      }
      
      if (
        distance(ps.turret.x, ps.turret.y, bullet.x, bullet.y) <=
        bullet.r + 5
      ) {
        const damage = 20;
        const shooterSession = PlayerSession.all[bullet.sessionId];
        if (shooterSession != null) {
          shooterSession.kills += 1;
          shooterSession.turret.life = 100;
          logInfo(`${shooterSession.name} killed ${ps.name} with bullet. Shooter now has ${shooterSession.kills} kills`);
        }
        if (ps.turret.life - damage <= 0) {
          // Only spawn power-up if killed by another player
          if (shooterSession != null) {
            ps.spawnPowerUpOnDeath(); // Spawn power-up where killed player died
          }
          
          // Store power-up for potential respawn (if they had one)
          const preservedPowerUp = ps.activePowerUp;
          logInfo(`Player ${ps.name} died with power-up: ${preservedPowerUp || 'none'}`);
          
          addCommand(
            [
              "rp",
              {
                sessionId: ps.sessionId,
              },
            ],
            [ps.turret.x, ps.turret.y]
          );
          ps.remove();
        } else {
          ps.turret.life = ps.turret.life - damage;
          addCommand(
            [
              "damagePlayer",
              {
                sessionId: ps.sessionId,
                life: ps.turret.life,
              },
            ],
            [ps.turret.x, ps.turret.y]
          );
        }
        bullet.remove();
        //console.log("remove player 3-");
      }
    }
  }
}

function turretCollideTurret(turret) {
  //console.log("turretCollideTurret");
  for (let idx in PlayerSession.all) {
    if (PlayerSession.all.hasOwnProperty(idx)) {
      const ps = PlayerSession.all[idx];
      if (ps.isNew()) {
        continue;
      }
      if (ps.turret.sessionId === turret.sessionId) continue;
      const dist = distance(ps.turret.x, ps.turret.y, turret.x, turret.y);
      //console.log("dist " + dist);
      if (dist <= turret.baseRadius + ps.turret.baseRadius) {
        //console.log("collided");
        const damage = 20;
        if (ps.turret.life - damage <= 0) {
          const shooterSession = PlayerSession.all[turret.sessionId];
          if (shooterSession != null) {
            shooterSession.kills += 1;
            logInfo(`${shooterSession.name} killed ${ps.name} by ramming. Killer now has ${shooterSession.kills} kills`);
          }
          ps.spawnPowerUpOnDeath(); // Spawn power-up where rammed player died
          addCommand(
            [
              "rp",
              {
                sessionId: ps.sessionId,
              },
            ],
            [ps.turret.x, ps.turret.y]
          );
          //console.log("remove player 4 " + ps.sessionId);
          ps.remove();
        } else {
          ps.turret.life = ps.turret.life - damage;
          addCommand(
            [
              "damagePlayer",
              {
                sessionId: ps.sessionId,
                life: ps.turret.life,
              },
            ],
            [ps.turret.x, ps.turret.y]
          );
        }
        const playerSession = PlayerSession.all[turret.sessionId];
        if (playerSession == null) continue;
        if (playerSession.turret.life - damage <= 0) {
          ps.kills += 1;
          logInfo(`${ps.name} killed ${playerSession.name} by ramming. Killer now has ${ps.kills} kills`);
          playerSession.spawnPowerUpOnDeath(); // Spawn power-up where killed player died
          addCommand(
            [
              "rp",
              {
                sessionId: playerSession.sessionId,
              },
            ],
            [playerSession.turret.x, playerSession.turret.y]
          );
          playerSession.remove();
          //console.log("remove player 5 " + playerSession.sessionId);
        } else {
          playerSession.turret.life = playerSession.turret.life - damage;
          addCommand(
            [
              "damagePlayer",
              {
                sessionId: playerSession.sessionId,
                life: playerSession.turret.life,
              },
            ],
            [playerSession.turret.x, playerSession.turret.y]
          );
        }
      }
    }
  }
}

// Bullet to Rock collision
function bulletCollideRock(bullet) {
  for (let idx in Rock.all) {
    const rock = Rock.all[idx];
    if (distance(rock.x, rock.y, bullet.x, bullet.y) <= bullet.r + rock.r) {
      bullet.remove();
      const ps = PlayerSession.all[bullet.sessionId];
      if (ps == null) continue;
      const turret = ps.turret;
      if (rock.color === "lightblue")
        turret.life = Math.min(100, turret.life + 10);
      if (rock.r < 20) {
        rock.remove();
        //score += 1;
      } else {
        rock.r = rock.r - 5;
        rock.resize();
      }
      break;
    }
  }
}

function rockCollideRock(rock) {
  for (let idx in Rock.all) {
    const r = Rock.all[idx];
    if (rock.id === r.id) {
      continue;
    }
    if (distance(rock.x, rock.y, r.x, r.y) <= rock.r + r.r) {
      const diff = Math.abs(rock.r - r.r);
      if (diff < 20) {
        r.remove();
        rock.remove();
      } else {
        if (rock.r > r.r) {
          rock.r = rock.r - r.r;
          rock.resize();
          r.remove();
        } else {
          r.r = r.r - rock.r;
          r.resize();
          rock.remove();
        }
      }
      break;
    }
  }
}

function distance(x1, y1, x2, y2) {
  const diffx = x2 - x1;
  const diffy = y2 - y1;
  return Math.sqrt(diffx * diffx + diffy * diffy);
}

function moveBullets() {
  for (let k in Bullet.all) {
    if (Bullet.all.hasOwnProperty(k)) {
      const bullet = Bullet.all[k];
      if (bullet == null) continue;
      
      // Check max distance (rockets get extended range)
      const maxDistance = bullet.type === "rockets" ? BULLET_DISTANCE * 2 : BULLET_DISTANCE;
      if (distance(bullet.x, bullet.y, bullet.ox, bullet.oy) > maxDistance) {
        bullet.remove();
        continue;
      }
      
      // Update homing for rockets BEFORE moving
      bullet.updateHoming();
      
      // Move bullet
      bullet.x += bullet.vx;
      bullet.y += bullet.vy;
      
      // Send position update to clients
      addCommand(
        ["ub", {
          id: bullet.id,
          x: bullet.x,
          y: bullet.y,
          vx: bullet.vx, // include velocity for client-side rocket rendering
          vy: bullet.vy
        }],
        [bullet.x, bullet.y]
      );
      
      // Check collisions
      bulletCollideRock(bullet);
      bulletCollideTurret(bullet);
      
      // Remove if out of bounds
      if (
        bullet.x <= 0 ||
        bullet.y <= 0 ||
        bullet.x % MAX_X !== bullet.x ||
        bullet.y % MAX_Y !== bullet.y
      ) {
        bullet.remove();
      }
    }
  }
}

function createBullets(sessionId) {
  const now = new Date();
  const ps = PlayerSession.all[sessionId];
  const turret = ps.turret;
  
  if (!ps || ps.isNew() || ps.mouseDown !== 1) {
    return;
  }
  
  // Simple weapon system: Use active power-up or default to normal
  const activeWeapon = ps.activePowerUp || "normal";
  const weaponConfig = WEAPON_CONFIGS[activeWeapon];
  
  // Debug logging for desync issues
  if (ps.activePowerUp && activeWeapon === "normal") {
    // Removed desync warning for performance (can be verbose)
  }
  
  // Check fire rate
  if (now - ps.mouseDate <= weaponConfig.fireRate) {
    return;
  }
  
  // More detailed logging every 10 shots to track state
  if (!ps.debugShotCount) ps.debugShotCount = 0;
  ps.debugShotCount++;
  if (ps.debugShotCount % 10 === 0) {
    // Removed weapon state debug log for performance
  }
  
  // Calculate bullet properties
  const bulletColor = weaponConfig.color === 'inherit' ? turret.color : weaponConfig.color;
  
  // Calculate number of bullets
  let numBullets = weaponConfig.count;
  if (activeWeapon === "normal") {
    numBullets = Math.min(1 + Math.floor(ps.kills / 3), 5); // Scale with kills but cap at 5
  }
  
  // Calculate spread and starting angle
  const spread = weaponConfig.spread;
  let bulletAngle = turret.angle - (numBullets - 1) * spread / 2;
  
  // Create bullets
  for (let i = 0; i < numBullets; i++) {
    const x = turret.recoilX + turret.length * Math.cos(turret.angle);
    const y = turret.recoilY + turret.length * Math.sin(turret.angle);
    const bullet = new Bullet(x, y, weaponConfig.size, bulletColor, sessionId);
    
    bullet.vx = weaponConfig.speed * Math.cos(bulletAngle);
    bullet.vy = weaponConfig.speed * Math.sin(bulletAngle);
    bullet.type = activeWeapon;
    
    // Removed bullet creation debug log for performance
    
    // Send bullet creation command
    const bulletData = bullet.serialize();
    bulletData.type = activeWeapon;
    addCommand(["cb", bulletData], [bullet.x, bullet.y]);
    
    bulletAngle += spread;
  }
  
  turret.recoil = 5;
  ps.mouseDate = now;
}

function createAllBullets() {
  for (let sessionId in PlayerSession.all) {
    if (PlayerSession.all.hasOwnProperty(sessionId)) {
      createBullets(sessionId);
    }
  }
}

function updatePowerUps() {
  for (let id in PowerUp.all) {
    if (PowerUp.all.hasOwnProperty(id)) {
      const powerUp = PowerUp.all[id];
      powerUp.update();
    }
  }
}
