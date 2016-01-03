/**
 * Created by ld on 12/20/15.
 */

var config = require('./config');
var utils = require('./utils')

var express = require('express');
var http = require('http');
var _ = require('underscore');
var socket_io = require("socket.io");
var app = express();

var five = require("johnny-five");
var board = new five.Board({
    repl: false
});

var EventEmitter = require('events').EventEmitter;
var inherits = require('util').inherits;


var cam = require('linuxcam');
var Jpeg = require('jpeg-fresh').Jpeg;

function Camera() {
    EventEmitter.call(this);
    this.start()
}
inherits(Camera, EventEmitter);

Camera.prototype.start = function () {
    cam.start(config.camera.DEVICE, 620, 480);
    setInterval(this.captureFrame.bind(this), config.camera.CAPTURE_INTERVAL_MS)
}
Camera.prototype.captureFrame = function () {
    var frame = cam.frame();
    var jpeg = new Jpeg(frame.data, frame.width, frame.height, 'rgb');
    this.emit('frame', jpeg.encodeSync().toString('base64'))
}
var camera = new Camera()

var server = http.createServer(app);

var io = socket_io();
app.io = io;

app.use(express.static(__dirname + '/public'));
app.get('/', function (req, res) {
    res.sendFile(__dirname + '/public/index.html');
});

app.io.attach(server);

function EngineController() {
    EventEmitter.call(this);

    this._controller = new utils.PIDController(config.engine_controller.GAINS);

    this.sensedRPM = 0
    this.targetRPM = config.engine_controller.DEFAULT_COMMAND_RPM

    this.setTargetRPM(this.targetRPM)

    this.start()
}
inherits(EngineController, EventEmitter);

EngineController.prototype.start = function () {
    setInterval(this.update.bind(this), config.engine_controller.UPDATE_INTERVAL_MS)
}

EngineController.prototype.setTargetRPM = function (rpm) {
    this.targetRPM = rpm
    this._controller.setTarget(this.targetRPM)
}

EngineController.prototype.update = function () {
    var command = utils.satf(this._controller.update(this.sensedRPM), config.engine_controller.SERVO_MAX_THROTTLE, config.engine_controller.SERVO_MIN_THROTTLE);
    this.emit('update', command)
}

var engineController = new EngineController()

board.on("ready", function () {
    board.samplingInterval(1);
    var servo = new five.Servo(config.SERVO_PIN);
    var servoPos = 90;
    servo.to(servoPos);

    var users = 0;

    var tachSwitch = new five.Switch(config.TACH_PIN);
    var rpmEventEmitter = new EventEmitter();
    var rpmAverage = utils.get_moving_average(5);
    var rpm = 0;
    var lastClick = new Date();
    var debounceZeroRPM = _.debounce(function () {
        rpm = 0
        engineController.sensedRPM = rpm
    }, 500);
    tachSwitch.on("open", function () {
        var thisClick = new Date();
        var diff = thisClick - lastClick;
        var newRPM = parseInt(1000 * 60 / diff);
        if (Math.abs(newRPM - rpm) < config.TACH_MAX_DELTA || rpm == 0) {
            rpm = rpmAverage(newRPM)
            engineController.sensedRPM = rpm
        }
        lastClick = thisClick;
        debounceZeroRPM()
    });
    setInterval(function () {
        rpmEventEmitter.emit('rpm', rpm)
    }, 300);

    engineController.on('update', function (servoCommand) {
        servo.to(servoCommand);
    })

    io.on('connection', function (socket) {
        users++;
        socket.broadcast.emit('users', {
            value: users
        });
        socket.on('sync', function () {
            console.log('users:', users);
            socket.emit('controller', {
                value: engineController.targetRPM
            });
            socket.emit('servo', {
                value: servoPos
            });
            socket.emit('users', {
                value: users
            });
        });

        socket.on('servo', function (data) {
            servoPos = parseInt(data.value);
            servo.to(servoPos);
            socket.broadcast.emit('servo', {
                value: servoPos
            })
        });

        socket.on('controller', function (data) {
            controllerCommand = parseInt(data.value);
            engineController.setTargetRPM(controllerCommand);
            socket.broadcast.emit('controller', {
                value: controllerCommand
            })
        });

        var sendFrame = function (frame) {
            socket.emit("frame", {
                frame: frame
            });
        };

        var sendRPM = function (rpm) {
            socket.emit("rpm", {
                rpm: rpm
            });
        };

        var sendControllerUpdate = function (newServoPosition) {
            socket.emit('servo', {
                value: newServoPosition
            })
        };

        camera.addListener('frame', sendFrame);
        rpmEventEmitter.addListener('rpm', sendRPM);
        engineController.addListener('update', sendControllerUpdate);

        socket.on('disconnect', function () {
            camera.removeListener('frame', sendFrame);
            rpmEventEmitter.removeListener('rpm', sendRPM);
            engineController.removeListener('update', sendControllerUpdate);
            users--;
            console.log('users:', users);
            socket.broadcast.emit('users', {
                value: users
            });
        })
    });

    server.listen(config.WEBSERVER_PORT);
    console.log('listening on', config.WEBSERVER_PORT);
});
