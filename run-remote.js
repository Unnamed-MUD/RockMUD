var secret = require('./secret');
Object.assign(process.env, secret.remote);
console.log("RUNNING ON REMOTE SERVER " + secret.remote.DB_HOST);
// kick off server
require('./server');
