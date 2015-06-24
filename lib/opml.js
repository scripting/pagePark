exports.readOpmlString = readOpmlString;
exports.readOpmlFile = readOpmlFile;
exports.readOpmlUrl = readOpmlUrl;
exports.outlineVisiter = outlineVisiter;

var request = require ("request");
var stream = require ("stream"); //6/23/15 by DW
var opmlParser = require ("opmlparser"); //6/23/15 by DW


var opmlData = { 
	flUseOutlineCache: false,
	outlineCache: new Object ()
	}

function getBoolean (val) { //12/5/13 by DW
	switch (typeof (val)) {
		case "string":
			if (val.toLowerCase () == "true") {
				return (true);
				}
			break;
		case "boolean":
			return (val);
		case "number":
			if (val == 1) {
				return (true);
				}
			break;
		}
	return (false);
	}
function getNameAtt (theNode) {
	function isAlpha (ch) {
		return (((ch >= 'a') && (ch <= 'z')) || ((ch >= 'A') && (ch <= 'Z')));
		}
	function isNumeric (ch) {
		return ((ch >= '0') && (ch <= '9'));
		}
	function stripMarkup (s) { //5/24/14 by DW
		if ((s === undefined) || (s == null) || (s.length == 0)) {
			return ("");
			}
		return (s.replace (/(<([^>]+)>)/ig, ""));
		}
	function innerCaseName (text) { //8/12/14 by DW
		var s = "", ch, flNextUpper = false;
		text = stripMarkup (text); 
		for (var i = 0; i < text.length; i++) {
			ch = text [i];
			if (isAlpha (ch) || isNumeric (ch)) { 
				if (flNextUpper) {
					ch = ch.toUpperCase ();
					flNextUpper = false;
					}
				else {
					ch = ch.toLowerCase ();
					}
				s += ch;
				}
			else {
				if (ch == ' ') { 
					flNextUpper = true;
					}
				}
			}
		return (s);
		}
	var nameatt = theNode.name;
	if (nameatt === undefined) {
		nameatt = innerCaseName (theNode.text);
		}
	return (nameatt);
	}
function typeIsDoc (theNode) {
	var type = getNodeType (theNode);
	return ((type !== undefined) && (type != "include") && (type != "link") && (type != "tweet"));
	}
function getNodeType (theNode) {
	if (theNode.type == "include") {
		return (theNode.includetype); //this allows include nodes to have types
		}
	else {
		return (theNode.type);
		}
	}
function copyScalars (source, dest) { //8/31/14 by DW
	for (var x in source) { 
		var type, val = source [x];
		if (val instanceof Date) { 
			val = val.toString ();
			}
		type = typeof (val);
		if ((type != "object") && (type != undefined)) {
			dest [x] = val;
			}
		}
	}
function readInclude (theIncludeNode, callback) {
	console.log ("readInclude: url == " + theIncludeNode.url);
	readOpmlUrl (theIncludeNode.url, function (theOutline, err) {
		if (err) {
			callback (undefined);
			}
		else {
			expandIncludes (theOutline, function (expandedOutline) {
				callback (expandedOutline); 
				});
			}
		});
	}
function outlineVisiter (theOutline, inlevelcallback, outlevelcallback, nodecallback, visitcompletecallback) {
	function doLevel (head, path, levelcompletecallback) {
		function doOneSub (head, ixsub) {
			if ((head.subs !== undefined) && (ixsub < head.subs.length)) {
				var sub = head.subs [ixsub], subpath = path + getNameAtt (sub);
				if (!getBoolean (sub.iscomment)) { 
					if ((sub.type == "include") && (!typeIsDoc (sub))) {
						nodecallback (sub, subpath);
						readInclude (sub, function (theIncludedOutline) {
							if (theIncludedOutline !== undefined) {
								doLevel (theIncludedOutline, subpath + "/", function () { 
									outlevelcallback ();
									doOneSub (head, ixsub +1);
									});
								}
							});
						}
					else {
						if (typeIsDoc (sub)) {
							if (sub.type == "index") {
								subpath += "/";
								}
							nodecallback (sub, subpath);
							doOneSub (head, ixsub +1);
							}
						else {
							nodecallback (sub, subpath);
							if (sub.subs !== undefined) {
								doLevel (sub, subpath + "/", function () { 
									outlevelcallback ();
									doOneSub (head, ixsub +1);
									});
								}
							else {
								doOneSub (head, ixsub +1);
								}
							}
						}
					}
				else {
					doOneSub (head, ixsub +1);
					}
				}
			else {
				levelcompletecallback ();
				}
			}
		inlevelcallback ();
		if (head.type == "include") {
			readInclude (head, function (theIncludedOutline) {
				if (theIncludedOutline !== undefined) {
					doOneSub (theIncludedOutline, 0);
					}
				});
			}
		else {
			doOneSub (head, 0);
			}
		}
	doLevel (theOutline, "", function () {
		outlevelcallback ();
		visitcompletecallback ();
		});
	}
function expandIncludes (theOutline, callback) {
	var theNewOutline = new Object (), lastNewNode = theNewOutline, stack = new Array (), currentOutline;
	function inlevelcallback () {
		stack [stack.length] = currentOutline;
		currentOutline = lastNewNode;
		if (currentOutline.subs === undefined) {
			currentOutline.subs = new Array ();
			}
		}
	function nodecallback (theNode, path) {
		var newNode = new Object ();
		copyScalars (theNode, newNode);
		currentOutline.subs [currentOutline.subs.length] = newNode;
		lastNewNode = newNode;
		}
	function outlevelcallback () {
		currentOutline = stack [stack.length - 1];
		stack.length--; //pop the stack
		}
	outlineVisiter (theOutline, inlevelcallback, outlevelcallback, nodecallback, function () {
		callback (theNewOutline);
		});
	}
function readOpmlString (s, callback) {
	var opmlparser = new opmlParser ();
	var outlineArray = new Array ();
	var metadata = undefined;
	flparseerror = false;
	var theStream = new stream.Readable ();
	theStream._read = function noop () {}; 
	theStream.push (s);
	theStream.push (null);
	theStream.pipe (opmlparser);
	
	opmlparser.on ("error", function (error) {
		console.log ("readOpml: opml parser error == " + error.message);
		if (callback != undefined) {
			callback (undefined, error);
			}
		flparseerror = true;
		});
	opmlparser.on ("readable", function () {
		var outline;
		while (outline = this.read ()) {
			var ix = Number (outline ["#id"]);
			outlineArray [ix] = outline;
			if (metadata === undefined) {
				metadata = this.meta;
				}
			}
		});
	opmlparser.on ("end", function () {
		if (flparseerror) {
			return;
			}
		var theOutline = new Object ();
		
		//copy elements of the metadata object into the root of the outline
			function copyone (name) {
				var val = metadata [name];
				if ((val !== undefined) && (val != null)) {
					theOutline [name] = val;
					}
				}
			copyone ("title");
			copyone ("datecreated");
			copyone ("datemodified");
			copyone ("ownername");
			copyone ("owneremail");
			copyone ("description");
		
		for (var i = 0; i < outlineArray.length; i++) {
			var obj = outlineArray [i];
			if (obj != null) {
				var idparent = obj ["#parentid"], parent;
				if (idparent == 0) {
					parent = theOutline;
					}
				else {
					parent = outlineArray [idparent];
					}
				if (parent.subs === undefined) {
					parent.subs = new Array ();
					}
				parent.subs [parent.subs.length] = obj;
				delete obj ["#id"];
				delete obj ["#parentid"];
				}
			}
		expandIncludes (theOutline, function (expandedOutline) {
			if (callback != undefined) {
				callback (expandedOutline, undefined);
				}
			});
		});
	}
function readOpmlFile (f, callback) { 
	var outlineArray = new Array ();
	var fstream = fs.createReadStream (f);
	var opmlparser = new opmlParser ();
	var metadata = undefined;
	flparseerror = false;
	
	fstream.pipe (opmlparser);
	
	opmlparser.on ("error", function (error) {
		console.log ("readOpml: opml parser error == " + error.message);
		if (callback != undefined) {
			callback (undefined, error);
			}
		flparseerror = true;
		});
	opmlparser.on ("readable", function () {
		var outline;
		while (outline = this.read ()) {
			var ix = Number (outline ["#id"]);
			outlineArray [ix] = outline;
			if (metadata === undefined) {
				metadata = this.meta;
				}
			}
		});
	opmlparser.on ("end", function () {
		if (flparseerror) {
			return;
			}
		var theOutline = new Object ();
		
		//copy elements of the metadata object into the root of the outline
			function copyone (name) {
				var val = metadata [name];
				if ((val !== undefined) && (val != null)) {
					theOutline [name] = val;
					}
				}
			copyone ("title");
			copyone ("datecreated");
			copyone ("datemodified");
			copyone ("ownername");
			copyone ("owneremail");
			copyone ("description");
		
		for (var i = 0; i < outlineArray.length; i++) {
			var obj = outlineArray [i];
			if (obj != null) {
				var idparent = obj ["#parentid"], parent;
				if (idparent == 0) {
					parent = theOutline;
					}
				else {
					parent = outlineArray [idparent];
					}
				if (parent.subs === undefined) {
					parent.subs = new Array ();
					}
				parent.subs [parent.subs.length] = obj;
				delete obj ["#id"];
				delete obj ["#parentid"];
				}
			}
		
		expandIncludes (theOutline, function (expandedOutline) {
			if (callback != undefined) {
				callback (expandedOutline, undefined);
				}
			});
		
		});
	}
function readOpmlUrl (urlOutline, callback) { 
	if (opmlData.flUseOutlineCache && (opmlData.outlineCache [urlOutline] !== undefined)) {
		if (callback !== undefined) {
			callback (opmlData.outlineCache [urlOutline], undefined);
			}
		}
	else {
		var outlineArray = new Array ();
		var opmlparser = new opmlParser ();
		var metadata = undefined;
		var flparseerror = false;
		var req;
		var theRequest = {
			url: urlOutline,
			headers: {
				"Accept": "text/x-opml, */*",
				}
			};
		req = request (theRequest);
		
		req.on ("response", function (res) {
			var stream = this;
			if (res.statusCode == 200) {
				stream.pipe (opmlparser);
				}
			});
		req.on ("error", function (res) {
			console.log ("readOpml: error reading outline. urlOutline == " + urlOutline);
			if (callback != undefined) {
				callback (undefined, res);
				}
			});
		opmlparser.on ("error", function (error) {
			console.log ("readOpml: opml parser error == " + error.message);
			if (callback != undefined) {
				callback (undefined, error);
				}
			flparseerror = true;
			});
		opmlparser.on ("readable", function () {
			var outline;
			while (outline = this.read ()) {
				var ix = Number (outline ["#id"]);
				outlineArray [ix] = outline;
				if (metadata === undefined) {
					metadata = this.meta;
					}
				}
			});
		opmlparser.on ("end", function () {
			if (flparseerror) {
				return;
				}
			var theOutline = new Object ();
			
			//copy elements of the metadata object into the root of the outline
				function copyone (name) {
					var val = metadata [name];
					if ((val !== undefined) && (val != null)) {
						theOutline [name] = val;
						}
					}
				copyone ("title");
				copyone ("datecreated");
				copyone ("datemodified");
				copyone ("ownername");
				copyone ("owneremail");
				copyone ("description");
			
			for (var i = 0; i < outlineArray.length; i++) {
				var obj = outlineArray [i];
				if (obj != null) {
					var idparent = obj ["#parentid"], parent;
					if (idparent == 0) {
						parent = theOutline;
						}
					else {
						parent = outlineArray [idparent];
						}
					if (parent.subs === undefined) {
						parent.subs = new Array ();
						}
					parent.subs [parent.subs.length] = obj;
					delete obj ["#id"];
					delete obj ["#parentid"];
					}
				}
			if (opmlData.flUseOutlineCache) {
				opmlData.outlineCache [urlOutline] = theOutline;
				}
			if (callback != undefined) {
				callback (theOutline, undefined);
				}
			});
		}
	}

