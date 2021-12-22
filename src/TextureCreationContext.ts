export class TextureCreationContext {
    useByteInsteadFloat : boolean;
    useSampler3D : boolean;
    images : any;
    index : number;
    texture : any;
    worldDimensions : number[];
    worldScale : number[];
    sampler2DGridX : number;
    sampler2DGridY :  number;
    moveTo2DSamplerPosition : (x: number, y: number, z: number) => number[];
    renderCall : () => void;
    loadingFinished : (index: number) => void;
    channel : number;
    setLoadingStatus : (index : number, percentage : number, message : string) => void;
    downscale : number;
    smallestOffset : number[];
    numChannelsGPU : number;
}