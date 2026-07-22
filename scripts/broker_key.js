// Moved to src/brokerKey.js so the app, the API functions and these scripts all
// share ONE normalizer. This shim keeps old requires working.
module.exports = require("../src/brokerKey.js");
