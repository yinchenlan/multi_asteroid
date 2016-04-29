var app = require('http').createServer(handler),
    io = require('socket.io').listen(app),
    fs = require('fs'),
    url = require('url'),
    util = require('util'),
    scores = [],
    MAX_X = 1600,
    MAX_Y = 1200,
    NUM_ROCKS = 10,
    NUM_STARS = 500,
    port = process.env.PORT || 8125,
    commandQueue = [],
    starPositions=[],
    bots = {/*playerSessionId : botStateMachine*/};

app.listen(port);
console.log("starting app");

function initializeStarsPositions() {
    for(i = 0; i < NUM_STARS; i++) {
	var x = Math.round(Math.random() * MAX_X);
	var y = Math.round(Math.random() * MAX_Y);
	starPositions.push([x, y]);
    }
}

function addCommand(command) {
    commandQueue.push(command);
}

function handler(req, res) {
    var request = url.parse(req.url, true);
    var action = request.pathname;
    if (action == '/laser.wav') {
        var sound = fs.readFileSync('./laser.wav');
        res.writeHead(200, {'Content-Type': 'audio/vnd.wav'});
        res.end(sound, 'binary');
    } else {
        fs.readFile('multiAstroid.html', 'utf-8',
          function(err, data) {
              if (err) {
                  res.writeHead(500);
                  return res.end('Error loading game!');
              }
  
              res.writeHead(200, {
                  'Content-Type': 'text/html'
              });
              res.end(data);
          });
     }   
}

function createBOT() {
    var id = generateUUID();
    var turret = new Turret(Math.round(Math.random() * (MAX_X - 40)) + 20, Math.round(Math.random() * (MAX_Y - 40)) + 20, id);
    var playerSession = new PlayerSession(id, turret, 1);
    playerSession.name = "BOT" + Math.round(Math.random() * 999) + 1;
}

function createPlayerSession(id, socket) {
    var turret = new Turret(Math.round(Math.random() * (MAX_X - 40)) + 20, Math.round(Math.random() * (MAX_Y - 40)) + 20, id);
    var playerSession = new PlayerSession(id, turret, 0);
    playerSession.name = "BOT";
    if (socket != null) {
        socket.emit("connected", {
	        "sessionId": id,
		    "x": turret.x,
		    "y": turret.y,
		    "color": turret.color,
		    "isNew": playerSession.isNew(),
		    "timeLeft": 6000 - (new Date().getTime() - turret.date.getTime()),
		    "life": turret.life,
		    "MAX_X": MAX_X,
		    "MAX_Y": MAX_Y
		    });
    }
    return playerSession;
}

io.on("connection", function(socket) {
    console.log(socket.handshake.address);
    var sessionId = socket.id;
    console.log("connection made for sessionId = " + sessionId);
    createPlayerSession(sessionId, socket);
    socket.emit("stars", {"stars": starPositions});
    for (var rockId in Rock.all) {
        socket.emit("createRock", Rock.all[rockId].serialize());
    }

    socket.on("disconnect", function(data) {
        var sessionId = socket.id;
        var playerSession = PlayerSession.all[sessionId];
        playerSession.remove();
        //console.log("size : " + Object.keys(PlayerSession.all).length);
        console.log("Player Session " + sessionId + " removed");
        //io.sockets.emit("removePlayer", {
        //    "sessionId": sessionId
        //});
        addCommand(["removePlayer", {
            "sessionId": sessionId
        }]);
    });

    socket.on("moveStart", function(data) {
        //console.log("moving player start");
        var sessionId = data["sessionId"];
        var hor = data["hor"];
        var ver = data["ver"];
        var ps = PlayerSession.all[socket.id];
        var turret = ps.turret;
        turret.hor = hor;
        turret.ver = ver;
    });

    socket.on("moveEnd", function(data) {
        //console.log("moving player end");
        var sessionId = data["sessionId"];
        var ps = PlayerSession.all[socket.id];
        var turret = ps.turret;
        turret.hor = 0;
        turret.ver = 0;
    });

    socket.on("mousePos", function(data) {
        var ps = PlayerSession.all[socket.id];
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
        ps.mouseDown = 1;
    });

    socket.on("mouseUp", function(data) {
        var ps = PlayerSession.all[socket.id];
        ps.mouseDown = 0;
    });
    
    socket.on("nickName", function(data) {
        var ps = PlayerSession.all[socket.id];
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
            var mousePosXTemp = this.mousePosX + this.hor * this.speed * Math.cos(Math.PI / 4);
            if (mousePosXTemp >= 0 && mousePosXTemp <= MAX_X) {
                this.mousePosX = mousePosXTemp;
            }
            turrety = this.y + this.ver * this.speed * Math.sin(Math.PI / 4);
            var mousePosYTemp = this.mousePosY + this.ver * this.speed * Math.cos(Math.PI / 4);
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
        this.angle = Math.atan2(this.mousePosY - this.y,
            this.mousePosX - this.x);
            //console.log("angle : " + this.angle + ", mousePosX : " + this.mousePosX + ", mousePosY : " + this.mousePosY + ", x : " + this.x + ", y : " + this.y);
        var recoilAngle = this.angle + Math.PI;
        this.recoilX = Math.round(this.x + this.recoil * Math.cos(recoilAngle));
        this.recoilY = Math.round(this.y + this.recoil * Math.sin(recoilAngle));
        if (this.recoil > 0) {
            this.recoil -= 1;
        }
    }
};

var turretColors = ["orange", "red", "blue",
    "purple", "yellow", "green", "pink"
];

var currColorIdx = 0;

function nextTurretColor() {
    var colorIdx = currColorIdx;
    currColorIdx = (currColorIdx + 1) % turretColors.length;
    return turretColors[colorIdx];
}

function BSM () {
    this.state = 'WANDER';
    this.destX = Math.round(Math.random() * MAX_X);
    this.destY = Math.round(Math.random() * MAX_Y);
    this.currVx = 0;
    this.currVy = 0;
    this.lastTicked = new Date();
    this.tickFreq = 2000;
}

function PlayerSession(sessionId, turret, isBot) {
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
    if (isBot==1) {
	this.bsm = new BSM();
    }
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
            addCommand(["matureSession", {
                "sessionId": this.sessionId
            }]); 
            return false;
        }
    },
    tick: function() {
        //console.log("tick");
        var now = new Date();
	if (now - this.bsm.lastTicked > this.bsm.tickFreq) {
	    this.bsm.destX = Math.round(Math.random() * MAX_X);
            this.bsm.destY = Math.round(Math.random() * MAX_Y);
            this.bsm.lastTicked = now;
        }
        var angle = Math.atan2(this.bsm.destY - this.turret.y, this.bsm.destX - this.turret.x);
        var destVx = Math.cos(angle);
        var destVy = Math.sin(angle);
        var dVx = (destVx - this.bsm.currVx) * .1;
        var dVy = (destVy - this.bsm.currVy) * .1;
        //var nAngle = Math.atan2(dVx, dVy);
        this.bsm.currVx = this.bsm.currVx + /*Math.cos(nAngle)*/ dVx;
        this.bsm.currVy = this.bsm.currVy + /*Math.sin(nAngle)*/ dVy;
        //nAngle = Math.atan2(this.bsm.currVx, this.bsm.currVy);
        //this.bsm.currVx = Math.cos(nAngle);
        //this.bsm.currVy = Math.sin(nAngle);
        this.turret.x = this.turret.x + this.turret.speed * this.bsm.currVx;
        this.turret.y = this.turret.y + this.turret.speed * this.bsm.currVy;
        this.turret.angle = angle;
        var recoilAngle = angle + Math.PI;
        this.turret.recoilX = Math.round(this.turret.x + this.turret.recoil * Math.cos(recoilAngle));
        this.turret.recoilY = Math.round(this.turret.y + this.turret.recoil * Math.sin(recoilAngle));
        if (this.turret.recoil > 0) {
            this.turret.recoil -= 1;
        }
        this.turret.mousePosX = this.bsm.destX;
        this.turret.mousePosY = this.bsm.destY;
    },
    attack: function() {
        
    }
};

initializeStarsPositions();

//Tick the world
var t = setInterval(function() {
    var turretMoves = [];
    var rockMoves = [];
    var bulletMoves = [];
    if (Object.keys(PlayerSession.all).length < 10) {
	createBOT();
    }
    for (var key in PlayerSession.all) {
        if (PlayerSession.all.hasOwnProperty(key)) {
            var ps = PlayerSession.all[key];
            var sessionId = ps.sessionId;
            var turret = ps.turret;
            if (ps.isBot == 1) ps.tick();
            else 
               turret.move();
            turretMoves.push({
                "sessionId": sessionId,
                "x": turret.x,
                "y": turret.y,
                "color": turret.color,
                "recoil": turret.recoil,
                "mousePosX": turret.mousePosX,
                "mousePosY": turret.mousePosY,
                "recoilX": turret.recoilX,
                "recoilY": turret.recoilY,
                "angle": turret.angle,
                "timeLeft": 6000 - (new Date().getTime() - turret.date.getTime()),
                "kills": ps.kills,
                "nickName": ps.name,
                "life": turret.life
            });
       }
    }
    createRocks();
    moveRocks();
    createAllBullets();
    moveBullets();
    addCommand(["turretMoves", {
		"turretMoves": turretMoves}]);
    io.sockets.emit("updateWorld", {"updateWorld" : commandQueue});
    commandQueue = [];    
}, 1000 / 30);

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
    Bullet.all.push(this);
}
Bullet.all = [];

Bullet.id = 0;

Bullet.prototype = {
    remove: function() {
        Bullet.all.splice(Bullet.all.indexOf(this), 1);
        //io.sockets.emit("removeBullet", {
        //    "id": this.id
        //});
        addCommand(["removeBullet", {
            "id": this.id
        }]);
    },
    serialize: function() {
        return {
            "x": this.x,
            "y": this.y,
            "r": this.r,
            "vx": this.vx,
            "vy": this.vy,
            "sessionId": this.sessionId,
            "color": this.color,
            "id": this.id
        };
    },
    getId: function() {
        return generateUUID();
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
    for (var idx = 1; idx <= this.numEdges; idx++) {
        var radius = this.r + (Math.random() - 1) * this.jaggedNess;
        var rx = radius * Math.cos(2 * Math.PI / this.numEdges * idx);
        var ry = radius * Math.sin(2 * Math.PI / this.numEdges * idx);
        var coord = [rx, ry];
        this.coords.push(coord);
    }
    Rock.all.push(this);
}

Rock.all = [];

Rock.id = 0;

Rock.prototype = {
    remove: function() {
        Rock.all.splice(Rock.all.indexOf(this), 1);
        //io.sockets.emit("removeRock", {
        //    "id": this.id
        //});
        addCommand(["removeRock", {
            "id": this.id
        }]);
    },
    resize: function() {
        this.coords = [];
        for (var idx = 1; idx <= this.numEdges; idx++) {
            var radius = this.r + (Math.random() - 1) * this.jaggedNess;
            var rx = radius * Math.cos(2 * Math.PI / this.numEdges * idx);
            var ry = radius * Math.sin(2 * Math.PI / this.numEdges * idx);
            var coord = [rx, ry];
            this.coords.push(coord);
        }
        //io.sockets.emit("resizeRock", this.serialize());
        addCommand(["resizeRock", this.serialize()]);
    },
    serialize: function() {
        var retVal = {
            "color": this.color,
            "x": this.x,
            "y": this.y,
            "r": this.r,
            "angle": this.angle,
            "vx": this.vx,
            "vy": this.vy,
            "jaggedNess": this.jaggedNess,
            "coords": this.coords,
            "drawangle": this.drawangle,
            "spinDirection": this.spinDirection,
            "numEdges": this.numEdges,
            "id": this.id
        };
        return retVal;
    },
    getId: function() {
	return generateUUID();
    }
};

function generateUUID(){
    var d = new Date().getTime();
    var uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
	    var r = (d + Math.random()*16)%16 | 0;
	    d = Math.floor(d/16);
	    return (c=='x' ? r : (r&0x3|0x8)).toString(16);
	});
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
        if ((currDate - rockDate) > 200 &&
            Rock.all.length < NUM_ROCKS + Math.floor( /*score = */ 20 / 20)) {
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
            var rock = new Rock(startx, starty,
                90 * Math.random() + 20);
            rock.color = rndColor();
            var angle = Math.atan2(MAX_Y / 2 - rock.y, MAX_X / 2 - rock.x);
            var rockSpeed = 80 / rock.r;
            rock.vx = rockSpeed * Math.cos(angle);
            rock.vy = rockSpeed * Math.sin(angle);
            if (Math.random() > .5) {
                rock.spinDirection = -1;
            }
            rockDate = currDate;
            //io.sockets.emit("createRock", rock.serialize());
            addCommand(["createRock", rock.serialize()]);
        }
    }
}

function moveRocks() {
    var i = Rock.all.length;
    while (i--) {
        var rock = Rock.all[i];
        if (rock == null) continue;
        rock.x += rock.vx;
        rock.y += rock.vy;
        addCommand(["updateRock", {"id" : rock.id, "x" : rock.x, "y" : rock.y}]);
        for (var idx in PlayerSession.all) {
            if (PlayerSession.all.hasOwnProperty(idx)) {
                var ps = PlayerSession.all[idx];
                if (ps.isNew()) {
                    continue;
                }
                rockCollideTurret(rock, ps);
            }
        }
        if (rock.x <= 0 || rock.y <= 0 || rock.x % MAX_X !== rock.x ||
            rock.y % MAX_Y !== rock.y) {
            rock.remove();
        }
    }
}

//Rock to Turret collision
function rockCollideTurret(rock, ps) {
    if (distance(ps.turret.x, ps.turret.y, rock.x, rock.y) <= (5 + rock.r)) {
        var damage = rock.r;
        if (ps.turret.life - damage <= 0) {
            //io.sockets.emit("removePlayer", {
            //    "sessionId": ps.sessionId
            //});
            addCommand(["removePlayer", {
                "sessionId": ps.sessionId
            }]);
            ps.remove();
        } else {
            ps.turret.life = ps.turret.life - damage;
            //io.sockets.emit("damagePlayer", {
            //    "sessionId": ps.sessionId,
            //   "life": ps.turret.life
            //});
            addCommand(["damagePlayer", {
                "sessionId": ps.sessionId,
                "life": ps.turret.life
            }]);
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
            if (distance(ps.turret.x, ps.turret.y, bullet.x, bullet.y) <= (bullet.r + 5)) {
                var damage = 20;
                if (ps.turret.life - damage <= 0) {
                    var shooterSession = PlayerSession.all[bullet.sessionId];
                    shooterSession.kills += 1;
                    //io.sockets.emit("removePlayer", {
                    //    "sessionId": ps.sessionId
                    //});
                    addCommand(["removePlayer", {
                        "sessionId": ps.sessionId
                    }]);
                    ps.remove();
                } else {
                    ps.turret.life = ps.turret.life - damage;
                    //io.sockets.emit("damagePlayer", {
                    //    "sessionId": ps.sessionId,
                    //    "life": ps.turret.life
                    //});
                    addCommand(["damagePlayer", {
                        "sessionId": ps.sessionId,
                        "life": ps.turret.life
                    }]);
                }
                bullet.remove();
            }
        }
    }
}

// Bullet to Rock collision
function bulletCollideRock(bullet) {
    for (var idx in Rock.all) {
        var rock = Rock.all[idx];
        if (distance(rock.x, rock.y, bullet.x, bullet.y) <= (bullet.r + rock.r)) {
            bullet.remove();
            if (rock.r < 20) {
                if (rock.color == "lightblue") {
                    var ps = PlayerSession.all[bullet.sessionId];
                    var turret = ps.turret;
                    turret.life = 100;
                }
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
    var i = Bullet.all.length;
    while (i--) {
        var bullet = Bullet.all[i];
        if (bullet == null) continue;
        bullet.x += bullet.vx;
        bullet.y += bullet.vy;
        addCommand(["updateBullet", {"id" : bullet.id, "x" : bullet.x, "y" : bullet.y}]);
        bulletCollideRock(bullet);
        bulletCollideTurret(bullet);
        if (bullet.x <= 0 || bullet.y <= 0 ||
            bullet.x % MAX_X !== bullet.x ||
            bullet.y % MAX_Y !== bullet.y) {
            bullet.remove();
        }
    }
}

function createBullets(sessionId) {
    var now = new Date();
    var ps = PlayerSession.all[sessionId];
    var turret = ps.turret;
    var color = turret.color;
    if (!ps.isNew() && ps.mouseDown == 1 && now - ps.mouseDate > 500) {
        var x = turret.recoilX + turret.length * Math.cos(turret.angle);
        var y = turret.recoilY + turret.length * Math.sin(turret.angle);
        var bullet = new Bullet(x, y, 4, color, sessionId);
        var speed = 16;
        bullet.vx = speed * Math.cos(turret.angle);
        bullet.vy = speed * Math.sin(turret.angle);
        turret.recoil = 5;
        ps.mouseDate = now;
        //io.sockets.emit("createBullet", bullet.serialize());
        addCommand(["createBullet", bullet.serialize()]);
    }
}

function createAllBullets() {
    for (var sessionId in PlayerSession.all) {
        if (PlayerSession.all.hasOwnProperty(sessionId)) {
            createBullets(sessionId);
        }
    }
}