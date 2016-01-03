/**
 * Created by ld on 12/20/15.
 */

var WEBSERVER_PORT = 8002;
var SERVO_PIN = 11;
var TACH_PIN = 12;
var VIDEO_DEVICE = "/dev/video1";

var express = require('express');
var http = require('http');
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
}, 100);

var server = http.createServer(app);

var io = socket_io();
app.io = io;

app.use(express.static(__dirname + '/public'));
app.get('/', function (req, res) {
    res.sendFile(__dirname + '/public/index.html');
});

app.io.attach(server);

board.on("ready", function() {
    var servo = new five.Servo(SERVO_PIN);
    var tachSwitch = new five.Switch(TACH_PIN);

    var users = 0;
    var servoPos = 90;
    servo.to(servoPos);

    var rpmEventEmitter = new events.EventEmitter();
    var rpm = 0;
    var lastClick = new Date();
    tachSwitch.on("open", function() {
        var thisClick = new Date();
        var diff = thisClick - lastClick;
        rpm = parseInt(1000 * 60 / diff);
        lastClick = thisClick
    });
    setInterval(function () {
        rpmEventEmitter.emit('rpm', rpm)
    }, 100);

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
            socket.broadcast.emit('servo',  {
                value: servoPos
            })
        });

        var sendFrame = function (frame) {
            socket.emit("frame", {
                frame: frame
            });
        };

        var sendRPM = function (frame) {
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
