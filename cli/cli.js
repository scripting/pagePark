var myVersion = "0.4.0", myProductName = "pageParkCommandLine";

const fs = require ("fs"); 
const utils = require ("daveutils");
const request = require ("request");
const childProcess = require ("child_process");

var config = { 
	domain: "localhost",
	port: 1349
	};

function pad (val, withchar, ctplaces) {
	var s = val.toString ();
	while (s.length < ctplaces) {
		s = withchar + s;
		}
	return (s);
	}
function readJsonFile (path, callback) {
	utils.sureFilePath (path, function () {
		fs.readFile (path, function (err, data) {
			var theObject = undefined;
			if (err) {
				}
			else {
				try {
					theObject = JSON.parse (data);
					}
				catch (err) {
					console.log ("readJsonFile: err.message == " + err.message);
					}
				}
			callback (theObject);
			});
		});
	}
function doCommand (theCommand, callback) {
	var url = "http://" + config.domain + ":" + config.port + "/" + theCommand;
	request (url, function (err, response, data) {
		if (err) {
			callback (err);
			}
		else {
			if (response.statusCode != 200) {
				callback ({message: "Error: " + data.toString ()});
				}
			else {
				callback (undefined, data.toString ());
				}
			}
		});
	}
function getProcessList (callback) {
	doCommand ("list", function (err, val) {
		if (err) {
			callback (err);
			}
		else {
			try {
				var jstruct = JSON.parse (val);
				callback (undefined, jstruct);
				}
			catch (err) {
				callback (err);
				}
			}
		});
	}
function getProcessInfo (ixProcess, callback) {
	ixProcess = Number (ixProcess);
	getProcessList (function (err, theList) {
		if (err) {
			callback (err);
			}
		else {
			if (ixProcess < theList.length) {
				callback (undefined, theList [ixProcess]);
				}
			else {
				var s = (theList.length == 1) ? "there is only " + theList.length + " process" : "there are only " + theList.length + " processes"
				callback ({message: "Can't find process #" + ixProcess + " because " + s + " in the list."});
				}
			}
		});
	}
function applyToProcessCommand (ixProcess, theCommand, callback) {
	getProcessInfo (ixProcess, function (err, theProcess) {
		if (err) {
			callback (err);
			}
		else {
			if ((!theProcess.running) && (theCommand == "stop")) {
				if (callback !== undefined) {
					callback ({message: "Can't stop the process because it isn't running."});
					}
				}
			else {
				doCommand (theCommand + "?file=" + theProcess.file, callback);
				}
			}
		});
	}
function stopCommand (ixProcess, callback) {
	applyToProcessCommand (ixProcess, "stop", function (err, msg) {
		if (err) {
			console.log ("\n" + err.message + "\n");
			}
		else {
			console.log ("\n" + msg + "\n");
			}
		});
	}
function restartCommand (ixProcess, callback) {
	applyToProcessCommand (ixProcess, "restart", function (err, msg) {
		if (err) {
			console.log ("\n" + err.message + "\n");
			}
		else {
			console.log ("\n" + msg + "\n");
			}
		});
	}
function logCommand (ixProcess) { //start scrolling the log for the indicated process
	getProcessInfo (ixProcess, function (err, theProcess) {
		if (err) {
			console.log (err);
			}
		else {
			var theProcess = childProcess.spawn ("tail", ["-f", theProcess.logfile]);
			theProcess.stdout.on ("data", function (linetext) {
				linetext = linetext.toString ();
				console.log (utils.trimWhitespace (linetext));
				});
			}
		});
	}
function listCommand () {
	getProcessList (function (err, theList) {
		if (err) {
			console.log ("\n" + err.message + "\n");
			}
		else {
			function line (ix, domain, port, fname, logfile, runningtime) {
				const maxlengthdomain = 15;
				const maxlengthfname = 15;
				const maxlengthlogfile = 20;
				const maxlengthport = 5;
				var s = "";
				function pushval (val) {
					s += val + " \t";
					}
				
				if (ix === undefined) {
					s += utils.filledString (" ", 7);
					}
				else {
					s += pad ("[" + ix + "]", " " , 5) + ": ";
					}
				
				pushval (pad (domain, " ", maxlengthdomain));
				pushval (pad (port, " ", maxlengthport));
				pushval (pad (fname, " ", maxlengthfname));
				pushval (pad (logfile, " ", maxlengthlogfile));
				pushval (runningtime);
				console.log (s);
				}
			console.log ("\n");
			line (undefined, "domain", "port", "fname", "logfile", "runningtime");
			theList.forEach (function (item, ix) {
				var runningtime = item.running ? utils.getFacebookTimeString (item.ctime, false) : "STOPPED";
				line (ix, item.domain, item.port, fileFromPath (item.file), item.logfile, runningtime);
				});
			console.log ("\n");
			}
		});
	}
function fileFromPath (f) {
	return (utils.stringLastField (f, "/"));
	}
function startup () {
	console.log (pad (8, "0", 4));
	
	var whenstart = new Date (), x;
	for (var i = 0; i < 1000000; i++) {
		x = pad (utils.random (0, 999), "0", 4);
		}
	console.log (utils.secondsSince (whenstart));
	
	
	readJsonFile ("config.json", function (theData) {
		if (theData !== undefined) {
			for (var x in theData) {
				config [x] = theData [x];
				}
			}
		process.argv.forEach (function (item, ix) {
			if (ix > 1) { //first two args are not from the command line
				switch (item) {
					case "now":
						doCommand (item, function (err, val) {
							if (err) {
								console.log (err.message);
								}
							else {
								console.log (val);
								}
							});
						break;
					case "list":
						listCommand ();
						break;
					case "stop":
						stopCommand (process.argv [ix + 1]);
						break;
					case "restart":
						restartCommand (process.argv [ix + 1]);
						break;
					case "log":
						logCommand (process.argv [ix + 1]);
						break;
					}
				}
			});
		});
	}
startup ();
