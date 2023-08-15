var myProductName = "PagePark", myVersion = "0.8.28"; 

/*  The MIT License (MIT)
	Copyright (c) 2014-2021 Dave Winer
	
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

const fs = require ("fs");
const request = require ("request");
const urlpack = require ("url");
const http = require ("http");
const marked = require ("marked");
const dns = require ("dns");
const utils = require ("daveutils"); //6/7/17 by DW
const opmlToJs = require ("opmltojs"); //6/16/17 by DW
const websocket = require ("nodejs-websocket"); //9/29/17 by DW
const s3 = require ("daves3"); //6/4/18 by DW
const githubpub = require ("githubpub"); //12/3/19 by DW
const freeDiskSpace = require ("davediskspace"); //12/20/19 by DW
const requireFromString = require ("require-from-string"); //5/9/20 by DW
const thePackage = require ("pagepark"); //5/6/20 by DW

var pageparkPrefs = {
	myPort: 1339, //1/8/15 by DW -- was 80, see note in readme.md
	flWebsocketEnabled: false, websocketPort: 1340, //9/29/17 by DW
	indexFilename: "index",
	flProcessScriptFiles: false, extScriptFiles: "js", //12/4/19 by DW -- breaking change
	flProcessMarkdownFiles: true, extMarkdownFiles: "md", //5/5/15 by DW
	flProcessOpmlFiles: true, extOpmlFiles: "opml", //6/23/15 by DW
	error404File: "prefs/error.html", //7/16/15 by DW
	legalPathChars: "", //7/19/15 by DW,
	flCacheTemplatesLocally: false, //12/21/19 by DW -- switched the default from true
	urlDefaultMarkdownTemplate: "http://scripting.com/code/pagepark/templates/markdown/template.txt", 
	urlDefaultOpmlTemplate: "http://scripting.com/code/pagepark/templates/opml/template.txt",
	urlDefaultErrorPage: "http://scripting.com/code/pagepark/prefs/error.html", 
	flUnicasePaths: false, //11/7/17 by DW
	defaultType: "text/html", //7/21/18 by DW
	flHiddenFilesCheck: true, //12/9/19 by DW -- check if file or folder name begins with _
	ctGithubCacheSecs: 3600, //12/13/19 by DW -- one hour
	flRunChronologicalScripts: false, //5/13/20 by DW
	flRunPersistentScripts: false, //5/13/20 by DW
	flCliPortEnabled: false, cliPort: 1349, //5/27/20 by DW
	defaultDomanFolderName: "default", //7/5/21 by DW
	defaultExtension: "", //7/25/21 by DW
	flServeConfigJson: false //7/28/21 by DW
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
var filterFname = "/filter.js";
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
function getMarkdownTitle (mdtext) { //12/31/19 by DW
	var linenum = 1;
	for (var i = 1; i <= 5; i++) {
		var s = utils.trimWhitespace (utils.stringNthField (mdtext, "\n", i));
		if (utils.beginsWith (s, "# ")) {
			return (utils.stringDelete (s, 1, 2));
			}
		}
	return (undefined);
	}
function handleHttpRequest (httpRequest, httpResponse) {
	var config; 
	var now = new Date ();
	var logInfo = { //2/17/18 by DW
		when: now
		};
	
	function getDiskSpace (callback) { //12/20/19 by DW
		var stats = new Object (); 
		freeDiskSpace.get (stats, function () {
			stats.productName = myProductName;
			stats.version = myVersion;
			callback (undefined, stats);
			});
		}
	function getOpmlTemplate (callback) { //6/23/15 by DW
		if (config.urlOpmlTemplate !== undefined) { //8/17/21 by DW
			getTemplate (undefined, config.urlOpmlTemplate, callback);
			}
		else {
			if (config.opmlTemplatePath !== undefined) {
				fs.readFile (config.opmlTemplatePath, function (err, data) {
					if (err) {
						getTemplate (opmlTemplatePath, config.urlDefaultOpmlTemplate, callback);
						}
					else {
						callback (data.toString ());
						}
					});
				}
			else {
				getTemplate (opmlTemplatePath, pageparkPrefs.urlDefaultOpmlTemplate, callback);
				}
			}
		}
	function getMarkdownTemplate (callback) {
		if (config.urlMarkdownTemplate !== undefined) { //8/17/21 by DW
			getTemplate (undefined, config.urlMarkdownTemplate, callback);
			}
		else {
			if (config.mdTemplatePath !== undefined) {
				fs.readFile (config.mdTemplatePath, function (err, data) {
					if (err) {
						getTemplate (mdTemplatePath, config.urlDefaultMarkdownTemplate, callback);
						}
					else {
						callback (data.toString ());
						}
					});
				}
			else {
				getTemplate (mdTemplatePath, config.urlDefaultMarkdownTemplate, callback);
				}
			}
		}
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
			function useDefaultFolder () {
				var name = pageparkPrefs.defaultDomanFolderName;
				callback (folder + name, name);
				}
			if (flExists) {
				callback (domainfolder, host);
				}
			else {
				if (utils.stringCountFields (host, ".") == 3) {
					var firstpart = utils.stringNthField (host, ".", 1);
					var wildcardhost = "*" + utils.stringDelete (host, 1, firstpart.length);
					domainfolder = folder + wildcardhost;
					fs.exists (domainfolder, function (flExists) { //7/5/21 by DW
						if (flExists) {
							callback (domainfolder, wildcardhost);
							}
						else {
							useDefaultFolder ();
							}
						});
					}
				else {
					useDefaultFolder ();
					}
				}
			});
		}
	function getConfigFile (host, callback) { 
		var config = {
			urlSiteRedirect: undefined,
			urlSiteContents: undefined,
			fargoS3Path: undefined,
			s3Path: undefined,
			s3ServeFromPath: undefined,
			githubServeFrom: undefined,
			localPath: undefined
			};
		for (var x in pageparkPrefs) { //12/10/19 by DW
			config [x] = pageparkPrefs [x];
			}
		var f = getFullFilePath (domainsPath) + host + configFname;
		fs.readFile (f, function (err, data) {
			if (err) {
				callback (config);
				}
			else {
				try {
					var jstruct = JSON.parse (data.toString ());
					for (var x in jstruct) {
						config [x] = jstruct [x];
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
	function runFilterScript (host, callback) { //3/23/20 by DW
		var f = getFullFilePath (domainsPath) + host + filterFname;
		fs.readFile (f, function (err, data) {
			if (err) {
				callback (false); //file doesn't exist -- we didn't run the filter script
				}
			else {
				const options = {
					httpRequest,
					httpResponse, //6/21/21 by DW
					serveLocalFile: function (f) {
						console.log ("serveLocalFile (" + f + ")");
						serveFile (f, config);
						}
					};
				try {
					thePackage.runJavaScriptCode (f, options, callback);
					}
				catch (err) {
					httpRespond (500, "text/plain", err.message);
					}
				callback (true); //we handled it
				}
			});
		}
	function httpRespond (code, type, val, headers) {
		if (headers === undefined) {
			headers = new Object ();
			}
		if (type === undefined) { //7/20/18 by DW
			type = "text/plain";
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
		getTemplate (config.error404File, config.urlDefaultErrorPage, function (htmtext) {
			httpRespond (404, "text/html", htmtext);
			});
		}
	function returnRedirect (urlRedirectTo, flPermanent) { //7/30/15 by DW
		var code = (flPermanent) ? 301 : 302;
		httpRespond (code, "text/plain", "Redirect to " + urlRedirectTo + ".", {"Location": urlRedirectTo})
		}
	function isSpecificFile (fname, specificFname) {
		if (utils.stringCountFields (fname, ".") == 2) { //something like xxx.yyy
			if (utils.stringNthField (fname, ".", 1).toLowerCase () == specificFname) { //something like index.wtf
				return (true);
				}
			}
		return (false);
		}
	function findSpecificFile (folder, specificFname, callback) {
		specificFname = specificFname.toLowerCase (); //7/16/15 by DW
		fs.readdir (folder, function (err, list) {
			for (var i = 0; i < list.length; i++) {
				var fname = list [i];
				if (isSpecificFile (fname, specificFname)) {
					callback (folder + fname);
					return;
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
		function getFileExtension (path) { //7/25/21 by DW
			var fname = utils.stringLastField (path, "/");
			var ext = utils.stringLastField (fname, ".");
			if (ext == fname) { //has no extension
				ext = config.defaultExtension;
				if (utils.beginsWith (ext, ".")) {
					ext = utils.stringDelete (ext, 1, 1);
					}
				}
			return (ext.toLowerCase ());
			}
		function getReturnType (path) { //7/6/18 by DW
			var fname = utils.stringLastField (path, "/");
			var ext = utils.stringLastField (fname, ".");
			if (ext == fname) { //has no extension
				return (config.defaultType);
				}
			else {
				return (utils.httpExt2MIME (ext));
				}
			}
		function httpReturn (val, type) { //2/17/15 by DW
			callback (200, type, val.toString ());
			}
		function defaultReturn (type, data) { 
			callback (200, type, data);
			}
		function checkForRedirect () { //6/6/18 by DW
			if (ext != "json") {
				var jsontext = data.toString ();
				if (jsontext.length > 0) {
					if (jsontext [0] == "{") {
						try {
							var jstruct = JSON.parse (jsontext);
							var pstruct = jstruct ["#pagePark"];
							if (pstruct !== undefined) {
								if (pstruct.urlRedirect !== undefined) {
									returnRedirect (pstruct.urlRedirect);
									return (false); //we got it, don't continue processing the file
									}
								}
							}
						catch (err) {
							}
						}
					}
				}
			return (true); //it wasn't a redirect, continue processing
			}
		var ext = getFileExtension (path);
		var type = getReturnType (path); //12/4/19 by DW -- it was passing ext which was not what the routine calls for
		if (checkForRedirect ()) { //it wasn't a redirect file
			switch (ext) {
				case config.extScriptFiles:
					if (config.flProcessScriptFiles) {
						console.log ("processResponse: path == " + path); //8/25/19 by DW
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
					if (config.flProcessMarkdownFiles) {
						getMarkdownTemplate (function (theTemplate) {
							var mdtext = data.toString (), pagetable = new Object ();
							pagetable.title = getMarkdownTitle (mdtext); //12/31/19 by DW
							if (pagetable.title === undefined) {
								pagetable.title = utils.stringLastField (path, "/");
								}
							pagetable.bodytext = marked (mdtext);
							pagetable.config = (config.pageParams === undefined) ? new Object () : utils.jsonStringify (config.pageParams); //12/12/19 by DW
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
					if (config.flProcessOpmlFiles && flReturnHtml) { //6/24/15 by DW
						try { //4/18/20 by DW -- XML errors should not crash the server
							getOpmlTemplate (function (theTemplate) {
								var opmltext = data.toString (), pagetable = new Object ();
								opmlToJs.parseWithError (opmltext, function (err, theOutline) {
									if (err) {
										callback (500, "text/plain", "There was an error processing the OPML file."); 
										}
									else {
										if (config.urlGlossary !== undefined) { //8/25/21 by DW
											if (theOutline.opml.head.urlGlossary === undefined) {
												theOutline.opml.head.urlGlossary = config.urlGlossary;
												}
											}
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
										}
									});
								});
							}
						catch (err) {
							callback (500, "text/plain", err.message); 
							}
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
	function serveFromS3 (config, parsedUrl) { //serve using S3's HTTP server
		var s3url = "http:/" + config.s3Path + parsedUrl.pathname; 
		console.log ("\nServing from S3 == " + s3url + "\n");
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
		}
	function serveFromS3WithPagePark (config, parsedUrl) { //serve with PagePark as the HTTP server -- 6/4/18 by DW
		var s3path = config.s3ServeFromPath + parsedUrl.pathname;
		function serveS3Object (s3path) {
			s3.getObject (s3path, function (err, data) {
				if (err) {
					s3.folderExists (s3path, function (flExists) {
						if (flExists) {
							returnRedirect (httpRequest.url + "/"); 
							}
						else {
							return404 ();
							}
						});
					}
				else {
					processResponse (s3path, data.Body, config, function (code, type, text) {
						httpRespond (code, type, text);
						});
					}
				});
			}
		if (utils.endsWith (s3path, "/")) {
			var flfound = false;
			var splitpath = s3.splitPath (s3path);
			var lookForPrefix = splitpath.Key;
			s3.listObjects (s3path, function (obj) {
				if (!flfound) {
					if (obj.flLastObject === undefined) {
						if (utils.beginsWith (obj.Key, lookForPrefix, false)) {
							var fname = utils.stringDelete (obj.Key, 1, lookForPrefix.length);
							if (isSpecificFile (fname, config.indexFilename)) {
								serveS3Object (splitpath.Bucket + "/" + obj.Key);
								flfound = true;
								}
							}
						}
					else {
						return404 ();
						}
					}
				});
			}
		else {
			serveS3Object (s3path);
			}
		}
	function serveMirrorWithPagePark (urlToServeFrom, config, parsedUrl) { //6/22/21 by DW
		var theRequest = {
			url: urlToServeFrom, 
			encoding: null,
			headers: {
				"User-Agent": myProductName + " v" + myVersion
				}
			};
		request (theRequest, function (err, response, body) {
			if (err) {
				return404 ();
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
		}
	function serveFromGithubRepo (config, parsedUrl) { //12/3/19 by DW
		var path = config.githubServeFrom.path + parsedUrl.pathname;
		function returnIndex (theArray) {
			var htmltext = "", indentlevel = 0;
			function add (s) {
				htmltext +=  utils.filledString ("\t", indentlevel) + s + "\n";
				}
			add ("<ul class=\"ulFileList\">"); indentlevel++;
			theArray.forEach (function (item) {
				add ("<li><a href=\"" + item.path + "\">" + item.name + "</a></li>");
				});
			add ("</ul>"); indentlevel--;
			processResponse ("index.md", htmltext, config, function (code, type, text) {
				httpRespond (code, type, text);
				});
			}
		var options = { 
			flCanUseCache: !utils.getBoolean (parsedUrl.query.nocache)
			}
		console.log ("serveFromGithubRepo: options.flCanUseCache == " + options.flCanUseCache + ", path == " + path);
		githubpub.getFromGitHub (config.githubServeFrom.username, config.githubServeFrom.repository, path, options, function (err, jstruct) {
			if (err) {
				return404 ();
				}
			else {
				if (jstruct.content !== undefined) {
					var content = jstruct.content;
					if (jstruct.encoding == "base64") {
						content = Buffer.from (content, "base64"); 
						}
					processResponse (path, content, config, function (code, type, text) {
						httpRespond (code, type, text);
						});
					}
				else { //assume it's an array of file descriptors
					var flfound = false;
					jstruct.forEach (function (item) {
						if (!flfound) {
							var beginswith = config.indexFilename + ".";
							var thisname = item.name;
							if (config.flUnicasePaths) {
								thisname = utils.stringLower (thisname);
								beginswith = utils.stringLower (beginswith);
								}
							if (utils.beginsWith (thisname, beginswith)) {
								parsedUrl.pathname = utils.stringDelete (item.path, 1, config.githubServeFrom.path.length);
								serveFromGithubRepo (config, parsedUrl);
								flfound = true;
								}
							}
						});
					if (!flfound) {
						returnIndex (jstruct);
						}
					}
				}
			});
		}
	function serveRedirect (lowerpath, config, parsedUrl) { //7/30/15 by DW -- return true if we handled the request
		if (config.redirects !== undefined) {
			for (var x in config.redirects) {
				if (x.toLowerCase () == lowerpath) {
					var urlRedirectTo = config.redirects [x];
					returnRedirect (urlRedirectTo);
					return (true);
					}
				}
			}
		if (config.mirrors !== undefined) { //4/10/20 by DW
			for (var x in config.mirrors) {
				if (x.toLowerCase () == lowerpath) {
					serveMirrorWithPagePark (config.mirrors [x], config, parsedUrl)
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
		var port = thePackage.findAppWithDomain (domain);
		callback (port); //if undefined, it's one of our domains, handle it here
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
	function gatherAttributes (domainfolder, path, callback) { //12/31/19 by DW
		var nomad = domainfolder, steps, atts = new Object ();
		if (utils.beginsWith (path, "/")) {
			path = utils.stringDelete (path, 1, 1);
			}
		steps = path.split ("/");
		if (steps [steps.length - 1].length == 0) {
			steps.pop ();
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
							if (utils.beginsWith (fname, "#")) { //it's an attribute
								var relpath = utils.stringDelete (nomad, 1, domainfolder.length);
								var attname = utils.stringLower (utils.stringDelete (fname, 1, 1));
								atts [attname] = domainfolder + relpath + fname;
								}
							if (fname == lowerstep) {
								nomad += list [i];
								doStep (ix + 1);
								flfound = true;
								break;
								}
							}
						if (!flfound) {
							var err = {
								message: "Not found."
								};
							callback (err);
							}
						}
					});
				}
			else {
				callback (undefined, atts);
				}
			}
		doStep (0);
		}
	function validatePath (path) { //12/9/19 by DW
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
		function checkPathForHiddenFiles (path) { //12/9/19 by DW
			if (pageparkPrefs.flHiddenFilesCheck) {
				var splits = path.split ("/"), flhidden = false;
				splits.forEach (function (item) {
					if (utils.beginsWith (item, "_")) {
						flhidden = true;
						console.log ("checkPathForHiddenFiles: " + path + " is hidden.");
						}
					});
				}
			return (!flhidden);
			}
		if (checkPathForIllegalChars (path)) {
			return (checkPathForHiddenFiles (path));
			}
		else {
			return (false);
			}
		}
	function configJsonCheck (f, config) { //7/28/21 by DW
		if (config.flServeConfigJson) { //ok to serve it
			return (true);
			}
		else {
			var fname = utils.stringLower (utils.stringLastField (f, "/"));
			var fnameConfig = utils.stringLower (utils.stringDelete (configFname, 1, 1)); //pop off leading slash
			return (fname != fnameConfig);
			}
		}
	
	function isDomainValid (theDomain) { //11/12/21 by DW
		var requestHost = utils.stringNthField (httpRequest.headers.host, ":", 1);
		if (requestHost == "localhost") { //only accept requests from local apps
			if (theDomain === undefined) { //domain param not supplied
				httpRespond (404, "text/plain", "Not found");
				}
			else {
				getDomainFolder (theDomain, function (folder, host) {
					if (host === pageparkPrefs.defaultDomanFolderName) { 
						httpRespond (404, "text/plain", "Not found");
						}
					else {
						httpRespond (200, "text/plain", host); //yes, it's a domain we serve
						}
					});
				}
			}
		else {
			httpRespond (403, "text/plain", "Forbidden");
			}
		}
	
	try {
		var parsedUrl = urlpack.parse (httpRequest.url, true), host, lowerhost, port, referrer;
		var lowerpath = parsedUrl.pathname.toLowerCase ();
		var remoteAddress = httpRequest.connection.remoteAddress;
		//set host, port
			host = httpRequest.headers.host;
			if (host === undefined) { //8/15/23 by DW
				host = "";
				}
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
						pathParse (domainfolder, parsedUrl.pathname, function (err, f) { //handles unicase paths via folder diving
							if (f === undefined) {
								f = domainfolder + parsedUrl.pathname;
								}
							if (validatePath (f)) {
								utils.sureFilePath (domainsPath, function () { //make sure domains folder exists
									getConfigFile (actualhost, function (configForThisDomain) { //get config.json, if it exists -- 1/18/15 by DW
										config = (configForThisDomain === undefined) ? new Object () : configForThisDomain; //set a global to this request -- 12/10/19 by DW
										if (configJsonCheck (f, config)) { //7/28/21 by DW
											gatherAttributes (domainfolder, parsedUrl.pathname, function (err, atts) { //12/31/19 by DW
												if (atts !== undefined) { //1/2/20 by DW -- this is all we do with atts for now
													config.mdTemplatePath = atts ["mdtemplate.html"]; 
													config.opmlTemplatePath = atts ["opmltemplate.html"]; 
													}
												runFilterScript (actualhost, function (flRanScript) { //3/23/20 by DW
													if (!flRanScript) {
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
															serveFromS3 (config, parsedUrl);
															return;
															}
														if (config.s3ServeFromPath != undefined) { //6/4/18 by DW
															serveFromS3WithPagePark (config, parsedUrl);
															return;
															}
														if (config.githubServeFrom != undefined) { //12/3/19 by DW
															serveFromGithubRepo (config, parsedUrl);
															return;
															}
														if (config.localPath != undefined) { //9/26/17 by DW
															var localFile = config.localPath + parsedUrl.pathname;
															console.log ("localFile == " + localFile);
															serveFile (localFile, config);
															return;
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
																	case "/freediskspace": //12/20/19 by DW
																		getDiskSpace (function (err, stats) {
																			httpRespond (200, "application/json", utils.jsonStringify (stats));
																			});
																		break;
																	case "/isdomainvalid": //11/12/21 by DW
																		isDomainValid (parsedUrl.query.domain);
																		break;
																	default:
																		if (!serveRedirect (lowerpath, config, parsedUrl)) { //12/8/15 by DW -- it wasn't a redirect
																			return404 (); 
																			}
																		break;
																	}
																}
															else {
																if (!serveRedirect (lowerpath, config, parsedUrl)) { //7/30/15 by DW -- it wasn't a redirect
																	if (stats.isDirectory ()) {
																		if (!utils.endsWith (f, "/")) {
																			returnRedirect (httpRequest.url + "/", false); //7/5/17 by DW
																			}
																		else {
																			findSpecificFile (f, config.indexFilename, function (findex) {
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
														}
													});
												});
											}
										else {
											return404 (); //7/28/21 by DW -- don't serve config.json
											}
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
function handleCliRequest (httpRequest, httpResponse) { //5/27/20 by DW
	var parsedUrl = urlpack.parse (httpRequest.url, true), host, lowerhost, port, referrer;
	var lowerpath = parsedUrl.pathname.toLowerCase ();
	var remoteAddress = httpRequest.connection.remoteAddress;
	//set host, port
		host = httpRequest.headers.host;
		if (host === undefined) { //8/15/23 by DW
			host = "";
			}
		if (utils.stringContains (host, ":")) {
			port = utils.stringNthField (host, ":", 2);
			host = utils.stringNthField (host, ":", 1);
			}
		else {
			port = 80;
			}
		lowerhost = host.toLowerCase ();
	function httpRespond (code, type, val, headers) {
		if (headers === undefined) {
			headers = new Object ();
			}
		if (type === undefined) { //7/20/18 by DW
			type = "text/plain";
			}
		headers ["Content-Type"] = type;
		httpResponse.writeHead (code, headers);
		httpResponse.end (val);    
		}
	if (lowerhost != "localhost") {
		httpRespond (403, "text/plain", "Forbidden");
		}
	else {
		switch (lowerpath) {
			case "/now":
				httpRespond (200, "text/plain", new Date ().toString ());
				return;
			case "/list":
				thePackage.getAppInfo (function (err, theInfo) {
					httpRespond (200, "application/json", utils.jsonStringify (theInfo));
					});
				return;
			case "/stop":
				thePackage.stopApp (parsedUrl.query.file, function (errrorMessage, msg) {
					if (errrorMessage) {
						console.log ("stopapp error");
						httpRespond (500, "text/plain", errrorMessage);
						}
					else {
						console.log ("stopapp no error");
						httpRespond (200, "text/plain", msg);
						}
					});
				return;
			case "/restart":
				thePackage.restartApp (parsedUrl.query.file, function (errrorMessage, msg) {
					if (errrorMessage) {
						httpRespond (500, "text/plain", errrorMessage);
						}
					else {
						httpRespond (200, "text/plain", msg);
						}
					});
				return;
			case "/rescan": //7/4/20 by DW
				thePackage.startPersistentApps (function (launchList) { //returns the list of apps we tried to launch
					httpRespond (200, "application/json", utils.jsonStringify (launchList));
					});
				return;
			}
		httpRespond (404, "text/plain", "Not found");
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
function everyMinute () { //7/17/17 by DW
	var now = new Date ();
	if (now.getMinutes () == 0) { //4/18/20 by DW -- only show status message at top of the hour
		console.log ("\n" + myProductName + " v" + myVersion + ": " + now.toLocaleTimeString () + ", port == " + pageparkPrefs.myPort + ".\n");
		}
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
function startup () {
	function initGithubpub () { //12/12/19 by DW
		var gitconfig = {
			maxCacheSecs: pageparkPrefs.ctGithubCacheSecs
			};
		githubpub.init (gitconfig, false);
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
	getTopLevelPrefs (function () {
		const environment = {
			serverAppFolder: __dirname, 
			dataFolder: __dirname + "/data/",
			logsFolder: "/tmp/logs/"
			};
		console.log ("\n" + myProductName + " v" + myVersion + " running on port " + pageparkPrefs.myPort + ".\n"); 
		thePackage.start (environment, pageparkPrefs, function () { //5/6/20 by DW
			if (process.env.PORT) { //4/18/20 by DW -- this is how Glitch and Heroku tell us what port to run on
				pageparkPrefs.myPort = process.env.PORT;
				}
			console.log ("startup: __dirname == " + __dirname);
			console.log ("startup: pageparkPrefs == " + utils.jsonStringify (pageparkPrefs));
			readStats (fnameStats, pageparkStats, function () {
				utils.sureFilePath (getFullFilePath (domainsPath) + "x", function () { //make sure domains folder exists
					var now = new Date ();
					pageparkStats.ctStarts++;
					pageparkStats.whenLastStart = now;
					pageparkStats.ctHitsSinceStart = 0; //9/30/17 by DW
					flStatsDirty = true;
					initGithubpub (); //12/12/19 by DW
					http.createServer (handleHttpRequest).listen (pageparkPrefs.myPort);
					
					if (pageparkPrefs.flCliPortEnabled) { //5/27/20 by DW
						http.createServer (handleCliRequest).listen (pageparkPrefs.cliPort);
						}
					
					webSocketStartup (); //9/29/17 by DW
					setInterval (everySecond, 1000); 
					});
				});
			});
		});
	}
startup ();
