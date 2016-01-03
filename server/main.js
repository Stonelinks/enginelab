/**
 * Created by ld on 12/20/15.
 */

var WEBSERVER_PORT = 8002;
var SERVO_PIN = 11;
var TACH_PIN = 12;
var TACH_MAX_DELTA = 500;
var VIDEO_DEVICE = "/dev/video1";
var ENGINE_CONTROLLER_GAINS = {
    k_p: -0.2,
    k_i: 0,
    k_d: 0.1
};

var express = require('express');
var http = require('http');
var _ = require('underscore');
var socket_io = require("socket.io");
var app = express();

var five = require("johnny-five");
var board = new five.Board({
    repl: false
});

var cam = require('linuxcam');
var Jpeg = require('jpeg-fresh').Jpeg;
cam.start(VIDEO_DEVICE, 620, 480);
var events = require('events');
var frameEventEmitter = new events.EventEmitter();
setInterval(function () {
    var frame = cam.frame();
    var jpeg = new Jpeg(frame.data, frame.width, frame.height, 'rgb');
    var jpeg_frame = jpeg.encodeSync();
    frameEventEmitter.emit('frame', jpeg_frame.toString('base64'))
}, 200);

var server = http.createServer(app);

var io = socket_io();
app.io = io;

app.use(express.static(__dirname + '/public'));
app.get('/', function (req, res) {
    res.sendFile(__dirname + '/public/index.html');
});

app.io.attach(server);

function get_moving_average(period) {
    var nums = [];
    return function (num) {
        nums.push(num);
        if (nums.length > period) {
            nums.splice(0, 1);
        }
        var sum = 0;
        for (var i = 0; i < nums.length; i++) {
            sum += nums[i];
        }
        var n = period;
        if (nums.length < period) {
            n = nums.length;
        }
        return (sum / n);
    }
}

var PIDController = function (gains) {
    this.k_p = gains.k_p || 1;
    this.k_i = gains.k_i || 0;
    this.k_d = gains.k_d || 0;

    this.sumError = 0;
    this.lastError = 0;

    this.target = 0;
};

PIDController.prototype.setTarget = function (target) {
    this.target = target;
};

PIDController.prototype.update = function (current_value) {
    this.current_value = current_value;

    var error = (this.target - this.current_value);
    this.sumError = this.sumError + error;
    var dError = error - this.lastError;
    this.lastError = error;
    return (this.k_p * error) + (this.k_i * this.sumError) + (this.k_d * dError);
};

var satf = function (input, min, max) {
    return Math.floor(Math.min(max, Math.max(min, parseInt(input))));
};

var engineController = new PIDController(ENGINE_CONTROLLER_GAINS);
var engineControllerEventEmitter = new events.EventEmitter();

board.on("ready", function () {
    board.samplingInterval(1);
    var servo = new five.Servo(SERVO_PIN);
    var servoPos = 90;
    servo.to(servoPos);

    var users = 0;

    var tachSwitch = new five.Switch(TACH_PIN);
    var rpmEventEmitter = new events.EventEmitter();
    var rpmAverage = get_moving_average(5);
    var rpm = 0;
    var lastClick = new Date();
    var debounceZeroRPM = _.debounce(function () {
        rpm = 0
    }, 500);
    tachSwitch.on("open", function () {
        var thisClick = new Date();
        var diff = thisClick - lastClick;
        var newRPM = parseInt(1000 * 60 / diff);
        if (Math.abs(newRPM - rpm) < TACH_MAX_DELTA || rpm == 0) {
            rpm = rpmAverage(newRPM)
        }
        lastClick = thisClick;
        debounceZeroRPM()
    });
    setInterval(function () {
        rpmEventEmitter.emit('rpm', rpm)
    }, 300);

    var controllerCommand = 1000;
    engineController.setTarget(controllerCommand);
    setInterval(function () {
        var servoCommand = satf(engineController.update(rpm), 16, 65);
        servo.to(servoCommand);
        console.log('servoCommand', servoCommand)
        engineControllerEventEmitter.emit('update', servoCommand)
    }, 100);


    io.on('connection', function (socket) {
        users++;
        socket.broadcast.emit('users', {
            value: users
        });
        socket.on('sync', function () {
            console.log('users:', users);
            socket.emit('controller', {
                value: controllerCommand
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
            engineController.setTarget(controllerCommand);
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

        frameEventEmitter.addListener('frame', sendFrame);
        rpmEventEmitter.addListener('rpm', sendRPM);
        engineControllerEventEmitter.addListener('update', sendControllerUpdate);

        socket.on('disconnect', function () {
            frameEventEmitter.removeListener('frame', sendFrame);
            rpmEventEmitter.removeListener('rpm', sendRPM);
            engineControllerEventEmitter.removeListener('update', sendControllerUpdate);
            users--;
            console.log('users:', users);
            socket.broadcast.emit('users', {
                value: users
            });
        })
    });

    server.listen(WEBSERVER_PORT);
    console.log('listening on', WEBSERVER_PORT);
});
