/**
 * Created by ld on 12/20/15.
 */

var WEBSERVER_PORT = 8002;
var SERVO_PIN = 11;
var VIDEO_DEVICE = "/dev/video1";

var express = require('express');
var http = require('http');
var socket_io = require("socket.io");
var app = express();

var five = require("johnny-five");
var board = new five.Board();

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

    var users = 0;
    var servoPos = 90;
    servo.to(servoPos);

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
        }

        frameEventEmitter.addListener('frame', sendFrame)

        socket.on('disconnect', function () {
            frameEventEmitter.removeListener('frame', sendFrame)
            users--;
            socket.broadcast.emit('users', {
                value: users
            });
        })
    });

    server.listen(WEBSERVER_PORT);
    console.log('listening on', WEBSERVER_PORT);
});
