#### 8/15/23; 5:37:20 PM by DW

if pagepark crashes on a machine that's running caddy, all the apps launch but the ports are already in use, so the keep launching and the machine effectively goes crazy. i found the problem by leaving a console window open, logging pagepark hits, and when the machine went nuts i scrolled back until i found the source. 

lowerhost = host.toLowerCase ()

so i check first if host is undefined and set it to the empty string. 

