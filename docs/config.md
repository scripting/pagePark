### Programming your website

Websites evolve over time, and PagePark has features that help you adjust things so links keep working after the change. 

#### config.json

All the values described here are added to a config.json file that's stored at the top level of a domain folder. Any time a request comes in for that domain, we read the config.json file in its folder, if there is one, and the values are applied to the request.

#### urlSiteContents in config.json

This value says where the content can be found, but it does not redirect.

PagePark grabs the content and serves it without redirecting. 

It's a way for a site to act as an alias for content stored elsewhere. 

It's a good way to shorten a URL. 

Example --  doc.liveblog.co

<pre>{"urlSiteContents": "http://liveblog.co/users/dsearls"}</pre>

#### urlSiteRedirect in config.json

If config.json has a value named urlSiteRedirect, we redirect from this folder to the value specified, which should be a string constant that's interpreted as a URL.

It's a way to redirect from one location to another for a whole domain.

Example -- bloggercon.org

<pre>{"urlSiteRedirect": "http://bloggercon.scripting.com"}</pre>

#### jsSiteRedirect in config.json

If config.json in a sub-folder of the domains folder has value named jsSiteRedirect, then its value is evaluated as a JavaScript expression, and PagePark redirects to that expression. It should obviously resolve to a URL.

Example -- archive.scripting.com 

<pre>{"jsSiteRedirect": "'http://scripting.com' + parsedUrl.pathname + '.html'"}</pre>

Example --  discuss.userland.com

<pre>{"jsSiteRedirect": "'http://static.userland.com/userLandDiscussArchive/msg' + utils.padWithZeros (parsedUrl.pathname.split ('$') [1], 6) + '.html'"}</pre>

#### You can put an IP address in the name of a sub-folder of the domains folder

Any request that comes in that has that IP address in the HOST header will be  routed to that folder.

#### You can redirect individual URLs

Add a <i>redirects</i> object to config.json. The name of each object is the url that is to be redirected. The value is the url that we redirect to.

Here's the <a href="https://gist.github.com/scripting/491c2d676dd7ad6e41f47a116d6b5016">config.json file</a> that's at the top level of the xmlrpc.scripting.com folder on my server.

In the old CMS, files didn't have extensions, but in the new environment, they must have them. So this redirects table just maps the old URLs onto the new ones.

#### flProcessScriptFiles

If you set this value false, none of the JavaScript files in the domain folder will be processed. They will be served as text, with the source code in the file. 

This can be useful if you want to serve script code to be used in browser-based apps. 

Example: 

<pre>{"flProcessScriptFiles": false} </pre>

#### Case-sensitive paths

If the filesystem on the server is case sensitive, as Ubuntu is, and you're porting a site from another system where file names are not case-sensitive, you will need to set `flUnicasePaths` to true. By default it's false. 

This option was added in <a href="https://github.com/scripting/pagePark/blob/master/README.md#v079-11817-by-dw">v0.7.9</a>.

