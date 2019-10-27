# Data Preview Tool
This tool aims to provide a quick overview of 3D data during the image acquisition process. This software must be provided by a web server (HTTP) and must be executed in a Chrome-based browser. 

## For the end user
This program should be provided by a server, for example over the URL http://localhost/viewer. Open this URL in Chrome or a similar browser that supports WebGL 2.0 (preferred) or at least WebGL 1.0 (having worse image quality). 
 
### Configuration
The first view is a configuration page where you have to enter multiple information:

- The URL of a configuration file, also on a web server, e.g. http://localhost/data/config.json
- The URL of the data root folder, also on a web server, e.g. http://localhost/data/
- A sampling rate for the volume rendering. Value 1 means that every pixel is roughly sampled once. Value 2 means oversampling, hence every pixel is sampled twice. Lower values lead to skipped pixels: value 0.1 means only one of 10 pixels is considered. A value of 1 is recommended, but lower values can tremendously increase rendering speed. Note: This does NOT affect the view of cutting planes. Cutting planes have always high quality.
- Type of the data. Uint8 means that each channel is converted to 256 intensity levels. Float32 offers much higher precision but requires four times the memory on the graphics card. Although it is below the resolution of the microscope's camera, uint8 should be sufficient for most images. Note, the program stretches the histogram to maximize the dynamic range.

### Exploration
The program constantly checks for updates and tells you when there are new images available. You can either manually reload images or let the tool automatically fetch new imags (just check the respective checkbox).

You can also configure the program to take screenshots whenever new data is loaded (which makes especially sense if you have activated autoloading of new textures), providing you a short overview over what has happened over time.

The program offers various methods of visualization:
- Colormapping. You can define a color for the dataset or you can use pre-defined colormaps. Besides that, you can stretch the contrast and the gamma value (the three sliders below the color selection), which is probably necessary to see something at all.
- Cutting planes. Select x, y, or z and a slice of interest. You can zoom in with the mouse wheel.
- Maximum intensity projection (MIP). This method looks through the image and shows you the brightest parts only.
- Iso surface. Select an intensity value and you will see a surface covering all image elements with (at least) this intensity.
- Average. This looks through the image and averages the intensity, which is comparable to an x-ray image.

Note, some settings are applied on the whole image (e.g. the choice of the cutting plane) whereas other settings must be specifically adjusted for each channel of the image. In that way you can give the channels different colors or render them with different iso values.

For a better overview, you can close and open the configuration area by clicking the "X" in the top left. Futhermore, you can resize the navigation area by dragging the square in the bottom right.


## About the setup
This tool requires a configuration file, which provides basic information about image size and location. This file can be permanently updated by the microscope software. It is reloaded every couple of seconds and it should look like this:

```json
{
    "xsize":512,
    "ysize":512,
    "zsize":370,
    "xpixelsize":2.6,
    "ypixelsize":2.6,
    "zpixelsize":2,
    "filelocation": {
        "488": "#/localhost/data/data1.raw",
        "530": "#/localhost/data/data2.raw"
    },
    "timestamp": {
        "488": "23 Oct 2019 12:47:52:316 -0500",
        "530": "23 Oct 2019 12:47:59:812 -0500"
    }
}
```
The first three values describe the data dimension and the `pixelsize`-values give information about the aspect ratio of a single voxel. They must remain constant over time and they must be equal for all channels! For each channel (up to a maximum of four) we need two pieces of information. First, a timestamp: whenever the timestamp of a channel changes, the channel will be reloaded. Second, the url of the channel's data. The url can be changing with every time step (which is recommended to avoid problems by half-overwritten files etc.). The URL may contain a sharp (#) which will be replaced by the data root URL (see above).


The data itself must be provided as a byte array of uint16 values.

As stated above, the data, the JSON file, and the tool itself must be served by a web server. A quick way to do so is using python3: First, open a terminal in the folder containing these files. Then, type 'python3 -m http.server 1234' to open a webserver at port 1234 pointing to the current directory. The address of the folder would then be 'http:/localhost:1234/'

## FAQ
### The image freezes, I cannot move the camera
The tool is just updating the image data (then, just wait a bit) or your graphics card is too weak (then, see below)

### The image flashes up and disappears
Likely the rendering time of a single frame was too high and the browser stopped the rendering process. Your graphics card is too weak, see below.

### I think my graphics card is too weak
If the framerate is very low or if the view flashes up for a moment and then seem to crash, it could be caused by low performance of your graphics card. In that case, changing the sampling rate to a low value (e.g. 0.1) could help.

### Nothing happens at all
Ideas: Your browser does not support WebGL. Check that on https://get.webgl.org/. Or maybe you did not run the program on web server. 
For advanced users: check Chrome's developer console