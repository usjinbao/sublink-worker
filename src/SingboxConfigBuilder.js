import { SING_BOX_CONFIG, generateRuleSets, generateRules, getOutbounds, PREDEFINED_RULE_SETS} from './config.js';
import { BaseConfigBuilder } from './BaseConfigBuilder.js';
import { DeepCopy } from './utils.js';

export class ConfigBuilder extends BaseConfigBuilder {
    constructor(inputString, selectedRules, customRules, pin, baseConfig) {
        if (baseConfig === undefined) {
            baseConfig = SING_BOX_CONFIG
        }
        super(inputString, baseConfig);
        this.selectedRules = selectedRules;
        this.customRules = customRules;
        this.pin = pin;
    }

    addCustomItems(customItems) {
        const validItems = customItems.filter(item => item != null).map(item => {
            if (item.type === 'hysteria2') {
                return {
                    ...item,
                    hop_ports: item.portRange,
                    hop_interval: item.portRange ? "30s" : undefined,
                    hop_ports_policy: item.portRange ? "random" : undefined,
                    tls: {
                        ...item.tls,
                        enabled: true,
                        server_name: item.sni,
                        alpn: ["h3"],
                        insecure: item.skipCertVerify || false  // 添加证书验证配置
                    },
                    udp_relay: item.udp ?? true,
                    password: item.password || item.auth  // 确保 auth 字段正确传递
                };
            }
            return item;
        });
        this.config.outbounds.push(...validItems);
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

        const proxyList = this.config.outbounds.filter(outbound => outbound?.server != undefined).map(outbound => outbound.tag);

        // 创建高速节点列表（名称包含特定关键字的节点）
        const highSpeedProxies = proxyList.filter(name => 
            name.includes('F') || 
            name.includes('负载') || 
            name.includes('高速') ||
            name.includes('优选')
        );
        // 只有当存在符合条件的节点时才添加负载均衡组
        if (highSpeedProxies.length > 0) {
            // 添加轮询模式负载均衡
            this.config.outbounds.unshift({
                "type": "load_balance",
                "tag": "⚖️ 负载-顺序",
                "strategy": "round_robin", // 采用下划线风格的策略名称
                "outbounds": DeepCopy(highSpeedProxies),
                "healthcheck": {
                    "enabled": true, // 启用健康检查
                    "url": "http://www.google.com/generate_204",
                    "interval": 300s // 用整数表示间隔秒数
                }
            });

            // 添加固定节点负载均衡，这里是最少连接策略
            this.config.outbounds.unshift({
                "type": "load_balance",
                "tag": "⚖️ 负载-主机",
                "strategy": "least_connection",
                "outbounds": DeepCopy(highSpeedProxies),
                "healthcheck": {
                    "enabled": true,
                    "url": "http://www.google.com/generate_204",
                    "interval": 300s
                }
            });
        }

        // 添加自动选择组
        this.config.outbounds.unshift({
            type: "urltest",
            tag: "⚡ 自动选择",
            outbounds: DeepCopy(proxyList),
            url: "http://www.google.com/generate_204",
            interval: "300s"
        });

        // 更新代理列表
        const balancerGroups = highSpeedProxies.length > 0 ? ['⚖️ 负载-顺序', '⚖️ 负载-主机'] : [];
        proxyList.unshift('DIRECT', 'REJECT', '⚡ 自动选择', ...balancerGroups);
        outbounds.unshift('🚀 节点选择','GLOBAL');
        
        outbounds.forEach(outbound => {
            if (outbound !== '🚀 节点选择') {
                this.config.outbounds.push({
                    type: "selector",
                    tag: outbound,
                    outbounds: ['🚀 节点选择', ...proxyList]
                });
            } else {
                this.config.outbounds.unshift({
                    type: "selector",
                    tag: outbound,
                    outbounds: proxyList
                });
            }
        });

        if (Array.isArray(this.customRules)) {
            this.customRules.forEach(rule => {
                this.config.outbounds.push({
                    type: "selector",
                    tag: rule.name,
                    outbounds: ['🚀 节点选择', ...proxyList]
                });
            });
        }

        this.config.outbounds.push({
            type: "selector",
            tag: "🐟 漏网之鱼",
            outbounds: ['🚀 节点选择', ...proxyList]
        });
    }

    formatConfig() {
        const rules = generateRules(this.selectedRules, this.customRules, this.pin);
        const { site_rule_sets, ip_rule_sets } = generateRuleSets(this.selectedRules,this.customRules);
    
        // 移除 global 配置，改为在 experimental 中设置
        this.config.experimental = {
            ...this.config.experimental,
            tcp_connect_timeout: "1s",
            tcp_retry: 5,
            tcp_retry_interval: "1s",
        };
    
        this.config.route.rule_set = [...site_rule_sets, ...ip_rule_sets];

        this.config.route.rules = rules.map(rule => ({
            rule_set: [
              ...(rule.site_rules.length > 0 && rule.site_rules[0] !== '' ? rule.site_rules : []),
              ...(rule.ip_rules.filter(ip => ip.trim() !== '').map(ip => `${ip}-ip`))
            ],
            domain_suffix: rule.domain_suffix,
            domain_keyword: rule.domain_keyword,
            ip_cidr: rule.ip_cidr,
            protocol: rule.protocol,
            outbound: rule.outbound
        }));
        // Add any default rules that should always be present
        this.config.route.rules.unshift(
            { protocol: 'dns', outbound: 'dns-out' },
            { clash_mode: 'direct', outbound: 'DIRECT' },
            { clash_mode: 'global', outbound: 'GLOBAL' }
        );

        this.config.route.auto_detect_interface = true;
        this.config.route.final = '🐟 漏网之鱼';

        return this.config;
    }
}
