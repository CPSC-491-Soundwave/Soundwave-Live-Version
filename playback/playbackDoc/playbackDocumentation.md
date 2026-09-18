# Audio Playback
## Code
The code for playback.js is relatively simple, thanks to the howl library. There  
exists a music variable that holds a Howl object. If one already exists in it,  
we clear it, and then we continue making a new Howl object. We set the path,  
a default volume, and force HTML5(mainly for testing). It also comes with  
console outputs for debugging. The rest of the code is very simple, all  
it is is calling functions from the Howl libary to define the path to the  
.mp3 file, play, pause, set volume, and skip to a specific part of the song.  

## Utilization
The client should be able to call the database to grab the location and the  
metadata of the .mp3 file. Then it should be able to pass the location of  
the file to the playback.js functions. Then the functions should be able  
to communicate with client.
