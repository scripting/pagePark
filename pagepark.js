var myVersion = "0.7.18", myProductName = "PagePark";   

/*  The MIT License (MIT)
	Copyright (c) 2014-2017 Dave Winer
	
	Permission is hereby granted, free of charge, to any person obtaining a copy
	of this software and associated documentation files (the "Software"), to deal
	in the Software without restriction, including without limitation the rights
	to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
	copies of the Software, and to permit persons to whom the Software is
	furnished to do so, subject to the following conditions:
	
	The above copyright notice and this permission notice shall be included in all
	copies or substantial portions of the Software.
	
	THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
	IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
	FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
	AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
	LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
	OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
	SOFTWARE.
	 
	structured listing: http://scripting.com/listings/pagepark.html
	*/

var fs = require ("fs");
var request = require ("request");
var urlpack = require ("url");
var http = require ("http");
var marked = require ("marked");
var dns = require ("dns");
var utils = require ("daveutils"); //6/7/17 by DW
var opmlToJs = require ("opmltojs"); //6/16/17 by DW
const websocket = require ("nodejs-websocket"); //9/29/17 by DW

var pageparkPrefs = {
	myPort: 1339, //1/8/15 by DW -- was 80, see note in readme.md
	flWebsocketEnabled: false, websocketPort: 1340, //9/29/17 by DW
	indexFilename: "index",
	flProcessScriptFiles: true, extScriptFiles: "js", //5/5/15 by DW
	flProcessMarkdownFiles: true, extMarkdownFiles: "md", //5/5/15 by DW
	flProcessOpmlFiles: true, extOpmlFiles: "opml", //6/23/15 by DW
	error404File: "prefs/error.html", //7/16/15 by DW
	legalPathChars: "", //7/19/15 by DW,
	flCacheTemplatesLocally: true, //6/17/17 by DW -- preserve the original behavior
	urlDefaultMarkdownTemplate: "http://fargo.io/code/pagepark/defaultmarkdowntemplate.txt", //6/17/17 by DW
	urlDefaultOpmlTemplate: "http://fargo.io/code/pagepark/templates/opml/template.txt", //6/17/17 by DW
	urlDefaultErrorPage: "http://fargo.io/code/pagepark/prefs/error.html", //6/17/17 by DW
	flUnicasePaths: false //11/7/17 by DW
	};
var pageparkStats = {
	ctStarts: 0, 
	whenLastStart: new Date (0),
	ctHits: 0, ctHitsToday: 0, ctHitsSinceStart: 0,
	whenLastHit: new Date (0),
	hitsByDomain: {}
	};

var fnamePrefs = "prefs/prefs.json";
var fnameStats = "prefs/stats.json", flStatsDirty = false;
var domainsPath = "domains/";
var configFname = "/config.json";
var mdTemplatePath = "prefs/mdTemplate.txt";
var opmlTemplatePath = "prefs/opmlTemplate.txt";
var folderPathFromEnv = process.env.pageparkFolderPath; //1/3/15 by DW
var flEveryMinuteScheduled = false; //7/17/17 by DW

//websockets -- 9/29/17 by DW
	var theWsServer = undefined;
	function notifySocketSubscribers (verb, jstruct) {
		if (theWsServer !== undefined) {
			var ctUpdates = 0, now = new Date (), jsontext = "";
			if (jstruct !== undefined) { //10/7/16 by DW
				jsontext = utils.jsonStringify (jstruct);
				}
			for (var i = 0; i < theWsServer.connections.length; i++) {
				var conn = theWsServer.connections [i];
				if (conn.pageParkData !== undefined) { //it's one of ours
					try {
						conn.sendText (verb + "\r" + jsontext);
						conn.pageParkData.whenLastUpdate = now;
						conn.pageParkData.ctUpdates++;
						ctUpdates++;
						}
					catch (err) {
						console.log ("notifySocketSubscribers: socket #" + i + ": error updating");
						}
					}
				}
			}
		}
	function webSocketStartup () {
		if (pageparkPrefs.flWebsocketEnabled) {
			try {
				theWsServer = websocket.createServer (function (conn) {
					conn.pageParkData = {
						whenLastUpdate: new Date (0),
						ctUpdates: 0
						};
					});
				theWsServer.listen (pageparkPrefs.websocketPort);
				}
			catch (err) {
				console.log ("webSocketStartup: err.message == " + err.message);
				}
			}
		}

function httpExt2MIME (ext) { //12/24/14 by DW
	return (utils.httpExt2MIME (ext));
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
function getTemplate (myTemplatePath, urlDefaultTemplate, callback) {
	if (pageparkPrefs.flCacheTemplatesLocally) {
		var f = getFullFilePath (myTemplatePath);
		fs.readFile (f, function (err, data) {
			if (err) {
				httpReadUrl (urlDefaultTemplate, function (s) {
					fs.writeFile (myTemplatePath, s, function (err) {
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
	else {
		httpReadUrl (urlDefaultTemplate, function (s) {
			if (callback != undefined) {
				callback (s);
				}
			});
		}
	}
function getMarkdownTemplate (callback) {
	getTemplate (mdTemplatePath, pageparkPrefs.urlDefaultMarkdownTemplate, callback);
	}
function getOpmlTemplate (callback) { //6/23/15 by DW
	getTemplate (opmlTemplatePath, pageparkPrefs.urlDefaultOpmlTemplate, callback);
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
		for (var i = 0; i <  pageparkPrefs.legalPathChars.length; i++) { //7/19/15 by DW -- check if they are legal on this server
			if (ch == pageparkPrefs.legalPathChars [i]) {
				return (false);
				}
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
function everyMinute () { //7/17/17 by DW
	var now = new Date ();
	console.log ("\n" + myProductName + " v" + myVersion + ": " + now.toLocaleTimeString () + ", port == " + pageparkPrefs.myPort + ".\n");
	if (flStatsDirty) {
		writeStats (fnameStats, pageparkStats);
		flStatsDirty = false;
		}
	}
function everySecond () {
	var now = new Date ();
	if (!flEveryMinuteScheduled) {
		if (now.getSeconds () == 0) {
			flEveryMinuteScheduled = true;
			setInterval (everyMinute, 60000); 
			everyMinute (); //do one right now
			}
		}
	}
function handleHttpRequest (httpRequest, httpResponse) {
	var now = new Date ();
	var logInfo = { //2/17/18 by DW
		when: now
		};
	
	function hasAcceptHeader (theHeader) {
		if (httpRequest.headers.accept === undefined) {
			return (false);
			}
		else {
			var split = httpRequest.headers.accept.split (", ");
			for (var i = 0; i < split.length; i++) {
				if (split [i] == theHeader) {
					return (true);
					}
				}
			return (false);
			}
		}
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
			flProcessOpmlFiles: true,
			extScriptFiles: pageparkPrefs.extScriptFiles,
			extMarkdownFiles: pageparkPrefs.extMarkdownFiles,
			extOpmlFiles: pageparkPrefs.extOpmlFiles
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
	function httpRespond (code, type, val, headers) {
		if (headers === undefined) {
			headers = new Object ();
			}
		headers ["Content-Type"] = type;
		httpResponse.writeHead (code, headers);
		httpResponse.end (val);    
		logInfo.ctSecs = utils.secondsSince (logInfo.when);
		logInfo.size = val.length;
		logInfo.code = code;
		logInfo.type = type;
		
		logInfo.serverStats = {
			pageParkVersion: myVersion,
			whenStart: pageparkStats.whenLastStart,
			ctHits: pageparkStats.ctHits,
			ctHitsToday: pageparkStats.ctHitsToday,
			ctHitsSinceStart: pageparkStats.ctHitsSinceStart
			};
		
		notifySocketSubscribers ("log", logInfo);
		}
	function return404 () {
		getTemplate (pageparkPrefs.error404File, pageparkPrefs.urlDefaultErrorPage, function (htmtext) {
			httpRespond (404, "text/html", htmtext);
			});
		}
	function returnRedirect (urlRedirectTo, flPermanent) { //7/30/15 by DW
		var code = (flPermanent) ? 301 : 302;
		httpRespond (code, "text/plain", "Redirect to " + urlRedirectTo + ".", {"Location": urlRedirectTo})
		}
	function findSpecificFile (folder, specificFname, callback) {
		specificFname = specificFname.toLowerCase (); //7/16/15 by DW
		fs.readdir (folder, function (err, list) {
			for (var i = 0; i < list.length; i++) {
				var fname = list [i];
				if (utils.stringCountFields (fname, ".") == 2) { //something like xxx.yyy
					if (utils.stringNthField (fname, ".", 1).toLowerCase () == specificFname) { //something like index.wtf
						callback (folder + fname);
						return;
						}
					}
				}
			return404 ();
			});
		}
	function processResponse (path, data, config, callback) { //9/26/17 by DW
		var formatParam; //url ends with ?format=abc -- 6/24/15 by DW
		if (parsedUrl.query.format !== undefined) {
			formatParam = parsedUrl.query.format.toLowerCase ()
			}
		function httpReturn (val, type) { //2/17/15 by DW
			callback (200, type, val.toString ());
			}
		function defaultReturn (type, data) {
			callback (200, type, data);
			}
		var ext = utils.stringLastField (path, ".").toLowerCase (), type = httpExt2MIME (ext);
		switch (ext) {
			case config.extScriptFiles:
				if (pageparkPrefs.flProcessScriptFiles && config.flProcessScriptFiles) {
					try {
						var val = eval (data.toString ());
						if (val !== undefined) { //2/17/15 by DW
							httpReturn (val.toString (), "text/html");
							}
						}
					catch (err) {
						callback (500, "text/plain", "Error running " + parsedUrl.pathname + ": \"" + err.message + "\"");
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
						pagetable.title = utils.stringLastField (path, "/");
						var s = utils.multipleReplaceAll (theTemplate, pagetable, false, "[%", "%]");
						callback (200, "text/html", s);
						});
					}
				else {
					defaultReturn (type, data);
					}
				break;
			case config.extOpmlFiles: //6/23/15 by DW
				var flReturnHtml = (!hasAcceptHeader ("text/x-opml")) && (formatParam != "opml");
				if (pageparkPrefs.flProcessOpmlFiles && config.flProcessOpmlFiles && flReturnHtml) { //6/24/15 by DW
					getOpmlTemplate (function (theTemplate) {
						var opmltext = data.toString (), pagetable = new Object ();
						opmlToJs.parse (opmltext, function (theOutline) {
							var pagetable = {
								bodytext: utils.jsonStringify (theOutline),
								title: utils.stringLastField (path, "/"),
								description: "",
								image: "",
								sitename: "",
								url: "http://" + httpRequest.headers.host + httpRequest.url
								};
							utils.copyScalars (theOutline.opml.head, pagetable);
							var htmltext = utils.multipleReplaceAll (theTemplate, pagetable, false, "[%", "%]");
							httpReturn (htmltext, "text/html");
							});
						});
					}
				else {
					defaultReturn ("text/xml", data);
					}
				break;
			default:
				defaultReturn (type, data);
				break;
			}
		}
	function serveFile (f, config) {
		fs.readFile (f, function (err, data) {
			if (err) {
				return404 ();
				}
			else {
				processResponse (f, data, config, function (code, type, text) {
					httpRespond (code, type, text);
					});
				}
			});
		}
	function serveRedirect (lowerpath, config) { //7/30/15 by DW -- return true if we handled the request
		if (config.redirects !== undefined) {
			for (x in config.redirects) {
				if (x.toLowerCase () == lowerpath) {
					var urlRedirectTo = config.redirects [x];
					console.log ("serveRedirect: urlRedirectTo == " + urlRedirectTo);
					returnRedirect (urlRedirectTo);
					return (true);
					}
				}
			}
		return (false);
		}
	function delegateRequest (urlToDelegateTo) {
		var theRequest = {
			url: urlToDelegateTo,
			followRedirect: false, //5/26/15  by DW
			headers: {
				"X-Forwarded-Host": host,
				"X-Forwarded-For": httpRequest.connection.remoteAddress
				}
			};
		function handleError (err) {
			if (err) {
				console.log ("delegateRequest: error == " + err.message); 
				httpRespond (500, "text/plain", err.message);
				}
			}
		var req = httpRequest.pipe (request (theRequest));
		req.on ("error", handleError);
		req.pipe (httpResponse).on ("error", handleError);
		
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
	function pathParse (domainfolder, path, callback) { //11/7/17 by DW
		if (pageparkPrefs.flUnicasePaths) {
			var nomad = domainfolder, steps, flSlashAtEnd = false;
			if (utils.beginsWith (path, "/")) {
				path = utils.stringDelete (path, 1, 1);
				}
			steps = path.split ("/");
			
			if (steps [steps.length - 1].length == 0) {
				steps.pop ();
				flSlashAtEnd = true;
				}
			
			function doStep (ix) {
				if (ix < steps.length) {
					var lowerstep = utils.stringLower (steps [ix]), flfound = false;
					if (!utils.endsWith (nomad, "/")) {
						nomad += "/";
						}
					fs.readdir (nomad, function (err, list) {
						if (err) {
							callback (err);
							}
						else {
							for (var i = 0; i < list.length; i++) {
								var fname = utils.stringLower (list [i]);
								if (fname == lowerstep) {
									nomad += list [i];
									doStep (ix + 1);
									flfound = true;
									break;
									}
								}
							if (!flfound) {
								var err = {
									};
								callback (err);
								}
							}
						});
					}
				else {
					if (flSlashAtEnd) {
						nomad += "/";
						}
					callback (undefined, nomad);
					}
				}
			doStep (0);
			}
		else {
			callback (undefined, domainfolder + path);
			}
		}
	
	try {
		var parsedUrl = urlpack.parse (httpRequest.url, true), host, lowerhost, port, referrer;
		var lowerpath = parsedUrl.pathname.toLowerCase ();
		var remoteAddress = httpRequest.connection.remoteAddress;
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
			
		//clean up remoteAddress -- 9/29/17 by DW
			if (utils.beginsWith (remoteAddress, "::ffff:")) { 
				remoteAddress = utils.stringDelete (remoteAddress, 1, 7);
				}
		//set up logInfo  -- 9/30/17 by DW
			logInfo = {
				method: httpRequest.method,
				host: host,
				port: port,
				path: parsedUrl.pathname,
				lowerpath: lowerpath,
				referrer: referrer,
				params: parsedUrl.query,
				remoteAddress: remoteAddress
				};
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
			pageparkStats.ctHitsSinceStart++; //9/30/17 by DW
			pageparkStats.whenLastHit = now;
			flStatsDirty = true;
		
		//log the request
			dns.reverse (remoteAddress, function (err, domains) {
				var client = remoteAddress;
				if (!err) {
					if (domains.length > 0) {
						client = domains [0];
						}
					}
				if (client == undefined) { //1/25/15 by DW
					client = "";
					}
				console.log (now.toLocaleTimeString () + " " + httpRequest.method + " " + host + ":" + port + " " + lowerpath + " " + referrer + " " + client);
				logInfo.client = client;
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
						pathParse (domainfolder, parsedUrl.pathname, function (err, f) {
							if (f === undefined) {
								f = domainfolder + parsedUrl.pathname;
								}
							if (checkPathForIllegalChars (f)) {
								utils.sureFilePath (domainsPath, function () { //make sure domains folder exists
									getConfigFile (actualhost, function (config) { //get config.json, if it exists -- 1/18/15 by DW
										if (config != undefined) {
											if (config.jsSiteRedirect != undefined) { //7/7/15 by DW
												try {
													var urlRedirect = eval (config.jsSiteRedirect.toString ());
													returnRedirect (urlRedirect.toString (), false); //9/30/17 by DW
													}
												catch (err) {
													httpRespond (500, "text/plain", "Error running " + config.jsSiteRedirect + ": \"" + err.message + "\"");
													}
												return; 
												}
											if (config.urlSiteRedirect != undefined) {
												var urlRedirect = config.urlSiteRedirect + parsedUrl.pathname;
												returnRedirect (urlRedirect.toString (), false); //9/30/17 by DW
												return; 
												}
											if (config.urlSiteContents != undefined) { //4/26/15 by DW -- v0.55
												delegateRequest (config.urlSiteContents + httpRequest.url);
												return; 
												}
											if (config.fargoS3Path != undefined) { //5/11/15 PM by DW v0.58
												var firstPartOfHost = utils.stringNthField (host, ".", 1); //if it's dave.smallpict.com, this value is "dave"
												var s3url = "http:/" + config.fargoS3Path + firstPartOfHost + parsedUrl.pathname; //xxx
												request (s3url, function (error, response, body) {
													if (error) {
														httpRespond (500, "text/plain", "Error accessing S3 data: " + error.message);
														}
													else {
														httpRespond (response.statusCode, response.headers ["content-type"], body);
														}
													});
												return;
												}
											if (config.s3Path != undefined) { //9/26/17 by DW
												var s3url = "http:/" + config.s3Path + parsedUrl.pathname; 
												request (s3url, function (error, response, body) {
													if (error) {
														httpRespond (500, "text/plain", "Error accessing S3 data: " + error.message);
														}
													else {
														if (response.statusCode == 200) {
															processResponse (parsedUrl.pathname, body, config, function (code, type, text) {
																httpRespond (code, type, text);
																});
															}
														else {
															httpRespond (response.statusCode, response.headers ["content-type"], body);
															}
														}
													});
												return;
												}
											if (config.localPath != undefined) { //9/26/17 by DW
												var localFile = config.localPath + parsedUrl.pathname;
												console.log ("localFile == " + localFile);
												serveFile (localFile, config);
												return;
												}
											}
										fs.stat (f, function (err, stats) {
											if (err) {
												switch (lowerpath) {
													case "/version":
														httpRespond (200, "text/plain", myVersion);
														break;
													case "/now": 
														httpRespond (200, "text/plain", now.toString ());
														break;
													case "/status": 
														var status = {
															prefs: pageparkPrefs,
															status: pageparkStats
															}
														httpRespond (200, "text/plain", utils.jsonStringify (status));
														break;
													default:
														if (!serveRedirect (lowerpath, config)) { //12/8/15 by DW -- it wasn't a redirect
															return404 (); 
															}
														break;
													}
												}
											else {
												if (!serveRedirect (lowerpath, config)) { //7/30/15 by DW -- it wasn't a redirect
													if (stats.isDirectory ()) {
														if (!utils.endsWith (f, "/")) {
															returnRedirect (httpRequest.url + "/", false); //7/5/17 by DW
															}
														else {
															findSpecificFile (f, pageparkPrefs.indexFilename, function (findex) {
																serveFile (findex, config);
																});
															}
														}
													else {
														serveFile (f, config);
														}
													}
												}
											});
										});
									});
								}
							else {
								httpRespond (400, "text/plain", "The file name contains illegal characters.");
								}
							});
						});
					}
				});
		}
	catch (err) {
		httpRespond (500, "text/plain", err.message);
		}
	}
function writeStats (fname, stats, callback) {
	var f = getFullFilePath (fname);
	utils.sureFilePath (f, function () {
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
	utils.sureFilePath (f, function () {
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
						var storedStats;
						try {
							storedStats = JSON.parse (data.toString ());
							for (var x in storedStats) {
								stats [x] = storedStats [x];
								}
							writeStats (fname, stats, function () {
								if (callback != undefined) {
									callback ();
									}
								});
							}
						catch (err) {
							console.log ("readStats: error parsing file " + f + " == " + err.message)
							}
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
function getTopLevelPrefs (callback) { //6/7/17 by DW -- first look for config.json, then prefs/prefs.json
	const newFnameConfig = "config.json", oldFnameConfig = "prefs/prefs.json";
	fs.exists (newFnameConfig, function (flExists) {
		function readFrom (fname) {
			readStats (fname, pageparkPrefs, callback);
			}
		if (flExists) {
			readFrom (newFnameConfig);
			}
		else {
			fs.exists (oldFnameConfig, function (flExists) {
				if (flExists) {
					readFrom (oldFnameConfig);
					}
				else {
					readFrom (newFnameConfig);
					}
				});
			}
		});
	}
function startup () {
	getTopLevelPrefs (function () {
		console.log ("\n" + myProductName + " v" + myVersion + " running on port " + pageparkPrefs.myPort + ".\n"); 
		console.log ("startup: pageparkPrefs == " + utils.jsonStringify (pageparkPrefs));
		readStats (fnameStats, pageparkStats, function () {
			utils.sureFilePath (getFullFilePath (domainsPath) + "x", function () { //make sure domains folder exists
				var now = new Date ();
				pageparkStats.ctStarts++;
				pageparkStats.whenLastStart = now;
				pageparkStats.ctHitsSinceStart = 0; //9/30/17 by DW
				flStatsDirty = true;
				http.createServer (handleHttpRequest).listen (pageparkPrefs.myPort);
				webSocketStartup (); //9/29/17 by DW
				setInterval (everySecond, 1000); 
				});
			});
		});
	}
startup ();
