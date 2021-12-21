import * as THREE from './includes/build/three.module.js';
import { OrbitControls } from './includes/examples/jsm/controls/OrbitControls.js';
import { TrackballControls } from './includes/examples/jsm/controls/TrackballControls.js';
import { VolumeRenderShader1 } from './includes/examples/jsm/shaders/VolumeShader.js';
import { WEBGL } from './includes/examples/jsm/WebGL.js';
import { RemoteDVRConfig } from './RemoteDVRConfig.js';

export class RemoteDVR {
    configUrl: string;
    webglMode: number;
    canvasHolder: HTMLElement;
    dataUrl: string;
    samplingRate: number;
    useByte: boolean;
    downscale: number;
    showFps: boolean;
    refreshRate: number;
    showReloadButtonCallback: () => void;
    hideReloadButtonCallback: () => void;
    addChannelsToGuiCallback: (channels: any) => void;
    addLoadingBarsToGuiCallback: (val: any) => void;
    setLoadingStatusCallback: () => void;
    addScreenshotCallback: (imageData: any) => void;
    loadingFinishedCallback: () => void;
    showRotationCamSliderCallback: () => void;
    showIsoSliderCallback: () => void;
    hideSliceAndIsoSliderCallback: () => void;
    setSliceSliderRange: (range: number) => void;
    cameraDist: number;
    allowPan: boolean;
    context: any;
    renderer: any;
    scene: any;
    camera: any;
    controls: any;
    material: any;
    cmtextures: any;
    texture: any;
    canvas: any;
    renderer2: any;
    scene2: any;
    camera2: any;
    stats: any;
    images: any;
    smallestOffset: number[];
    numImages: number;
    numImagesPerChannel: { [key: string]: number };
    channelToIndex: { [key: string]: number };
    numChannels: number;
    numChannelsGPU: number;
    loadedImageVersions: any[];
    worldDimensions: number[];
    imageChannels: any[];
    worldScale: number[];
    noTextureLoaded: boolean;
    autoScreenshot: boolean;
    autoLoad: boolean;
    useSampler3D: boolean;
    sampler2DGridX: number;
    sampler2DGridY: number;
    insetHolder: HTMLElement;

    constructor(config: RemoteDVRConfig) {
        // Check availability of WebGL 2.0. We prefer 2.0 since WebGL 1.0 does
        // not know 3D textures.
        this.webglMode = WEBGL.isWebGL2Available() ? 2 : WEBGL.isWebGLAvailable() ? 1 : 0;
        console.log('WebGL available? ', this.webglMode);
        console.log('Config:', config);
        this.canvasHolder = config.canvasHolder;
        this.insetHolder = config.insetHolder;
        this.configUrl = config.configUrl;
        this.dataUrl = config.dataUrl;
        this.samplingRate = config.samplingRate;
        this.useByte = config.useByte;
        this.downscale = config.downscale;
        this.showFps = config.showFps;
        this.refreshRate = config.refreshRate;
        this.showReloadButtonCallback = config.showReloadButtonCallback;
        this.hideReloadButtonCallback = config.hideReloadButtonCallback;
        this.addChannelsToGuiCallback = config.addChannelsToGuiCallback;
        this.addLoadingBarsToGuiCallback = config.addLoadingBarsToGuiCallback;
        this.setLoadingStatusCallback = config.setLoadingStatusCallback;
        this.addScreenshotCallback = config.addScreenshotCallback;
        this.loadingFinishedCallback = config.loadingFinishedCallback;
        this.showRotationCamSliderCallback = config.showRotationCamSliderCallback;
        this.showIsoSliderCallback = config.showIsoSliderCallback;
        this.hideSliceAndIsoSliderCallback = config.hideSliceAndIsoSliderCallback;
        this.setSliceSliderRange = config.setSliceSliderRange;
        this.cameraDist = config.cameraDist;
        this.allowPan = config.allowPan;

        // The webGL elements
        this.context = null;
        this.renderer = null;
        this.scene = null;
        this.camera = null;
        this.controls = null;
        this.material = null;
        this.cmtextures = null;
        this.texture = null;
        this.canvas = null;
        this.renderer2 = null;
        this.scene2 = null;
        this.camera2 = null;
        this.stats = null;

        // Most image information are stored in variable "images". Besides that we created some
        // helpers that store advanced information and relations between images and channels.
        // Note, a channel must be filled by at least one image, but also multiple images could be
        // used to create a stitched view on the data. The world dimension is derived from the
        // maximum image size and the maximum image offset.
        this.images; // Holds metadata for all images. This is basically a copy of the config JSON.
        this.smallestOffset = [0, 0, 0]; // We have to normalize by the smallest offset in order to start world space at 0/0/0
        this.numImages = 1; // The total number of images
        this.numImagesPerChannel = {}; // Not needed so far, but potentially to know when a channel is fully updated
        this.channelToIndex = {}; // Provides the order (= a numeric index) for each channel name
        this.numChannels = 1; // The number of channels provided by the data, in [1,4].
        this.numChannelsGPU = 1; // Like above, but considers limits of WebGL. E.g. there can't be 2 - we would use 3 and fill up with zeros.
        this.loadedImageVersions = []; // Array of timestamps of currently loaded (=visible) data
        this.worldDimensions = [0, 0, 0]; // Number of elements per axis
        this.imageChannels = []; // For each image: channel it belongs to (like a reverse index)
        this.worldScale = [1, 1, 1]; // Voxel spacing for x, y, z dimensions

        this.noTextureLoaded = true; // Just to know if we have successfully loaded anything
        this.autoScreenshot = true; // If true, a screenshot is taken just before a new texture is loaded
        this.autoLoad = false; // If true, new datasets are loaded automatically
        this.useSampler3D = this.webglMode == 2; // If webgl2, use sampler3d; else we must use the workaround with a large 2D texture
        this.sampler2DGridX = 1; // If we use 2D textures, we place the textures in a grid. That's the number of images along x
        this.sampler2DGridY = 1; // If we use 2D textures, we place the textures in a grid. That's the number of images along y

        // Start everything
        if (this.webglMode === 0) {
            alert('Your browser does not support WebGL');
        } else {
            this.init();
        }
    }
    /**
     * This starts the graphics engine and triggers all loading processes
     */
    init() {
        // Create the THREE.js basics
        this.scene = new THREE.Scene();
        this.canvas = document.createElement('canvas');
        this.context = this.canvas.getContext(this.webglMode == 2 ? 'webgl2' : 'webgl1', { alpha: false, antialias: false });

        this.renderer = new THREE.WebGLRenderer({
            canvas: this.canvas,
            context: this.context,
            //preserveDrawingBuffer: true, // Seems important for screenshots
            //powerPreference: "high-performance"
        });
        this.renderer.setClearColor(0x282828); // Background color
        this.renderer.setPixelRatio(window.devicePixelRatio); // High DPI screen?
        this.renderer.setSize(this.canvasHolder.clientWidth, this.canvasHolder.clientHeight);
        this.canvasHolder.appendChild(this.renderer.domElement);
        if (this.showFps) {
            // TODO find/import a version of stats and call constructor here
            this.stats = null;
            this.stats.showPanel(0); // 0: fps, 1: ms, 2: mb, 3+: custom
            document.body.appendChild(this.stats.dom);
        }
        // Create orthographics camera. Perspective won't work with raycasting. (Could be done, somehow, but...)
        let h = 1024; // Height of the view, which is sort of the "zoom level". TODO: maybe update it after data loading?
        let aspect = this.canvasHolder.clientWidth / this.canvasHolder.clientHeight;
        this.camera = new THREE.OrthographicCamera((-h * aspect) / 2, (h * aspect) / 2, h / 2, -h / 2, 0, 99999999);
        // The camera must have a distance large enough from the data (e.g. 5000), otherwise annoying clipping can occur.
        this.camera.position.set(0, 0, this.cameraDist);
        this.camera.up.set(0, 1, 0);
        this.initInset();

        // Create . The target will be updated once we know the data size.
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.addEventListener('change', this.renderCall.bind(this));
        this.controls.target.set(64, 64, 128);
        this.controls.minZoom = 0.1;
        this.controls.maxZoom = 100;
        this.controls.enablePan = this.allowPan;
        this.controls.update();

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
        this.observeExternalDataSource();
        window.addEventListener('resize', this.onWindowResize.bind(this), false);
        this.renderCall();
    }

    /**
     * Creates a second view showing orientation/axes
     */
    initInset() {
        this.renderer2 = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        this.renderer2.setClearColor(0xf0f0f0, 0); // Transparent background
        this.renderer2.setSize(this.insetHolder.offsetWidth, this.insetHolder.offsetHeight);
        this.insetHolder.appendChild(this.renderer2.domElement);

        this.scene2 = new THREE.Scene();
        // Orthographic camera confused me/didn't work (wrong frustum?).
        // However, perspective is not a problem here.
        //camera2 = new THREE.OrthographicCamera( -1, 1, 1, -1, 0.1, 1000 );
        this.camera2 = new THREE.PerspectiveCamera(50, this.insetHolder.offsetWidth / this.insetHolder.offsetHeight, 0.1, 1000);
        this.camera2.up = this.camera.up;

        // Add axes and manually change their color
        let axes = new THREE.AxesHelper(1);
        let colors = (axes as any).geometry.attributes.color;
        colors.setXYZ(0, 1.0, 0.1, 0.1); // index, R, G, B
        colors.setXYZ(1, 1.0, 0.1, 0.1); // red
        colors.setXYZ(2, 0.2, 0.8, 0.1);
        colors.setXYZ(3, 0.2, 0.8, 0.1); // green
        colors.setXYZ(4, 0.1, 0.4, 1);
        colors.setXYZ(5, 0.1, 0.4, 1); // blue
        (axes as any).material.linewidth = 2;
        this.scene2.add(axes);
    }

    /**
     * The constant observation of our JSON config file in order to see if data has changed.
     * If data has changed, this function will trigger the reloading process
     */
    observeExternalDataSource() {
        this.fetchJSONFile(
            this.configUrl + '?' + Math.random(), // Force to load new; avoid caching
            (data: { images: string | any[]; pixelsize: number[] }) => {
                if (this.loadedImageVersions.length === 0) {
                    this.numImages = data.images.length;
                    this.numChannels = 0;
                    let largestDim = [0, 0, 0];
                    this.smallestOffset = [99999, 99999, 99999];
                    this.worldScale = data.pixelsize;

                    for (let i = 0; i < data.images.length; i++) {
                        let img = data.images[i]; // less typing...
                        let wavelength: string = img.wavelength;
                        // First, remember number of images per channel
                        if (this.numImagesPerChannel[wavelength] === undefined) {
                            this.imageChannels.push(wavelength);
                            this.numImagesPerChannel[wavelength] = 1;
                            this.channelToIndex[wavelength] = this.imageChannels.length - 1;
                            this.numChannels += 1;
                        } else {
                            this.numImagesPerChannel[wavelength] += 1;
                        }
                        this.smallestOffset = [Math.min(img.offset[0], this.smallestOffset[0]), Math.min(img.offset[1], this.smallestOffset[1]), Math.min(img.offset[2], this.smallestOffset[2])];
                    }
                    for (let i = 0; i < data.images.length; i++) {
                        let img = data.images[i]; // less typing...

                        let imageRange = [img.datasize[0] + Math.ceil((img.offset[0] - this.smallestOffset[0]) / this.worldScale[0]), img.datasize[1] + Math.ceil((img.offset[1] - this.smallestOffset[1]) / this.worldScale[1]), img.datasize[2] + Math.ceil((img.offset[2] - this.smallestOffset[2]) / this.worldScale[2])];
                        console.log('Image range of image', i, 'is', imageRange);
                        largestDim[0] = Math.max(largestDim[0], imageRange[0]);
                        largestDim[1] = Math.max(largestDim[1], imageRange[1]);
                        largestDim[2] = Math.max(largestDim[2], imageRange[2]);
                        console.log('Image range dim', largestDim);
                    }

                    // Just create some array structures. We fill in proper values later
                    for (let i = 0; i < this.numImages; i++) {
                        this.loadedImageVersions.push('');
                    }
                    this.worldDimensions = largestDim;
                    this.initTexture();
                }

                console.log('Checked the config file');

                this.images = data.images;

                for (let i = 0; i < this.images.length; i++) {
                    if (this.loadedImageVersions[i] !== this.images[i].timestamp) {
                        console.log('Something has changed. Update now (or show reload button)');
                        if (this.autoLoad || this.loadedImageVersions[i] == '') {
                            this.loadTexture();
                        } else {
                            this.showReloadButtonCallback();
                        }
                    }
                }
                // Check again in 3 seconds
                // TODO: Control reloads from outside
                setTimeout(this.observeExternalDataSource.bind(this), this.refreshRate);
            },
            this.couldNotFindConfig
        );
    }

    /**
     * A vague message that something went somehow wrong.
     */
    couldNotFindConfig() {
        alert('Error! Could not access the config file. Is the URL correct? ' + this.configUrl);
    }

    /**
     * We create the initial texture. We can do this once we know the size of the data.
     */
    initTexture() {
        let x = Math.floor(this.worldDimensions[0] / this.downscale);
        let y = Math.floor(this.worldDimensions[1] / this.downscale);
        let z = Math.floor(this.worldDimensions[2] / this.downscale); // usually z is smaller, thus we only scale x/y
        let xScale = this.worldScale[0] * this.downscale;
        let yScale = this.worldScale[1] * this.downscale;
        let zScale = this.worldScale[2] * this.downscale;

        // THREE.js/WebGL seems to be quite restriced regarding data types and texture layout.
        // First, it is unable to use any 2 byte type. Hence we have to use either ubyte or float32.
        // Second, the number of channels can only be 1, 3, or 4 (Luminance/Red, RGB, RGBA) for
        // bytes or 1 and 4 for float32. Hence we consider various cases:

        this.numChannelsGPU = this.numChannels; // Basic assumption: one texture channel per data channel. However...
        if (this.numChannels == 2) {
            this.numChannelsGPU = 3; // ... nope, there is no two-channel-GPU format, use 3!
        }

        if (this.numChannelsGPU == 3 && !this.useByte) {
            this.numChannelsGPU = 4; // ... hmm, also no three channels for float
        }

        let dataArray = null;
        let numTotal = x * y * z * this.numChannelsGPU;
        let maxTexSize = this.renderer.capabilities.maxTextureSize;
        console.log('Using sampler 3D? ', this.useSampler3D);
        console.log('Maximum texture size of this device: ', maxTexSize);

        if (!this.useSampler3D) {
            this.sampler2DGridX = Math.floor(maxTexSize / x);
            this.sampler2DGridY = Math.ceil(z / this.sampler2DGridX);
            if (this.sampler2DGridY * y > maxTexSize) {
                alert('The 2D texture is too large for this graphics card! Try downsampling.');
            }
            numTotal = this.sampler2DGridX * x * this.sampler2DGridY * y * this.numChannelsGPU;
        } else {
            if (x > maxTexSize || y > maxTexSize || z > maxTexSize) {
                alert('The 3D texture is too large for this graphics card! Try downsampling.');
            }
        }

        if (this.useByte) {
            dataArray = new Uint8Array(numTotal);
        } else {
            dataArray = new Float32Array(numTotal);
        }
        dataArray.fill(0); // For now, it's all black

        if (this.useSampler3D) {
            this.texture = new THREE.DataTexture3D(dataArray, x, y, z);
        } else {
            this.texture = new THREE.DataTexture(dataArray, x * this.sampler2DGridX, y * this.sampler2DGridY);
            console.log('Max texture size is', maxTexSize);
            console.log('Hence, use a grid of ', this.sampler2DGridX, this.sampler2DGridY);
        }

        if (this.useByte) {
            this.texture.type = THREE.UnsignedByteType;
        } else {
            this.texture.type = THREE.FloatType;
            //this.texture.format = THREE.RedFormat; // TODO: maybe float single channel must be RedFormat
        }
        if (this.numChannelsGPU == 1) {
            this.texture.format = THREE.LuminanceFormat;
        } else if (this.numChannelsGPU == 3) {
            this.texture.format = THREE.RGBFormat;
        } else {
            this.texture.format = THREE.RGBAFormat;
        }

        this.texture.minFilter = this.texture.magFilter = THREE.LinearFilter;
        // Alternative (but ugly and no meaningful speed gain):
        //this.texture.minFilter = this.texture.magFilter = THREE.NearestFilter;
        // Not too sure about the following one or if alternatives would be better.
        this.texture.unpackAlignment = 1;

        // Colormap textures. Any number could be added (however, also the GUI must be updated then).
        this.cmtextures = {
            viridis: new (THREE.TextureLoader() as any).load('src/includes/examples/textures/cm_viridis.png', this.render.bind(this)),
            gray: new (THREE.TextureLoader() as any).load('src/includes/examples/textures/cm_gray.png', this.render.bind(this)),
            gray_rev: new (THREE.TextureLoader() as any).load('src/includes/examples/textures/cm_gray_rev.png', this.render.bind(this)),
            hot_iron: new (THREE.TextureLoader() as any).load('src/includes/examples/textures/cm_hot_iron.png', this.render.bind(this)),
        };

        // Material and uniforms
        let shader = VolumeRenderShader1;
        let uniforms: any = THREE.UniformsUtils.clone(shader.uniforms);

        // Normalizing by the smalles dimension avoids unnecessary sampling steps
        let minDim = Math.min(xScale, yScale, zScale);
        let volX = (x * xScale) / minDim;
        let volY = (y * yScale) / minDim;
        let volZ = (z * zScale) / minDim;

        // Now update these uniforms about which we have learned something new.
        uniforms['u_data'].value = this.texture;
        uniforms['u_samplingRate'].value = this.samplingRate;
        uniforms['u_size'].value.set(volX, volY, volZ);
        uniforms['u_grid2D'].value.set(this.sampler2DGridX, this.sampler2DGridY);
        uniforms['u_numSlices'].value.set(x, y, z);
        uniforms['u_cmdata_0'].value = this.cmtextures['gray'];
        uniforms['u_cmdata_1'].value = this.cmtextures['gray'];
        uniforms['u_cmdata_2'].value = this.cmtextures['gray'];
        uniforms['u_cmdata_3'].value = this.cmtextures['gray'];
        for (let i = 0; i < this.numChannels; i++) uniforms['u_used_' + i].value = 1;
        console.log('Initial state of uniforms:', uniforms);

        // Prepare uniforms and shaders
        this.material = new THREE.ShaderMaterial({
            uniforms: uniforms,
            vertexShader: shader.vertexShader,
            fragmentShader: shader.getFragmentShader(this.useSampler3D, this.worldDimensions[2]),
            side: THREE.BackSide, // The volume shader uses the backface as its "reference point"
        });

        // A box with the size of the data. We will use its walls as canvas for rendering.
        let geometry = new THREE.BoxBufferGeometry(volX, volY, volZ);
        console.log(geometry);
        (geometry as any).translate(volX / 2, volY / 2, volZ / 2); // Or plus -0.5 per component, as in example?
        let mesh = new THREE.Mesh(geometry, this.material);

        // Make the controls (camera) look at the right spot.
        this.controls.target.set(volX / 2, volY / 2, volZ / 2);
        this.controls.update();
        this.scene.add(mesh);
        this.renderCall();
        this.addChannelsToGuiCallback(this.imageChannels);
        this.addLoadingBarsToGuiCallback(this.numImages);
    }

    /**
     * Transforms x/y/z coordinates to x/y coordinates of a new texture in which all
     * layers are placed next to each other in a grid
     * @param {int} x X coordinate in 3D texture
     * @param {int} y Y coordinate in 3D texture
     * @param {int} z Z coordinate in 3D texture
     */
    moveTo2DSamplerPosition(x: number, y: number, z: number) {
        let offsetX = (z % this.sampler2DGridX) * Math.floor(this.worldDimensions[0] / this.downscale);
        let offsetY = Math.floor(z / this.sampler2DGridX) * Math.floor(this.worldDimensions[1] / this.downscale);
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
    handleTextureData(data: Iterable<number>, parameters: { index?: any; channel?: any; images?: any; setLoadingStatus?: any; smallestOffset?: any; worldScale?: any; worldDimensions?: any; downscale?: any; useSampler3D?: any; sampler2DGridX?: any; sampler2DGridY?: any; useByte?: any; moveTo2DSamplerPosition?: any; texture?: any; numChannelsGPU?: any; loadingFinished?: any; renderCall?: any }) {
        console.log('Parameters', parameters);
        console.log('data', data);
        // Get information/links from "this" (the context)
        let index = parameters.index;
        let channel = parameters.channel;
        let img = parameters.images[index];
        console.log('Received new texture data for image', index, 'channel', img.wavelength);
        parameters.setLoadingStatus(index, 95, 'Create texture');

        // The data always arrives as Uint16
        let array = new Uint16Array(data);

        // Find out the max, so we can normalize
        let maxVal = 0;
        for (let i = 0; i < array.length; i++) {
            maxVal = Math.max(array[i], maxVal);
        }
        // But limit the normalization to a factor of a maximum of 256. Otherwise "near black"
        // (empty) images would become super bright.
        maxVal = Math.max(maxVal, 255);
        console.log('Normalizing to ', maxVal);

        console.time('Timer for updating texture:');

        let offsetX = Math.round((img.offset[0] - parameters.smallestOffset[0]) / parameters.worldScale[0]);
        let offsetY = Math.round((img.offset[1] - parameters.smallestOffset[1]) / parameters.worldScale[1]);
        let offsetZ = Math.round((img.offset[2] - parameters.smallestOffset[2]) / parameters.worldScale[2]);
        console.log('Place image at offset', offsetX, offsetY, offsetZ);
        let flipX = img.flipping[0];
        let flipY = img.flipping[1];
        let flipZ = img.flipping[2];

        // The data copy process. The last case is the easiest one. I kept in separately in order
        // to copy data at highest speed.
        //if(offsetX !== 0 || offsetY !== 0 || offsetZ !== 0 || flipX || flipY || flipZ || !parameters.useSampler3D) {
        console.log('Handle images. Offset: ', offsetX, offsetY, offsetZ, ', flips:', flipX, flipY, flipZ);
        let numX = Math.floor(parameters.worldDimensions[0] / parameters.downscale);
        let numXOrig = img.datasize[0];
        let numXY = Math.floor(parameters.worldDimensions[1] / parameters.downscale) * numX;
        let numXYOrig = img.datasize[1] * numXOrig;
        if (!parameters.useSampler3D) {
            numX = parameters.sampler2DGridX * Math.floor(parameters.worldDimensions[0] / parameters.downscale);
            numXY = parameters.sampler2DGridY * numX * Math.floor(parameters.worldDimensions[1] / parameters.downscale); // not needed in that case
        }

        let toX, toY, toZ, val;
        console.log('Image datasize', img.datasize);
        // Load the data and normalize to [0,1]. If texture uses bytes, convert to [0,255].
        // This loop runs in data (origin) space and puts the value to the respective position in the world
        // Note: it is way faster do let x be fastest changing index!
        for (let z = 0; z < img.datasize[2]; z++) {
            for (let y = 0; y < img.datasize[1]; y++) {
                for (let x = 0; x < img.datasize[0]; x++) {
                    // In case we allow downsampling, skip everything except every n^th
                    if (parameters.downscale > 1) {
                        if (x % parameters.downscale !== 0 || y % parameters.downscale !== 0 || z % parameters.downscale !== 0) {
                            continue;
                        }
                    }

                    // Reading the texture is easy
                    val = array[x + y * numXOrig + z * numXYOrig] / maxVal;
                    if (parameters.useByte) {
                        // TODO normalization?
                    }
                    val = Math.floor(val * 255);
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
                    if (toX < 0 || toY < 0 || toZ < 0 || toX >= parameters.worldDimensions[0] || toY >= parameters.worldDimensions[1] || toZ >= parameters.worldDimensions[2]) {
                        continue; // Out of bounds
                    }

                    // Eventually - and not before - we move to scaled space
                    if (parameters.downscale > 1) {
                        toX = Math.floor(toX / parameters.downscale);
                        toY = Math.floor(toY / parameters.downscale);
                        toZ = Math.floor(toZ / parameters.downscale);
                    }

                    // In case we use 2D sampler, the position must be changed. In parameters mode, we
                    // don't have a third dimension but we store the images in a 2D grid (e.g.
                    // we have one big texture that hold like 32 * 12 slices in a grid layout)
                    if (!parameters.useSampler3D) {
                        let xy2D = parameters.moveTo2DSamplerPosition(toX, toY, toZ);
                        toX = xy2D[0];
                        toY = xy2D[1];
                        toZ = 0;
                    }
                    parameters.texture.image.data[(toX + toY * numX + toZ * numXY) * parameters.numChannelsGPU + channel] = val;
                }
            }
        }

        console.timeEnd('Timer for updating texture:');

        console.log('Updated texture:', parameters.texture);
        parameters.loadingFinished(index);
        parameters.texture.needsUpdate = true;
        parameters.renderCall();
    }

    /**
     * Compares the loaded data with the available data. If we are outdated,
     * show the reload button.
     */
    checkIfShowReloadButton() {
        let hide = true;
        for (let i = 0; i < this.images.length; i++) {
            if (this.loadedImageVersions[i] !== this.images[i].timestamp) {
                console.log('Image ', i, 'is not loaded in its most recent version');
                hide = false;
            }
        }
        if (hide) {
            this.hideReloadButtonCallback();
        }
    }

    /**
     * Triggers the loading process of all outdated textures. This one is called either
     * automatically or manually be the reload button (depends on the settings).
     */
    loadTexture() {
        for (let i = 0; i < this.images.length; i++) {
            if (this.loadedImageVersions[i] !== this.images[i].timestamp) {
                console.log('Reloading image', i, ', which belongs to channel', this.images[i].wavelength);
                if (this.autoScreenshot) this.takeScreenshot();
                this.loadedImageVersions[i] = this.images[i].timestamp;
                let loader = new (THREE.FileLoader() as any)();
                loader.setResponseType('arraybuffer');
                // Note, we replace (the first occurence of) "#" by the user-defined data URL
                let url = this.images[i].url.replace('#', this.dataUrl) + '?' + Math.random(); // Random string to prevent caching

                // Since the callback allows only one parameter, we define a new
                // context for the callback that contains further information
                // TODO: Parameter as class
                let parameters: { [key: string]: any } = {};
                parameters.images = this.images;
                parameters.index = i;
                parameters.texture = this.texture;
                parameters.worldDimensions = this.worldDimensions;
                parameters.worldScale = this.worldScale;
                parameters.sampler2DGridX = this.sampler2DGridX;
                parameters.sampler2DGridY = this.sampler2DGridY;
                parameters.moveTo2DSamplerPosition = this.moveTo2DSamplerPosition;
                parameters.renderCall = this.renderCall.bind(this);
                parameters.loadingFinished = this.loadingFinishedCallback;
                parameters.channel = this.channelToIndex[this.images[i].wavelength];
                parameters.setLoadingStatus = this.setLoadingStatusCallback;
                parameters.downscale = this.downscale;
                parameters.smallestOffset = this.smallestOffset;
                parameters.numChannelsGPU = this.numChannelsGPU;

                loader.load(
                    url,
                    (data: any) => this.handleTextureData(data, parameters),
                    (value: any) => this.loadingStatus(value, parameters)
                );
            }
        }

        // Now -- at least after the triggered processes have finished -- we can be sure
        // to have at least one texture loaded.
        this.noTextureLoaded = false;

        // We can disable the reload button now (if nothing else is outdated)
        this.checkIfShowReloadButton();
    }

    /**
     * Sets the loading bars according to the status. However, the function stops at
     * 95% because afterwards we have to update the texture which takes some time and
     * will FREEZE the screen (hence, no updates of the status bar possible).
     * Of course we could just display any percentage, but 95% sounds optimistic.
     * @param {Object} value The THREE.js progress object
     * @param {int} channel The channel for which we should update the status bar
     */
    loadingStatus(value: { lengthComputable: any; loaded: number; total: number }, parameters: { setLoadingStatus?: any; index?: any }) {
        if (value.lengthComputable) {
            let percentage = Math.round((95 * value.loaded) / value.total);
            parameters.setLoadingStatus(parameters.index, percentage, 'Loading');
        }
    }

    /**
     * Handler for resizing event. Maintains correct camera FOV.
     */
    onWindowResize() {
        console.log('Resize');
        let canvasList = ['mainCanvasHolder'];
        for (let i = 0; i < canvasList.length; i++) {
            let canvas = document.getElementById(canvasList[i]);
            this.renderer.setSize(canvas.clientWidth, canvas.clientHeight);
            let aspect = canvas.clientWidth / canvas.clientHeight;
            let frustumHeight = this.camera.top - this.camera.bottom;
            this.camera.left = (-frustumHeight * aspect) / 2;
            this.camera.right = (frustumHeight * aspect) / 2;
            this.camera.updateProjectionMatrix();
        }
        this.renderCall();
    }

    /**
     * The render loop
     */
    render() {
        this.showFps = false;
        if (this.showFps) {
            this.stats.begin();
        }

        this.renderer.render(this.scene, this.camera);

        // Update the axes view to the current camera settings
        this.camera2.position.copy(this.camera.position);
        this.camera2.position.sub(this.controls.target);
        this.camera2.position.setLength(2);
        this.camera2.lookAt(this.scene2.position);
        this.renderer2.render(this.scene2, this.camera2);

        if (this.showFps) {
            this.stats.end();
        }
        //requestAnimationFrame( render ); // Alternative: loop, rendering all the time
    }

    /**
     * This one is called whenever something in the this.scene is changed. By this approach,
     * we only re-render the scene on demand (instead of permanently).
     */
    renderCall() {
        console.log('Render function', this.render);
        requestAnimationFrame(this.render.bind(this));
    }

    /**
     * Get JSON file and trigger further processing.
     * @param {string} url Address of the file. Must be provided by http, not local file.
     * @param {function} callbackSuccess Function to receive the JSON data.
     * @param {function} callbackFail Function to say sorry in case this failed.
     */
    fetchJSONFile(url: string | URL, callbackSuccess: { (data: any): void; (arg0: any): void }, callbackFail: { (): void; (this: XMLHttpRequest, ev: ProgressEvent<EventTarget>): any }) {
        let httpRequest = new XMLHttpRequest();
        httpRequest.onreadystatechange = () => {
            if (httpRequest.readyState === 4) {
                if (httpRequest.status === 200) {
                    let data = JSON.parse(httpRequest.responseText);
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
    takeScreenshot() {
        if (this.noTextureLoaded) return;
        this.renderer.render(this.scene, this.camera);
        this.addScreenshotCallback(this.renderer.domElement.toDataURL());
    }

    /**
     * Enables or disables automated screenshot acquisition whenever (just before) a
     * new texture is loaded.
     * @param {boolean} value
     */
    setAutoScreenshot(value: boolean) {
        this.autoScreenshot = value;
    }

    /**
     * Enables or disables automated reloading of new textures once we know there is
     * a new texture available.
     * @param {boolean} value
     */
    setAutoLoad(value: boolean) {
        this.autoLoad = value;
    }

    /**
     * Turns on or off a certain channel
     * @param {boolean} val On (true) or off (false)?
     * @param {int} channel The channel to be toggled
     */
    setChannelVisible(val: any, channel: string) {
        this.material.uniforms['u_used_' + channel].value = val ? 1 : 0;
        this.renderCall();
    }

    /**
     * Sets the colormap. Sends texture to shader and tells shader to use this
     * texture (rather than e.g. a custom color).
     * @param {string} mapName Name of the colormap (as it was loaded before)
     * @param {int} channel Which channel this should be used for (in [0,3])
     */
    setColorMap(mapName: string | number, channel: string) {
        this.material.uniforms['u_colormode_' + channel].value = 0;
        this.material.uniforms['u_cmdata_' + channel].value = this.cmtextures[mapName];
        this.renderCall();
    }

    /**
     * Enable maximum intensity projection.
     */
    enableMIP() {
        this.showRotationCamSliderCallback();
        // Enable rotation and pan (could have been disabled by slice view)
        this.controls.enableRotate = true;
        this.controls.enablePan = this.allowPan;
        this.hideSliceAndIsoSliderCallback();
        this.material.uniforms['u_renderstyle'].value = 0;
        this.renderCall();
    }

    /**
     * Enable average projection.
     */
    enableAverage() {
        this.showRotationCamSliderCallback();
        // Enable rotation and pan (could have been disabled by slice view)
        this.controls.enableRotate = true;
        this.controls.enablePan = this.allowPan;
        this.hideSliceAndIsoSliderCallback();
        this.material.uniforms['u_renderstyle'].value = 3;
        this.renderCall();
    }

    /**
     * Enables the iso surface view in the shader.
     */
    enableIso() {
        this.showRotationCamSliderCallback();
        this.hideSliceAndIsoSliderCallback();
        // Enable rotation and pan (could have been disabled by slice view)
        this.controls.enableRotate = true;
        this.controls.enablePan = this.allowPan;

        this.showIsoSliderCallback();
        this.material.uniforms['u_renderstyle'].value = 1;
        this.renderCall();
    }

    /**
     * Sets a iso value for the iso surface calculation.
     * @param {float} val The iso value
     * @param {int} channel Which channel this should be used for (in [0,3])
     */
    setIsoValue(val: any, channel: string) {
        this.material.uniforms['u_renderthreshold_' + channel].value = val;
        this.renderCall();
    }

    /**
     * Sets a current slice for the slice view. Note, this value will be used
     * to "cut" the value at each time simultaneously. The actually visible
     * plane (e.g. xy, xz, yz) is, then, just a matter of the camera
     * perspective.
     * @param {float} val The position of the plane, in [0, n] with n = width/...
     */
    setSlice(val: number) {
        this.material.uniforms['u_slice'].value = val;
        this.renderCall();
    }

    /**
     * Sets the camera to a certain position around the y axis.
     * @param {float} val The angle (in degree) to rotate
     */
    setCamera(val: number) {
        let angle = (val / 180) * Math.PI;
        let x = Math.cos(angle);
        let z = Math.sin(angle);
        let newPos = new THREE.Vector3(x * this.cameraDist, 0, z * this.cameraDist);
        let center = new THREE.Vector3(this.controls.target.x, this.controls.target.y, this.controls.target.z);
        (newPos as any).add(center);
        this.camera.position.set(newPos.x, newPos.y, newPos.z);
        this.camera.lookAt(new THREE.Vector3(this.controls.target.x, this.controls.target.y, this.controls.target.z));
        this.renderCall();
    }

    /**
     * Sets the lower end for the colormap stretching.
     * @param {float} val The darkest visible intensity (in [0, 1])
     * @param {int} channel Which channel this should be used for (in [0,3])
     */
    setColorMinimum(val: any, channel: string) {
        this.material.uniforms['u_clim_' + channel].value.set(val, this.material.uniforms['u_clim_' + channel].value.y);
        this.renderCall();
    }

    /**
     * Sets the upper end for the colormap stretching.
     * @param {float} val The brightest visible intensity (in [0, 1])
     * @param {int} channel Which channel this should be used for (in [0,3])
     */
    setColorMaximum(val: any, channel: string) {
        this.material.uniforms['u_clim_' + channel].value.set(this.material.uniforms['u_clim_' + channel].value.x, val);
        this.renderCall();
    }

    /**
     * Sets the gamma value used for the colormap.
     * @param {float} val The gamma value (something around 1, like [0.5, 3]; it's not validated or clipped)
     * @param {int} channel Which channel this should be used for (in [0,3])
     */
    setGamma(val: any, channel: string) {
        this.material.uniforms['u_gamma_' + channel].value = val;
        this.renderCall();
    }

    /**
     * Enable custom color as colormap. Values will be mapped to colors
     * interpolated between black and a custom color.
     * @param {int} channel Which channel this should be used for (in [0,3])
     */
    enableCustomColor(channel: string) {
        this.material.uniforms['u_colormode_' + channel].value = 1;
        this.renderCall();
    }

    /**
     * Set a custom color that is used as upper end for the colormapping.
     * The lower end will be black; concrete colors are interpolated from
     * in between.
     * @param {color} color The color value - anything understandable by THREE, e.g. #000000
     * @param {int} channel Which channel this should be used for (in [0,3])
     */
    setCustomColor(color: any, channel: string) {
        let c = new (THREE.Color as any)(color);
        this.material.uniforms['u_customcolor_' + channel].value.set(c.r, c.g, c.b);
        this.renderCall();
    }

    /**
     * Background color of the rendered image
     * @param {color} color Anything that can be pares to a color by THREE.color()
     */
    setBackgroundColor(color: any) {
        this.renderer.setClearColor(color);
        this.renderCall();
    }

    /**
     * Enable the slice view (cutting planes).
     * @param {string} type Which slice/orientation, can be "x", "y", "z"
     */
    enableSlice(type: string) {
        this.hideSliceAndIsoSliderCallback();
        this.showIsoSliderCallback();
        this.showRotationCamSliderCallback();

        // Disable rotation and pan
        this.controls.enableRotate = false;
        this.controls.enablePan = false;
        console.log('Controls:', this.controls);

        // TODO: the quaternions are not really justified so far. Better solution?
        if (type == 'x') {
            this.setSliceSliderRange(this.worldDimensions[0]);
            this.setCamera(90);
            /*
                    camera.position.set(this.cameraDist, this.controls.target.y, this.controls.target.z);
                    camera.quaternion.set(0.5, 0.5, 0.5, 0.5);*/
        } else if (type == 'y') {
            this.setSliceSliderRange(this.worldDimensions[1]);
            this.camera.position.set(this.controls.target.x, this.cameraDist, this.controls.target.z);
            this.camera.quaternion.set(0, 1 / Math.sqrt(2), 1 / Math.sqrt(2), 0);
        } else {
            this.setSliceSliderRange(this.worldDimensions[2]);
            this.setCamera(0);
            /*
                    camera.position.set(this.controls.target.x, this.controls.target.y, this.cameraDist);
                    camera.quaternion.set(0, 0, 0, 1);*/
        }
        this.material.uniforms['u_renderstyle'].value = 2;
        this.renderCall();
    }

    /**
     * Originally, reloading and loading behaved differently. However,
     * this function is the one called from the GUI (whereas loadTexture()
     * is used only within the module)
     */
    reloadTexture() {
        this.loadTexture();
    }
}
