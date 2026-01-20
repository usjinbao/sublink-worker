export const SURGE_CONFIG = {
  'general': {
    'allow-wifi-access': false,
    'wifi-access-http-port': 6152,
    'wifi-access-socks5-port': 6153,
    'http-listen': '127.0.0.1:6152',
    'socks5-listen': '127.0.0.1:6153',
    'allow-hotspot-access': false,
    'skip-proxy': '127.0.0.1,192.168.0.0/16,10.0.0.0/8,172.16.0.0/12,100.64.0.0/10,17.0.0.0/8,localhost,*.local,*.crashlytics.com,seed-sequoia.siri.apple.com,sequoia.apple.com',
    'test-timeout': 5,
    'proxy-test-url': 'http://cp.cloudflare.com/generate_204',
    'internet-test-url': 'http://www.apple.com/library/test/success.html',
    'geoip-maxmind-url': 'https://raw.githubusercontent.com/Loyalsoldier/geoip/release/Country.mmdb',
    'ipv6': false,
    'show-error-page-for-reject': true,
    'exclude-simple-hostnames': true,
    'read-etc-hosts': true,
    'always-real-ip': '*.msftconnecttest.com, *.msftncsi.com, *.srv.nintendo.net, *.stun.playstation.net, xbox.*.microsoft.com, *.xboxlive.com, *.logon.battlenet.com.cn, *.logon.battle.net, stun.l.google.com, easy-login.10099.com.cn,*-update.xoyocdn.com, *.prod.cloud.netflix.com, appboot.netflix.com, *-appboot.netflix.com',
    'hijack-dns': '*:53',
    'udp-policy-not-supported-behaviour': 'REJECT',
    'hide-vpn-icon': false,
    // 移除原有的 dns-server/encrypted-dns-server，移到独立 DNS 模块
  },
  'replica': {
    'hide-apple-request': true,
    'hide-crashlytics-request': true,
    'use-keyword-filter': false,
    'hide-udp': false
  },
  // ========== Surge 5 专属 DNS 模块（核心：国内/国外 DNS 分组） ==========
  'dns': {
    // 1. 基础 DNS 服务器（国内，兜底用）
    'nameserver': [
      '223.5.5.5',
      '119.29.29.29',
      '180.184.1.1'
    ],
    // 2. 加密 DNS 服务器（给分组调用）
    'encrypted-nameserver': [
      // 国内加密 DNS
      'AliDNS = doh://223.5.5.5/dns-query',
      'AliDNS-Domain = doh://dns.alidns.com/dns-query',
      // 国外加密 DNS（核心的“国外 DNS 分组”）
      'Cloudflare = doh://cloudflare-dns.com/dns-query',
      'GoogleDNS = doh://dns.google/dns-query'
    ],
    // 3. DNS 分流策略（国内/国外流量用不同 DNS）
    'nameserver-policy': [
      // 国内流量 → 用阿里云加密 DNS
      'GEOIP,CN -> AliDNS',
      'DOMAIN-SET,cn -> AliDNS',
      // 内网流量 → 用系统 DNS
      'IP-CIDR,192.168.0.0/16,DIRECT -> system',
      'IP-CIDR,10.0.0.0/8,DIRECT -> system',
      'IP-CIDR,172.16.0.0/12,DIRECT -> system',
      // 国外流量 → 优先 Cloudflare，备用 Google
      'GEOIP,!CN -> Cloudflare,GoogleDNS',
      'DOMAIN-SET,!cn -> Cloudflare,GoogleDNS',
      // 兜底规则 → 用基础国内 DNS
      'FINAL -> 223.5.5.5'
    ],
    // 保留你原有 DNS 劫持配置
    'hijack': [
      '*:53 -> 127.0.0.1'
    ],
    'enable-dns-cache': true, // 开启 DNS 缓存，提升解析速度
    'ipv6': false // 关闭 IPv6 解析，和 general 保持一致
  }
};