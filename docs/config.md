### Programming your website

Websites evolve over time, and PagePark has features that help you adjust things so links keep working after the change. Almost all the features described on this page are here to help you prevent linkrot! That's how prevalent it is.

#### config.json

All the values described here are added to a config.json file that's stored at the top level of a domain folder. Any time a request comes in for that domain, we read the config.json file in its folder, if there is one, and the values are applied to the request.

#### flProcessScriptFiles

If you set this value false, none of the JavaScript files in the domain folder will be processed. They will be served as text, with the source code in the file. 

This can be useful if you want to serve script code to be used in browser-based apps. 

Example: 

<pre>

{

"flProcessScriptFiles": false

}

</pre>

