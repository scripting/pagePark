var myVersion = "0.40", myProductName = "pagePark", myPort = 80;

var fs = require ("fs");
var request = require ("request");
var urlpack = require ("url");
var http = require ("http");
var marked = require ("marked");

var pageParkPrefs = {
	myPort: 80
	};
var fnamePrefs = "prefs/prefs.json";

var pageParkStats = {
	ctStarts: 0, 
	whenLastStart: new Date (0)
	};
var fnameStats = "prefs/stats.json";

var domainsPath = "domains/";
var httpDefaultFilename = "index.html";

//routines from utils.js, fs.js
	function getBoolean (val) {  
		switch (typeof (val)) {
			case "string":
				if (val.toLowerCase () == "true") {
					return (true);
					}
				break;
			case "boolean":
				return (val);
				break;
			case "number":
				if (val != 0) {
					return (true);
					}
				break;
			}
		return (false);
		}
	function jsonStringify (jstruct) { 
		return (JSON.stringify (jstruct, undefined, 4));
		}
	function secondsSince (when) { 
		var now = new Date ();
		when = new Date (when);
		return ((now - when) / 1000);
		}
	function endsWith (s, possibleEnding, flUnicase) {
		if ((s == undefined) || (s.length == 0)) { 
			return (false);
			}
		var ixstring = s.length - 1;
		if (flUnicase == undefined) {
			flUnicase = true;
			}
		if (flUnicase) {
			for (var i = possibleEnding.length - 1; i >= 0; i--) {
				if (s [ixstring--].toLowerCase () != possibleEnding [i].toLowerCase ()) {
					return (false);
					}
				}
			}
		else {
			for (var i = possibleEnding.length - 1; i >= 0; i--) {
				if (s [ixstring--] != possibleEnding [i]) {
					return (false);
					}
				}
			}
		return (true);
		}
	function stringContains (s, whatItMightContain, flUnicase) { 
		if (flUnicase == undefined) {
			flUnicase = true;
			}
		if (flUnicase) {
			s = s.toLowerCase ();
			whatItMightContain = whatItMightContain.toLowerCase ();
			}
		return (s.indexOf (whatItMightContain) != -1);
		}
	function stringCountFields (s, chdelim) {
		var ct = 1;
		if (s.length == 0) {
			return (0);
			}
		for (var i = 0; i < s.length; i++) {
			if (s [i] == chdelim) {
				ct++;
				}
			}
		return (ct)
		}
	function stringNthField (s, chdelim, n) {
		var splits = s.split (chdelim);
		if (splits.length >= n) {
			return splits [n-1];
			}
		return ("");
		}
	function fsSureFilePath (path, callback) { 
		var splits = path.split ("/"), path = "";
		if (splits.length > 0) {
			function doLevel (levelnum) {
				if (levelnum < (splits.length - 1)) {
					path += splits [levelnum] + "/";
					fs.exists (path, function (flExists) {
						if (flExists) {
							doLevel (levelnum + 1);
							}
						else {
							fs.mkdir (path, undefined, function () {
								doLevel (levelnum + 1);
								});
							}
						});
					}
				else {
					if (callback != undefined) {
						callback ();
						}
					}
				}
			doLevel (0);
			}
		else {
			if (callback != undefined) {
				callback ();
				}
			}
		}

function writeStats (fname, stats) {
	fsSureFilePath (fname, function () {
		fs.writeFile (fname, jsonStringify (stats), function (err) {
			if (err) {
				console.log ("writeStats: error == " + err.message);
				}
			});
		});
	}
function readStats (f, stats, callback) {
	fs.exists (f, function (flExists) {
		if (flExists) {
			fs.readFile (f, function (err, data) {
				if (err) {
					console.log ("readStats: error reading file " + f + " == " + err.message)
					}
				else {
					var storedStats = JSON.parse (data.toString ());
					for (var x in storedStats) {
						stats [x] = storedStats [x];
						}
					writeStats (f, stats);
					}
				if (callback != undefined) {
					callback ();
					}
				});
			}
		else {
			writeStats (fname, stats);
			}
		});
	}
function getMarkdownTemplate (callback) {
	fs.readFile (mdTemplatePath, function (err, data) {
		if (err) {
			httpReadUrl (urlDefaultTemplate, function (s) {
				fs.writeFile (mdTemplatePath, s, function (err) {
					if (callback != undefined) {
						callback (s);
						}
					});
				});
			}
		else {
			if (callback != undefined) {
				callback (data.toString ());
				}
			}
		});
	}
function checkPathForIllegalChars (path) {
	function isIllegal (ch) {
		if (isAlpha (ch) || isNumeric (ch)) {
			return (false);
			}
		switch (ch) {
			case "/": case "_": case "-": case ".":  case " ":
				return (false);
			}
		return (true);
		}
	for (var i = 0; i < path.length; i++) {
		if (isIllegal (path [i])) {
			return (false);
			}
		}
	return (true);
	}

function handleHttpRequest (httpRequest, httpResponse) {
	function return404 () {
		httpResponse.writeHead (404, {"Content-Type": "text/plain"});
		httpResponse.end ("The file was not found.");    
		}
	try {
		var parsedUrl = urlpack.parse (httpRequest.url, true), host, port;
		var lowercasepath = parsedUrl.pathname.toLowerCase (), now = new Date ();
		//set host, port
			host = httpRequest.headers.host;
			if (stringContains (host, ":")) {
				port = stringNthField (host, ":", 2);
				host = stringNthField (host, ":", 1);
				}
		console.log ("Received request: " + httpRequest.url);
		switch (lowercasepath) {
			case "/version":
				httpResponse.writeHead (200, {"Content-Type": "text/plain"});
				httpResponse.end (myVersion);    
				break;
			case "/now": 
				httpResponse.writeHead (200, {"Content-Type": "text/plain"});
				httpResponse.end (now.toString ());    
				break;
			default: //see if it's a path in the domains folder, if not 404
				var f = domainsPath + host + parsedUrl.pathname;
				if (checkPathForIllegalChars (f)) {
					fs.stat (f, function (err, stats) {
						if (err) {
							return404 ();
							}
						else {
							if (stats.isDirectory ()) {
								if (!endsWith (f, "/")) {
									f += "/";
									}
								f += "index.html";
								}
							fs.readFile (f, function (err, data) {
								if (err) {
									httpResponse.writeHead (500, {"Content-Type": "text/plain"});
									httpResponse.end ("There was an error reading the file.");    
									}
								else {
									var ext = stringLower (stringLastField (f, ".")), type = httpExt2MIME (ext);
									console.log ("handleHttpRequest: f == " + f + ", type == " + type);
									switch (ext) {
										case "js":
											try {
												var val = eval (data.toString ());
												httpResponse.writeHead (200, {"Content-Type": "text/html"});
												httpResponse.end (val.toString ());    
												}
											catch (err) {
												httpResponse.writeHead (500, {"Content-Type": "text/plain"});
												httpResponse.end ("Error running " + parsedUrl.pathname + ": \"" + err.message + "\"");
												}
											break;
										case "md":
											getMarkdownTemplate (function (theTemplate) {
												var mdtext = data.toString (), pagetable = new Object ();
												pagetable.bodytext = marked (mdtext);
												pagetable.title = stringLastField (f, "/");
												var s = multipleReplaceAll (theTemplate, pagetable, false, "[%", "%]");
												httpResponse.writeHead (200, {"Content-Type": "text/html"});
												httpResponse.end (s);    
												});
											break;
										default:
											httpResponse.writeHead (200, {"Content-Type": type});
											httpResponse.end (data);    
											break;
										}
									}
								});
							}
						});
					}
				else {
					httpResponse.writeHead (500, {"Content-Type": "text/plain"});
					httpResponse.end ("The file name contains illegal characters.");    
					}
				break;
			}
		}
	catch (tryError) {
		httpResponse.writeHead (500, {"Content-Type": "text/plain"});
		httpResponse.end (tryError.message);    
		}
	}

function startup () {
	readStats (fnamePrefs, pageParkPrefs, function () {
		readStats (fnameStats, pageParkStats, function () {
			var now = new Date ();
			console.log (myProductName + " v" + myVersion + ".");
			pageParkStats.ctStarts++;
			pageParkStats.whenLastStart = now;
			writeStats (fnameStats, pageParkStats);
			http.createServer (handleHttpRequest).listen (pageParkPrefs.myPort);
			});
		});
	}
startup ();
