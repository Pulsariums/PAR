import type { Env } from './report';

const gpuName = (): string | null => {
  try {
    const gl = document.createElement('canvas').getContext('webgl');
    const ext = gl?.getExtension('WEBGL_debug_renderer_info');
    return gl && ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : null;
  } catch { return null; }
};

/** Names of rasterisers that run on the CPU. */
export const isSoftwareGpu = (name: string | null): boolean => !!name && /swiftshader|llvmpipe|softpipe|software|basic render/i.test(name);

/** Facts about the machine that change how PAR performs. Nothing that identifies a person or a file. */
export const collectEnv = (longTasks: boolean): Env => {
  const nav = navigator as Navigator & { deviceMemory?: number; userAgentData?: { platform?: string } };
  const gpu = gpuName();
  return {
    userAgent: nav.userAgent,
    platform: nav.userAgentData?.platform || nav.platform || 'unknown',
    cores: nav.hardwareConcurrency || null,
    memoryGB: nav.deviceMemory ?? null,
    dpr: Math.round((window.devicePixelRatio || 1) * 100) / 100,
    screen: `${screen.width}x${screen.height}`,
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    gpu,
    softwareGpu: isSoftwareGpu(gpu),
    longTasks,
  };
};
