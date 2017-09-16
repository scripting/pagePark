var myVersion = "0.7.6", myProductName = "PagePark"; 

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
var mime = require ("mime"); //1/8/15 by DW
var utils = require ("daveutils"); //6/7/17 by DW
var opmlToJs = require ("opmltojs"); //6/16/17 by DW

var pageparkPrefs = {
	myPort: 1339, //1/8/15 by DW -- was 80, see note in readme.md
	indexFilename: "index",
	flProcessScriptFiles: true, extScriptFiles: "js", //5/5/15 by DW
	flProcessMarkdownFiles: true, extMarkdownFiles: "md", //5/5/15 by DW
	flProcessOpmlFiles: true, extOpmlFiles: "opml", //6/23/15 by DW
	error404File: "prefs/error.html", //7/16/15 by DW
	legalPathChars: "", //7/19/15 by DW,
	flCacheTemplatesLocally: true, //6/17/17 by DW -- preserve the original behavior
	urlDefaultMarkdownTemplate: "http://fargo.io/code/pagepark/defaultmarkdowntemplate.txt", //6/17/17 by DW
	urlDefaultOpmlTemplate: "http://fargo.io/code/pagepark/templates/opml/template.txt", //6/17/17 by DW
	urlDefaultErrorPage: "http://fargo.io/code/pagepark/prefs/error.html" //6/17/17 by DW
	};
var pageparkStats = {
	ctStarts: 0, 
	whenLastStart: new Date (0),
	ctHits: 0, ctHitsToday: 0,
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


function httpExt2MIME (ext) { //12/24/14 by DW
	mime.default_type = "text/plain";
	return (mime.getType (ext));
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
	function return404 () {
		getTemplate (pageparkPrefs.error404File, pageparkPrefs.urlDefaultErrorPage, function (htmtext) {
			httpResponse.writeHead (404, {"Content-Type": "text/html"});
			httpResponse.end (htmtext); 
			});
		}
	function returnRedirect (urlRedirectTo, flPermanent) { //7/30/15 by DW
		var code = (flPermanent) ? 301 : 302;
		httpResponse.writeHead (code, {"Location": urlRedirectTo, "Content-Type": "text/plain"});
		httpResponse.end ("Redirect to " + urlRedirectTo + ".");    
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
	function serveFile (f, config) {
		var formatParam; //url ends with ?format=abc -- 6/24/15 by DW
		if (parsedUrl.query.format !== undefined) {
			formatParam = parsedUrl.query.format.toLowerCase ()
			}
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
					case config.extOpmlFiles: //6/23/15 by DW
						var flReturnHtml = (!hasAcceptHeader ("text/x-opml")) && (formatParam != "opml");
						if (pageparkPrefs.flProcessOpmlFiles && config.flProcessOpmlFiles && flReturnHtml) { //6/24/15 by DW
							getOpmlTemplate (function (theTemplate) {
								var opmltext = data.toString (), pagetable = new Object ();
								opmlToJs.parse (opmltext, function (theOutline) {
									var pagetable = {
										bodytext: utils.jsonStringify (theOutline),
										title: utils.stringLastField (f, "/"),
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
				httpResponse.writeHead (500, {"Content-Type": "text/plain"});
				httpResponse.end (err.message);    
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
							utils.sureFilePath (domainsPath, function () { //make sure domains folder exists
								getConfigFile (actualhost, function (config) { //get config.json, if it exists -- 1/18/15 by DW
									if (config != undefined) {
										if (config.jsSiteRedirect != undefined) { //7/7/15 by DW
											try {
												var urlRedirect = eval (config.jsSiteRedirect.toString ());
												httpResponse.writeHead (302, {"Location": urlRedirect.toString (), "Content-Type": "text/plain"});
												httpResponse.end ("Temporary redirect to " + urlRedirect + ".");    
												}
											catch (err) {
												httpResponse.writeHead (500, {"Content-Type": "text/plain"});
												httpResponse.end ("Error running " + config.jsSiteRedirect + ": \"" + err.message + "\"");
												}
											return; 
											}
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
							httpResponse.writeHead (500, {"Content-Type": "text/plain"});
							httpResponse.end ("The file name contains illegal characters.");    
							}
						});
					}
				});
		}
	catch (err) {
		httpResponse.writeHead (500, {"Content-Type": "text/plain"});
		httpResponse.end (err.message);    
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
				flStatsDirty = true;
				http.createServer (handleHttpRequest).listen (pageparkPrefs.myPort);
				setInterval (everySecond, 1000); 
				});
			});
		});
	}
startup ();
