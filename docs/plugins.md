# PagePark plug-ins

A plug-in is a JavaScript module. 

### Background

I've wanted the ability to extend PagePark with JavaScript since the beginning, but didn't like the two methods I had found to do it.

1. Reading the file via fs.readFile and running it through eval. 

2. Using the [vm module](https://nodejs.org/api/vm.html). 

### A plug-in is a module

If the directory for a domain has a file named filter.js, it fully determines what to serve.

The filter must be a Node <a href="https://www.w3schools.com/nodejs/nodejs_modules.asp">module</a>, and must export a function named filter. 

When a request for that domain comes in, the filter is opened via require, and we call the filter function with two params, an options object and a callback script. Options contains various information PagePark wants to make available to filters. Right now it includes the httpRequest we received from Node and a function that serves a file. 

The callback takes one param, an object with three values: code, type and val. We return an HTTP response using those values. However you don't have to call the callback if you're able to completely handle the request. That's why serveFile is provided in options. 

I found you can't require fs in your filter, and it screwed things up pretty badly -- buffers no longer functioned properly. If necessary we can transfer those via the options object, or perhaps via import, which doesn't appear to be supported in Node yet (it's part of the Ecma module spec).

### Example

Here's an example of a simple plug-in, almost Hello World level.

https://gist.github.com/scripting/a676b0da36c13576877a91fc77a34ecb

### What I like best about it

You can iterate over changes to your plug-ins just by saving. No need to restart anything, or change some configuration file. I find it's as much fun to work on these plug-ins as it was to work on Frontier websites.

Second runner-up thing to like: You can go into the plug-ins with the debugger! That makes a world of difference. Node has no idea it's a plug-in. ;-)

