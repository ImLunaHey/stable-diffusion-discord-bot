import { setTimeout as sleep } from 'node:timers/promises';
import { Logger } from './logger';

type PythonError = { detail: string; };
type Online = { status: 'Online' | 'LoadingModel', queue: number, stream: string, task: number };
type Step = { step: number, step_time: number, total_steps: number };
type Output = {
    data: string,
    seed: number,
    path_abs: null
};
type Success = { status: 'succeeded', output: Output[] };
type Failure = { status: 'failed' };
type Finished = Success | Failure;
type ImageResponse = Success | Step | null;

const isFinished = (body: Step | Finished | null): body is Finished => {
    if (!body) return false;
    if ('status' in body) return body.status === 'succeeded';
    return false;
};

const urlToDataUrl = async (url: string) => {
    try {
        const imageUrlData = await fetch(url);
        const buffer = await imageUrlData.arrayBuffer();
        const stringifiedBuffer = Buffer.from(buffer).toString('base64');
        const contentType = imageUrlData.headers.get('content-type');
        return `data:${contentType};base64,${stringifiedBuffer}`;
    } catch { }
};

export type Data = {
    prompt: string;
    seed: number;
    used_random_seed: boolean;
    negative_prompt: string;
    num_outputs: number;
    num_inference_steps: number;
    guidance_scale: number;
    width: number;
    height: number;
    vram_usage_level: string;
    sampler_name: string;
    use_face_correction?: 'GFPGANv1.4' | 'GFPGANv1.3' | undefined;
    use_stable_diffusion_model: string;
    clip_skip: boolean;
    tiling: string;
    use_vae_model: string;
    stream_progress_updates: boolean;
    stream_image_progress: boolean;
    show_only_filtered_image: boolean;
    block_nsfw: boolean;
    output_format: string;
    output_quality: number;
    output_lossless: boolean;
    metadata_output_format: string;
    original_prompt: string;
    active_tags: string[];
    inactive_tags: string[];
    use_upscale: 'RealESRGAN_x4plus' | undefined;
    upscale_amount: number | undefined;
    use_controlnet_model: 'control_v11p_sd15_canny' | undefined;
    session_id: string;
};

const negativePrompts = {
    age: ['teen', 'kid', 'child', 'underage', 'minor', 'children'],
    badWords: ['rape'],
    badQuality: ['cropped', 'worst quality', 'low quality', 'normal quality', 'jpeg artifacts', 'signature', '(((watermark)))', 'username', 'blurry', 'lowres', 'error'],
    badQualityPeople: ['bad anatomy', 'bad hands', 'missing fingers', 'extra digit', 'fewer digits'],
};

export class EasyDiffusion {
    private logger = new Logger({ service: 'easy-diffusion' });
    private controlNetUrl: string | undefined;
    private data: Data;

    constructor(private url: string = 'http://localhost:9000', data: Partial<Data> = {}) {
        const sessionId = `${new Date().getUTCFullYear()}-${new Date()
            .getUTCMonth()
            .toString()
            .padStart(2, '0')}-${new Date().getUTCDate()}`;
        this.data = {
            prompt: data.prompt ?? 'a photograph of an astronaut riding a horse',
            original_prompt: data.original_prompt ?? data.prompt ?? 'a photograph of an astronaut riding a horse',
            seed: data.seed ?? 1458359407,
            used_random_seed: true,
            negative_prompt: [
                ...negativePrompts.age,
                ...negativePrompts.badQuality,
                ...negativePrompts.badWords,
            ].join(', '),
            num_outputs: data.num_outputs ?? 1,
            num_inference_steps: data.num_inference_steps ?? 20,
            guidance_scale: data.guidance_scale ?? 7.5,
            width: data.width ?? 512,
            height: data.height ?? 512,
            vram_usage_level: data.vram_usage_level ?? 'balanced',
            sampler_name: data.sampler_name ?? 'euler_a',
            use_face_correction: data.use_face_correction ?? undefined,
            use_stable_diffusion_model: data.use_stable_diffusion_model ?? 'realisticVisionV13_v13',
            clip_skip: data.clip_skip ?? false,
            tiling: data.tiling ?? 'none',
            use_vae_model: data.use_vae_model ?? 'vae-ft-mse-840000-ema-pruned',
            stream_progress_updates: true,
            stream_image_progress: true,
            show_only_filtered_image: true,
            block_nsfw: true,
            output_format: 'png',
            output_quality: 75,
            output_lossless: false,
            metadata_output_format: 'none',
            active_tags: [],
            inactive_tags: [],
            use_upscale: data.use_upscale ?? undefined,
            upscale_amount: data.upscale_amount ?? undefined,
            use_controlnet_model: data.use_controlnet_model ?? undefined,
            session_id: sessionId,
        } satisfies Partial<Data>;
    }

    useRandomSeed(): EasyDiffusion {
        this.data.seed = parseInt(`${Math.random() * 1_000_000_000}`, 10);
        this.data.used_random_seed = true;
        return this;
    }

    setPrompt(prompt: string): EasyDiffusion {
        this.data.prompt = prompt;
        this.data.original_prompt = prompt;
        return this;
    }

    setSeed(seed: number): EasyDiffusion {
        this.data.seed = seed;
        return this;
    }

    setNegativePrompt(negativePrompt: string): EasyDiffusion {
        this.data.negative_prompt = negativePrompt;
        return this;
    }

    /**
     * Sets the number of output images to be generated in a single operation.
     * Generating multiple images at once can improve efficiency when producing batches.
     *
     * @param numOutputs - The desired number of output images to generate.
     *
     * @example
     * // Generating 5 output images in a single operation
     * const easyDiffusion = new EasyDiffusion();
     * easyDiffusion.setNumOutputs(5);
     * easyDiffusion.render();
     */
    setNumOutputs(numOutputs: number) {
        this.data.num_outputs = numOutputs;
        return this;
    }

    /**
     * Sets the number of iterative inference steps to refine the AI image generation process.
     * Increasing the number of inference steps can lead to more detailed and intricate images.
     *
     * @param numInferenceSteps - The desired number of iterative inference steps.
     * 
     * @example
     * // Generating an image with increased inference steps for more intricate details
     * const easyDiffusion = new EasyDiffusion();
     * easyDiffusion.setNumInferenceSteps(15);
     * easyDiffusion.render();
     */
    setNumInferenceSteps(numInferenceSteps: number): EasyDiffusion {
        this.data.num_inference_steps = numInferenceSteps;
        return this;
    }

    setGuidanceScale(guidanceScale: number): EasyDiffusion {
        this.data.guidance_scale = guidanceScale;
        return this;
    }

    setWidth(width: number): EasyDiffusion {
        this.data.width = width;
        return this;
    }

    setHeight(height: number): EasyDiffusion {
        this.data.height = height;
        return this;
    }

    setVRAMUsageLevel(vramUsageLevel: 'high' | 'balanced' | 'low' | undefined): EasyDiffusion {
        this.data.vram_usage_level = vramUsageLevel ?? 'balanced';
        return this;
    }

    setSampler(name: string): EasyDiffusion {
        this.data.sampler_name = name;
        return this;
    }

    setStableDiffusionModel(model: string): EasyDiffusion {
        this.data.use_stable_diffusion_model = model;
        return this;
    }

    setClipSkip(clipSkip: boolean): EasyDiffusion {
        this.data.clip_skip = clipSkip;
        return this;
    }

    setTiling(tiling: string): EasyDiffusion {
        this.data.tiling = tiling;
        return this;
    }

    setVAEModel(model: string): EasyDiffusion {
        this.data.use_vae_model = model;
        return this;
    }

    setStreamProgressUpdates(streamProgressUpdates: boolean): EasyDiffusion {
        this.data.stream_progress_updates = streamProgressUpdates;
        return this;
    }

    setStreamImageProgress(streamImageProgress: boolean): EasyDiffusion {
        this.data.stream_image_progress = streamImageProgress;
        return this;
    }

    setShowOnlyFilteredImage(showOnlyFilteredImage: boolean): EasyDiffusion {
        this.data.show_only_filtered_image = showOnlyFilteredImage;
        return this;
    }

    setBlockNSFW(blockNSFW: boolean): EasyDiffusion {
        this.data.block_nsfw = blockNSFW;
        return this;
    }

    setOutputFormat(outputFormat: 'png' | 'jpeg'): EasyDiffusion {
        this.data.output_format = outputFormat;
        return this;
    }

    setOutputQuality(outputQuality: number): EasyDiffusion {
        this.data.output_quality = outputQuality;
        return this;
    }

    setOutputLossless(outputLossless: boolean): EasyDiffusion {
        this.data.output_lossless = outputLossless;
        return this;
    }

    setMetadataOutputFormat(metadataOutputFormat: string): EasyDiffusion {
        this.data.metadata_output_format = metadataOutputFormat;
        return this;
    }

    setActiveTags(activeTags: string[]): EasyDiffusion {
        this.data.active_tags = activeTags;
        return this;
    }

    setInactiveTags(inactiveTags: string[]): EasyDiffusion {
        this.data.inactive_tags = inactiveTags;
        return this;
    }

    setSessionId(sessionId: string): EasyDiffusion {
        this.data.session_id = sessionId;
        return this;
    }

    setUseFaceCorrection(faceCorrection: 'GFPGANv1.4' | 'GFPGANv1.3' | undefined): EasyDiffusion {
        this.data.use_face_correction = faceCorrection ?? undefined;
        return this;
    }

    setControlNet(controlNet: 'control_v11p_sd15_canny' | undefined, url: string | undefined): EasyDiffusion {
        this.data.use_controlnet_model = (controlNet && url) ? controlNet : undefined;
        this.controlNetUrl = (controlNet && url) ? url : undefined;
        return this;
    }

    setUpscaleAmount(amount: number | undefined) {
        this.data.upscale_amount = amount ?? undefined;
        this.data.use_upscale = amount ? 'RealESRGAN_x4plus' : undefined;
        return this;
    }

    build() {
        return this.data;
    }

    async render() {
        const settings = this.build();
        const controlImage = this.controlNetUrl ? await urlToDataUrl(this.controlNetUrl) : undefined;
        const body = JSON.stringify({
            ...settings,
            ...(controlImage ? {
                control_image: controlImage,
            } : {}),
            ...(settings.prompt.includes('person') || settings.prompt.includes('people') ? {
                negative_prompt: [
                    ...settings.negative_prompt.split(','),
                    negativePrompts.badQualityPeople,
                ].join(','),
            } : {}),
        } satisfies Data);

        const response = await fetch(`${this.url}/render`, {
            headers: {
                'Content-Type': 'application/json',
            },
            method: 'POST',
            body,
        });

        const json = await response.json() as Online | PythonError;

        // Image failed to render before even starting
        if ('detail' in json) throw new Error('Failed to start render', { cause: new Error(json.detail) });

        // Wait until render is done
        while (true) {
            await sleep(100);

            // Fetch the image itself
            const response = await fetch(`${this.url}${(json as Online).stream}`);
            const body = await response.json().catch(() => null) as ImageResponse;

            // Waiting for the image to start rendering
            if (!body) continue;

            // Image is rendering
            if (!isFinished(body)) {
                if (body.step === undefined) continue;
                this.logger.debug(`Step ${body.step + 1}/${body.total_steps}`);
                continue;
            }

            // If the render failed log that
            if (body.status !== 'succeeded') console.log(body);

            // Image is done
            return body.output.map(output => output.data.split(',')[1]);
        }
    }
}
