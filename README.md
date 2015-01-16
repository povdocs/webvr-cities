# WebVR City Visualization

[View Demo](http://povdocs.github.io/webvr-cities/)

This demonstrates an experimental virtual reality interaction using a mobile browser to fly around a representation of a real-world city. Enter the name of a location in the text box below to search for a location to visit. Scan (or right-click and copy) the QR code for a link to open in mobile Chrome or Firefox. Touch and drag in any direction to move around the space. You will move in whatever direction you're dragging, taking into account the direction the device is pointing. You can shake the phone quickly to turn around 180 degrees.

Load this site in an experimental WebVR build of either [Firefox](http://mozvr.com) or [Chrome](http://blog.bitops.com/blog/2014/08/20/updated-firefox-vr-builds/). When the Rift is connected, hit the "Enter" key or click the "VR" button to enter full-screen VR mode. Hit "Escape" to exit VR and release the mouse cursor.

## Data Visualization

The demo includes four different three-dimensional representations of data placed in our virtual world. You can select one data visualization at a time and search for any location.

### Average Income
There are two views representing average income, either as vertical bars or as hemispherical bubbles. The data come from the <a href="http://www.census.gov/geo/maps-data/data/tiger-data.html" target="_blank">2010 US census</a>, so this one only works inside the United States. Each bar or bubble represents the average for a single <a href="https://www.census.gov/geo/maps-data/maps/2010tract.html" target="_blank">census tract</a>.

### Population Particles
Inspired by the [Racial Dot Map](http://www.coopercenter.org/demographics/Racial-Dot-Map), the second visualization shows population broken down by race, with each person represented as a color-coded particle, like a snowflake or bit of pollen floating in the air. This one also comes from the 2010 US census.

### NYPD Personal Injury Claims
This view plots every [personal injury claim](http://comptroller.nyc.gov/reports/claimstat/) made against the New York City Police Department in 2013. The visual is simple: each claim is represented as a red cylinder, similar to the income bars.

### Bike and Run GPS Logs
GPS data files from training bike rides and runs of a [triathlete](http://anthonybagnettofitness.com/). Paths are represented as colored lines. The user may follow the lines using the [mobile phone control](http://www.pbs.org/pov/blog/povdocs/2014/11/introducing-a-remote-control-for-virtual-reality-films-hint-its-in-your-pocket/) to get a rough sense of what it might be like to ride through the city.

## License
Original code is made avalable under [MIT License](http://www.opensource.org/licenses/mit-license.php), Copyright (c) 2014 American Documentary Inc.

## Author
Code, concept and design by [Brian Chirls](https://github.com/brianchirls), [POV](http://www.pbs.org/pov/) Digital Technology Fellow

[Vizicities](https://github.com/vizicities/vizicities) by [Robin Hawkes](https://github.com/robhawkes)