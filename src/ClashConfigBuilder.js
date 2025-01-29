import yaml from 'js-yaml';
import { CLASH_CONFIG, generateRules, getOutbounds, PREDEFINED_RULE_SETS } from './config.js';
import { BaseConfigBuilder } from './BaseConfigBuilder.js';
import { DeepCopy } from './utils.js';

export class ClashConfigBuilder extends BaseConfigBuilder {
    constructor(inputString, selectedRules, customRules, pin, baseConfig) {
        if (!baseConfig) {
            baseConfig = CLASH_CONFIG
        }
        super(inputString, baseConfig);
        this.selectedRules = selectedRules;
        this.customRules = customRules;
        this.pin = pin;
    }

    addCustomItems(customItems) {
        customItems.forEach(item => {
            if (item?.tag && !this.config.proxies.some(p => p.name === item.tag)) {
                this.config.proxies.push(this.convertToClashProxy(item));
            }
        });
    }

    addSelectors() {
        let outbounds;
        if (typeof this.selectedRules === 'string' && PREDEFINED_RULE_SETS[this.selectedRules]) {
            outbounds = getOutbounds(PREDEFINED_RULE_SETS[this.selectedRules]);
        } else if(this.selectedRules && Object.keys(this.selectedRules).length > 0) {
            outbounds = getOutbounds(this.selectedRules);
        } else {
            outbounds = getOutbounds(PREDEFINED_RULE_SETS.minimal);
        }

        const proxyList = this.config.proxies.map(proxy => proxy.name);
        
        // 创建高速节点列表（名称包含特定关键字的节点）
        const highSpeedProxies = proxyList.filter(name => 
            name.includes('F') || 
            name.includes('负载') || 
            name.includes('高速') ||
            name.includes('优选')
        );

        // 只有当存在符合条件的节点时才添加负载均衡组
        if (highSpeedProxies.length > 0) {
            this.config['proxy-groups'].push({
                name: '⚖️ 负载-顺序',
                type: 'load-balance',
                strategy: 'round-robin',
                proxies: DeepCopy(highSpeedProxies),
                url: 'http://www.google.com/generate_204',
                interval: 280
            });
        
            this.config['proxy-groups'].push({
                name: '⚖️ 负载-主机',
                type: 'load-balance',
                strategy: 'consistent-hashing',
                proxies: DeepCopy(highSpeedProxies),
                url: 'http://www.google.com/generate_204',
                interval: 280
            });
    
            this.config['proxy-groups'].push({
                name: '⚡ 自动选择',
                type: 'url-test',
                proxies: DeepCopy(proxyList),
                url: 'https://www.gstatic.com/generate_204',
                interval: 280,
                lazy: false
            });
        }
        // 为节点选择组创建完整代理列表（包含负载均衡）
        const nodeSelectProxies = ['⚖️ 负载-顺序', '⚖️ 负载-主机', 'DIRECT', 'REJECT', '⚡ 自动选择', ...proxyList];
        // 为其他选择组创建基础代理列表（不包含负载均衡）
        const basicProxies = ['DIRECT', 'REJECT', '⚡ 自动选择', ...proxyList];
    
        outbounds.unshift('🚀 节点选择');
        
        outbounds.forEach(outbound => {
            if (outbound !== '🚀 节点选择') {
                this.config['proxy-groups'].push({
                    type: "select",
                    name: outbound,
                    proxies: ['🚀 节点选择', ...basicProxies]
                });
            } else {
                this.config['proxy-groups'].unshift({
                    type: "select",
                    name: outbound,
                    proxies: nodeSelectProxies
                });
            }
        });
    
        if (Array.isArray(this.customRules)) {
            this.customRules.forEach(rule => {
                this.config['proxy-groups'].push({
                    type: "select",
                    name: rule.name,
                    proxies: ['🚀 节点选择', ...basicProxies]
                });
            });
        }
    
        this.config['proxy-groups'].push({
            type: "select",
            name: "🐟 漏网之鱼",
            proxies: ['🚀 节点选择', ...basicProxies]
        });
    }
    formatConfig() {
        const rules = generateRules(this.selectedRules, this.customRules, this.pin);

        this.config.rules = rules.flatMap(rule => {
            const siteRules = rule.site_rules[0] !== '' ? rule.site_rules.map(site => `GEOSITE,${site},${rule.outbound}`) : [];
            const ipRules = rule.ip_rules[0] !== '' ? rule.ip_rules.map(ip => `GEOIP,${ip},${rule.outbound},no-resolve`) : [];
            const domainSuffixRules = rule.domain_suffix ? rule.domain_suffix.map(suffix => `DOMAIN-SUFFIX,${suffix},${rule.outbound}`) : [];
            const domainKeywordRules = rule.domain_keyword ? rule.domain_keyword.map(keyword => `DOMAIN-KEYWORD,${keyword},${rule.outbound}`) : [];
            const ipCidrRules = rule.ip_cidr ? rule.ip_cidr.map(cidr => `IP-CIDR,${cidr},${rule.outbound},no-resolve`) : [];
            return [...siteRules, ...ipRules, ...domainSuffixRules, ...domainKeywordRules, ...ipCidrRules];
        });

        // Add the final catch-all rule
        this.config.rules.push('MATCH,🐟 漏网之鱼');

        return yaml.dump(this.config);
    }

    convertToClashProxy(proxy) {
        switch(proxy.type) {
            case 'shadowsocks':
                return {
                    name: proxy.tag,
                    type: 'ss',
                    server: proxy.server,
                    port: proxy.server_port,
                    cipher: proxy.method,
                    password: proxy.password
                };
            case 'vmess':
                return {
                    name: proxy.tag,
                    type: proxy.type,
                    server: proxy.server,
                    port: proxy.server_port,
                    uuid: proxy.uuid,
                    alterId: proxy.alter_id,
                    cipher: proxy.security,
                    tls: proxy.tls?.enabled || false,
                    servername: proxy.tls?.server_name || '',
                    network: proxy.transport?.type || 'tcp',
                    'ws-opts': proxy.transport?.type === 'ws' ? {
                        path: proxy.transport.path,
                        headers: proxy.transport.headers
                    } : undefined
                };
            case 'vless':
                return {
                    name: proxy.tag,
                    type: proxy.type,
                    server: proxy.server,
                    port: proxy.server_port,
                    uuid: proxy.uuid,
                    cipher: proxy.security,
                    tls: proxy.tls?.enabled || false,
                    'client-fingerprint': proxy.tls.utls?.fingerprint,
                    servername: proxy.tls?.server_name || '',
                    network: proxy.transport?.type || 'tcp',
                    'ws-opts': proxy.transport?.type === 'ws' ? {
                        path: proxy.transport.path,
                        headers: proxy.transport.headers
                    }: undefined,
                    'reality-opts': proxy.tls.reality?.enabled ? {
                        'public-key': proxy.tls.reality.public_key,
                        'short-id': proxy.tls.reality.short_id,
                    } : undefined,
                    'grpc-opts': proxy.transport?.type === 'grpc' ? {
                        'grpc-mode': 'gun',
                        'grpc-service-name': proxy.transport.service_name,
                    } : undefined,
                    tfo : proxy.tcp_fast_open,
                    'skip-cert-verify': proxy.tls.insecure,
                    'flow': proxy.flow ?? undefined,
                };
            case 'hysteria2':
                return {
                    name: proxy.tag,
                    type: proxy.type,
                    server: proxy.server,
                    port: proxy.server_port,
                    password: proxy.password,
                    auth: proxy.auth,
                    'skip-cert-verify': proxy.skipCertVerify,
                    sni: proxy.sni,
                    udp: proxy.udp,
                    'port-range': proxy.portRange,
                    'jump-policy': proxy.portRange ? 'random' : undefined,
                    'jump-interval': proxy.portRange ? 30 : undefined,
                };
			case 'trojan':
				return {
                    name: proxy.tag,
                    type: proxy.type,
                    server: proxy.server,
                    port: proxy.server_port,
                    password: proxy.password,
                    cipher: proxy.security,
                    tls: proxy.tls?.enabled || false,
                    'client-fingerprint': proxy.tls.utls?.fingerprint,
                    sni: proxy.tls?.server_name || '',
                    network: proxy.transport?.type || 'tcp',
                    'ws-opts': proxy.transport?.type === 'ws' ? {
                        path: proxy.transport.path,
                        headers: proxy.transport.headers
                    }: undefined,
                    'reality-opts': proxy.tls.reality?.enabled ? {
                        'public-key': proxy.tls.reality.public_key,
                        'short-id': proxy.tls.reality.short_id,
                    } : undefined,
                    'grpc-opts': proxy.transport?.type === 'grpc' ? {
                        'grpc-mode': 'gun',
                        'grpc-service-name': proxy.transport.service_name,
                    } : undefined,
                    tfo : proxy.tcp_fast_open,
                    'skip-cert-verify': proxy.tls.insecure,
                    'flow': proxy.flow ?? undefined,
				}
            case 'tuic':
                return {
                    name: proxy.tag,
                    type: proxy.type,
                    server: proxy.server,
                    port: proxy.server_port,
                    uuid: proxy.uuid,
                    password: proxy.password,
                    'congestion-controller': proxy.congestion,
                    'skip-cert-verify': proxy.tls.insecure,
                    'disable-sni': true,
                    'alpn': proxy.tls.alpn,
                    'sni': proxy.tls.server_name,
                    'udp-relay-mode': 'native',
                };
            default:
                return proxy; // Return as-is if no specific conversion is defined
        }
    }
}
