var appConsts = {
	domain: stringNthField (window.location.href, "/", 3)
	};
var savedState = { //9/22/17 by DW
	expansionStates: {
		}
	};
var mySocket = undefined; //11/7/21 by DW

function collapseEverything () {
	$(".aOutlineWedgeLink i").each (function () {
		var id = $(this).attr ("id"); //something like idOutlineWedge17
		var idnum = stringDelete (id, 1, "idOutlineWedge".length);
		if (idnum != 0) {
			var idWedge = "#idOutlineWedge" + idnum;
			var idLevel = "#idOutlineLevel" + idnum;
			$(idWedge).attr ("class", "fa fa-caret-right");
			$(idWedge).css ("color", "black");
			$(idLevel).css ("display", "none");
			}
		});
	}
function saveState () { //9/22/17 by DW
	localStorage.savedState = jsonStringify (savedState);
	console.log ("saveState: localStorage.savedState == " + localStorage.savedState);
	}
function restoreExpansionState () { //9/26/17 by DW
	try {
		if (savedState.expansionStates [window.location.href] !== undefined) {
			collapseEverything ();
			applyExpansionState (savedState.expansionStates [window.location.href]);
			}
		}
	catch (err) {
		console.log ("restoreExpansionState: err.message == " + err.message);
		}
	}
function getOpmlHeadElements (xstruct) {
	var adropml = xmlGetAddress (xstruct, "opml");
	var adrhead = xmlGetAddress (adropml, "head");
	return (xmlGetSubValues (adrhead));
	}
function startDisqus (disqusGroup) {
	(function() {
		var dsq = document.createElement ('script'); dsq.type = 'text/javascript'; dsq.async = true;
		dsq.src = '//' + disqusGroup + '.disqus.com/embed.js';
		(document.getElementsByTagName('head')[0] || document.getElementsByTagName('body')[0]).appendChild(dsq);
		})();
	(function() {
		var s = document.createElement('script'); s.async = true;
		s.type = 'text/javascript';
		s.src = '//' + disqusGroup + '.disqus.com/count.js';
		(document.getElementsByTagName('HEAD')[0] || document.getElementsByTagName('BODY')[0]).appendChild(s);
		}());
	}
	
function typeToClass (type) {
	switch (type) {
		case "blogpost":
			return ("divtypeblogpost");
		case "gist":
			return ("divtypegist");
		}
	return ("divtypedefault");
	}
function readGlossary (urlOpmlFile, glossary, callback) {
	var whenstart = new Date ();
	if ((urlOpmlFile !== undefined) && (urlOpmlFile.length > 0)) {
		readHttpFileThruProxy (urlOpmlFile, undefined, function (opmltext) {
			if (opmltext != undefined) {
				var xstruct = $($.parseXML (opmltext)), ctread = 0;
				var adropml = xmlGetAddress (xstruct, "opml");
				var adrbody = xmlGetAddress (adropml, "body");
				xmlOneLevelVisit (adrbody, function (adrx) {
					if (!xmlIsComment (adrx)) {
						var name = xmlGetTextAtt (adrx);
						if (name.length > 0) {
							var subtext = xmlGetSubText (adrx, false); //8/11/16 by DW -- don't add tabs and newlines to the glossary text
							ctread++;
							glossary [name] = subtext;
							}
						}
					return (true);
					});
				console.log ("readGlossary: read " + ctread + " items in " + secondsSince (whenstart) + " secs.");
				}
			if (callback !== undefined) {
				callback ();
				}
			});
		}
	else {
		if (callback !== undefined) {
			callback ();
			}
		}
	}
function viewTypedOutline (head, theOutline, callback) {
	function ifDefinedSet (id, val) {
		if (val !== undefined) {
			$("#" + id).html (val);
			}
		}
	function dateString (theDate) {
		if (theDate === undefined) { //5/9/20 by DW
			return ("");
			}
		else {
			return (dateFormat (new Date (theDate), "dddd mmmm d, yyyy; h:MM TT Z"));
			}
		}
	ifDefinedSet ("idOutlineTitle", head.title);
	ifDefinedSet ("idOutlineDescription", head.description);
	ifDefinedSet ("idOutlineFooter", head.footer);
	ifDefinedSet ("idWhenLastUpdate", dateString (head.dateModified));
	ifDefinedSet ("idWhenCreated", dateString (head.dateCreated));
	
	var type = head.type || "blogpost";
	$("#idOutlineDisplayer").addClass (typeToClass (type));
	
	var outlineHtml = renderOutlineBrowser (theOutline, false, undefined, undefined, true);
	outlineHtml = emojiProcess (outlineHtml);
	
	function finishStart () {
		if (getBoolean (head.flDisqusComments)) {
			var disqusGroup = head.disqusGroup || "smallpict";
			startDisqus (disqusGroup);
			$("#idComments").css ("display", "block");
			}
		if (head.urlCustomCss !== undefined) {
			console.log ("Inserting custom css: " + head.urlCustomCss);
			var header = document.getElementsByTagName ("head") [0];
			var styleSheet = document.createElement ("link");
			styleSheet.rel = "stylesheet";
			styleSheet.type = "text/css";
			styleSheet.href = head.urlCustomCss;
			header.appendChild (styleSheet);
			}
		$("#idOutlineDisplayer").html (outlineHtml);
		callback ();
		}
	
	if (head.urlGlossary !== undefined) {
		var glossary = new Object ();
		readGlossary (head.urlGlossary, glossary, function () {
			outlineHtml = multipleReplaceAll (outlineHtml, glossary);
			finishStart ();
			});
		}
	else {
		finishStart ();
		}
	}

function checkWebSocket () { //11/7/21 by DW
	function wsWatchForChange (urlSocketServer, urlOpmlFile, callback) { //connect with socket server, if not already connected
		if (urlSocketServer !== undefined) {
			mySocket = new WebSocket (urlSocketServer); 
			mySocket.onopen = function (evt) {
				var msg = "watch " + urlOpmlFile;
				mySocket.send (msg);
				console.log ("wsWatchForChange: socket is open. sent msg == " + msg);
				};
			mySocket.onmessage = function (evt) {
				var s = evt.data;
				if (s !== undefined) { //no error
					const updatekey = "update\r";
					if (beginsWith (s, updatekey)) { //it's an update
						var opmltext = stringDelete (s, 1, updatekey.length);
						console.log ("wsWatchForChange: update received along with " + opmltext.length + " chars of OPML text.");
						callback (undefined, opmltext);
						}
					}
				};
			mySocket.onclose = function (evt) {
				mySocket = undefined;
				};
			mySocket.onerror = function (evt) {
				console.log ("wsWatchForChange: socket for outline " + urlOpmlFile + " received an error.");
				};
			}
		}
	if (mySocket === undefined) {
		wsWatchForChange (jstruct.opml.head.urlUpdateSocket, jstruct.opml.head.urlPublic, function (err, opmltext) {
			if (err) {
				console.log ("checkWebSocket: err.message == " + err.message);
				}
			else {
				console.log ("checkWebSocket: opmltext.length == " + opmltext.length);
				jstruct = opml.parse (opmltext);
				viewTypedOutline (jstruct.opml.head, jstruct.opml.body, function () {
					});
				}
			});
		}
	}
function everySecond () {
	checkWebSocket (); //11/7/21 by DW
	}
function setXmlIcon (urlOpml) {
	$("#idXmlIcon").html ("<a href=\"" + urlOpml + "\"><img src=\"http://scripting.com/images/xml.gif\" widt=\"36\" height=\"14\"></a>");
	}
function addPermalinks () { //6/24/21 by DW
	function addToSubs (theSubs) {
		theSubs.forEach (function (sub) {
			sub.flPermalink = true;
			if (sub.subs !== undefined) {
				addToSubs (sub.subs);
				}
			});
		}
	addToSubs (jstruct.opml.body.subs);
	}
function startup () {
	console.log ("startup");
	
	if (localStorage.savedState !== undefined) { //9/22/17 by DW
		savedState = JSON.parse (localStorage.savedState);
		}
	
	hitCounter (); 
	initGoogleAnalytics (); 
	
	addPermalinks (); //6/24/21 by DW
	
	outlineBrowserData.flTextBasedPermalinks = false;
	
	viewTypedOutline (jstruct.opml.head, jstruct.opml.body, function () {
		setXmlIcon (getAppUrl () + "?format=opml");
		outlineBrowserData.expandCollapseCallback = function (idnum) {
			if (savedState.expansionStates === undefined) {
				savedState.expansionStates = new Object ();
				}
			savedState.expansionStates [window.location.href] = getExpansionState ();
			saveState ();
			}
		
		$("#idOutlineContainer").css ("display", "block");
		
		self.setInterval (everySecond, 1000); 
		});
	}
