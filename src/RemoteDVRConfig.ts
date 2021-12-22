export class RemoteDVRConfig {
    canvasHolder: HTMLElement;
    insetHolder: HTMLElement;
    configUrl : string;
    dataUrl : string;
    samplingRate = 1;
    useByteInsteadFloat = true;
    downscale = 1;
    showFps = false;
    refreshRate = 3000;
    showReloadButtonCallback: () => void;
    hideReloadButtonCallback: () => void;
    addChannelsToGuiCallback: (channels: any) => void;
    addLoadingBarsToGuiCallback: (numImages: any) => void;
    setLoadingStatusCallback : (index : number, percentage : number, message : string) => void;
    addScreenshotCallback: (imageData: any) => void
    loadingFinishedCallback: () => void;
    showRotationCamSliderCallback: () => void;
    showIsoSliderCallback: () => void;
    hideSliceAndIsoSliderCallback: () => void;
    setSliceSliderRange: (range: number) => void;
    cameraDist = 2500; // Camera must be far away from the data to avoid clipping (=voxel space)
    allowPan = false; // We disable the option to move the geometry away
  }