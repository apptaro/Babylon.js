﻿module BABYLON {
    /**
	 * The default rendering pipeline can be added to a scene to apply common post processing effects such as anti-aliasing or depth of field.
     * See https://doc.babylonjs.com/how_to/using_default_rendering_pipeline
     */
    export class DefaultRenderingPipeline extends PostProcessRenderPipeline implements IDisposable, IAnimatable {
        private _scene: Scene;
        private _originalCameras:Array<Camera> = [];
        /**
		 * ID of the sharpen post process,
		 */
        readonly SharpenPostProcessId: string = "SharpenPostProcessEffect";
        /**
		 * ID of the pass post process used for bloom,
		 */
        readonly PassPostProcessId: string = "PassPostProcessEffect";
        /**
		 * ID of the highlight post process used for bloom,
		 */
        readonly HighLightsPostProcessId: string = "HighLightsPostProcessEffect";
        /**
		 * ID of the blurX post process used for bloom,
		 */
        readonly BlurXPostProcessId: string = "BlurXPostProcessEffect";
        /**
		 * ID of the blurY post process used for bloom,
		 */
        readonly BlurYPostProcessId: string = "BlurYPostProcessEffect";
        /**
		 * ID of the copy back post process used for bloom,
		 */
        readonly CopyBackPostProcessId: string = "CopyBackPostProcessEffect";
        /**
		 * ID of the image processing post process;
		 */
        readonly ImageProcessingPostProcessId: string = "ImageProcessingPostProcessEffect";
        /**
		 * ID of the Fast Approximate Anti-Aliasing post process;
		 */
        readonly FxaaPostProcessId: string = "FxaaPostProcessEffect";
        /**
		 * ID of the final merge post process;
		 */
        readonly FinalMergePostProcessId: string = "FinalMergePostProcessEffect";
        /**
		 * ID of the chromatic aberration post process,
		 */
        readonly ChromaticAberrationPostProcessId: string = "ChromaticAberrationPostProcessEffect";

        // Post-processes
        /**
		 * Sharpen post process which will apply a sharpen convolution to enhance edges
		 */
        public sharpen: SharpenPostProcess;
        private _sharpenEffect: PostProcessRenderEffect;
        /**
		 * First pass of bloom to capture the original image texture for later use.
		 */
        public pass: PassPostProcess;
        /**
		 * Second pass of bloom used to brighten bright portions of the image.
		 */
        public highlights: HighlightsPostProcess;
        /**
		 * BlurX post process used in coordination with blurY to guassian blur the highlighted image.
		 */
        public blurX: BlurPostProcess;
        /**
		 * BlurY post process used in coordination with blurX to guassian blur the highlighted image.
		 */
        public blurY: BlurPostProcess;
        /**
		 * Final pass run for bloom to copy the resulting bloom texture back to screen.
		 */
        public copyBack: PassPostProcess;
        /**
         * Depth of field effect, applies a blur based on how far away objects are from the focus distance.
         */
        public depthOfField: DepthOfFieldEffect;
        /**
         * The Fast Approximate Anti-Aliasing post process which attemps to remove aliasing from an image.
         */
        public fxaa: FxaaPostProcess;
        /**
         * Image post processing pass used to perform operations such as tone mapping or color grading.
         */
        public imageProcessing: ImageProcessingPostProcess;
        /**
         * Final post process to merge results of all previous passes
         */
        public finalMerge: PassPostProcess;
        /**
		 * Chromatic aberration post process which will shift rgb colors in the image
		 */
        public chromaticAberration: ChromaticAberrationPostProcess;
        private _chromaticAberrationEffect: PostProcessRenderEffect;

        /**
         * Animations which can be used to tweak settings over a period of time
         */
        public animations: Animation[] = [];

        // Values   
        private _sharpenEnabled:boolean = false;    
        private _bloomEnabled: boolean = false;
        private _depthOfFieldEnabled: boolean = false;
        private _depthOfFieldBlurLevel = DepthOfFieldEffectBlurLevel.Low;
        private _fxaaEnabled: boolean = false;
        private _msaaEnabled: boolean = false;
        private _imageProcessingEnabled: boolean = true;
        private _defaultPipelineTextureType: number;
        private _bloomScale: number = 0.6;
        private _chromaticAberrationEnabled:boolean = false;  

        private _buildAllowed = true;

        /**
         * Enable or disable the sharpen process from the pipeline
         */
        public set sharpenEnabled(enabled: boolean) {
            if (this._sharpenEnabled === enabled) {
                return;
            }
            this._sharpenEnabled = enabled;

            this._buildPipeline();
        }

        @serialize()
        public get sharpenEnabled(): boolean {
            return this._sharpenEnabled;
        }


        /**
		 * Specifies the size of the bloom blur kernel, relative to the final output size
		 */
        @serialize()
        public bloomKernel: number = 64;

        /**
		 * Specifies the weight of the bloom in the final rendering
		 */
        @serialize()
        private _bloomWeight: number = 0.15;

        @serialize()
        private _hdr: boolean;

        /**
         * The strength of the bloom.
         */
        public set bloomWeight(value: number) {
            if (this._bloomWeight === value) {
                return;
            }
            this._bloomWeight = value;

            if (this._hdr && this.copyBack) {
                this.copyBack.alphaConstants = new Color4(value, value, value, value);
            }
        }

        @serialize()
        public get bloomWeight(): number {
            return this._bloomWeight;
        }

        /**
         * The scale of the bloom, lower value will provide better performance.
         */
        public set bloomScale(value: number) {
            if (this._bloomScale === value) {
                return;
            }
            this._bloomScale = value;

            this._buildPipeline();
        }

        @serialize()
        public get bloomScale(): number {
            return this._bloomScale;
        }

        /**
         * Enable or disable the bloom from the pipeline
         */
        public set bloomEnabled(enabled: boolean) {
            if (this._bloomEnabled === enabled) {
                return;
            }
            this._bloomEnabled = enabled;

            this._buildPipeline();
        }

        @serialize()
        public get bloomEnabled(): boolean {
            return this._bloomEnabled;
        }

        /**
         * If the depth of field is enabled.
         */
        @serialize()
        public get depthOfFieldEnabled(): boolean {
            return this._depthOfFieldEnabled;
        }   
        
        public set depthOfFieldEnabled(enabled: boolean) {
            if (this._depthOfFieldEnabled === enabled) {
                return;
            }
            this._depthOfFieldEnabled = enabled;
            
            this._buildPipeline();
        }

        /**
         * Blur level of the depth of field effect. (Higher blur will effect performance)
         */
        @serialize()
        public get depthOfFieldBlurLevel(): DepthOfFieldEffectBlurLevel {
            return this._depthOfFieldBlurLevel;
        }   
        
        public set depthOfFieldBlurLevel(value: DepthOfFieldEffectBlurLevel) {
            if (this._depthOfFieldBlurLevel === value) {
                return;
            }
            this._depthOfFieldBlurLevel = value;
            
            // recreate dof and dispose old as this setting is not dynamic
            var depthTexture = this._scene.enableDepthRenderer(this._cameras[0]).getDepthMap();
            var oldDof = this.depthOfField;

            this.depthOfField = new DepthOfFieldEffect(this._scene, depthTexture, this._depthOfFieldBlurLevel, this._defaultPipelineTextureType);
            this.depthOfField.focalLength = oldDof.focalLength;
            this.depthOfField.focusDistance = oldDof.focusDistance;
            this.depthOfField.fStop = oldDof.fStop;
            this.depthOfField.lensSize = oldDof.lensSize;
            
            for (var i = 0; i < this._cameras.length; i++) {
                oldDof.disposeEffects(this._cameras[i]);
            }

            this._buildPipeline();
        }

        /**
         * If the anti aliasing is enabled.
         */
        public set fxaaEnabled(enabled: boolean) {
            if (this._fxaaEnabled === enabled) {
                return;
            }
            this._fxaaEnabled = enabled;

            this._buildPipeline();
        }

        @serialize()
        public get fxaaEnabled(): boolean {
            return this._fxaaEnabled;
        }

        /**
         * If the multisample anti-aliasing is enabled.
         */
        public set msaaEnabled(enabled: boolean) {
            if (this._msaaEnabled === enabled) {
                return;
            }
            this._msaaEnabled = enabled;

            this._buildPipeline();
        }

        @serialize()
        public get msaaEnabled(): boolean {
            return this._msaaEnabled;
        }

        /**
         * If image processing is enabled.
         */
        public set imageProcessingEnabled(enabled: boolean) {
            if (this._imageProcessingEnabled === enabled) {
                return;
            }
            this._imageProcessingEnabled = enabled;

            this._buildPipeline();
        }

        @serialize()
        public get imageProcessingEnabled(): boolean {
            return this._imageProcessingEnabled;
        }

        /**
         * Enable or disable the chromaticAberration process from the pipeline
         */
        public set chromaticAberrationEnabled(enabled: boolean) {
            if (this._chromaticAberrationEnabled === enabled) {
                return;
            }
            this._chromaticAberrationEnabled = enabled;

            this._buildPipeline();
        }

        @serialize()
        public get chromaticAberrationEnabled(): boolean {
            return this._chromaticAberrationEnabled;
        }

        /**
         * @constructor
         * @param {string} name - The rendering pipeline name
         * @param {BABYLON.Scene} scene - The scene linked to this pipeline
         * @param {any} ratio - The size of the postprocesses (0.5 means that your postprocess will have a width = canvas.width 0.5 and a height = canvas.height 0.5)
         * @param {BABYLON.Camera[]} cameras - The array of cameras that the rendering pipeline will be attached to
         * @param {boolean} automaticBuild - if false, you will have to manually call prepare() to update the pipeline
         */
        constructor(name: string, hdr: boolean, scene: Scene, cameras?: Camera[], automaticBuild = true) {
            super(scene.getEngine(), name);
            this._cameras = cameras ||  [];
            this._originalCameras = this._cameras.slice();

            this._buildAllowed = automaticBuild;

            // Initialize
            this._scene = scene;
            var caps = this._scene.getEngine().getCaps();
            this._hdr = hdr && (caps.textureHalfFloatRender || caps.textureFloatRender);

            // Misc
            if (this._hdr) {
                if (caps.textureHalfFloatRender) {
                    this._defaultPipelineTextureType = Engine.TEXTURETYPE_HALF_FLOAT;
                }
                else if (caps.textureFloatRender) {
                    this._defaultPipelineTextureType = Engine.TEXTURETYPE_FLOAT;
                }
            } else {
                this._defaultPipelineTextureType = Engine.TEXTURETYPE_UNSIGNED_INT;
            }

            // Attach
            scene.postProcessRenderPipelineManager.addPipeline(this);

            var engine = this._scene.getEngine();
            this.sharpen = new SharpenPostProcess("sharpen", 1.0, null, Texture.BILINEAR_SAMPLINGMODE, engine, false, this._defaultPipelineTextureType);
            this._sharpenEffect = new PostProcessRenderEffect(engine, this.SharpenPostProcessId, () => { return this.sharpen; }, true);

            var depthTexture = this._scene.enableDepthRenderer(this._cameras[0]).getDepthMap();
            this.depthOfField = new DepthOfFieldEffect(this._scene, depthTexture, this._depthOfFieldBlurLevel, this._defaultPipelineTextureType);

            this.chromaticAberration = new ChromaticAberrationPostProcess("ChromaticAberration", engine.getRenderWidth(), engine.getRenderHeight(), 1.0, null, Texture.BILINEAR_SAMPLINGMODE, engine, false, this._defaultPipelineTextureType);
            this._chromaticAberrationEffect = new PostProcessRenderEffect(engine, this.ChromaticAberrationPostProcessId, () => { return this.chromaticAberration; }, true);
            
            this._buildPipeline();
        }

        /**
         * Force the compilation of the entire pipeline.
         */
        public prepare(): void {
            let previousState = this._buildAllowed;
            this._buildAllowed = true;
            this._buildPipeline();
            this._buildAllowed = previousState;
        }

        private _buildPipeline() {
            if (!this._buildAllowed) {
                return;
            }

            var engine = this._scene.getEngine();

            this._disposePostProcesses();
            if (this._cameras !== null) {
                this._scene.postProcessRenderPipelineManager.detachCamerasFromRenderPipeline(this._name, this._cameras);
                // get back cameras to be used to reattach pipeline
                this._cameras = this._originalCameras.slice();
            }
            this._reset();
            
            if (this.fxaaEnabled) {
                this.fxaa = new FxaaPostProcess("fxaa", 1.0, null, Texture.BILINEAR_SAMPLINGMODE, engine, false, this._defaultPipelineTextureType);
                this.addEffect(new PostProcessRenderEffect(engine, this.FxaaPostProcessId, () => { return this.fxaa; }, true));
            }

            if (this.sharpenEnabled) {
                this.addEffect(this._sharpenEffect);
            }

            if (this.depthOfFieldEnabled) {
                this.addEffect(this.depthOfField);
            }

            if (this.bloomEnabled) {
                this.pass = new PassPostProcess("sceneRenderTarget", 1.0, null, Texture.BILINEAR_SAMPLINGMODE, engine, false, this._defaultPipelineTextureType);
                this.addEffect(new PostProcessRenderEffect(engine, this.PassPostProcessId, () => { return this.pass; }, true));

                if (!this._hdr) { // Need to enhance highlights if not using float rendering
                    this.highlights = new HighlightsPostProcess("highlights", this.bloomScale, null, Texture.BILINEAR_SAMPLINGMODE, engine, false, this._defaultPipelineTextureType);
                    this.addEffect(new PostProcessRenderEffect(engine, this.HighLightsPostProcessId, () => { return this.highlights; }, true));
                    this.highlights.autoClear = false;
                    this.highlights.alwaysForcePOT = true;
                }

                this.blurX = new BlurPostProcess("horizontal blur", new Vector2(1.0, 0), 10.0, this.bloomScale, null, Texture.BILINEAR_SAMPLINGMODE, engine, false, this._defaultPipelineTextureType);
                this.addEffect(new PostProcessRenderEffect(engine, this.BlurXPostProcessId, () => { return this.blurX; }, true));
                this.blurX.alwaysForcePOT = true;
                this.blurX.autoClear = false;
                this.blurX.onActivateObservable.add(() => {
                    let dw = this.blurX.width / engine.getRenderWidth(true);
                    this.blurX.kernel = this.bloomKernel * dw;
                });

                this.blurY = new BlurPostProcess("vertical blur", new Vector2(0, 1.0), 10.0, this.bloomScale, null, Texture.BILINEAR_SAMPLINGMODE, engine, false, this._defaultPipelineTextureType);
                this.addEffect(new PostProcessRenderEffect(engine, this.BlurYPostProcessId, () => { return this.blurY; }, true));
                this.blurY.alwaysForcePOT = true;
                this.blurY.autoClear = false;
                this.blurY.onActivateObservable.add(() => {
                    let dh = this.blurY.height / engine.getRenderHeight(true);
                    this.blurY.kernel = this.bloomKernel * dh;
                });

                this.copyBack = new PassPostProcess("bloomBlendBlit", this.bloomScale, null, Texture.BILINEAR_SAMPLINGMODE, engine, false, this._defaultPipelineTextureType);
                this.addEffect(new PostProcessRenderEffect(engine, this.CopyBackPostProcessId, () => { return this.copyBack; }, true));
                this.copyBack.alwaysForcePOT = true;
                if (this._hdr) {
                    this.copyBack.alphaMode = Engine.ALPHA_INTERPOLATE;
                    let w = this.bloomWeight;
                    this.copyBack.alphaConstants = new Color4(w, w, w, w);
                } else {
                    this.copyBack.alphaMode = Engine.ALPHA_SCREENMODE;
                }
                this.copyBack.autoClear = false;
            }

            if (this._imageProcessingEnabled) {
                this.imageProcessing = new ImageProcessingPostProcess("imageProcessing", 1.0, null, Texture.BILINEAR_SAMPLINGMODE, engine, false, this._defaultPipelineTextureType);
                if (this._hdr) {
                    this.addEffect(new PostProcessRenderEffect(engine, this.ImageProcessingPostProcessId, () => { return this.imageProcessing; }, true));
                } else {
                    this._scene.imageProcessingConfiguration.applyByPostProcess = false;
                }
            }

            if (this._hdr && this.imageProcessing) {
                this.finalMerge = this.imageProcessing;
            }
            else {
                this.finalMerge = new PassPostProcess("finalMerge", 1.0, null, Texture.BILINEAR_SAMPLINGMODE, engine, false, this._defaultPipelineTextureType);
                this.addEffect(new PostProcessRenderEffect(engine, this.FinalMergePostProcessId, () => { return this.finalMerge; }, true));

                this.finalMerge.autoClear = !this.bloomEnabled && (!this._hdr || !this.imageProcessing);
            }

            if (this.bloomEnabled) {
                if (this._hdr) { // Share render targets to save memory
                    this.copyBack.shareOutputWith(this.blurX);
                    if (this.imageProcessing) {
                        this.imageProcessing.shareOutputWith(this.pass);
                        this.imageProcessing.autoClear = false;
                    } else {
                        this.finalMerge.shareOutputWith(this.pass);
                    }
                } else {
                    this.finalMerge.shareOutputWith(this.pass);
                }
            }

            if (this.chromaticAberrationEnabled) {
                this.addEffect(this._chromaticAberrationEffect);
            }

            if (this._cameras !== null) {
                this._scene.postProcessRenderPipelineManager.attachCamerasToRenderPipeline(this._name, this._cameras);
            }

            if(this.msaaEnabled){
                if(!this._enableMSAAOnFirstPostProcess()){
                    BABYLON.Tools.Warn("MSAA failed to enable, MSAA is only supported in browsers that support webGL >= 2.0");
                }
            }
        }

        private _disposePostProcesses(disposeNonRecreated = false): void {
            for (var i = 0; i < this._cameras.length; i++) {
                var camera = this._cameras[i];

                if (this.pass) {
                    this.pass.dispose(camera);
                }

                if (this.highlights) {
                    this.highlights.dispose(camera);
                }

                if (this.blurX) {
                    this.blurX.dispose(camera);
                }

                if (this.blurY) {
                    this.blurY.dispose(camera);
                }

                if (this.copyBack) {
                    this.copyBack.dispose(camera);
                }

                if (this.imageProcessing) {
                    this.imageProcessing.dispose(camera);
                }

                if (this.fxaa) {
                    this.fxaa.dispose(camera);
                }

                if (this.finalMerge) {
                    this.finalMerge.dispose(camera);
                }

                // These are created in the constructor and should not be disposed on every pipeline change
                if(disposeNonRecreated){
                    if (this.sharpen) {
                        this.sharpen.dispose(camera);
                    }
    
                    if(this.depthOfField){
                        this.depthOfField.disposeEffects(camera);
                    }
    
                    if(this.chromaticAberration){
                        this.chromaticAberration.dispose(camera);
                    }
                }
            }

            (<any>this.pass) = null;
            (<any>this.highlights) = null;
            (<any>this.blurX) = null;
            (<any>this.blurY) = null;
            (<any>this.copyBack) = null;
            (<any>this.imageProcessing) = null;
            (<any>this.fxaa) = null;
            (<any>this.finalMerge) = null;

            if(disposeNonRecreated){
                (<any>this.sharpen) = null;
                (<any>this.depthOfField) = null;
                (<any>this.chromaticAberration) = null;
            } 
        }

        /**
         * Dispose of the pipeline and stop all post processes
         */
        public dispose(): void {
            this._disposePostProcesses(true);

            this._scene.postProcessRenderPipelineManager.detachCamerasFromRenderPipeline(this._name, this._cameras);

            super.dispose();
        }

        /**
         * Serialize the rendering pipeline (Used when exporting)
         * @returns the serialized object
         */
        public serialize(): any {
            var serializationObject = SerializationHelper.Serialize(this);
            serializationObject.customType = "DefaultRenderingPipeline";

            return serializationObject;
        }

        /**
         * Parse the serialized pipeline
         * @param source Source pipeline.
         * @param scene The scene to load the pipeline to.
         * @param rootUrl The URL of the serialized pipeline.
         * @returns An instantiated pipeline from the serialized object.
         */
        public static Parse(source: any, scene: Scene, rootUrl: string): DefaultRenderingPipeline {
            return SerializationHelper.Parse(() => new DefaultRenderingPipeline(source._name, source._name._hdr, scene), source, scene, rootUrl);
        }
    }
}
