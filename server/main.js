/**
 * Created by ld on 12/20/15.
 */

var WEBSERVER_PORT = 8002;
var SERVO_PIN = 11;

var express = require('express');
var http = require('http');
var socket_io = require("socket.io");
var app = express();

var five = require("johnny-five");
var board = new five.Board();

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

    var servoPos = 90;
    servo.to(servoPos);
    io.on('connection', function (socket) {
        socket.on('sync', function () {
            console.log('sync');
            socket.emit('servo', {
                value: servoPos
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
    });

    server.listen(WEBSERVER_PORT);
    console.log('listening on', WEBSERVER_PORT);
});
