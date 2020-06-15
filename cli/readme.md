# PagePark command line tool

Run this from the command line to communicate directly with the copy of PagePark running on the same machine. It allows you to list processes, stop and restart them, and possibly other things in the future. Patterened after the command line interface of Forever, which is included in PagePark.

For more info on processes see the <a href="https://github.com/scripting/pagePark/blob/master/docs/persistentapps.md">docs</a> for persistent apps. 

### How to install the command line tool

1. cd into the cli directory

2. npm install -g

From there you can type pp at the command line to get a list of all your running processes, including those that were launched by PagePark. 

pp communicates with PagePark over HTTP. The commands only work locally.

### Commands

#### pp list

Shows you a list of running processes. 

The first value in each row is the process number, you'll use in the other commands. 

#### pp restart 3

Kills the process, which Forever will then restart. 

#### pp stop 3

Stops the process. It doesn't restart. 

#### pp log 3

Shows you the log for process 3. It scrolls, not stopping until you press Control-C.

### What's in the list?

Here's a <a href="http://scripting.com/images/2020/06/15/ppCommandLineScreenShot.png">screen shot</a> of the table displayed by pp list, and a description for each column.

domain -- the domain name mapped to that process. Any requests with that host are sent there. 

port -- when launching the app, PagePark assigns it a port through process.env.PORT. This is that port.

fname -- the name of the file containing the JS app.

logfile -- where we're keeping the stdout log file.

starts -- the number of times the app has been restarted.

runningtime -- how long it's been running since the last restart. 



