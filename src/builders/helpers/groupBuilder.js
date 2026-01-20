const normalize = (value) => typeof value === 'string' ? value.trim() : value;

export function uniqueNames(names = []) {
    const seen = new Set();
    const result = [];
    names.forEach(name => {
        if (typeof name !== 'string') return;
        const normalized = normalize(name);
        if (!normalized || seen.has(normalized)) return;
        seen.add(normalized);
        result.push(normalized);
    });
    return result;
}

export function withDirectReject(options = []) {
    return uniqueNames([
        ...options,
        'DIRECT',
        'REJECT'
    ]);
}

export function buildNodeSelectMembers({ proxyList = [], translator, groupByCountry = false, manualGroupName, countryGroupNames = [] }) {
    if (!translator) {
        throw new Error('buildNodeSelectMembers requires a translator function');
    }
    const autoName = translator('outboundNames.Auto Select');
    // Add load balance groups to node select members
    const base = groupByCountry
        ? [
            '⚖️ 负载-顺序',
            '⚖️ 负载-主机',
            autoName,
            ...(manualGroupName ? [manualGroupName] : []),
            ...countryGroupNames
        ]
        : [
            '⚖️ 负载-顺序',
            '⚖️ 负载-主机',
            autoName,
            ...proxyList
        ];
    return withDirectReject(base);
}

export function buildSelectorMembers({ proxyList = [], translator, groupByCountry = false, manualGroupName, countryGroupNames = [] }) {
    if (!translator) {
        throw new Error('buildSelectorMembers requires a translator function');
    }
    const autoName = translator('outboundNames.Auto Select');
    // Add load balance groups to selector members
    const base = groupByCountry
        ? [
            translator('outboundNames.Node Select'),
            autoName,
            '⚖️ 负载-顺序',
            '⚖️ 负载-主机',
            ...(manualGroupName ? [manualGroupName] : []),
            ...countryGroupNames
        ]
        : [
            translator('outboundNames.Node Select'),
            '⚖️ 负载-顺序',
            '⚖️ 负载-主机',
            ...proxyList
        ];
    return withDirectReject(base);
}
