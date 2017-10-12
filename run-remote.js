var secret = require('./secret');
Object.assign(process.env, secret.remote);

// kick off server
require('./server');
