var myVersion = "0.59f", myProductName = "PagePark"; 

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
	indexFilename: "index",
	flProcessScriptFiles: true, extScriptFiles: "js", //5/5/15 by DW
	flProcessMarkdownFiles: true, extMarkdownFiles: "md" //5/5/15 by DW
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
			case "/": case "_": case "-": case ".":  case " ": case "*":
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
	function getDomainFolder (host, callback) { //5/11/15 by DW
		var folder = getFullFilePath (domainsPath);
		var domainfolder = folder + host;
		fs.exists (domainfolder, function (flExists) {
			if (flExists) {
				callback (domainfolder, host);
				}
			else {
				if (utils.stringCountFields (host, ".") == 3) {
					var firstpart = utils.stringNthField (host, ".", 1);
					var wildcardhost = "*" + utils.stringDelete (host, 1, firstpart.length);
					domainfolder = folder + wildcardhost;
					callback (domainfolder, wildcardhost);
					}
				else {
					callback (domainfolder, host);
					}
				}
			});
		}
	function getConfigFile (host, callback) {
		var config = {
			urlSiteRedirect: undefined,
			urlSiteContents: undefined,
			flProcessScriptFiles: true, 
			flProcessMarkdownFiles: true,
			extScriptFiles: pageparkPrefs.extScriptFiles,
			extMarkdownFiles: pageparkPrefs.extMarkdownFiles
			};
		var f = getFullFilePath (domainsPath) + host + configFname;
		fs.readFile (f, function (err, data) {
			if (err) {
				callback (config);
				}
			else {
				try {
					var storedConfig = JSON.parse (data.toString ());
					for (var x in storedConfig) {
						config [x] = storedConfig [x];
						}
					callback (config);
					
					}
				catch (err) {
					console.log ("getConfigFile: error reading " + configFname + " file for host " + host + ". " + err.message);
					callback (config);
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
	function serveFile (f, config) {
		function httpReturn (val, type) { //2/17/15 by DW
			httpResponse.writeHead (200, {"Content-Type": type});
			httpResponse.end (val.toString ());    
			}
		
		function defaultReturn (type, data) {
			httpResponse.writeHead (200, {"Content-Type": type});
			httpResponse.end (data);    
			}
		
		fs.readFile (f, function (err, data) {
			if (err) {
				return404 ();
				}
			else {
				var ext = utils.stringLastField (f, ".").toLowerCase (), type = httpExt2MIME (ext);
				switch (ext) {
					case config.extScriptFiles:
						if (pageparkPrefs.flProcessScriptFiles && config.flProcessScriptFiles) {
							try {
								var val = eval (data.toString ());
								if (val !== undefined) { //2/17/15 by DW
									httpResponse.writeHead (200, {"Content-Type": "text/html"});
									httpResponse.end (val.toString ());    
									}
								}
							catch (err) {
								httpResponse.writeHead (500, {"Content-Type": "text/plain"});
								httpResponse.end ("Error running " + parsedUrl.pathname + ": \"" + err.message + "\"");
								}
							}
						else {
							defaultReturn (type, data);
							}
						break;
					case config.extMarkdownFiles:
						if (pageparkPrefs.flProcessMarkdownFiles && config.flProcessMarkdownFiles) {
							getMarkdownTemplate (function (theTemplate) {
								var mdtext = data.toString (), pagetable = new Object ();
								pagetable.bodytext = marked (mdtext);
								pagetable.title = utils.stringLastField (f, "/");
								var s = utils.multipleReplaceAll (theTemplate, pagetable, false, "[%", "%]");
								httpResponse.writeHead (200, {"Content-Type": "text/html"});
								httpResponse.end (s);    
								});
							}
						else {
							defaultReturn (type, data);
							}
						break;
					default:
						defaultReturn (type, data);
						break;
					}
				}
			});
		}
	function delegateRequest (urlToDelegateTo) {
		var theRequest = {
			url: urlToDelegateTo,
			headers: {
				"X-Forwarded-Host": host,
				"X-Forwarded-For": httpRequest.connection.remoteAddress
				}
			};
		try {
			httpRequest.pipe (request (theRequest)).pipe (httpResponse); 
			}
		catch (tryError) {
			httpResponse.writeHead (500, {"Content-Type": "text/plain"});
			httpResponse.end (tryError.message);    
			}
		}
	function findMappedDomain (domain, callback) { //5/23/15 by DW
		for (var x in pageparkPrefs.domainMap) {
			if (utils.endsWith (domain, x)) {
				callback (pageparkPrefs.domainMap [x]); //a mapped domain, delegate to this port
				return;
				}
			}
		callback (undefined); //it's one of our domains, handle it here
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
				if (client == undefined) { //1/25/15 by DW
					client = "";
					}
				console.log (now.toLocaleTimeString () + " " + httpRequest.method + " " + host + ":" + port + " " + lowerpath + " " + referrer + " " + client);
				});
		//handle the request
			findMappedDomain (host, function (thePort) {
				if (thePort !== undefined) {
					var urlRemote;
					parsedUrl.protocol = "http:";
					parsedUrl.host = host + ":" + thePort;
					parsedUrl.hostname = host;
					parsedUrl.port = thePort;
					urlRemote = urlpack.format (parsedUrl);
					delegateRequest (urlRemote);
					}
				else { //no mapping, we handle the request
					getDomainFolder (host, function (domainfolder, actualhost) { //might be a wildcard folder
						var f = domainfolder + parsedUrl.pathname;
						if (checkPathForIllegalChars (f)) {
							fsSureFilePath (domainsPath, function () { //make sure domains folder exists
								getConfigFile (actualhost, function (config) { //get config.json, if it exists -- 1/18/15 by DW
									if (config != undefined) {
										if (config.urlSiteRedirect != undefined) {
											var urlRedirect = config.urlSiteRedirect + parsedUrl.pathname;
											httpResponse.writeHead (302, {"Location": urlRedirect, "Content-Type": "text/plain"});
											httpResponse.end ("Temporary redirect to " + urlRedirect + ".");    
											return; 
											}
										if (config.urlSiteContents != undefined) { //4/26/15 by DW -- v0.55
											delegateRequest (config.urlSiteContents + httpRequest.url);
											return; 
											}
										if (config.s3Path != undefined) { //5/11/15 PM by DW v0.58
											var firstPartOfHost = utils.stringNthField (host, ".", 1); //if it's dave.smallpict.com, this value is "dave"
											var s3url = "http:/" + config.s3Path + firstPartOfHost + parsedUrl.pathname; //xxx
											request (s3url, function (error, response, body) {
												if (error) {
													httpResponse.writeHead (500, {"Content-Type": "text/plain"});
													httpResponse.end ("Error accessing S3 data: " + error.message);    
													}
												else {
													httpResponse.writeHead (response.statusCode, {"Content-Type": response.headers ["content-type"]});
													httpResponse.end (body);    
													}
												});
											return;
											}
										}
									fs.stat (f, function (err, stats) {
										if (err) {
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
												default:
													return404 ();
													break;
												}
											}
										else {
											if (stats.isDirectory ()) {
												if (!utils.endsWith (f, "/")) {
													f += "/";
													}
												findIndexFile (f, function (findex) {
													serveFile (findex, config);
													});
												}
											else {
												serveFile (f, config);
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
						});
					}
				});
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
				pageparkStats.ctStarts++;
				pageparkStats.whenLastStart = now;
				flStatsDirty = true;
				http.createServer (handleHttpRequest).listen (pageparkPrefs.myPort);
				console.log (""); console.log (myProductName + " v" + myVersion + " running on port " + pageparkPrefs.myPort + "."); console.log ("");
				setInterval (everySecond, 1000); 
				});
			});
		});
	}
startup ();
