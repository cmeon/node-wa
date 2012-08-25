node-wa
=======

Node.js whatsapp access

Loosely based on the WhatsAPI and Wazapp projects that you can find on github.

Appears to work in all versions of Node from 0.2 to 0.8.  

I don't know much about building node modules properly, so hopefully if anyone else finds this useful, they can
clean up some of the mess.  

Good luck and enjoy.

Here's how I basically make it do something:

var waApi = require('testapi.js').waApi;

var wa = new waApi(userId, password, { debug: true });

It is an EventEmitter that will emit several events when things happen.  You can call different functions within it to 
cause different things to happen.

At this time, if someone sends you custom image data, it'll probably crash out, as it has no idea how to parse it.

