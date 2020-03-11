var app = require("http").createServer(handler),
  io = require("socket.io").listen(app, {
    pingTimeout: 4000,
    pingInterval: 1000
  }),
  fs = require("fs"),
  url = require("url"),
  util = require("util"),
  scores = [],
  MAX_X = 3200,
  MAX_Y = 2400,
  NUM_ROCKS = 50,
  NUM_STARS = 1000,
  MAX_PLAYERS = 15,
  port = process.env.PORT || 8125,
  starPositions = [],
  bots = {};

app.listen(port);
console.log("starting app");
console.log("port : " + port);

function initializeStarsPositions() {
  for (i = 0; i < NUM_STARS; i++) {
    var x = Math.round(Math.random() * MAX_X);
    var y = Math.round(Math.random() * MAX_Y);
    starPositions.push([x, y]);
  }
}

function addCommand(command, pos) {
  //console.log("command : " + command[0]);
  if (command[0] == "removePlayer")
    io.sockets.emit("rp", { sId: command[1]["sessionId"] });
  else {
    for (var k in PlayerSession.all) {
      if (PlayerSession.all.hasOwnProperty(k)) {
        var ps = PlayerSession.all[k];
        if (ps.isBot == 0)
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
  var request = url.parse(req.url, true);
  var action = request.pathname;
  if (action == "/laser.wav") {
    var sound = fs.readFileSync("./laser.wav");
    res.writeHead(200, { "Content-Type": "audio/vnd.wav" });
    res.end(sound, "binary");
  } else {
    fs.readFile("multiAsteroid.html", "utf-8", function(err, data) {
      if (err) {
        res.writeHead(500);
        return res.end("Error loading game!");
      }

      res.writeHead(200, {
        "Content-Type": "text/html"
      });
      res.end(data);
    });
  }
}

function createBOT() {
  var id = generateUUID();
  var turret = new Turret(
    Math.round(Math.random() * (MAX_X - 40)) + 20,
    Math.round(Math.random() * (MAX_Y - 40)) + 20,
    id
  );
  var playerSession = new PlayerSession(id, turret, 1, null);
  playerSession.name = "BOT" + Math.round(Math.random() * 999) + 1;
}

function createPlayerSession(id, socket) {
  var turret = new Turret(
    Math.round(Math.random() * (MAX_X - 40)) + 20,
    Math.round(Math.random() * (MAX_Y - 40)) + 20,
    id
  );
  var playerSession = new PlayerSession(id, turret, 0, socket);
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
      MAX_Y: MAX_Y
    });
  }
  return playerSession;
}

io.on("connection", function(socket) {
  console.log(socket.handshake.address);
  var sessionId = socket.id;
  console.log("connection made for sessionId = " + sessionId);
  createPlayerSession(sessionId, socket);
  socket.emit("stars", { stars: starPositions });
  //for (var rockId in Rock.all) {
  //    socket.emit("createRock", Rock.all[rockId].serialize());
  //}

  socket.on("gb", function(data) {
    var id = data["id"];
    var bullet = Bullet.all[id];
    if (bullet != null) socket.emit("gb", bullet.serialize());
  });

  socket.on("gr", function(data) {
    var id = data["id"];
    var rock = Rock.all[id];
    if (rock != null) socket.emit("createRock", rock.serialize());
  });

  socket.on("wr", function(data) {
    var sessId = data["sId"];
    var scale = data["s"];
    var width = data["w"];
    var height = data["h"];
    var ps = PlayerSession.all[sessId];
    if (ps != null) {
      ps.scale = scale;
      ps.canvasWidth = width;
      ps.canvasHeight = height;
    }
  });

  socket.on("disconnect", function(data) {
    console.log("disconnect : " + data);
    var sessionId = socket.id;
    var playerSession = PlayerSession.all[sessionId];
    if (playerSession == null) return;
    playerSession.remove();
    //console.log("size : " + Object.keys(PlayerSession.all).length);
    console.log("Player Session " + sessionId + " removed");
    //io.sockets.emit("removePlayer", {
    //    "sessionId": sessionId
    //});
    addCommand(
      [
        "removePlayer",
        {
          sessionId: sessionId
        }
      ],
      [playerSession.turret.x, playerSession.turret.y]
    );
    //console.log("remove player 1 " + sessionId);
  });

  socket.on("moveStart", function(data) {
    //console.log("moving player start");
    var sessionId = data["sessionId"];
    var hor = data["hor"];
    var ver = data["ver"];
    var ps = PlayerSession.all[socket.id];
    if (ps == null) return;
    var turret = ps.turret;
    turret.hor = hor;
    turret.ver = ver;
  });

  socket.on("moveEnd", function(data) {
    //console.log("moving player end");
    var sessionId = data["sessionId"];
    var ps = PlayerSession.all[socket.id];
    if (ps == null) return;
    var turret = ps.turret;
    turret.hor = 0;
    turret.ver = 0;
  });

  socket.on("mousePos", function(data) {
    var ps = PlayerSession.all[socket.id];
    if (ps == null) return;
    var turret = ps.turret;
    turret.mousePosX = data["mousePosX"];
    turret.mousePosY = data["mousePosY"];
  });

  socket.on("serverLog", function(data) {
    var log = data["log"];
    console.log("Server Log :" + log);
  });

  socket.on("mouseDown", function(data) {
    var ps = PlayerSession.all[socket.id];
    if (ps == null) return;
    ps.mouseDown = 1;
  });

  socket.on("mouseUp", function(data) {
    var ps = PlayerSession.all[socket.id];
    if (ps == null) return;
    ps.mouseDown = 0;
  });

  socket.on("nickName", function(data) {
    console.log("nickName ");
    var ps = PlayerSession.all[socket.id];
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
  move: function() {
    var turretx = this.x;
    var turrety = this.y;
    if (this.hor != 0 && this.ver != 0) {
      turretx = this.x + this.hor * this.speed * Math.cos(Math.PI / 4);
      var mousePosXTemp =
        this.mousePosX + this.hor * this.speed * Math.cos(Math.PI / 4);
      if (mousePosXTemp >= 0 && mousePosXTemp <= MAX_X) {
        this.mousePosX = mousePosXTemp;
      }
      turrety = this.y + this.ver * this.speed * Math.sin(Math.PI / 4);
      var mousePosYTemp =
        this.mousePosY + this.ver * this.speed * Math.cos(Math.PI / 4);
      if (mousePosYTemp >= 0 && mousePosYTemp <= MAX_Y) {
        this.mousePosY = mousePosYTemp;
      }
    } else if (this.hor != 0) {
      turretx = this.x + this.hor * this.speed;
      var mousePosXTemp = this.mousePosX + this.hor * this.speed;
      if (mousePosXTemp >= 0 && mousePosXTemp <= MAX_X) {
        this.mousePosX = mousePosXTemp;
      }
    } else if (this.ver != 0) {
      turrety = this.y + this.ver * this.speed;
      var mousePosYTemp = this.mousePosY + this.ver * this.speed;
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
    //console.log("angle : " + this.angle + ", mousePosX : " + this.mousePosX + ", mousePosY : " + this.mousePosY + ", x : " + this.x + ", y : " + this.y);
    var recoilAngle = this.angle + Math.PI;
    this.recoilX = Math.round(this.x + this.recoil * Math.cos(recoilAngle));
    this.recoilY = Math.round(this.y + this.recoil * Math.sin(recoilAngle));
    if (this.recoil > 0) {
      this.recoil -= 1;
    }
    turretCollideTurret(this);
  }
};

var turretColors = [
  "orange",
  "red",
  "blue",
  "purple",
  "yellow",
  "green",
  "pink"
];

var currColorIdx = 0;

function nextTurretColor() {
  var colorIdx = currColorIdx;
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
  getMostThreateningObstacle: function(sessionId) {
    var x = 0;
    var y = 0;
    var currMin = 1000000;
    for (var idx in Rock.all) {
      var rock = Rock.all[idx];
      var dist = this.getDistance(
        rock.x,
        rock.y,
        this.shortAheadX,
        this.shortAheadY
      );
      //console.log("dist : " + dist + ", radius : " + rock.r);
      if (dist <= rock.r * 1.2 && dist < currMin) {
        currMin = dist;
        x = rock.x;
        y = rock.y;
        //console.log("dist : " + dist + ", radius : " + rock.r);
        //continue;
      }
      dist = this.getDistance(rock.x, rock.y, this.aheadX, this.aheadY);
      if (dist <= rock.r * 1.2 && dist < currMin) {
        currMin = dist;
        x = rock.x;
        y = rock.y;
        //console.log("dist : " + dist + ", radius : " + rock.r);
      }
    }

    for (var idx in PlayerSession.all) {
      var turret = PlayerSession.all[idx].turret;
      if (turret.sessionId == sessionId) continue;
      var dist = this.getDistance(
        turret.x,
        turret.y,
        this.shortAheadX,
        this.shortAheadY
      );
      //console.log("dist : " + dist + ", radius : " + turret.baseRadius);
      if (dist <= 30 && dist < currMin) {
        currMin = dist;
        x = turret.x;
        y = turret.y;
        //console.log("dist : " + dist);
        //continue;
      }
      dist = this.getDistance(turret.x, turret.y, this.aheadX, this.aheadY);
      if (dist <= 30 && dist < currMin) {
        currMin = dist;
        x = turret.x;
        y = turret.y;
        //console.log("dist : " + dist);
      }
    }
    if (currMin < 10000) return [x, y];
    else return null;
  },
  getDistance: function(x1, y1, x2, y2) {
    return Math.sqrt((x1 - x2) * (x1 - x2) + (y1 - y2) * (y1 - y2));
  },
  calculateAheadVector: function(x, y) {
    var angle = Math.atan2(this.currVy, this.currVx);
    this.aheadX = x + Math.cos(angle) * this.aheadDist;
    this.aheadY = y + Math.sin(angle) * this.aheadDist;
    //console.log("aheadX " + this.aheadX + ", aheadY " + this.aheadY);
    this.shortAheadX = x + Math.cos(angle) * 10;
    this.shortAheadY = y + Math.sin(angle) * 10;
  }
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
  if (isBot == 1) {
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
  remove: function() {
    delete PlayerSession.all[this.sessionId];
  },
  isNew: function() {
    var now = new Date();
    if (now - this.date < 6000) {
      return true;
    } else {
      //io.sockets.emit("matureSession", {
      //    "sessionId": this.sessionId
      //});
      // addCommand(["matureSession", {
      //    "sessionId": this.sessionId
      //	    }], [this.turret.x, this.turret.y]);
      return false;
    }
  },
  tick: function() {
    this.wander();
    this.avoid();
    var angle = Math.atan2(this.bsm.currVy, this.bsm.currVx);
    this.turret.x = this.turret.x + this.turret.speed * Math.cos(angle);
    this.turret.y = this.turret.y + this.turret.speed * Math.sin(angle);
    var recoilAngle = this.turret.angle + Math.PI;
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
  wander: function() {
    var now = new Date();
    if (now - this.bsm.lastTicked > this.bsm.tickFreq) {
      this.bsm.destX = Math.round(Math.random() * MAX_X);
      this.bsm.destY = Math.round(Math.random() * MAX_Y);
      this.bsm.lastTicked = now;
    }
    var angle = Math.atan2(
      this.bsm.destY - this.turret.y,
      this.bsm.destX - this.turret.x
    );
    var destVx = Math.cos(angle);
    var destVy = Math.sin(angle);
    var dVx = (destVx - this.bsm.currVx) * 0.05;
    var dVy = (destVy - this.bsm.currVy) * 0.05;
    this.bsm.currVx = this.bsm.currVx + dVx;
    this.bsm.currVy = this.bsm.currVy + dVy;
    this.turret.angle = angle;
  },
  avoid: function() {
    this.bsm.calculateAheadVector(this.turret.x, this.turret.y);
    var pos = this.bsm.getMostThreateningObstacle(this.turret.sessionId);
    if (pos != null) {
      var angle = Math.atan2(
        this.bsm.aheadY - pos[1],
        this.bsm.aheadX - pos[0]
      );
      var avoidanceX = Math.cos(angle);
      var avoidanceY = Math.sin(angle);
      this.bsm.currVx = this.bsm.currVx + avoidanceX;
      this.bsm.currVy = this.bsm.currVy + avoidanceY;
      var angle2 = Math.atan2(pos[1] - this.turret.y, pos[0] - this.turret.x);
      this.turret.angle = angle2;
      this.mouseDown = 1;
    } else {
      this.mouseDown = 0;
    }
  },
  pushCommand: function(cmd) {
    this.commandQueue.push(cmd);
  },
  sendUpdate: function() {
    if (this.commandQueue.length == 0) return;
    if (this.socket != null) {
      //console.log("sendUpdate");
      this.socket.emit("updateWorld", { updateWorld: this.commandQueue });
      this.commandQueue = [];
    }
  },
  isVisibleTo: function(pos) {
    //return 1;
    if (pos == null || pos.length != 2) return 0;
    var xos = this.getXOffset();
    var yos = this.getYOffset();
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
  getXOffset: function() {
    //console.log("here");
    var negX = -1 * this.turret.x;
    var offset = negX + this.canvasWidth / 2 / this.scale;
    if (this.turret.x < this.canvasWidth / 2 / this.scale) {
      return 0;
    } else if (this.turret.x > MAX_X - this.canvasWidth / 2 / this.scale) {
      return -(MAX_X - this.canvasWidth / this.scale);
    }
    //console.log("here");
    return offset;
  },
  getYOffset: function() {
    var negY = -1 * this.turret.y;
    var offset = negY + this.canvasHeight / 2 / this.scale;
    if (this.turret.y < this.canvasHeight / 2 / this.scale) {
      return 0;
    } else if (this.turret.y > MAX_Y - this.canvasHeight / 2 / this.scale) {
      return -(MAX_Y - this.canvasHeight / this.scale);
    }
    return offset;
  }
};

initializeStarsPositions();

var lastPushTime = new Date();

//Tick the world
var t = setInterval(function() {
  var turretMoves = [];
  var rockMoves = [];
  var bulletMoves = [];
  if (Object.keys(PlayerSession.all).length < MAX_PLAYERS) {
    createBOT();
  }
  var scoreQueue = [];
  for (var key in PlayerSession.all) {
    if (PlayerSession.all.hasOwnProperty(key)) {
      var ps = PlayerSession.all[key];
      var sId = ps.sessionId;
      var turret = ps.turret;
      if (ps.isBot == 1) ps.tick();
      else {
        turret.move();
      }
      scoreQueue.push({ n: ps.name, s: ps.kills });
      var loc = [turret.x, turret.y];
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
            l: turret.life
          }
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
  var now = new Date();
  if (now.getTime() - lastPushTime.getTime() >= 2000) {
    io.sockets.emit("lb", { ss: scoreQueue });
    lastPushTime = now;
  }
}, 1000 / 30);

function emitWorld() {
  for (var k in PlayerSession.all) {
    //if (PlayerSession.all.hasOwnProperty(k)) {
    var ps = PlayerSession.all[k];
    //verifyUpdate(ps);
    ps.sendUpdate();
    //}
  }
}

function verifyUpdate(ps) {
  var cnt = 0;
  //while (cnt++ < ps.commandQueue.length) {
  for (var k in ps.commandQueue) {
    var cmd = ps.commandQueue[k];
    //console.log("command " + cmd[0]);
    if (cmd != null && cmd[0] == "removePlayer" /*&& cmd[1]["sessionId"]*/) {
      console.log("verified");
      debugger;
      break;
    }
  }
}

// Constructor
function Bullet(x, y, r, color, sessionId) {
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
  remove: function() {
    delete Bullet.all[this.id];
    //Bullet.all.splice(Bullet.all.indexOf(this), 1);
    //io.sockets.emit("removeBullet", {
    //    "id": this.id
    //});
    addCommand(
      [
        "removeBullet",
        {
          id: this.id
        }
      ],
      [this.x, this.y]
    );
  },
  serialize: function() {
    return {
      x: this.x,
      y: this.y,
      r: this.r,
      vx: this.vx,
      vy: this.vy,
      sessionId: this.sessionId,
      color: this.color,
      id: this.id
    };
  },
  getId: function() {
    return generateUUID();
  }
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
  remove: function() {
    delete PowerUp.all[this.id];
  },
  move: function() {}
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
  for (var idx = 1; idx <= this.numEdges; idx++) {
    var radius = this.r + (Math.random() - 1) * this.jaggedNess;
    var rx = radius * Math.cos(((2 * Math.PI) / this.numEdges) * idx);
    var ry = radius * Math.sin(((2 * Math.PI) / this.numEdges) * idx);
    var coord = [rx, ry];
    this.coords.push(coord);
  }
  //Rock.all.push(this);
  Rock.all[this.id] = this;
  //console.log("created rock " + this.id);
}

Rock.all = {};

Rock.id = 0;

Rock.prototype = {
  remove: function() {
    delete Rock.all[this.id];
    //Rock.all.splice(Rock.all.indexOf(this), 1);
    //io.sockets.emit("removeRock", {
    //    "id": this.id
    //});
    addCommand(
      [
        "removeRock",
        {
          id: this.id
        }
      ],
      [this.x, this.y]
    );
  },
  resize: function() {
    this.coords = [];
    for (var idx = 1; idx <= this.numEdges; idx++) {
      var radius = this.r + (Math.random() - 1) * this.jaggedNess;
      var rx = radius * Math.cos(((2 * Math.PI) / this.numEdges) * idx);
      var ry = radius * Math.sin(((2 * Math.PI) / this.numEdges) * idx);
      var coord = [rx, ry];
      this.coords.push(coord);
    }
    //io.sockets.emit("resizeRock", this.serialize());
    addCommand(["resizeRock", this.serialize()], [this.x, this.y]);
  },
  serialize: function() {
    var retVal = {
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
      id: this.id
    };
    return retVal;
  },
  getId: function() {
    return generateUUID();
  }
};

function generateUUID() {
  var d = new Date().getTime();
  var uuid = "xxxxxxxx-xxxx-4xxx".replace(/[xy]/g, function(c) {
    var r = (d + Math.random() * 16) % 16 | 0;
    d = Math.floor(d / 16);
    return (c == "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
  //console.log(uuid);
  return uuid;
}

function rndColor() {
  var simpleColors = ["grey", "silver", "lightblue"];
  return simpleColors[Math.floor(Math.random() * 3)];
}

var rockDate = new Date();

function createRocks() {
  var currDate = new Date();
  if (rockDate == null) {
    rockDate = currDate;
  } else {
    if (currDate - rockDate > 200 && Object.keys(Rock.all).length < NUM_ROCKS) {
      var side = Math.floor(Math.random() * 4);
      var startx = 0,
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
      var rock = new Rock(startx, starty, 90 * Math.random() + 20);
      rock.color = rndColor();
      var angle = Math.atan2(MAX_Y / 2 - rock.y, MAX_X / 2 - rock.x);
      var rockSpeed = 80 / rock.r;
      rock.vx = rockSpeed * Math.cos(angle);
      rock.vy = rockSpeed * Math.sin(angle);
      if (Math.random() > 0.5) {
        rock.spinDirection = -1;
      }
      rockDate = currDate;
      //io.sockets.emit("createRock", rock.serialize());
      //addCommand(["createRock", rock.serialize()], [rock.x, rock.y]);
    }
  }
}

function moveRocks() {
  for (var k in Rock.all) {
    if (Rock.all.hasOwnProperty(k)) {
      var rock = Rock.all[k];
      if (rock == null) continue;
      rock.x += rock.vx;
      rock.y += rock.vy;
      addCommand(
        ["updateRock", { id: rock.id, x: rock.x, y: rock.y }],
        [rock.x, rock.y]
      );
      debugger;
      for (var idx in PlayerSession.all) {
        if (PlayerSession.all.hasOwnProperty(idx)) {
          var ps = PlayerSession.all[idx];
          if (ps.isNew()) {
            continue;
          }
          rockCollideTurret(rock, ps);
        }
      }
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
    var damage = rock.r;
    if (ps.turret.life - damage <= 0) {
      //io.sockets.emit("removePlayer", {
      //    "sessionId": ps.sessionId
      //});
      addCommand(
        [
          "removePlayer",
          {
            sessionId: ps.sessionId
          }
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
            life: ps.turret.life
          }
        ],
        [ps.turret.x, ps.turret.y]
      );
    }
    rock.remove();
  }
}

function bulletCollideTurret(bullet) {
  for (var idx in PlayerSession.all) {
    if (PlayerSession.all.hasOwnProperty(idx)) {
      var ps = PlayerSession.all[idx];
      if (ps.isNew()) {
        continue;
      }
      if (
        distance(ps.turret.x, ps.turret.y, bullet.x, bullet.y) <=
        bullet.r + 5
      ) {
        var damage = 20;
        var shooterSession = PlayerSession.all[bullet.sessionId];
        if (shooterSession != null) shooterSession.kills += 1;
        if (ps.turret.life - damage <= 0) {
          if (ps != null) {
            addCommand(
              [
                "removePlayer",
                {
                  sessionId: ps.sessionId
                }
              ],
              [ps.turret.x, ps.turret.y]
            );
            //console.log("remove player 3 " + ps.sessionId);
            ps.remove();
          }
        } else {
          ps.turret.life = ps.turret.life - damage;
          addCommand(
            [
              "damagePlayer",
              {
                sessionId: ps.sessionId,
                life: ps.turret.life
              }
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
  for (var idx in PlayerSession.all) {
    if (PlayerSession.all.hasOwnProperty(idx)) {
      var ps = PlayerSession.all[idx];
      if (ps.isNew()) {
        continue;
      }
      if (ps.turret.sessionId == turret.sessionId) continue;
      var dist = distance(ps.turret.x, ps.turret.y, turret.x, turret.y);
      //console.log("dist " + dist);
      if (dist <= turret.baseRadius + ps.turret.baseRadius) {
        //console.log("collided");
        var damage = 20;
        if (ps.turret.life - damage <= 0) {
          var shooterSession = PlayerSession.all[turret.sessionId];
          if (shooterSession != null) shooterSession.kills += 1;
          addCommand(
            [
              "removePlayer",
              {
                sessionId: ps.sessionId
              }
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
                life: ps.turret.life
              }
            ],
            [ps.turret.x, ps.turret.y]
          );
        }
        var playerSession = PlayerSession.all[turret.sessionId];
        if (playerSession == null) continue;
        if (playerSession.turret.life - damage <= 0) {
          ps.kills += 1;
          addCommand(
            [
              "removePlayer",
              {
                sessionId: playerSession.sessionId
              }
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
                life: playerSession.turret.life
              }
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
  for (var idx in Rock.all) {
    var rock = Rock.all[idx];
    if (distance(rock.x, rock.y, bullet.x, bullet.y) <= bullet.r + rock.r) {
      bullet.remove();
      var ps = PlayerSession.all[bullet.sessionId];
      if (ps == null) continue;
      var turret = ps.turret;
      if (rock.color == "lightblue")
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

function distance(x1, y1, x2, y2) {
  var diffx = x2 - x1;
  var diffy = y2 - y1;
  return Math.sqrt(diffx * diffx + diffy * diffy);
}

function moveBullets() {
  for (var k in Bullet.all) {
    if (Bullet.all.hasOwnProperty(k)) {
      var bullet = Bullet.all[k];
      if (bullet == null) continue;
      bullet.x += bullet.vx;
      bullet.y += bullet.vy;
      //console.log("id : " + bullet.id + ", x : " + bullet.x + ", y : " + bullet.y);
      addCommand(
        ["updateBullet", { id: bullet.id, x: bullet.x, y: bullet.y }],
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
  var now = new Date();
  var ps = PlayerSession.all[sessionId];
  var turret = ps.turret;
  var color = turret.color;
  if (ps == null) return;
  if (turret == null) console.log("null turret");
  if (!ps.isNew() && ps.mouseDown == 1 && now - ps.mouseDate > 500) {
    var x = turret.recoilX + turret.length * Math.cos(turret.angle);
    var y = turret.recoilY + turret.length * Math.sin(turret.angle);
    //console.log("x : " + x + ", y : " + y + ", color : " + color + ", sessionId : " + sessionId);
    var bullet = new Bullet(x, y, 4, color, sessionId);
    var speed = 16;
    bullet.vx = speed * Math.cos(turret.angle);
    bullet.vy = speed * Math.sin(turret.angle);
    turret.recoil = 5;
    ps.mouseDate = now;
    addCommand(["createBullet", bullet.serialize()], [bullet.x, bullet.y]);
  }
}

function createAllBullets() {
  for (var sessionId in PlayerSession.all) {
    if (PlayerSession.all.hasOwnProperty(sessionId)) {
      createBullets(sessionId);
    }
  }
}
