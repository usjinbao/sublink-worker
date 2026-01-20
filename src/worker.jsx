import { createApp } from './app/createApp.jsx';
import { createCloudflareRuntime } from './runtime/cloudflare.js';

let honoApp;

function getApp(env) {
    if (!honoApp) {
        const runtime = createCloudflareRuntime(env);
        // 将env直接传递给createApp，以便访问环境变量
        honoApp = createApp({ ...runtime, ...env });
    }
    return honoApp;
}

export default {
    fetch(request, env, ctx) {
        const app = getApp(env);
        return app.fetch(request, env, ctx);
    }
};
