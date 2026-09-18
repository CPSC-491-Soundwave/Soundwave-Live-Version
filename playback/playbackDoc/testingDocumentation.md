# Testing
## Purpose
The purpose of this document is to provide context to how testing was done.  

## Files for testing
index.html
- A simple .html file to test out the functions for playback.html.  

testMetadata.js
- A simple .js to test if metadata.js can properly grab the metadata from  
the .mp3 file.

server.js
- A basic server to tests out whether or not playback functions properly  
when connecting to an endpoint; To prove that it can work not locally.  

## Process
### index.html
Running index.html was as simple as going into the same directory and  
running the command npx serve. The html has basic buttons that are  
linked to the functions in playback.js, so all was done was to actvate  
the inputs to test if they worked or not.

### testMetadata.js
testMetadata.js was ran by running node testMetadata.js. In it's current  
iterations, it outputs to the console the data it grabbed from the file.

### server.js
The way server.js was used to test playback.js was by having two consoles  
open, both of which in the same directory, one of them runs node server.js  
and the other runs npx serve . . The npx serve . ended up being redundant,  
but node server.js allowed for not only showed that the code successfully  
runs at an endpoint, but also how much and how the data from the .mp3  
was streamed.
