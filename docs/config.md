### Programming your website

Websites evolve over time, and PagePark has features that help you adjust things so links keep working after the change. Some of the features described on this page are here to help you prevent linkrot! That's how prevalent it is.

Another thing you'll want to do is pass the content through various processors. The file extensions control that. So if a file name ends with .md, it is passed through the Markdown processor. If it's .js, it's assumed to contain JavaScript code, and that code is run, and the value it returns is what we return. You can also control whether or not the scripts run. 

#### config.json

All the values described here are added to a config.json file that's stored at the top level of a domain folder. Any time a request comes in for that domain, we read the config.json file in its folder, if there is one, and the values are applied to the request.

#### File extensions

The extension of a file determines how PagePark serves it.

<table>

<tr>

<td>

.txt

</td>

<td>

The text in the file is returned, the type is text/plain.

</td>

<td>

<a href="http://lucky.wtf/applejoke.txt">applejoke.txt</a>

</td>

</tr>

<tr>

<td>

.xml

</td>

<td>

The text in the file is returned, the type is text/xml.

</td>

<td>

<a href="http://lucky.wtf/davetwitterfeed.xml">davetwitterfeed.xml</a>

</td>

</tr>

<tr>

<td>

.json

</td>

<td>

The text in the file is returned, the type is application/json.

</td>

<td>

<a href="http://lucky.wtf/wodemo.json">wodemo.json</a>

</td>

</tr>

<tr>

<td>

.png

</td>

<td>

The contents of the file is returned with type image/png.

</td>

<td>

<a href="http://lucky.wtf/tree.png">tree.png</a>

</td>

</tr>

<tr>

<td>

.opml

</td>

<td>

The outline is rendered as an expandable outline, the type returned is text/html.

</td>

<td>

<a href="http://lucky.wtf/states.opml">states.opml</a>

</td>

</tr>

<tr>

<td>

.md

</td>

<td>

The text in the file is passed through a Markdown processor and that text is returned. The type returned is text/html.

</td>

<td>

<a href="http://lucky.wtf/test.md">test.md</a>

</td>

</tr>

<tr>

<td>

.js

</td>

<td>

We run the script, and the return value is returned to the caller, with type of text/html. Here's the <a href="https://gist.github.com/scripting/fd9e6720834958130f0a3d53b9f8dd15">source code</a> for the script in the demo below.

</td>

<td>

<a href="http://lucky.wtf/badass/butt.js">butt.js</a>

</td>

</tr>

</table>

#### flProcessScriptFiles

If you set this value false, none of the JavaScript files in the domain folder will be processed. They will be served as text, with the source code in the file. 

This can be useful if you want to serve script code to be used in browser-based apps. 

Example: 

<pre>{

   "flProcessScriptFiles": false

   }</pre>

#### The template for Markdown files

There's a special template used for rendering Markdown files. It defines the shell in which the Markdown text is included in to create the HTML file. You can position the text, or add CSS styles or script code in the template. 

The <a href="https://github.com/scripting/pagePark/blob/master/prefs/mdTemplate.txt">default template</a> is in the prefs folder. You can edit it to customize it. 

