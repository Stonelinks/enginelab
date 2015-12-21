/**
 * Created by ld on 12/20/15.
 */

var express = require('express')
var http = require('http')
var socket_io = require("socket.io");
var app = express();

var server = http.createServer(app);

var io = socket_io();
app.io = io;

app.use(express.static(__dirname + '/public'));
app.get('/', function (req, res) {
    res.sendFile(__dirname + '/public/index.html');
});

var SERVO_POSITION = 128
io.on('connection', function (socket) {
    socket.emit('servo',  {
        value: SERVO_POSITION
    })
    socket.on('servo', function (data) {
        console.log(data);
        SERVO_POSITION = parseInt(data.value)
        socket.broadcast.emit('servo',  {
            value: SERVO_POSITION
        })
    });
});

app.io.attach(server);

var PORT = 8002
server.listen(PORT);
console.log('listening on', PORT)