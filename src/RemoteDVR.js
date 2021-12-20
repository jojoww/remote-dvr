import * as THREE from './includes/build/three.module.js';
            import { OrbitControls } from './includes/examples/jsm/controls/OrbitControls.js';
            import { TrackballControls } from './includes/examples/jsm/controls/TrackballControls.js';
            import { VolumeRenderShader1 } from './includes/examples/jsm/shaders/VolumeShader.js?v=22';
            import { WEBGL } from './includes/examples/jsm/WebGL.js';

            // Check availability of WebGL 2.0. We prefer 2.0 since WebGL 1.0 does
            // not know 3D textures.
            var webglMode = WEBGL.isWebGL2Available() ? 2 : WEBGL.isWebGLAvailable() ? 1 : 0;
            console.log('WebGL available? ', webglMode);

            // Prepare: get parameters from URL
            var url = new URL(window.location.href);
            var configUrl = url.searchParams.get('configUrl');
            var dataUrl = url.searchParams.get('dataUrl');
            var samplingRate = url.searchParams.get('samplingRate');
            var useByte = url.searchParams.get('useByte') == 1 ? true : false;
            var downscale = url.searchParams.get('downscale');
            var showFps = url.searchParams.get('fps') !== null;

            if (configUrl === null) alert('Please provide the URL of a configuration file!');
            if (dataUrl === null) alert("Please provide the URL of the data server's root location!");
            if (isNaN(useByte) || useByte === null) useByte = 1;
            if (isNaN(downscale) || downscale === null) downscale = 1;
            if (isNaN(samplingRate) || samplingRate === null) samplingRate = 1;

            // The webGL elements
            var context, renderer, scene, camera, controls, material, cmtextures, texture, canvas, mesh;
            var renderer2, scene2, camera2;
            var stats;

            var cameraDist = 2500; // Camera must be far away from the data to avoid clipping (=voxel space)
            var allowPan = false; // We disable the option to move the geometry away



            // Most image information are stored in variable "images". Besides that we created some 
            // helpers that store advanced information and relations between images and channels.
            // Note, a channel must be filled by at least one image, but also multiple images could be
            // used to create a stitched view on the data. The world dimension is derived from the
            // maximum image size and the maximum image offset.
            var images; // Holds metadata for all images. This is basically a copy of the config JSON.
            var smallestOffset = [0, 0, 0]; // We have to normalize by the smallest offset in order to start world space at 0/0/0
            var numImages = 1; // The total number of images
            var numImagesPerChannel = {}; // Not needed so far, but potentially to know when a channel is fully updated
            var channelToIndex = {}; // Provides the order (= a numeric index) for each channel name
            var numChannels = 1; // The number of channels provided by the data, in [1,4].
            var numChannelsGPU = 1; // Like above, but considers limits of WebGL. E.g. there can't be 2 - we would use 3 and fill up with zeros.
            var loadedImageVersions = []; // Array of timestamps of currently loaded (=visible) data
            var worldDimensions = [0, 0, 0]; // Number of elements per axis
            var imageChannels = []; // For each image: channel it belongs to (like a reverse index)
            var worldScale = [1, 1, 1]; // Voxel spacing for x, y, z dimensions
            var isRendering = false;

            var noTextureLoaded = true; // Just to know if we have successfully loaded anything
            var autoScreenshot = true; // If true, a screenshot is taken just before a new texture is loaded
            var autoLoad = false; // If true, new datasets are loaded automatically
            var useSampler3D = webglMode == 2; // If webgl2, use sampler3d; else we must use the workaround with a large 2D texture
            var sampler2DGridX = 1; // If we use 2D textures, we place the textures in a grid. That's the number of images along x
            var sampler2DGridY = 1; // If we use 2D textures, we place the textures in a grid. That's the number of images along y

            // Start everything
            if (webglMode === 0) {
                alert('Your browser does not support WebGL');
            } else {
                init();
            }
           

            /**
             * This function starts the graphics engine and triggers all loading processes
             */
            function init() {
                // Create the THREE.js basics
                scene = new THREE.Scene();
                var canvasHolder = document.getElementById('mainCanvas');
                canvas = document.createElement('canvas');
                context = canvas.getContext(webglMode == 2 ? 'webgl2' : 'webgl1', { alpha: false, antialias: false });

                renderer = new THREE.WebGLRenderer({ 
                    canvas: canvas, 
                    context: context 
                    //preserveDrawingBuffer: true, // Seems important for screenshots
                    //powerPreference: "high-performance"
                 });
                renderer.setClearColor(0x282828); // Background color
                renderer.setPixelRatio(window.devicePixelRatio); // High DPI screen?
                renderer.setSize(canvasHolder.clientWidth, canvasHolder.clientHeight);
                canvasHolder.appendChild(renderer.domElement);

                if(showFps) {
                    stats = new Stats();
                    stats.showPanel( 0 ); // 0: fps, 1: ms, 2: mb, 3+: custom
                    document.body.appendChild( stats.dom );
                }
                // Create orthographics camera. Perspective won't work with raycasting. (Could be done, somehow, but...)
                var h = 1024; // Height of the view, which is sort of the "zoom level". TODO: maybe update it after data loading?
                var aspect = canvasHolder.clientWidth / canvasHolder.clientHeight;
                camera = new THREE.OrthographicCamera((-h * aspect) / 2, (h * aspect) / 2, h / 2, -h / 2, 0, 99999999);
                // The camera must have a distance large enough from the data (e.g. 5000), otherwise annoying clipping can occur.
                camera.position.set(0, 0, cameraDist);
                camera.up.set(0, 1, 0);
                initInset();

                // Create . The target will be updated once we know the data size.
                controls = new OrbitControls(camera, renderer.domElement);
                controls.addEventListener('change', renderCall);
                controls.target.set(64, 64, 128);
                controls.minZoom = 0.1;
                controls.maxZoom = 100;
                controls.enablePan = allowPan; 
                controls.update();

                /*
                // Trackball controls could be nice, but they are currently not working, maybe a version mismatch?!
				controls = new TrackballControls( camera, renderer.domElement );
                controls.rotateSpeed = 1.0;
                controls.zoomSpeed = 1.2;
                controls.panSpeed = 0.8;
                controls.staticMoving = true;
                controls.dynamicDampingFactor = 0.3;
                controls.keys = [ 65, 83, 68 ];
                controls.addEventListener( 'change', render );
                */

                // Now we start observing our data source (and also window size changes)
                observeExternalDataSource();
                window.addEventListener('resize', onWindowResize, false);
                render();
            }

            /**
             * Creates a second view showing orientation/axes
             */
            function initInset() {
                var container = document.getElementById('inset');
                renderer2 = new THREE.WebGLRenderer({ antialias: true, alpha: true });
                renderer2.setClearColor(0xf0f0f0, 0); // Transparent background
                renderer2.setSize(container.offsetWidth, container.offsetHeight);
                container.appendChild(renderer2.domElement);

                scene2 = new THREE.Scene();
                // Orthographic camera confused me/didn't work (wrong frustum?).
                // However, perspective is not a problem here.
                //camera2 = new THREE.OrthographicCamera( -1, 1, 1, -1, 0.1, 1000 );
                camera2 = new THREE.PerspectiveCamera(50, container.offsetWidth / container.offsetHeight, 0.1, 1000);
                camera2.up = camera.up;  

                // Add axes and manually change their color
                var axes = new THREE.AxesHelper(1);
                var colors = axes.geometry.attributes.color;
                colors.setXYZ(0, 1.0, 0.1, 0.1); // index, R, G, B
                colors.setXYZ(1, 1.0, 0.1, 0.1); // red
                colors.setXYZ(2, 0.2, 0.8, 0.1);
                colors.setXYZ(3, 0.2, 0.8, 0.1); // green
                colors.setXYZ(4, 0.1, 0.4, 1);
                colors.setXYZ(5, 0.1, 0.4, 1); // blue
                axes.material.linewidth = 2;
                scene2.add(axes);
            }

            /**
             * The constant observation of our JSON config file in order to see if data has changed.
             * If data has changed, this function will trigger the reloading process
             */
            function observeExternalDataSource() {
                fetchJSONFile(
                    configUrl + '?' + Math.random(), // Force to load new; avoid caching
                    function(data) {
                        if (loadedImageVersions.length === 0) {
                            numImages = data.images.length;
                            numChannels = 0;
                            var largestDim = [0, 0, 0];
                            smallestOffset = [99999, 99999, 99999];
                            worldScale = data.pixelsize;

                            for (var i = 0; i < data.images.length; i++) {
                                var img = data.images[i]; // less typing...
                                var wavelength = img.wavelength;
                                // First, remember number of images per channel
                                if (numImagesPerChannel[wavelength] === undefined) {
                                    imageChannels.push(wavelength);
                                    numImagesPerChannel[wavelength] = 1;
                                    channelToIndex[wavelength] = imageChannels.length - 1;
                                    numChannels += 1;
                                } else {
                                    numImagesPerChannel[wavelength] += 1;
                                }
                                smallestOffset = [Math.min(img.offset[0], smallestOffset[0]), Math.min(img.offset[1], smallestOffset[1]), Math.min(img.offset[2], smallestOffset[2])];
                            }

                            for (var i = 0; i < data.images.length; i++) {
                                var img = data.images[i]; // less typing...
                                
                                var imageRange = [img.datasize[0] + Math.ceil((img.offset[0] - smallestOffset[0]) / worldScale[0]),
                                                 img.datasize[1] + Math.ceil((img.offset[1] - smallestOffset[1]) / worldScale[1]),
                                                 img.datasize[2] + Math.ceil((img.offset[2] - smallestOffset[2]) / worldScale[2])]
                                console.log("Image range of image", i, "is", imageRange)
                                largestDim[0] = Math.max(largestDim[0], imageRange[0]);
                                largestDim[1] = Math.max(largestDim[1], imageRange[1]);
                                largestDim[2] = Math.max(largestDim[2], imageRange[2]);
                            }

                            // Just create some array structures. We fill in proper values later
                            for (var i = 0; i < numImages; i++) {
                                loadedImageVersions.push('');
                            }
                            worldDimensions = largestDim;
                            initTexture();
                        }

                        console.log('Checked the config file');

                        images = data.images;

                        for (var i = 0; i < images.length; i++) {
                            if (loadedImageVersions[i] !== images[i].timestamp) {
                                console.log('Something has changed. Update now (or show reload button)');
                                if (autoLoad || loadedImageVersions[i] == '') {
                                    loadTexture();
                                } else {
                                    showReloadButton();
                                }
                            }
                        }
                        // Check again in 3 seconds
                        window.setTimeout(observeExternalDataSource, 3000);
                    },
                    couldNotFindConfig
                );
            }

            /**
             * A vague message that something went somehow wrong.
             */
            function couldNotFindConfig() {
                alert('Error! Could not access the config file. Is the URL correct? ' + configUrl);
            }

            /**
             * We create the initial texture. We can do this once we know the size of the data.
             */
            function initTexture() {
                var x = parseInt(worldDimensions[0] / downscale);
                var y = parseInt(worldDimensions[1] / downscale);
                var z = parseInt(worldDimensions[2] / downscale); // usually z is smaller, thus we only scale x/y 
                var xScale = worldScale[0] * downscale;
                var yScale = worldScale[1] * downscale;
                var zScale = worldScale[2] * downscale;

                // THREE.js/WebGL seems to be quite restriced regarding data types and texture layout.
                // First, it is unable to use any 2 byte type. Hence we have to use either ubyte or float32.
                // Second, the number of channels can only be 1, 3, or 4 (Luminance/Red, RGB, RGBA) for
                // bytes or 1 and 4 for float32. Hence we consider various cases:

                numChannelsGPU = numChannels; // Basic assumption: one texture channel per data channel. However...
                if (numChannels == 2) {
                    numChannelsGPU = 3; // ... nope, there is no two-channel-GPU format, use 3!
                }

                if (numChannelsGPU == 3 && !useByte) {
                    numChannelsGPU = 4; // ... hmm, also no three channels for float
                }

                var dataArray = null;
                var numTotal = x * y * z * numChannelsGPU;
                var maxTexSize = renderer.capabilities.maxTextureSize;
                console.log('Using sampler 3D? ', useSampler3D);
                console.log('Maximum texture size of this device: ', maxTexSize);

                if (!useSampler3D) {
                    sampler2DGridX = Math.floor(maxTexSize / x);
                    sampler2DGridY = Math.ceil(z / sampler2DGridX);
                    if (sampler2DGridY * y > maxTexSize) {
                        alert('The 2D texture is too large for this graphics card! Try downsampling.');
                    }
                    numTotal = sampler2DGridX * x * sampler2DGridY * y * numChannelsGPU;
                } else {
                    if (x > maxTexSize || y > maxTexSize || z > maxTexSize) {
                        alert('The 3D texture is too large for this graphics card! Try downsampling.');
                    }
                }

                if (useByte) {
                    dataArray = new Uint8Array(numTotal);
                } else {
                    dataArray = new Float32Array(numTotal);
                }
                dataArray.fill(0); // For now, it's all black

                if (useSampler3D) {
                    texture = new THREE.DataTexture3D(dataArray, x, y, z);
                } else {
                    texture = new THREE.DataTexture(dataArray, x * sampler2DGridX, y * sampler2DGridY);
                    console.log('Max texture size is', maxTexSize);
                    console.log('Hence, use a grid of ', sampler2DGridX, sampler2DGridY);
                }

                if (useByte) {
                    texture.type = THREE.UnsignedByteType;
                } else {
                    texture.type = THREE.FloatType;
                    //texture.format = THREE.RedFormat; // TODO: maybe float single channel must be RedFormat
                }
                if (numChannelsGPU == 1) {
                    texture.format = THREE.LuminanceFormat;
                } else if (numChannelsGPU == 3) {
                    texture.format = THREE.RGBFormat;
                } else {
                    texture.format = THREE.RGBAFormat;
                }

                texture.minFilter = texture.magFilter = THREE.LinearFilter;
                // Alternative (but ugly and no meaningful speed gain):
                //texture.minFilter = texture.magFilter = THREE.NearestFilter;
                // Not too sure about the following one or if alternatives would be better.
                texture.unpackAlignment = 1;

                // Colormap textures. Any number could be added (however, also the GUI must be updated then).
                cmtextures = {
                    viridis: new THREE.TextureLoader().load('src/includes/examples/textures/cm_viridis.png', render),
                    gray: new THREE.TextureLoader().load('src/includes/examples/textures/cm_gray.png', render),
                    gray_rev: new THREE.TextureLoader().load('src/includes/examples/textures/cm_gray_rev.png', render),
                    hot_iron: new THREE.TextureLoader().load('src/includes/examples/textures/cm_hot_iron.png', render)
                };

                // Material and uniforms
                var shader = VolumeRenderShader1;
                var uniforms = THREE.UniformsUtils.clone(shader.uniforms);

                // Normalizing by the smalles dimension avoids unnecessary sampling steps
                var minDim = Math.min(xScale, yScale, zScale);
                var volX = x * xScale / minDim; 
                var volY = y * yScale / minDim;
                var volZ = z * zScale / minDim;

                // Now update these uniforms about which we have learned something new.
                uniforms['u_data'].value = texture;
                uniforms['u_samplingRate'].value = samplingRate;
                uniforms['u_size'].value.set(volX, volY, volZ);
                uniforms['u_grid2D'].value.set(sampler2DGridX, sampler2DGridY);
                uniforms['u_numSlices'].value.set(x, y, z);
                uniforms['u_cmdata_0'].value = cmtextures['gray'];
                uniforms['u_cmdata_1'].value = cmtextures['gray'];
                uniforms['u_cmdata_2'].value = cmtextures['gray'];
                uniforms['u_cmdata_3'].value = cmtextures['gray'];
                for (var i = 0; i < numChannels; i++) uniforms['u_used_' + i].value = 1;
                console.log('Initial state of uniforms:', uniforms);

                // Prepare uniforms and shaders
                material = new THREE.ShaderMaterial({
                    uniforms: uniforms,
                    vertexShader: shader.vertexShader,
                    fragmentShader: shader.getFragmentShader(useSampler3D, worldDimensions[2]),
                    side: THREE.BackSide // The volume shader uses the backface as its "reference point"
                });

                // A box with the size of the data. We will use its walls as canvas for rendering.
                var geometry = new THREE.BoxBufferGeometry(volX, volY, volZ);
                console.log(geometry);
                geometry.translate(volX / 2, volY / 2, volZ / 2); // Or plus -0.5 per component, as in example?
                mesh = new THREE.Mesh(geometry, material);

                // Make the controls (camera) look at the right spot.
                controls.target.set(volX / 2, volY / 2, volZ / 2);
                controls.update();
                scene.add(mesh);
                renderCall();
                addChannelsToGui(imageChannels);
                addLoadingBarsToGui(numImages);
            }

            /**
             * Transforms x/y/z coordinates to x/y coordinates of a new texture in which all
             * layers are placed next to each other in a grid
             * @param {int} x X coordinate in 3D texture
             * @param {int} y Y coordinate in 3D texture
             * @param {int} z Z coordinate in 3D texture
             */
            function moveTo2DSamplerPosition(x, y, z) {
                var offsetX = (z % sampler2DGridX) * parseInt(worldDimensions[0] / downscale);
                var offsetY = Math.floor(z / sampler2DGridX) * parseInt(worldDimensions[1] / downscale);
                return [x + offsetX, y + offsetY];
            }

            /**
             * Receive bytes with data of one (!) channel and copies the bytes at their
             * respective place in the texture (which is like every n^th byte, with n
             * the number of channels). Besides that, data is stretched towards the
             * maximum value in order to make "the best of the bytes".
             * @param {bytes} data The raw uint16 byte image data
             * @param {int} channel The channel the texture should be loaded to
             *
             * Note, since this function is used in a callback and the callback only allows
             * one parameter, we provide a "context" to this function with .bind(), which
             * is accessable by "this" within this function. We assume that in the context
             * a number of information are provided, i.e. references to important data and
             * other functions. I am not sure if JavaScript offers a better alternative for
             * this approach.
             */
            function handleTextureData(data) {
                // Get information/links from "this" (the context)
                var index = this.index;
                var channel = this.channel;
                var img = this.images[index];
                var worldDimensions = this.worldDimensions;
                var downscale = this.downscale;
                console.log('Received new texture data for image', index, 'channel', img.wavelength);
                this.setLoadingStatus(index, 95, 'Create texture');

                // The data always arrives as Uint16
                var array = new Uint16Array(data);

                // Find out the max, so we can normalize
                var maxVal = 0;
                for (var i = 0; i < array.length; i++) {
                    maxVal = Math.max(array[i], maxVal);
                }
                // But limit the normalization to a factor of a maximum of 256. Otherwise "near black"
                // (empty) images would become super bright.
                maxVal = Math.max(maxVal, 255);
                maxVal = parseFloat(maxVal);
                console.log('Normalizing to ', maxVal);

                console.time('Timer for updating texture:');

                var offsetX = Math.round((img.offset[0] - smallestOffset[0]) / worldScale[0]);
                var offsetY = Math.round((img.offset[1] - smallestOffset[1]) / worldScale[1]);
                var offsetZ = Math.round((img.offset[2] - smallestOffset[2]) / worldScale[2]);
                console.log("Place image at offset", offsetX, offsetY, offsetZ);
                var flipX = img.flipping[0];
                var flipY = img.flipping[1];
                var flipZ = img.flipping[2];

                // The data copy process. The last case is the easiest one. I kept in separately in order
                // to copy data at highest speed.
                //if(offsetX !== 0 || offsetY !== 0 || offsetZ !== 0 || flipX || flipY || flipZ || !useSampler3D) {
                console.log('Handle images. Offset: ', offsetX, offsetY, offsetZ, ', flips:', flipX, flipY, flipZ);
                var numX = parseInt(worldDimensions[0] / downscale);
                var numXOrig = img.datasize[0];
                var numXY = parseInt(worldDimensions[1] / downscale) * numX;
                var numXYOrig = img.datasize[1] * numXOrig;
                if (!this.useSampler3D) {
                    numX = this.sampler2DGridX * parseInt(worldDimensions[0] / downscale);
                    numXY = this.sampler2DGridY * numX * parseInt(worldDimensions[1] / downscale); // not needed in that case
                }

                var toX, toY, toZ, val;
                // Load the data and normalize to [0,1]. If texture uses bytes, convert to [0,255].
                // This loop runs in data (origin) space and puts the value to the respective position in the world
                // Note: it is way faster do let x be fastest changing index!
                for (var z = 0; z < img.datasize[2]; z++) {
                    for (var y = 0; y < img.datasize[1]; y++) {
                        for (var x = 0; x < img.datasize[0]; x++) {
                            // In case we allow downsampling, skip everything except every n^th
                            if (downscale > 1) {
                                if (x % downscale !== 0 || y % downscale !== 0 || z % downscale !== 0) {
                                    continue;
                                }
                            }

                            // Reading the texture is easy
                            val = parseFloat(array[x + y * numXOrig + z * numXYOrig]) / maxVal;
                            if (useByte) {
                                val = parseInt(val * 255);
                            }
                            toX = x;
                            toY = y;
                            toZ = z;

                            // We flip first, still in data space, without offsets
                            if (flipX) toX = img.datasize[0] - toX - 1;
                            if (flipY) toY = img.datasize[1] - toY - 1;
                            if (flipZ) toZ = img.datasize[2] - toZ - 1;

                            // Now we translate the target position according to the offset
                            toX = toX + offsetX;
                            toY = toY + offsetY;
                            toZ = toZ + offsetZ;

                            // Since we are in texture space now, we can check against the
                            // world's boundaries. 
                            if (toX < 0 || toY < 0 || toZ < 0 || toX >= worldDimensions[0] || toY >= worldDimensions[1] || toZ >= worldDimensions[2]) {
                                continue; // Out of bounds
                            }

                            // Eventually - and not before - we move to scaled space
                            if (downscale > 1) {
                                toX = parseInt(toX / downscale);
                                toY = parseInt(toY / downscale);
                                toZ = parseInt(toZ / downscale);
                            }

                            // In case we use 2D sampler, the position must be changed. In this mode, we
                            // don't have a third dimension but we store the images in a 2D grid (e.g.
                            // we have one big texture that hold like 32 * 12 slices in a grid layout)
                            if (!this.useSampler3D) {
                                var xy2D = this.moveTo2DSamplerPosition(toX, toY, toZ);
                                toX = xy2D[0];
                                toY = xy2D[1];
                                toZ = 0;
                            }
                            this.texture.image.data[(toX + toY * numX + toZ * numXY) * numChannelsGPU + channel] = val;
                        }
                    }
                }

                console.timeEnd('Timer for updating texture:');

                console.log('Updated texture:', texture);
                this.loadingFinished(index);
                this.texture.needsUpdate = true;
                this.renderCall();
            }

            /**
             * Compares the loaded data with the available data. If we are outdated,
             * show the reload button.
             */
            function checkIfShowReloadButton() {
                var hide = true;
                for (var i = 0; i < images.length; i++) {
                    if (loadedImageVersions[i] !== images[i].timestamp) {
                        console.log('Image ', i, 'is not loaded in its most recent version');
                        hide = false;
                    }
                }
                if (hide) {
                    hideReloadButton();
                }
            }

            /**
             * Triggers the loading process of all outdated textures. This one is called either
             * automatically or manually be the reload button (depends on the settings).
             */
            function loadTexture() {
                for (var i = 0; i < images.length; i++) {
                    if (loadedImageVersions[i] !== images[i].timestamp) {
                        console.log('Reloading image', i, ', which belongs to channel', images[i].wavelength);
                        if (autoScreenshot) takeScreenshot();
                        loadedImageVersions[i] = images[i].timestamp;
                        var loader = new THREE.FileLoader();
                        loader.setResponseType('arraybuffer');
                        // Note, we replace (the first occurence of) "#" by the user-defined data URL
                        var url = images[i].url.replace('#', dataUrl) + '?' + Math.random(); // Random string to prevent caching

                        // Since the callback allows only one parameter, we define a new 
                        // context for the callback that contains further information
                        var parameters = {};
                        parameters.images = images;
                        parameters.index = i;
                        parameters.texture = texture;
                        parameters.worldDimensions = worldDimensions;
                        parameters.texture = texture;
                        parameters.sampler2DGridX = sampler2DGridX;
                        parameters.sampler2DGridY = sampler2DGridY;
                        parameters.moveTo2DSamplerPosition = moveTo2DSamplerPosition;
                        parameters.renderCall = renderCall;
                        parameters.loadingFinished = loadingFinished;
                        parameters.channel = channelToIndex[images[i].wavelength];
                        parameters.setLoadingStatus = setLoadingStatus;
                        parameters.downscale = downscale;

                        loader.load(url, handleTextureData.bind(parameters), loadingStatus.bind(parameters));
                    }
                }

                // Now -- at least after the triggered processes have finished -- we can be sure
                // to have at least one texture loaded.
                noTextureLoaded = false;

                // We can disable the reload button now (if nothing else is outdated)
                checkIfShowReloadButton();
            }

            /**
             * Sets the loading bars according to the status. However, the function stops at
             * 95% because afterwards we have to update the texture which takes some time and
             * will FREEZE the screen (hence, no updates of the status bar possible).
             * Of course we could just display any percentage, but 95% sounds optimistic.
             * @param {Object} value The THREE.js progress object
             * @param {int} channel The channel for which we should update the status bar
             */
            function loadingStatus(value) {
                if (value.lengthComputable) {
                    var percentage = Math.round((95 * value.loaded) / value.total);
                    this.setLoadingStatus(this.index, percentage, 'Loading');
                }
            }

            /**
             * Handler for resizing event. Maintains correct camera FOV.
             */
            function onWindowResize() {
                console.log('Resize');
                var canvasList = ['mainCanvas'];
                for (var i = 0; i < canvasList.length; i++) {
                    var canvas = document.getElementById(canvasList[i]);
                    renderer.setSize(canvas.clientWidth, canvas.clientHeight);
                    var aspect = canvas.clientWidth / canvas.clientHeight;
                    var frustumHeight = camera.top - camera.bottom;
                    camera.left = (-frustumHeight * aspect) / 2;
                    camera.right = (frustumHeight * aspect) / 2;
                    camera.updateProjectionMatrix();
                }
                renderCall();
            }

            /**
             * The render loop
             */
            function render() {
                if(showFps) {
                    stats.begin();
                }

                renderer.render(scene, camera);

                // Update the axes view to the current camera settings
                camera2.position.copy(camera.position);
                camera2.position.sub(controls.target);
                camera2.position.setLength(2);
                camera2.lookAt(scene2.position);
                renderer2.render(scene2, camera2);

                if(showFps) {
                    stats.end();
                }
                //requestAnimationFrame( render ); // Alternative: loop, rendering all the time
            }

            /**
             * This one is called whenever something in the scene is changed. By this approach,
             * we only re-render the scene on demand (instead of permanently).
             */
            function renderCall() {
                requestAnimationFrame(render);
            }

            /**
             * Get JSON file and trigger further processing.
             * @param {string} url Address of the file. Must be provided by http, not local file.
             * @param {function} callbackSuccess Function to receive the JSON data.
             * @param {function} callbackFail Function to say sorry in case this failed.
             */
            function fetchJSONFile(url, callbackSuccess, callbackFail) {
                var httpRequest = new XMLHttpRequest();
                httpRequest.onreadystatechange = function() {
                    if (httpRequest.readyState === 4) {
                        if (httpRequest.status === 200) {
                            var data = JSON.parse(httpRequest.responseText);
                            if (callbackSuccess) callbackSuccess(data);
                        } else {
                            alert('Error requesting the JSON file. Wrong URL? \n\nHttpRequest error code: ' + httpRequest.status);
                        }
                    }
                };
                httpRequest.onerror = callbackFail;
                try {
                    httpRequest.open('GET', url);
                    httpRequest.send();
                } catch (error) {
                    alert('Could not load the config JSON file. \n\n' + JSON.stringify(error));
                    console.error(error);
                }
            }

            /////////////////////////////////////////////////////////////////
            // Function being accessable from outside this module (e.g. GUI). We have to
            // make them visible by refering to them using the (global) window object

            /**
             *  Takes a screenshot (at least if a texture was loaded) and sends it to the GUI
             */
            function takeScreenshot() {
                if (noTextureLoaded) return;
                renderer.render(scene, camera);
                addScreenshot(renderer.domElement.toDataURL());
            }
            window.takeScreenshot = takeScreenshot;

            /**
             * Enables or disables automated screenshot acquisition whenever (just before) a
             * new texture is loaded.
             * @param {boolean} value
             */
            function setAutoScreenshot(value) {
                autoScreenshot = value;
            }
            window.setAutoScreenshot = setAutoScreenshot;

            /**
             * Enables or disables automated reloading of new textures once we know there is
             * a new texture available.
             * @param {boolean} value
             */
            function setAutoLoad(value) {
                autoLoad = value;
            }
            window.setAutoLoad = setAutoLoad;

            /**
             * Turns on or off a certain channel 
             * @param {boolean} val On (true) or off (false)?
             * @param {int} channel The channel to be toggled 
             */
            function setChannelVisible(val, channel) {
                material.uniforms['u_used_' + channel].value = val ? 1 : 0;
                renderCall();
            }
            window.setChannelVisible = setChannelVisible;

            /**
             * Sets the colormap. Sends texture to shader and tells shader to use this
             * texture (rather than e.g. a custom color).
             * @param {string} mapName Name of the colormap (as it was loaded before)
             * @param {int} channel Which channel this should be used for (in [0,3])
             */
            function setColorMap(mapName, channel) {
                material.uniforms['u_colormode_' + channel].value = 0;
                material.uniforms['u_cmdata_' + channel].value = cmtextures[mapName];
                renderCall();
            }
            window.setColorMap = setColorMap;

            /**
             * Enable maximum intensity projection.
             */
            function enableMIP() {
                showRotationCamSlider();
                // Enable rotation and pan (could have been disabled by slice view)
                controls.enableRotate = true;
                controls.enablePan = allowPan;
                hideSliceAndIsoSlider();
                material.uniforms['u_renderstyle'].value = 0;
                renderCall();
            }
            window.enableMIP = enableMIP;

            /**
             * Enable average projection.
             */
            function enableAverage() {
                showRotationCamSlider();
                // Enable rotation and pan (could have been disabled by slice view)
                controls.enableRotate = true;
                controls.enablePan = allowPan;
                hideSliceAndIsoSlider();
                material.uniforms['u_renderstyle'].value = 3;
                renderCall();
            }
            window.enableAverage = enableAverage;

            /**
             * Enables the iso surface view in the shader.
             */
            function enableIso() {
                showRotationCamSlider();
                hideSliceAndIsoSlider();
                // Enable rotation and pan (could have been disabled by slice view)
                controls.enableRotate = true;
                controls.enablePan = allowPan;

                showIsoSlider();
                material.uniforms['u_renderstyle'].value = 1;
                renderCall();
            }
            window.enableIso = enableIso;

            /**
             * Sets a iso value for the iso surface calculation.
             * @param {float} val The iso value
             * @param {int} channel Which channel this should be used for (in [0,3])
             */
            function setIsoValue(val, channel) {
                material.uniforms['u_renderthreshold_' + channel].value = val;
                renderCall();
            }
            window.setIsoValue = setIsoValue;

            /**
             * Sets a current slice for the slice view. Note, this value will be used
             * to "cut" the value at each time simultaneously. The actually visible
             * plane (e.g. xy, xz, yz) is, then, just a matter of the camera
             * perspective.
             * @param {float} val The position of the plane, in [0, n] with n = width/...
             */
            function setSlice(val) {
                material.uniforms['u_slice'].value = val;
                renderCall();
            }
            window.setSlice = setSlice;

            /**
            * Sets the camera to a certain position around the y axis.
            * @param {float} val The angle (in degree) to rotate
            */
            function setCamera(val) {
                var angle = (val / 180) * Math.PI;
                var x = Math.cos(angle);
                var z = Math.sin(angle);
                var newPos = new THREE.Vector3(x * cameraDist, 0, z * cameraDist);
                var center = new THREE.Vector3(controls.target.x, controls.target.y, controls.target.z);
                newPos.add(center);
                camera.position.set(newPos.x, newPos.y, newPos.z);
                camera.lookAt(new THREE.Vector3(controls.target.x, controls.target.y, controls.target.z));
                renderCall();
            }
            window.setCamera = setCamera;

            /**
             * Sets the lower end for the colormap stretching.
             * @param {float} val The darkest visible intensity (in [0, 1])
             * @param {int} channel Which channel this should be used for (in [0,3])
             */
            function setColorMinimum(val, channel) {
                material.uniforms['u_clim_' + channel].value.set(val, material.uniforms['u_clim_' + channel].value.y);
                renderCall();
            }
            window.setColorMinimum = setColorMinimum;

            /**
             * Sets the upper end for the colormap stretching.
             * @param {float} val The brightest visible intensity (in [0, 1])
             * @param {int} channel Which channel this should be used for (in [0,3])
             */
            function setColorMaximum(val, channel) {
                material.uniforms['u_clim_' + channel].value.set(material.uniforms['u_clim_' + channel].value.x, val);
                renderCall();
            }
            window.setColorMaximum = setColorMaximum;

            /**
             * Sets the gamma value used for the colormap.
             * @param {float} val The gamma value (something around 1, like [0.5, 3]; it's not validated or clipped)
             * @param {int} channel Which channel this should be used for (in [0,3])
             */
            function setGamma(val, channel) {
                material.uniforms['u_gamma_' + channel].value = val;
                renderCall();
            }
            window.setGamma = setGamma;

            /**
             * Enable custom color as colormap. Values will be mapped to colors
             * interpolated between black and a custom color.
             * @param {int} channel Which channel this should be used for (in [0,3])
             */
            function enableCustomColor(channel) {
                material.uniforms['u_colormode_' + channel].value = 1;
                renderCall();
            }
            window.enableCustomColor = enableCustomColor;

            /**
             * Set a custom color that is used as upper end for the colormapping.
             * The lower end will be black; concrete colors are interpolated from
             * in between.
             * @param {color} color The color value - anything understandable by THREE, e.g. #000000
             * @param {int} channel Which channel this should be used for (in [0,3])
             */
            function setCustomColor(color, channel) {
                var c = new THREE.Color(color);
                material.uniforms['u_customcolor_' + channel].value.set(c.r, c.g, c.b);
                renderCall();
            }
            window.setCustomColor = setCustomColor;

            /**
             * Background color of the rendered image
             * @param {color} color Anything that can be pares to a color by THREE.color()
             */
            function setBackgroundColor(color) {
                renderer.setClearColor(color);
                renderCall();
            }
            window.setBackgroundColor = setBackgroundColor;

            /**
             * Enable the slice view (cutting planes).
             * @param {string} type Which slice/orientation, can be "x", "y", "z"
             */
            function enableSlice(type) {
                hideSliceAndIsoSlider();
                showSliceSlider();
                hideRotationCamSlider();

                // Disable rotation and pan
                controls.enableRotate = false;
                controls.enablePan = false;
                console.log('Controls:', controls);

                // TODO: the quaternions are not really justified so far. Better solution?
                if (type == 'x') {
                    setSliceSliderRange(worldDimensions[0]);
                    setCamera(90);
                    /*
                    camera.position.set(cameraDist, controls.target.y, controls.target.z);
                    camera.quaternion.set(0.5, 0.5, 0.5, 0.5);*/
                } else if (type == 'y') {
                    setSliceSliderRange(worldDimensions[1]);
                    camera.position.set(controls.target.x, cameraDist, controls.target.z);
                    camera.quaternion.set(0, 1 / Math.sqrt(2), 1 / Math.sqrt(2), 0);
                } else {
                    setSliceSliderRange(worldDimensions[2]);
                    setCamera(0);
                    /*
                    camera.position.set(controls.target.x, controls.target.y, cameraDist);
                    camera.quaternion.set(0, 0, 0, 1);*/
                }
                material.uniforms['u_renderstyle'].value = 2;
                renderCall();
            }
            window.enableSlice = enableSlice;

            /**
             * Originally, reloading and loading behaved differently. However,
             * this function is the one called from the GUI (whereas loadTexture()
             * is used only within the module)
             */
            function reloadTexture() {
                loadTexture();
            }
            window.reloadTexture = reloadTexture;
