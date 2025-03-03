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
        const validItems = customItems.filter(item => item != null);
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
        
        // 创建节点关键词 包含以下关键词的节点才会加入到负载均衡组
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
                type: "loadbalance",
                tag: "⚖️ 负载-顺序",
                outbounds: DeepCopy(highSpeedProxies),
                strategy: {
                    type: "round_robin"
                },
                health_check: {
                    enable: true,
                    url: "http://www.google.com/generate_204",
                    interval: "180"
                }
            });

            // 添加固定节点负载均衡（一致性哈希）
            this.config.outbounds.unshift({
                type: "loadbalance",
                tag: "⚖️ 负载-主机",
                outbounds: DeepCopy(highSpeedProxies),
                strategy: {
                    type: "consistent_hash"
                },
                health_check: {
                    enable: true,
                    url: "http://www.google.com/generate_204",
                    interval: "180"
                }
            });

            // 添加自动选择组
            this.config.outbounds.unshift({
                type: "urltest",
                tag: "⚡ 自动选择",
                outbounds: DeepCopy(proxyList),
                url: "http://www.google.com/generate_204",
                interval: "300s"
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