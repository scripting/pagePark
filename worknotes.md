#### 9/20/23; 8:53:50 AM by DW

Another pagepark crash, this time on peabody, very reproducible. If you go to https://this.how/ -- it crashes. Happens in opmltojs package. I'm going to try setting up a local test and see if I can reproduce here. 

The problem was in opmltojs package, it the xml parser wasn't returning an error when it wasn't able to parse an OPML file, so I added an extra check for a null value returned, and the crash went away. 

Now it's good question why the parser couldn't handle it because it looks to be valid xml, it's the index.opml file for the this.how website. 

#### 8/15/23; 5:37:20 PM by DW

if pagepark crashes on a machine that's running caddy, all the apps launch but the ports are already in use, so the keep launching and the machine effectively goes crazy. i found the problem by leaving a console window open, logging pagepark hits, and when the machine went nuts i scrolled back until i found the source. 

lowerhost = host.toLowerCase ()

so i check first if host is undefined and set it to the empty string. 

