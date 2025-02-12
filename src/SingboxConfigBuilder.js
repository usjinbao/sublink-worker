import { SING_BOX_CONFIG， generateRuleSets， generateRules， getOutbounds， PREDEFINED_RULE_SETS} from './config.js';
import { BaseConfigBuilder } from './BaseConfigBuilder.js';
import { DeepCopy } from './utils.js';

export class ConfigBuilder extends BaseConfigBuilder {
    constructor(inputString， selectedRules， customRules， pin， baseConfig) {
        if (baseConfig === undefined) {
            baseConfig = SING_BOX_CONFIG
        }
        super(inputString， baseConfig);
        this。selectedRules = selectedRules;
        this。customRules = customRules;
        this。pin = pin;
    }

    addCustomItems(customItems) {
        const validItems = customItems。filter(item => item != null);
        this。config。outbounds。push(...validItems);
    }

    addSelectors() {
        let outbounds;
        if (typeof this。selectedRules === 'string' && PREDEFINED_RULE_SETS[this。selectedRules]) {
            outbounds = getOutbounds(PREDEFINED_RULE_SETS[this。selectedRules]);
        } else if(this。selectedRules && Object。keys(this。selectedRules)。length > 0) {
            outbounds = getOutbounds(this。selectedRules);
        } else {
            outbounds = getOutbounds(PREDEFINED_RULE_SETS。minimal);
        }

        const proxyList = this。config。outbounds。filter(outbound => outbound?.server != undefined)。map(outbound => outbound。标签);

        this。config。outbounds。unshift({
            type: "urltest"，
            标签: "⚡ 自动选择"，
            outbounds: DeepCopy(proxyList)，
        });

        proxyList。unshift('DIRECT'， 'REJECT'， '⚡ 自动选择');
        outbounds。unshift('🚀 节点选择'，'GLOBAL');
        
        outbounds。forEach(outbound => {
            if (outbound !== '🚀 节点选择') {
                this。config。outbounds。push({
                    type: "selector"，
                    标签: outbound，
                    outbounds: ['🚀 节点选择', ...proxyList]
                });
            } else {
                this。config。outbounds。unshift({
                    type: "selector"，
                    标签: outbound，
                    outbounds: proxyList
                });
            }
        });

        if (Array。isArray(this。customRules)) {
            this。customRules。forEach(rule => {
                this。config。outbounds。push({
                    type: "selector"，
                    标签: rule。name，
                    outbounds: ['🚀 节点选择', ...proxyList]
                });
            });
        }

        this。config。outbounds。push({
            type: "selector"，
            标签: "🐟 漏网之鱼"，
            outbounds: ['🚀 节点选择', ...proxyList]
        });
    }

    formatConfig() {
        const rules = generateRules(this。selectedRules， this。customRules， this。pin);
        const { site_rule_sets， ip_rule_sets } = generateRuleSets(this。selectedRules，this。customRules);

        this。config。route。rule_set = [...site_rule_sets, ...ip_rule_sets];

        this。config。route。rules = rules。map(rule => ({
            rule_set: [
              ...(rule。site_rules。length > 0 && rule。site_rules[0] !== '' ? rule。site_rules : [])，
              ...(rule。ip_rules。filter(ip => ip。trim() !== '')。map(ip => `${ip}-ip`))
            ]，
            domain_suffix: rule。domain_suffix，
            domain_keyword: rule。domain_keyword，
            ip_cidr: rule。ip_cidr，
            protocol: rule。protocol，
            outbound: rule。outbound
        }));
        // Add any default rules that should always be present
        this。config。route。rules。unshift(
            { protocol: 'dns'， outbound: 'dns-out' }，
            { clash_mode: 'direct'， outbound: 'DIRECT' }，
            { clash_mode: 'global'， outbound: 'GLOBAL' }
        );

        this。config。route。auto_detect_interface = true;
        this。config。route。final = '🐟 漏网之鱼';

        return this。config;
    }
}
