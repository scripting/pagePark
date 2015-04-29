var myVersion = "0.56", myProductName = "PagePark"; 

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
var q = require ("q"); //4/28/2015 by FM
var mkdirp = require ("mkdirp"); //4/28/2015 by FM

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

var fsReadFile = q.denodeify (fs.readFile);
var fsWriteFile = q.denodeify (fs.writeFile);
var fsStat = q.denodeify (fs.stat);
var mkDir = q.denodeify (mkdirp);
var httpClient = q.denodeify ()

function MaybeCreatePath (path) {
	var splits = path.split ("/");
	var defer = q.defer ();
	splits.pop ();
	path = splits.join ("/");
	fsStat (path).then (function () {
		defer.resolve ();
	}, function (err) {
		mkDir (path).then (function (path, err) {
			if (err) {
				console.log ('Error making directory: ' + path);
			}
			defer.resolve ();
		});
	});
	return defer.promise;
}

function httpExt2MIME (ext) { //12/24/14 by DW
	mime.default_type = "text/plain";
	return (mime.lookup (ext));
}
function httpReadUrl (url) {
	var defer = q.defer ();
	request (url, function (error, response, body) {
		if (!error && (response.statusCode == 200)) {
			defer.resolve (body); 
		}
		defer.reject (error);
	});
	return defer.promise;
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
function getMarkdownTemplate () {
	var defer = q.defer ();
	var f = getFullFilePath (mdTemplatePath);
	fsReadFile (f).then (function (data) {
		defer.resolve(data);
	}, function (err) {
		httpReadUrl (urlDefaultTemplate, function (s) {
			fsWriteFile (mdTemplatePath, s).then (function () {
				defer.resolve(s);
			}, function (err) {
				console.log("Failed to write default template.");
				defer.resolve(s);
			});
		});
	});
	return defer.promise;
}
function isIllegalChar (ch) {
	if (utils.isAlpha (ch) || utils.isNumeric (ch)) {
		return (false);
	}
	switch (ch) {
		case "/": case "_": case "-": case ".":  case " ":
			return (false);
	}
	return (true);
}
function checkPathForIllegalChars (path) {
	for (var i = 0; i < path.length; i++) {
		if (isIllegalChar (path [i])) {
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
		flStatsDirty = false;
		writeStats (fnameStats, pageparkStats);
	}
}

function handleHttpRequest (httpRequest, httpResponse) {
	function getConfigFile (host) {
		var f = getFullFilePath (domainsPath) + host + configFname;
		var defer = q.defer();
		fsReadFile (f).then (function (data) {
			var config = JSON.parse (data.toString ());
			defer.resolve(config);
		}, function (err) {
				defer.resolve();
		}).catch (function (err) {
			console.log ("getConfigFile: error reading " + configFname + " file for host " + host + ". " + err.message);
			defer.resolve();
		});
		return defer.promise;
	}
	function return404 () {
		httpResponse.writeHead (404, {"Content-Type": "text/plain"});
		httpResponse.end ("The file was not found.");    
	}
	function findIndexFile (folder, callback) {
		var defer = q.defer();
		q.nfcall (fs.readdir, folder).then (function (list) {
			for (var i = 0; i < list.length; i++) {
				var fname = list [i];
				if (utils.stringCountFields (fname, ".") == 2) { //something like xxx.yyy
					if (utils.stringNthField (fname, ".", 1).toLowerCase () == pageparkPrefs.indexFilename) { //something like index.wtf
						return defer.resolve (folder + fname);
					}
				}
			}
			return404 ();
			defer.reject();
		});
		return defer.promise;
	}
	function serveFile (f) {
		function httpReturn (val, type) { //2/17/15 by DW
			httpResponse.writeHead (200, {"Content-Type": type});
			httpResponse.end (val.toString ());    
		}
		fs.readFile (f, function (err, data) {
			if (err) {
				return404 ();
			} else {
				var ext = utils.stringLastField (f, ".").toLowerCase (), type = httpExt2MIME (ext);
				switch (ext) {
					case "js":
						try {
							var val = eval (data.toString ());
							if (val !== undefined) { //2/17/15 by DW
								httpResponse.writeHead (200, {"Content-Type": "text/html"});
								httpResponse.end (val.toString ());    
							}
						} catch (err) {
							httpResponse.writeHead (500, {"Content-Type": "text/plain"});
							httpResponse.end ("Error running " + parsedUrl.pathname + ": \"" + err.message + "\"");
						}
						break;
					case "md":
						getMarkdownTemplate ().then (function (theTemplate) {
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
		} else {
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
		} else {
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
			if (client == undefined) { //1/25/15 by DW
				client = "";
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
					//get config.json, if it exists -- 1/18/15 by DW
					getConfigFile (host).then (function (config) { 
						if (config != undefined) {
							if (config.urlSiteRedirect != undefined) {
								var urlRedirect = config.urlSiteRedirect + parsedUrl.pathname;
								httpResponse.writeHead (302, {"Location": urlRedirect, "Content-Type": "text/plain"});
								httpResponse.end ("Temporary redirect to " + urlRedirect + ".");    
								return; 
							}
							if (config.urlSiteContents != undefined) { //4/26/15 by DW -- v0.55
								var path = parsedUrl.pathname;
								if (path == "/") {
									path += pageparkPrefs.indexFilename + ".html";
									}
								var url = config.urlSiteContents + path;
								httpRequest.pipe (request (url)).pipe (httpResponse);
								return; 
							}
						}
						fs.stat (f, function (err, stats) {
							if (err) {
								return404 ();
							} else {
								if (stats.isDirectory ()) {
									if (!utils.endsWith (f, "/")) {
										f += "/";
									}
									findIndexFile (f).then (function (findex) {
										serveFile (findex);
									});
								} else {
									serveFile (f);
								}
							}
						});
					});
				} else {
					httpResponse.writeHead (500, {"Content-Type": "text/plain"});
					httpResponse.end ("The file name contains illegal characters.");    
				}
				break;
		}
	} catch (tryError) {
		httpResponse.writeHead (500, {"Content-Type": "text/plain"});
		httpResponse.end (tryError.message);    
	}
}

function writeStats (fname, stats, callback) {
	var f = getFullFilePath (fname);
	return fsWriteFile (f, utils.jsonStringify (stats)).fail (function (err) {
		console.log ("writeStats: error == " + err.message);
	});
}
function readStats (fname, stats) {
	var f = getFullFilePath (fname);
	return MaybeCreatePath (f).then (function () {
		return fsReadFile (f, "utf-8").then (function(data) {
			var storedStats = JSON.parse (data.toString ());
			for (var x in storedStats) {
				stats [x] = storedStats [x];
			}
			return writeStats (fname, stats);
		}, function (err) {
			console.log ("Prefs file " + fname + " not found, writing new copy");
			return writeStats (fname, stats);
		});
	});
}

function startup () {
	readStats (fnamePrefs, pageparkPrefs).then (function () {
		return readStats (fnameStats, pageparkStats);
	}).then (function () {
		//make sure domains folder exists
		return MaybeCreatePath (getFullFilePath (domainsPath) + "x");
	}).then (function () { 
		var now = new Date ();
		pageparkStats.ctStarts++;
		pageparkStats.whenLastStart = now;
		flStatsDirty = true;
		http.createServer (handleHttpRequest).listen (pageparkPrefs.myPort);
		console.log (""); console.log (myProductName + " v" + myVersion + " running on port " + pageparkPrefs.myPort + "."); console.log ("");
		setInterval (everySecond, 1000); 
	});
}
startup ();