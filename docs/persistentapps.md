# Persistent apps

The contents of a domains folder can now be a Node.js app. We do this by integrating the Forever app, as a <a href="https://github.com/foreversd/forever-monitor#readme">Node package</a>. It does all the app management. 

### Overview

As PagePark starts up, it looks in each of the sub-folders of the domains folder. 

If a folder contains a package.json file and a node_modules folder, it then looks for a main property at the top level of the package.json file and that's the file it launches with Forever. If the main property is not present, it scans the folder and launches the first file it finds that ends in .js.

### Details

1. You can set any of the <a href="https://github.com/foreversd/forever-monitor#options-available-when-using-forever-in-nodejs">options</a> for Forever with a <i>forever</i> object at the top level of your config.json file. 

2. Your app has a log file in the <i>data</i> sub-folder of the folder PagePark is running from. 

3. You have to enable persistent apps globally by setting PagePark's config.flRunPersistentScripts to true. Unless you do so it will not look in the <i>domains</i> folder at startup.

### Limits, unfinished business

1. There's no way to launch an app after PagePark boots, for now, to install a new app you have to reboot PP.

3. It should be possible to disable an app even if it has a package.json file and a node_modules folder. Probably something in its config.json file. 

4. flRunPersistentScripts should be called flRunPersistentApps. 

