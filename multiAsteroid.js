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
    FPS = 30,
    MAX_X = 3200,
    MAX_Y = 2400,
    NUM_ROCKS = 200,
    NUM_STARS = 1000,
    BULLET_DISTANCE = 300,
    MAX_PLAYERS = 50,
    port = process.env.PORT || 8125,
    starPositions = [];

app.listen(port);
console.log("starting app");
console.log("port : " + port);

function initializeStarsPositions() {
  for (let i = 0; i < NUM_STARS; i++) {
    const x = Math.round(Math.random() * MAX_X);
    const y = Math.round(Math.random() * MAX_Y);
    starPositions.push([x, y]);
  }
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
}

function createBOTName(playerSession) {
  https
    .get(
      "https://names.drycodes.com/1?nameOptions=starwarsFirstNames&format=json",
      (resp) => {
        let data = "";

        // A chunk of data has been received.
        resp.on("data", (chunk) => {
          data += chunk;
        });

        // The whole response has been received. Print out the result.
        resp.on("end", () => {
          try {
            playerSession.name = JSON.parse(data)[0];
          } catch (e) {
            playerSession.name = "BOT" + Math.round(Math.random() * 999) + 1;
          }
        });
      }
    )
    .on("error", () => {
      playerSession.name = "BOT" + Math.round(Math.random() * 999) + 1;
    });
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
  }
  return playerSession;
}

io.on("connection", function (socket) {
  console.log(socket.handshake.address);
  const sessionId = socket.id;
  console.log("connection made for sessionId = " + sessionId);
  //createPlayerSession(sessionId, socket);
  socket.emit("stars", {
    stars: starPositions
  });

  socket.on("cps", function () {
    const sessionId = socket.id;
    createPlayerSession(sessionId, socket);
  });

  socket.on("cbs", function () {
    const sessionId = socket.id;
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
    console.log("disconnect : " + data);
    const sessionId = socket.id;
    const playerSession = PlayerSession.all[sessionId];
    if (playerSession == null) return;
    playerSession.remove();
    console.log("Player Session " + sessionId + " removed");
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

  socket.on("ms", function (data) {

    const hor = data["hor"];
    const ver = data["ver"];
    const ps = PlayerSession.all[socket.id];
    if (ps == null) return;
    const turret = ps.turret;
    turret.hor = hor;
    turret.ver = ver;
  });

  socket.on("me", function (data) {
    const ps = PlayerSession.all[socket.id];
    if (ps == null) return;
    const turret = ps.turret;
    turret.hor = 0;
    turret.ver = 0;
  });

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
    console.log("nickName ");
    const ps = PlayerSession.all[socket.id];
    if (ps == null) return;
    ps.name = data["name"];
    console.log("nickName " + ps.name);
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
    let mousePosYTemp
    ;
    let mousePosXTemp
    ;
    let turretx = this.x;
    let turrety = this.y;
    if (this.hor !== 0 && this.ver !== 0) {
      turretx = this.x + this.hor * this.speed * Math.cos(Math.PI / 4);
      mousePosXTemp = this.mousePosX + this.hor * this.speed * Math.cos(Math.PI / 4);
      if (mousePosXTemp >= 0 && mousePosXTemp <= MAX_X) {
        this.mousePosX = mousePosXTemp;
      }
      turrety = this.y + this.ver * this.speed * Math.sin(Math.PI / 4);
      mousePosYTemp = this.mousePosY + this.ver * this.speed * Math.cos(Math.PI / 4);
      if (mousePosYTemp >= 0 && mousePosYTemp <= MAX_Y) {
        this.mousePosY = mousePosYTemp;
      }
    } else if (this.hor !== 0) {
      turretx = this.x + this.hor * this.speed;
      mousePosXTemp = this.mousePosX + this.hor * this.speed;
      if (mousePosXTemp >= 0 && mousePosXTemp <= MAX_X) {
        this.mousePosX = mousePosXTemp;
      }
    } else if (this.ver !== 0) {
      turrety = this.y + this.ver * this.speed;
      mousePosYTemp = this.mousePosY + this.ver * this.speed;
      if (mousePosYTemp >= 0 && mousePosYTemp <= MAX_Y) {
        this.mousePosY = mousePosYTemp;
      }
    }
    if (turretx - this.baseRadius >= 0 && turretx + this.baseRadius <= MAX_X) {
      this.x = turretx;
    }
    if (turrety - this.baseRadius >= 0 && turrety + this.baseRadius <= MAX_Y) {
      this.y = turrety;
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
};

initializeStarsPositions();

let lastPushTime = new Date();

//Tick the world
setInterval(function () {
  if (Object.keys(PlayerSession.all).length < MAX_PLAYERS) {
    createBOT();
  }
  const scoreQueue = [];
  for (let key in PlayerSession.all) {
    if (PlayerSession.all.hasOwnProperty(key)) {
      const ps = PlayerSession.all[key];
      const sId = ps.sessionId;
      const turret = ps.turret;
      if (ps.isBot === 1) ps.tick();
      else {
        turret.move();
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
  emitWorld();
  //console.log("queue length = " + scoreQueue.length);
  const now = new Date();
  if (now.getTime() - lastPushTime.getTime() >= 2000) {
    io.sockets.emit("lb", {
      ss: scoreQueue
    });
    lastPushTime = now;
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
  this.id = this.getId();
  //console.log ("bullet id " + this.id);
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
      id: this.id,
    };
  },
  getId: function () {
    return generateUUID();
  },
};

function PowerUp(
  xCoord,
  yCoord,
  healthBonus,
  bulletSpeedBonus,
  shipSpeedBonus
) {
  this.x = xCoord;
  this.y = yCoord;
  this.hb = healthBonus;
  this.bsb = bulletSpeedBonus;
  this.ssb = shipSpeedBonus;
  this.id = generateUUID();
}

PowerUp.all = [];

PowerUp.prototype = {
  remove: function () {
    delete PowerUp.all[this.id];
  },
  move: function () {},
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
      //console.log("creating rock");
      const rock = new Rock(startx, starty, 90 * Math.random() + 20);
      rock.color = rndColor();
      const angle = Math.atan2(MAX_Y / 2 - rock.y, MAX_X / 2 - rock.x);
      const rockSpeed = 80 / rock.r;
      rock.vx = rockSpeed * Math.cos(angle);
      rock.vy = rockSpeed * Math.sin(angle);
      if (Math.random() > 0.5) {
        rock.spinDirection = -1;
      }
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
      addCommand(
        [
          "rp",
          {
            sessionId: ps.sessionId,
          },
        ],
        [ps.turret.x, ps.turret.y]
      );
      //console.log("remove player 2 " + ps.sessionId);
      ps.remove();
    } else {
      ps.turret.life = ps.turret.life - damage;
      //io.sockets.emit("damagePlayer", {
      //    "sessionId": ps.sessionId,
      //   "life": ps.turret.life
      //});
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
      if (
        distance(ps.turret.x, ps.turret.y, bullet.x, bullet.y) <=
        bullet.r + 5
      ) {
        const damage = 20;
        const shooterSession = PlayerSession.all[bullet.sessionId];
        if (shooterSession != null) shooterSession.kills += 1;
        if (ps.turret.life - damage <= 0) {
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
          if (shooterSession != null) shooterSession.kills += 1;
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
      if (
        distance(bullet.x, bullet.y, bullet.ox, bullet.oy) > BULLET_DISTANCE
      ) {
        bullet.remove();
      }
      bullet.x += bullet.vx;
      bullet.y += bullet.vy;
      //console.log("id : " + bullet.id + ", x : " + bullet.x + ", y : " + bullet.y);
      addCommand(
        ["ub", {
          id: bullet.id,
          x: bullet.x,
          y: bullet.y
        }],
        [bullet.x, bullet.y]
      );
      //console.log("id : " + bullet.id + ", x : " + bullet.x + ", y : " + bullet.y);
      bulletCollideRock(bullet);
      bulletCollideTurret(bullet);
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
  //console.log("bullet session id " + sessionId);
  const now = new Date();
  const ps = PlayerSession.all[sessionId];
  const turret = ps.turret;
  const color = turret.color;
  if (!ps.isNew() && ps.mouseDown === 1 && now - ps.mouseDate > 500) {
    const x = turret.recoilX + turret.length * Math.cos(turret.angle);
    const y = turret.recoilY + turret.length * Math.sin(turret.angle);
    const bullet = new Bullet(x, y, 4, color, sessionId);
    const speed = 16;
    bullet.vx = speed * Math.cos(turret.angle);
    bullet.vy = speed * Math.sin(turret.angle);
    turret.recoil = 5;
    ps.mouseDate = now;
    addCommand(["cb", bullet.serialize()], [bullet.x, bullet.y]);
  }
}

function createAllBullets() {
  for (let sessionId in PlayerSession.all) {
    if (PlayerSession.all.hasOwnProperty(sessionId)) {
      createBullets(sessionId);
    }
  }
}
