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
                type: "load_balance",
                strategy: 'round_robin',
                tag: "⚖️ 负载-顺序",
                outbounds: DeepCopy(highSpeedProxies),
                url: "http://www.google.com/generate_204",
                interval: "60s",
                tolerance: 50
            });

            // 添加固定节点负载均衡（模拟 consistent-hashing）
            this.config.outbounds.unshift({
                type: "load_balance",
                strategy: 'consistent_hashing',
                tag: "⚖️ 负载-主机",
                outbounds: DeepCopy(highSpeedProxies),
                url: "http://www.google.com/generate_204",
                interval: "60s",
                tolerance: 50,
                sticky: true  // 保持连接固定到同一节点
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