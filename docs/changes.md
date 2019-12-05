* ### 12/4/19 by DW
   * flProcessScriptFiles defaults false. This is a breaking change. If you have pages that are implemented in JS you will have to switch this on for the site in question. 
   * Displaying pages of various types with the proper content-type header. 
      * There was a bug that I fixed, we were calling a local routine named getReturnType with the incorrect parameter. The bug was also present when serving content from S3. 
   * Display an index file for GitHub directories.
   * Added a section to the docs for config.json about serving content from GitHub. 
* ### 6/8/17 by DW
   * We look for config.json in the home directory. It contains what used to be in pref/prefs.json. All my other apps work with config.json, I wanted PagePark to be consistent. If we don't find config.json we look for prefs/prefs.json, so that there's no breakage. 
