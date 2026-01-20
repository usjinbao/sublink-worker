import { CloudflareKVAdapter } from '../adapters/kv/cloudflareKv.js';

export function createCloudflareRuntime(env) {
    return {
        kv: env?.SUBLINK_KV ? new CloudflareKVAdapter(env.SUBLINK_KV) : null,
        assetFetcher: env?.ASSETS ? (request) => env.ASSETS.fetch(request) : null,
        logger: console,
        config: {
            configTtlSeconds: parseNumber(env?.CONFIG_TTL_SECONDS) || undefined,
            shortLinkTtlSeconds: parseNumber(env?.SHORT_LINK_TTL_SECONDS) || null,
            password: env?.PASS || null
        }
    };
}

function parseNumber(value) {
    if (!value) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}
