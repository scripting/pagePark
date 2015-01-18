var myVersion = "0.51", myProductName = "PagePark";

	//The MIT License (MIT)
	
	//Copyright (c) 2014 Dave Winer
	
	//Permission is hereby granted, free of charge, to any person obtaining a copy
	//of this software and associated documentation files (the "Software"), to deal
	//in the Software without restriction, including without limitation the rights
	//to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
	//copies of the Software, and to permit persons to whom the Software is
	//furnished to do so, subject to the following conditions:
	
	//The above copyright notice and this permission notice shall be included in all
	//copies or substantial portions of the Software.
	
	//THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
	//IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
	//FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
	//AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
	//LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
	//OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
	//SOFTWARE.

var fs = require ("fs");
var request = require ("request");
var urlpack = require ("url");
var http = require ("http");
var marked = require ("marked");
var dns = require ("dns");
var mime = require ("mime"); //1/8/15 by DW
var utils = require ("./lib/utils.js"); //1/18/15 by DW

var folderPathFromEnv = process.env.pageparkFolderPath; //1/3/15 by DW

var pageparkPrefs = {
	myPort: 1339, //1/8/15 by DW -- was 80, see note in readme.md
	indexFilename: "index"
	};
var fnamePrefs = "prefs/prefs.json";

var pageparkStats = {
	ctStarts: 0, 
	whenLastStart: new Date (0),
	ctHits: 0, ctHitsToday: 0,
	whenLastHit: new Date (0),
	hitsByDomain: {}
	};
var fnameStats = "prefs/stats.json", flStatsDirty = false;

var domainsPath = "domains/";
	var configFname = "/config.json";

var mdTemplatePath = "prefs/mdTemplate.txt";
var urlDefaultTemplate = "http://fargo.io/code/pagepark/defaultmarkdowntemplate.txt";

//routines from utils.js, fs.js
	function fsSureFilePath (path, callback) { 
		var splits = path.split ("/");
		path = ""; //1/8/15 by DW
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

function httpExt2MIME (ext) { //12/24/14 by DW
	mime.default_type = "text/plain";
	return (mime.lookup (ext));
	}
function httpReadUrl (url, callback) {
	request (url, function (error, response, body) {
		if (!error && (response.statusCode == 200)) {
			callback (body) 
			}
		});
	}
function getFullFilePath (relpath) { //1/3/15 by DW
	var folderpath = folderPathFromEnv;
	if (folderpath == undefined) { //the environment variable wasn't specified
		return (relpath);
		}
	if (!utils.endsWith (folderpath, "/")) {
		folderpath += "/";
		}
	if (utils.beginsWith (relpath, "/")) {
		relpath = utils.stringDelete (relpath, 1, 1);
		}
	return (folderpath + relpath);
	}
function getMarkdownTemplate (callback) {
	var f = getFullFilePath (mdTemplatePath);
	fs.readFile (f, function (err, data) {
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
		if (utils.isAlpha (ch) || utils.isNumeric (ch)) {
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
	if (utils.stringContains (path, "./")) {
		return (false);
		}
	return (true);
	}

function everySecond () {
	if (flStatsDirty) {
		writeStats (fnameStats, pageparkStats);
		flStatsDirty = false;
		}
	}



function handleHttpRequest (httpRequest, httpResponse) {
	function getConfigFile (host, callback) {
		var f = getFullFilePath (domainsPath) + host + configFname;
		fs.readFile (f, function (err, data) {
			if (err) {
				callback (undefined);
				}
			else {
				try {
					var config = JSON.parse (data.toString ());
					callback (config);
					}
				catch (err) {
					console.log ("getConfigFile: error reading " + configFname + " file for host " + host + ". " + err.message);
					callback (undefined);
					}
				}
			});
		}
	function return404 () {
		httpResponse.writeHead (404, {"Content-Type": "text/plain"});
		httpResponse.end ("The file was not found.");    
		}
	function findIndexFile (folder, callback) {
		fs.readdir (folder, function (err, list) {
			for (var i = 0; i < list.length; i++) {
				var fname = list [i];
				if (utils.stringCountFields (fname, ".") == 2) { //something like xxx.yyy
					if (utils.stringNthField (fname, ".", 1).toLowerCase () == pageparkPrefs.indexFilename) { //something like index.wtf
						callback (folder + fname);
						return;
						}
					}
				}
			return404 ();
			});
		}
	function serveFile (f) {
		fs.readFile (f, function (err, data) {
			if (err) {
				return404 ();
				}
			else {
				var ext = utils.stringLastField (f, ".").toLowerCase (), type = httpExt2MIME (ext);
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
							pagetable.title = utils.stringLastField (f, "/");
							var s = utils.multipleReplaceAll (theTemplate, pagetable, false, "[%", "%]");
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
	
	try {
		var parsedUrl = urlpack.parse (httpRequest.url, true), host, lowerhost, port, referrer;
		var lowerpath = parsedUrl.pathname.toLowerCase (), now = new Date ();
		//set host, port
			host = httpRequest.headers.host;
			if (utils.stringContains (host, ":")) {
				port = utils.stringNthField (host, ":", 2);
				host = utils.stringNthField (host, ":", 1);
				}
			else {
				port = 80;
				}
			lowerhost = host.toLowerCase ();
		//set referrer
			referrer = httpRequest.headers.referer;
			if (referrer == undefined) {
				referrer = "";
				}
			
		//stats
			//hits by domain
				if (pageparkStats.hitsByDomain [lowerhost] == undefined) {
					pageparkStats.hitsByDomain [lowerhost] = 1;
					}
				else {
					pageparkStats.hitsByDomain [lowerhost]++;
					}
			//hits today
				if (!utils.sameDay (now, pageparkStats.whenLastHit)) { //day rollover
					pageparkStats.ctHitsToday = 0;
					}
			pageparkStats.ctHits++;
			pageparkStats.ctHitsToday++;
			pageparkStats.whenLastHit = now;
			flStatsDirty = true;
		
		//log the request
			dns.reverse (httpRequest.connection.remoteAddress, function (err, domains) {
				var client = httpRequest.connection.remoteAddress;
				if (!err) {
					if (domains.length > 0) {
						client = domains [0];
						}
					}
				console.log (now.toLocaleTimeString () + " " + httpRequest.method + " " + host + ":" + port + " " + lowerpath + " " + referrer + " " + client);
				});
		
		switch (lowerpath) {
			case "/version":
				httpResponse.writeHead (200, {"Content-Type": "text/plain"});
				httpResponse.end (myVersion);    
				break;
			case "/now": 
				httpResponse.writeHead (200, {"Content-Type": "text/plain"});
				httpResponse.end (now.toString ());    
				break;
			case "/status": 
				var status = {
					prefs: pageparkPrefs,
					status: pageparkStats
					}
				httpResponse.writeHead (200, {"Content-Type": "text/plain"});
				httpResponse.end (utils.jsonStringify (status));    
				break;
			default: //see if it's a path in the domains folder, if not 404
				var domainfolder = getFullFilePath (domainsPath) + host;
				var f = domainfolder + parsedUrl.pathname;
				if (checkPathForIllegalChars (f)) {
					fsSureFilePath (domainsPath, function () { //make sure domains folder exists
						getConfigFile (host, function (config) { //get config.json, if it exists -- 1/18/15 by DW
							if (config != undefined) {
								console.log ("handleHttpRequest: config == " + utils.jsonStringify (config));
								if (config.urlSiteRedirect != undefined) {
									var urlRedirect = config.urlSiteRedirect + parsedUrl.pathname;
									httpResponse.writeHead (302, {"Location": urlRedirect, "Content-Type": "text/plain"});
									httpResponse.end ("Temporary redirect to " + urlRedirect + ".");    
									return; 
									}
								}
							fs.stat (f, function (err, stats) {
								if (err) {
									return404 ();
									}
								else {
									if (stats.isDirectory ()) {
										if (!utils.endsWith (f, "/")) {
											f += "/";
											}
										findIndexFile (f, function (findex) {
											serveFile (findex);
											});
										}
									else {
										serveFile (f);
										}
									}
								});
							});
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


function writeStats (fname, stats, callback) {
	var f = getFullFilePath (fname);
	fsSureFilePath (f, function () {
		fs.writeFile (f, utils.jsonStringify (stats), function (err) {
			if (err) {
				console.log ("writeStats: error == " + err.message);
				}
			if (callback != undefined) {
				callback ();
				}
			});
		});
	}
function readStats (fname, stats, callback) {
	var f = getFullFilePath (fname);
	fsSureFilePath (f, function () {
		fs.exists (f, function (flExists) {
			if (flExists) {
				fs.readFile (f, function (err, data) {
					if (err) {
						console.log ("readStats: error reading file " + f + " == " + err.message)
						if (callback != undefined) {
							callback ();
							}
						}
					else {
						var storedStats = JSON.parse (data.toString ());
						for (var x in storedStats) {
							stats [x] = storedStats [x];
							}
						writeStats (fname, stats, function () {
							if (callback != undefined) {
								callback ();
								}
							});
						}
					});
				}
			else {
				writeStats (fname, stats, function () {
					if (callback != undefined) {
						callback ();
						}
					});
				}
			});
		});
	}


function startup () {
	readStats (fnamePrefs, pageparkPrefs, function () {
		readStats (fnameStats, pageparkStats, function () {
			fsSureFilePath (getFullFilePath (domainsPath) + "x", function () { //make sure domains folder exists
				var now = new Date ();
				console.log (myProductName + " v" + myVersion + ".");
				pageparkStats.ctStarts++;
				pageparkStats.whenLastStart = now;
				flStatsDirty = true;
				http.createServer (handleHttpRequest).listen (pageparkPrefs.myPort);
				setInterval (everySecond, 1000); 
				});
			});
		});
	}
startup ();
