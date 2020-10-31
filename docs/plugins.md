# PagePark plug-ins

A plug-in is a bit of JavaScript code that handles all requests for a domain. 

### Background

I've wanted the ability to extend PagePark with JavaScript since the beginning, but didn't like the two methods I had found to do it.

1. Reading the file via fs.readFile and running it through eval. 

2. Using the [vm module](https://nodejs.org/api/vm.html). 

### A plug-in is a bit of JavaScript code

If the directory for a domain has a file named filter.js, we run the script and it fully determines the response to the request. The other files in the domain directory are ignored. 

Three globals from the PagePark environment are accessible to the filter script: 

* options -- data provided from PP to the script including the HTTP request and a function that serves a local file. It's there so we can share more data from PP with the filters in the future. 

* localStorage -- PP has localStorage that works like localStorage in browser-based apps. It provides persistence across invocations of the filter script, and a way for scripts to share information with other scripts.

* system -- provides functions for interfacing with the local operating system. Currently there's one function, that runs a Unix shell command.

### Example

Here's an example of a simple plug-in, almost Hello World level.

https://gist.github.com/scripting/a2d4ab4275a787e912f02e0e28d354da

### What I like best about it

You can iterate over changes to your plug-ins just by saving. No need to restart anything, or change some configuration file. I find it's as much fun to work on these plug-ins as it was to work on Frontier websites.

Second runner-up thing to like: You can go into the plug-ins with the debugger! That makes a world of difference. Node has no idea it's a plug-in. ;-)

