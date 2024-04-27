const express = require('express');
const PORT = 443;
var https = require('https');
var http = require('http');
const path = require('path');
var fs = require('fs');

// var options = {
//   key: fs.readFileSync('helpers/secrets/certs/cert.key'),
//   cert: fs.readFileSync('helpers/secrets/certs/cert.crt')
// };

var options = {
    key: fs.readFileSync('/home/ec2-user/secrets/certs/cert.key'),
    cert: fs.readFileSync('/home/ec2-user/secrets/certs/cert.crt')
};

var util = require('util');
var logFile = fs.createWriteStream(__dirname + '/log.txt', { flags: 'a' });
  // Or 'w' to truncate the file every time the process starts.
var logStdout = process.stdout;

console.log = function () {
  logFile.write(util.format.apply(null, arguments) + '\n');
  logStdout.write(util.format.apply(null, arguments) + '\n');
}
console.error = console.log;

const app = express();

// redirect http to https
app.use(function requireHTTPS(req, res, next) {
  if (!req.secure) {
    return res.redirect('https://' + req.headers.host + req.url);
  }
  next();
});

//redirect www.chapalbarua.com to chapalbarua.com
app.use(function requireWWW(req, res, next) {
  if(!req.headers.host.startsWith('www.')){
    return res.redirect('https://' + 'www.' + req.headers.host + req.url);
  }
  next();
});

http.createServer(app).listen(80);
app.use(express.static(__dirname + '/dist/internationalBridge/browser'));
app.get('/*', (req, res) => res.sendFile(path.join(__dirname + '/dist/internationalBridge/browser/index.html')));
https.createServer(options, app).listen(PORT, ()=>console.log(`Server is now listening on port ${PORT} for https`));