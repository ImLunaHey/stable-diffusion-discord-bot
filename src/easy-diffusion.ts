import { setTimeout as sleep } from 'node:timers/promises';
import { Logger } from './logger';

type Online = { status: 'Online' | 'LoadingModel', queue: number, stream: string, task: number };
type Step = { step: number, step_time: number, total_steps: number };
type Output = {
    data: string,
    seed: number,
    path_abs: null
};
type Success = { status: 'succeeded', output: Output[] };
type ImageResponse = Success | Step | null;

const isFinished = (body: Step | Success | null): body is Success => {
    if (!body) return false;
    if ('status' in body) return body.status === 'succeeded';
    return false;
};

export class EasyDiffusion {
    private logger = new Logger({ service: 'easy-diffusion' });
    private data: {
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
        session_id: string;
    };

    constructor(private url: string = 'http://localhost:9000') {
        const sessionId = `${new Date().getUTCFullYear()}-${new Date()
            .getUTCMonth()
            .toString()
            .padStart(2, '0')}-${new Date().getUTCDate()}`;
        this.data = {
            prompt: 'a photograph of an astronaut riding a horse',
            seed: 1458359407,
            used_random_seed: true,
            negative_prompt: 'lowres, bad anatomy, bad hands, text, error, missing fingers, extra digit, fewer digits, cropped, worst quality, low quality, normal quality, jpeg artifacts, signature, (((watermark))), username, blurry, face not visible, hat, tattoos',
            num_outputs: 1,
            num_inference_steps: 20,
            guidance_scale: 7.5,
            width: 512,
            height: 512,
            vram_usage_level: 'balanced',
            sampler_name: 'dpmpp_sde',
            use_face_correction: undefined,
            use_stable_diffusion_model: 'realisticVisionV13_v13',
            clip_skip: false,
            tiling: 'none',
            use_vae_model: 'vae-ft-mse-840000-ema-pruned',
            stream_progress_updates: true,
            stream_image_progress: true,
            show_only_filtered_image: true,
            block_nsfw: true,
            output_format: 'png',
            output_quality: 75,
            output_lossless: false,
            metadata_output_format: 'none',
            original_prompt: 'a photograph of an astronaut riding a horse',
            active_tags: [],
            inactive_tags: [],
            session_id: sessionId,
        };
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

    setUsedRandomSeed(usedRandomSeed: boolean): EasyDiffusion {
        this.data.used_random_seed = usedRandomSeed;
        return this;
    }

    setNegativePrompt(negativePrompt: string): EasyDiffusion {
        this.data.negative_prompt = negativePrompt;
        return this;
    }

    setNumOutputs(numOutputs: number): EasyDiffusion {
        this.data.num_outputs = numOutputs;
        return this;
    }

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

    setVRAMUsageLevel(vramUsageLevel: string): EasyDiffusion {
        this.data.vram_usage_level = vramUsageLevel;
        return this;
    }

    setSamplerName(samplerName: string): EasyDiffusion {
        this.data.sampler_name = samplerName;
        return this;
    }

    setUseStableDiffusionModel(useStableDiffusionModel: string): EasyDiffusion {
        this.data.use_stable_diffusion_model = useStableDiffusionModel;
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

    setUseVAEModel(useVAEModel: string): EasyDiffusion {
        this.data.use_vae_model = useVAEModel;
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

    setOutputFormat(outputFormat: string): EasyDiffusion {
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
        this.data.use_face_correction = faceCorrection;
        return this;
    }

    build() {
        return this.data;
    }

    async render() {
        const body = JSON.stringify(this.build());

        const response = await fetch(`${this.url}/render`, {
            headers: {
                'Content-Type': 'application/json',
            },
            method: 'POST',
            body,
        });

        const json = await response.json() as Online;
        while (true) {
            await sleep(100);

            // Fetch the image itself
            const response = await fetch(`http://192.168.1.101:9000${json.stream}`);
            const body = await response.json().catch(() => null) as ImageResponse;

            // Waiting for the image to start rendering
            if (!body) continue;

            // Image is rendering
            if (!isFinished(body)) {
                if (body.step === undefined) continue;
                this.logger.debug(`Step ${body.step + 1}/${body.total_steps}`);
                continue;
            }

            // Image is done
            return body.output.map(output => output.data.split(',')[1]);
        }
    }
}
