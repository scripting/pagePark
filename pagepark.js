var myVersion = "0.47", myProductName = "PagePark";

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

var folderPathFromEnv = process.env.pageparkFolderPath; //1/3/15 by DW

var pageparkPrefs = {
	myPort: 80,
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

var mdTemplatePath = "prefs/mdTemplate.txt";
var urlDefaultTemplate = "http://fargo.io/code/pagepark/defaultmarkdowntemplate.txt";

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
	function isAlpha (ch) {
		return (((ch >= 'a') && (ch <= 'z')) || ((ch >= 'A') && (ch <= 'Z')));
		}
	function isNumeric (ch) {
		return ((ch >= '0') && (ch <= '9'));
		}
	function jsonStringify (jstruct) { 
		return (JSON.stringify (jstruct, undefined, 4));
		}
	function secondsSince (when) { 
		var now = new Date ();
		when = new Date (when);
		return ((now - when) / 1000);
		}
	function sameDay (d1, d2) { //returns true if the two dates are on the same day
		d1 = new Date (d1);
		d2 = new Date (d2);
		return ((d1.getFullYear () == d2.getFullYear ()) && (d1.getMonth () == d2.getMonth ()) && (d1.getDate () == d2.getDate ()));
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
	function stringLastField (s, chdelim) { 
		var ct = stringCountFields (s, chdelim);
		if (ct == 0) { //8/31/14 by DW
			return (s);
			}
		return (stringNthField (s, chdelim, ct));
		}
	function multipleReplaceAll (s, adrTable, flCaseSensitive, startCharacters, endCharacters) { 
		if(flCaseSensitive===undefined){
			flCaseSensitive = false;
			}
		if(startCharacters===undefined){
			startCharacters="";
			}
		if(endCharacters===undefined){
			endCharacters="";
			}
		for( var item in adrTable){
			var replacementValue = adrTable[item];
			var regularExpressionModifier = "g";
			if(!flCaseSensitive){
				regularExpressionModifier = "gi";
				}
			var regularExpressionString = (startCharacters+item+endCharacters).replace(/([.?*+^$[\]\\(){}|-])/g, "\\$1");
			var regularExpression = new RegExp(regularExpressionString, regularExpressionModifier);
			s = s.replace(regularExpression, replacementValue);
			}
		return s;
		}
	function httpExt2MIME (ext) { //12/24/14 by DW
		var lowerext = ext.toLowerCase ();
		var map = {
			"au": "audio/basic",
			"avi": "application/x-msvideo",
			"bin": "application/x-macbinary",
			"css": "text/css",
			"dcr": "application/x-director",
			"dir": "application/x-director",
			"dll": "application/octet-stream",
			"doc": "application/msword",
			"dtd": "text/dtd",
			"dxr": "application/x-director",
			"exe": "application/octet-stream",
			"fatp": "text/html",
			"ftsc": "text/html",
			"fttb": "text/html",
			"gif": "image/gif",
			"gz": "application/x-gzip",
			"hqx": "application/mac-binhex40",
			"htm": "text/html",
			"html": "text/html",
			"jpeg": "image/jpeg",
			"jpg": "image/jpeg",
			"js": "application/javascript",
			"mid": "audio/x-midi",
			"midi": "audio/x-midi",
			"mov": "video/quicktime",
			"mp3": "audio/mpeg",
			"pdf": "application/pdf",
			"png": "image/png",
			"ppt": "application/mspowerpoint",
			"ps": "application/postscript",
			"ra": "audio/x-pn-realaudio",
			"ram": "audio/x-pn-realaudio",
			"sit": "application/x-stuffit",
			"sys": "application/octet-stream",
			"tar": "application/x-tar",
			"text": "text/plain",
			"txt": "text/plain",
			"wav": "audio/x-wav",
			"wrl": "x-world/x-vrml",
			"xml": "text/xml",
			"zip": "application/zip"
			};
		for (x in map) {
			if (x.toLowerCase () == lowerext) {
				return (map [x]);
				}
			}
		return ("text/plain");
		}
	function httpReadUrl (url, callback) {
		request (url, function (error, response, body) {
			if (!error && (response.statusCode == 200)) {
				callback (body) 
				}
			});
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

function getFullFilePath (relpath) { //1/3/15 by DW
	var folderpath = folderPathFromEnv;
	if (folderpath == undefined) { //the environment variable wasn't specified
		return (relpath);
		}
	if (!endsWith (folderpath, "/")) {
		folderpath += "/";
		}
	if (beginsWith (relpath, "/")) {
		relpath = stringDelete (relpath, 1, 1);
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
	if (stringContains (path, "./")) {
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
	function return404 () {
		httpResponse.writeHead (404, {"Content-Type": "text/plain"});
		httpResponse.end ("The file was not found.");    
		}
	
	function findIndexFile (folder, callback) {
		fs.readdir (folder, function (err, list) {
			for (var i = 0; i < list.length; i++) {
				var fname = list [i];
				if (stringCountFields (fname, ".") == 2) { //something like xxx.yyy
					if (stringNthField (fname, ".", 1).toLowerCase () == pageparkPrefs.indexFilename) { //something like index.wtf
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
				var ext = stringLastField (f, ".").toLowerCase (), type = httpExt2MIME (ext);
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
	
	try {
		var parsedUrl = urlpack.parse (httpRequest.url, true), host, lowerhost, port, referrer;
		var lowerpath = parsedUrl.pathname.toLowerCase (), now = new Date ();
		//set host, port
			host = httpRequest.headers.host;
			if (stringContains (host, ":")) {
				port = stringNthField (host, ":", 2);
				host = stringNthField (host, ":", 1);
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
				if (!sameDay (now, pageparkStats.whenLastHit)) { //day rollover
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
				httpResponse.end (jsonStringify (status));    
				break;
			default: //see if it's a path in the domains folder, if not 404
				var f = getFullFilePath (domainsPath) + host + parsedUrl.pathname;
				if (checkPathForIllegalChars (f)) {
					fsSureFilePath (domainsPath, function () { //make sure domains folder exists
						fs.stat (f, function (err, stats) {
							if (err) {
								return404 ();
								}
							else {
								if (stats.isDirectory ()) {
									if (!endsWith (f, "/")) {
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
		fs.writeFile (f, jsonStringify (stats), function (err) {
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
