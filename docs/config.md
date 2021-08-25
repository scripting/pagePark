# Configuring your website

Websites evolve over time, and PagePark has features that help you adjust things so links keep working after the change. 

### config.json

All the values described here are added to a config.json file that's stored at the top level of a domain folder. Any time a request comes in for that domain, we read the config.json file in its folder, if there is one, and the values are applied to the request.

### urlSiteContents in config.json

This value says where the content can be found, but it does not redirect.

PagePark grabs the content and serves it without redirecting. 

It's a way for a site to act as an alias for content stored elsewhere. 

It's a good way to shorten a URL. 

Example --  doc.liveblog.co

<pre>{"urlSiteContents": "http://liveblog.co/users/dsearls"}</pre>

### urlSiteRedirect in config.json

If config.json has a value named urlSiteRedirect, we redirect from this folder to the value specified, which should be a string constant that's interpreted as a URL.

It's a way to redirect from one location to another for a whole domain.

Example -- bloggercon.org

<pre>{"urlSiteRedirect": "http://bloggercon.scripting.com"}</pre>

### jsSiteRedirect in config.json

If config.json in a sub-folder of the domains folder has value named jsSiteRedirect, then its value is evaluated as a JavaScript expression, and PagePark redirects to that expression. It should obviously resolve to a URL.

Example --  discuss.userland.com

<pre>{"jsSiteRedirect": "'http://static.userland.com/userLandDiscussArchive/msg' + utils.padWithZeros (parsedUrl.pathname.split ('&#x24;') [1], 6) + '.html'"}</pre>

Example -- archive.scripting.com 

<pre>{"jsSiteRedirect": "'http://scripting.com' + parsedUrl.pathname + '.html'"}</pre>

### You can put an IP address in the name of a sub-folder of the domains folder

Any request that comes in that has that IP address in the HOST header will be  routed to that folder.

### You can redirect individual URLs

Add a <i>redirects</i> object to config.json. The name of each object is the url that is to be redirected. The value is the url that we redirect to.

Here's the <a href="https://gist.github.com/scripting/491c2d676dd7ad6e41f47a116d6b5016">config.json file</a> that's at the top level of the xmlrpc.scripting.com folder on my server.

In the old CMS, files didn't have extensions, but in the new environment, they must have them. So this redirects table just maps the old URLs onto the new ones.

### Mirrors works like redirects

<i>New feature 4/11/20.</i>

Mirrors work much like redirects. If there's an object in a domain's config.json file called mirrors, each property's name is a path, and its value is a URL. when a request resolves to the path, we serve the content from the page pointed to by the URL. 

Here's an example of a <a href="https://gist.github.com/scripting/bc94224619c9bbe6c608aec1a41222a1">config.json</a> file that serves the home page of a site with an image from another site. 

Updated 6/22/21, we now <a href="https://github.com/scripting/pagePark#v0818-62221-by-dw">render</a> the files from the source site. 

### defaultExtension

<i>New feature 7/25/21.</i>

Setting a defaultExtension for a domain makes it possible to serve files without extensions as rendered markdown or outline files. 

For example if you set config.defaultExtension to "md" any file without an extension will be rendered through a markdown interpreter. Here's a <a href="https://gist.github.com/scripting/3bf72d4a7dc967ce8a682fe2e7ce07e7">config.json</a> file that illustrates.

If you set defaultExtension to "opml", any file without an extension will be rendered as an outline. 

This is especially useful for mirrors (above) if you're serving the index file from another location. "/" doesn't have an extension, but you can say how to serve the file using this value. 

Here's a <a href="https://gist.github.com/scripting/486758f8edd58ee7af34eca50394b114">config.json</a> file that serves an <a href="http://hosting.opml.org/dave/spec/states.opml">example outline</a> in a readable way, through mirrors. I set up a <a href="http://defaultextensiondemo.userland.com/">domain</a> to test this feature. 

This feature is implemented in a general way so the defaultExtension value should work in other situations where files don't have extension, not just mirrors.

Here are <a href="https://github.com/scripting/pagePark/issues/21#issuecomment-886229200">notes</a> from the development work.

### flProcessScriptFiles

If you set this value false, none of the JavaScript files in the domain folder will be processed. They will be served as text, with the source code in the file. 

This can be useful if you want to serve script code to be used in browser-based apps. 

Example: 

<pre>{"flProcessScriptFiles": false} </pre>

Note: As of 12/4/2019, this setting defaults false. 

### Case-sensitive paths

If the filesystem on the server is case sensitive, as Ubuntu is, and you're porting a site from another system where file names are not case-sensitive, you will need to set `flUnicasePaths` to true. By default it's false. 

This option was added in <a href="https://github.com/scripting/pagePark/blob/master/README.md#v079-11817-by-dw">v0.7.9</a>.

### Serving content from S3

These config settings have evolved over a long time, so their names might not be the most intuitive.

1. config.fargoS3Path -- Fargo is no longer shipping. When it was, it could be used to maintain a blog. Users could reserve names for their blog, for example, dave.smallpict.com. This value says where on S3 the folder of Fargo-generated pages are.  

2. config.s3Path -- References to files in this folder are accessed using Amazon's HTTP server. 

3. config.s3ServeFromPath -- References to files in this folder are accessed through PagePark, following its conventions and processing features. An <a href="https://gist.github.com/scripting/1ef07a199c93f1d8cf60c89f034f18f7">example</a> of a config.json file with s3ServeFromPath specified. 

### Serving content from GitHub

You can use PagePark to serve content from GitHub using a <i>githubServeFrom</i> object. It has three properties, username, repository and path. Taken together, they define a location on GitHub. 

Here's an exampe of a <a href="https://gist.github.com/scripting/07a38e3e00e8581585dad6b057d504a8">config.json</a> set up to serve from the top level of the pagePark repository.

### Redirect from the file that's being redirected

One thing I've wanted since using MacHTTP in the early days of the web is the ability to alter the content of a file to tell the server where to redirect. No messing with config files, setting up rules, just change the content of the file and you're done. 

To do so in PagePark, create a JSON file in place of the file, with exactly the same name, that tells PagePark where to redirect. 

Here are the rules governing the content of that file, and they are strict. 

1. The file's extension is <i>not</i> .json.

1. The first character in the file is a left curly brace, or {.

1. It is legal JSON, i.e. it is correctly interpreted by JSON.parse. 

1. It has a top level object named #pagePark.

1. Inside #pagePark is a property named urlRedirect. Its value is the URL PagePark redirects to.

Here's an <a href="https://gist.github.com/scripting/b580c6d5eaa13da108364ccc9b713454">example</a> of such a file.

And a file <a href="http://lucky.wtf/redirect.html">on lucky.wtf</a> that redirects to a fun video.

### Setting the default content type for a domain

In config.json at the top level of the folder containing the domain's content, add a defaultType element, and set it to the type that's returned for files that don't have an extension, or don't have one of the recognized extensions. 

Here's an <a href="https://gist.github.com/scripting/102c34a6ed3143c037eea1ac5c5473f3">example</a> of a config.json file that sets the default type to "text/html".

### Serving config.json

config.flServeConfigJson determines whether we serve the config.json file from each domains sub-folder that has one. 

if flServeConfigJson is false, we will return "404 not found" for config.json files in domains sub-folders. If it's true, we'll serve it just like any other file.

It defaults false. 

This was an oversight, imho we should not have been serving config.json files. We closed the door in July 2021, but in case people have an application for it, it's possible to open door for a single domain or globally using config.flServeConfigJson.

An example <a href="https://gist.github.com/scripting/80bf3e84a5e68ee3cafd3aff979d361c">config.json</a> for this feature.

### Templates for individual websites. 

<i>New feature 8/20/21.</i>

PagePark has default templates for OPML and Markdown files that apply to all sites on a server. 

What if you want to do a custom template that applies only to one site?

Two config options, config.urlOpmlTemplate and config.urlMarkdownTemplate, let you specify a different template on a per-domain basis. 

Example -- a customized template for outlines in <a href="http://opml.org/">opml.org</a>. 

<pre>"urlOpmlTemplate": "http://opml.org/templates/opml/template.txt"<</pre>

### urlGlossary for individual websites

<i>New feature 8/25/21.</i>

Since PagePark specializes in serving outlines, and outlines for a specific site might define their own vocabularies, it made sense for a domain to "broadcast" a glossary to all the outlines served from that site. To do that, PagePark now supports a urlGlossary option for config.json.

Example -- from the config.json file for one of my sites. 

<pre>"urlGlossary": "http://drummer.scripting.com/davewiner/glossary.opml"</pre>

