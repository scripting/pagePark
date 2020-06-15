#!/usr/bin/env node

var myVersion = "0.4.1", myProductName = "pageParkCommandLine";

const fs = require ("fs"); 
const utils = require ("daveutils");
const request = require ("request");
const childProcess = require ("child_process");
const colors = require ("colors");

var config = { 
	domain: "localhost",  
	port: 1349   
	};

function pad (val, withchar, ctplaces, flleftalign) {
	var s = (val === undefined) ? "" : val.toString ();
	while (s.length < ctplaces) {
		if (flleftalign) {
			s = s + withchar;
			}
		else {
			s = withchar + s;
			}
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
			function line (ix, domain, port, fname, logfile, restarts, runningtime, fltitleline) {
				const maxlengthdomain = 30;
				const maxlengthfname = 15;
				const maxlengthlogfile = 30;
				const maxlengthport = 5;
				const maxlengthrestarts = 6;
				var s = "";
				function pushval (val) {
					if (fltitleline) {
						val = val.blue.bold;
						}
					s += val + " \t";
					}
				
				if (ix === undefined) {
					s += utils.filledString (" ", 7);
					}
				else {
					s += pad ("[" + ix + "]", " " , 5) + ": ";
					}
				
				pushval (pad (domain, " ", maxlengthdomain, true));
				pushval (pad (port, " ", maxlengthport, true));
				pushval (pad (fname, " ", maxlengthfname, true));
				pushval (pad (logfile, " ", maxlengthlogfile, true));
				pushval (pad (restarts, " ", maxlengthrestarts, true));
				pushval (runningtime);
				console.log (s);
				}
			console.log ("\n");
			line (undefined, "domain", "port", "fname", "logfile", "starts", "runningtime", true);
			theList.forEach (function (item, ix) {
				var domain = (item.domain === undefined) ? "" : item.domain;
				var runningtime = item.running ? utils.getFacebookTimeString (item.ctime, false) : "STOPPED";
				line (ix, domain, item.port, fileFromPath (item.file), item.logfile, item.restarts, runningtime);
				});
			console.log ("\n");
			}
		});
	}
function fileFromPath (f) {
	return (utils.stringLastField (f, "/"));
	}
function startup () {
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
			else {
				listCommand (); //pp with no params is the list command
				}
			});
		});
	}
startup ();
