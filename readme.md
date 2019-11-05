# Remote Direct Volume Rendering
This tool provides a quick overview of 3D data (e.g. microscope images) that is delivered by a remote HTTP server. The visualization methods include maximum intensity projection, iso surface rendering, and cutting planes. A Chrome-based browser is recommended for highest performance. 

## For the end user
This program should be provided by a server, for example over the URL http://localhost/viewer. Open this URL in Chrome or a similar browser that supports WebGL 2.0 (preferred) or at least WebGL 1.0 (resulting in worse image quality). 
 
### Step 1: Configuration
The first view is a configuration page where you have to enter multiple information:

- The URL of a configuration file, also on a web server, e.g. http://localhost/data/config.json
- The URL of the data root folder, also on a web server, e.g. http://localhost/data/
- A sampling rate for the volume rendering. Value 1 means that every pixel is sampled at least once. Value 2 means oversampling, hence every pixel is sampled at least twice. Lower values lead to skipped pixels: value 0.1 means only one of 10 pixels is considered. A value of 1 is recommended, but lower values can tremendously increase rendering speed. Note: This does NOT affect the view of cutting planes - they always have high quality.
- Type of the data. Uint8 means that each channel is converted to 256 intensity levels. Float32 offers much higher precision but requires four times the memory on the graphics card. Although it is below the resolution of the microscope's camera, uint8 should be sufficient for most images. Note, the program stretches the histogram (and cuts off unused intensity values at the upper side of the intensity range) to maximize the dynamic range.

### Step 2: Exploration
The program constantly checks for updates and tells you when there are new images available. You can either manually reload images or let the tool automatically fetch new images (just check the respective checkbox).

You can also configure the program to take screenshots whenever new data is loaded (which makes especially sense if you have activated autoloading of new textures), providing you a short overview over what has happened over time. These images can be downloaded. Note, whenever you reload the page, screenshots get lost. Save them before reloading!

The program offers various methods of visualization:
- Colormapping. You can define a color for the dataset or you can use pre-defined colormaps. Besides that, you can stretch the contrast and the gamma value (the three sliders below the color selection), which is probably necessary to see something at all.
- Cutting planes. Select x, y, or z and a slice of interest. You can zoom in with the mouse wheel.
- Maximum intensity projection (MIP). This method looks through the image and shows you the brightest parts only.
- Iso surface. Select an intensity value and you will see a surface covering all image elements with (at least) this intensity.
- Average. This looks through the image and averages the intensity, which is comparable to an x-ray image.
- A slider for rotation around the y axis helps you to rotate the value in the same manner as it is rotated on the microscope stage (not usable in slice view mode). This might be helpful for the positioning of the specimen.

Note, some settings are applied to the whole image (e.g. the choice of the cutting plane) whereas other settings must be specifically adjusted for each channel of the image. In that way you can give the channels different colors or render them with different iso values.

For a better overview, you can close and open the configuration area by clicking the "X" in the top left. Futhermore, you can resize the navigation area by dragging the square in the bottom right.


## About the setup
This tool requires a configuration file, which provides basic information about image size and location. This file can be permanently updated by the microscope software. It is reloaded every couple of seconds and it should look like this:

```json
{
    "pixelsize": [2.6, 2.6, 2.0],
    "images": [
        {"url": "#/datafile002.raw",
         "timestamp" : "image id 031201",
         "wavelength" : "488",
         "offset" : [0, 0, 0],
         "datasize" : [512, 512, 370],
         "flipping" : [false, false, false]}, 
         ...
    ]
}
```
The first three values describe the dimensions of a single voxel. In this case, a single voxels represents a volume of 2.6 x 2.6 x 2 microns. These values must remain constant over time and they must be equal for all images. Next, the JSON file provides individual information about each image that should be loaded. Each image comes with its own URL and a timestamp. Once the timestamp changes, the image will be reloaded. The timestamp can be any string - we only check for changes in that string. Each image can have an individual data size and offset. Furthermore it is possible to flip the data along an individual axis. With these parameters it is, for example, possible to stitch two or more images. Note, flipping the data is performed first, moving the image to a certain offset position is performed afterwards. The wavelength entry is used to group images by channel. All images with the same wavelength will be drawn into the same channel. There can be up to four different channels (hence, four different wavelengths). 

The data itself must be provided as a byte array of uint16 values.

As stated above, the data, the JSON file, and the tool itself must be served by a web server. A quick way to do so is using python3: First, open a terminal in the folder containing these files. Then, type 'python3 -m http.server 1234' to open a webserver at port 1234 pointing to the current directory. The address of the folder would then be 'http:/localhost:1234/'

## FAQ
### The image freezes, I cannot move the camera
The tool is probably updating the image data (then, just wait a bit) or your graphics card is too weak (then, see below).

### The image flashes up and disappears
Likely the rendering time of a single frame was too high and the browser stopped the rendering process. Your graphics card is too weak, see below.

### I think my graphics card is too weak
If the framerate is very low or if the view flashes up for a moment and then seem to crash, it could be caused by low performance of your graphics card. In that case, changing the sampling rate to a low value (e.g. 0.1) could help.

### Nothing happens at all
This is a hard one. Ideas: Your browser does not support WebGL. Check that on https://get.webgl.org/. Or maybe you did not run the program on web server. 
For advanced users: check Chrome's developer console for any errors (red lines).

