const utils = require ("daveutils");
var whenstart = new Date ();
console.log (new Date ().toLocaleString () + ": " + system.unixShellCommand ("pwd"));
localStorage.runShellScript = {
	when: new Date ().toLocaleString (),
	howLongSecs: utils.secondsSince (whenstart)
	};
