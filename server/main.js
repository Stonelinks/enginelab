/**
 * Created by ld on 12/20/15.
 */

var WEBSERVER_PORT = 8002;
var SERVO_PIN = 11;
var TACH_PIN = 12;
var TACH_MAX_DELTA = 500;
var VIDEO_DEVICE = "/dev/video1";

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

board.on("ready", function () {
    board.samplingInterval(1);
    var servo = new five.Servo(SERVO_PIN);
    var tachSwitch = new five.Switch(TACH_PIN);

    var users = 0;
    var servoPos = 90;
    servo.to(servoPos);

    var rpmEventEmitter = new events.EventEmitter();
    var rpmAverage = get_moving_average(10);
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

    io.on('connection', function (socket) {
        users++;
        socket.broadcast.emit('users', {
            value: users
        });
        socket.on('sync', function () {
            console.log('sync');
            socket.emit('servo', {
                value: servoPos
            });
            socket.emit('users', {
                value: users
            });
        });

        socket.on('servo', function (data) {
            console.log(data);
            servoPos = parseInt(data.value);
            servo.to(servoPos);
            socket.broadcast.emit('servo', {
                value: servoPos
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

        frameEventEmitter.addListener('frame', sendFrame);
        rpmEventEmitter.addListener('rpm', sendRPM);

        socket.on('disconnect', function () {
            frameEventEmitter.removeListener('frame', sendFrame);
            rpmEventEmitter.removeListener('rpm', sendRPM);
            users--;
            socket.broadcast.emit('users', {
                value: users
            });
        })
    });

    server.listen(WEBSERVER_PORT);
    console.log('listening on', WEBSERVER_PORT);
});
