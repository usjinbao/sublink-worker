import { parseServerInfo, parseUrlParams, createTlsConfig, createTransportConfig, decodeBase64 } from './utils.js';


export class ProxyParser {
	static parse(url) {
		url = url.trim();
		const type = url.split('://')[0];
		switch(type) {
			case 'ss': return new ShadowsocksParser().parse(url);
			case 'vmess': return new VmessParser().parse(url);
			case 'vless': return new VlessParser().parse(url);
      case 'hysteria2': 
      case 'hy2':
        return new Hysteria2Parser().parse(url);
      case 'http':
      case 'https':
        return HttpParser.parse(url);
      case 'trojan': return new TrojanParser().parse(url);
      case 'tuic': return new TuicParser().parse(url);
		}
	}
	}

	class ShadowsocksParser {
		parse(url) {
			let parts = url.replace('ss://', '').split('#');
			let mainPart = parts[0];
			let tag = parts[1];
			if (tag && tag.includes('%')) {
				tag = decodeURIComponent(tag);
			}

			// Try new format first
			try {
				let [base64, serverPart] = mainPart.split('@');
				// If no @ symbol found, try legacy format
				if (!serverPart) {
					// Decode the entire mainPart for legacy format
					let decodedLegacy = decodeBase64(mainPart);
					// Legacy format: method:password@server:port
					let [methodAndPass, serverInfo] = decodedLegacy.split('@');
					let [method, password] = methodAndPass.split(':');
					let [server, server_port] = this.parseServer(serverInfo);
					
					return this.createConfig(tag, server, server_port, method, password);
				}

				// Continue with new format parsing
				let decodedParts = decodeBase64(base64).split(':');
				let method = decodedParts[0];
				let password = decodedParts.slice(1).join(':');
				let [server, server_port] = this.parseServer(serverPart);

				return this.createConfig(tag, server, server_port, method, password);
			} catch (e) {
				console.error('Failed to parse shadowsocks URL:', e);
				return null;
			}
		}

		// Helper method to parse server info
		parseServer(serverPart) {
			// Match IPv6 address
			let match = serverPart.match(/\[([^\]]+)\]:(\d+)/);
			if (match) {
				return [match[1], match[2]];
			}
			return serverPart.split(':');
		}

		// Helper method to create config object
		createConfig(tag, server, server_port, method, password) {
			return {
				"tag": tag || "Shadowsocks",
				"type": 'shadowsocks',
				"server": server,
				"server_port": parseInt(server_port),
				"method": method,
				"password": password,
				"network": 'tcp',
				"tcp_fast_open": false
			};
		}
	}

	class VmessParser {
		parse(url) {
            let base64 = url.replace('vmess://', '')
            let vmessConfig = JSON.parse(decodeBase64(base64))
            let tls = { "enabled": false }
            let transport = {}
            if (vmessConfig.net === 'ws') {
                transport = {
                    "type": "ws",
                    "path": vmessConfig.path,
                    "headers": { 'Host': vmessConfig.host? vmessConfig.host : vmessConfig.sni  }
                }
                if (vmessConfig.tls !== '') {
                    tls = {
                        "enabled": true,
                        "server_name": vmessConfig.sni,
                        "insecure": false
                    }
                }
            }
            return {
                "tag": vmessConfig.ps,
                "type": "vmess",
                "server": vmessConfig.add,
                "server_port": parseInt(vmessConfig.port),
                "uuid": vmessConfig.id,
                "alter_id": parseInt(vmessConfig.aid),
                "security": vmessConfig.scy || "auto",
                "network": "tcp",
                "tcp_fast_open": false,
                "transport": transport,
                "tls": tls.enabled ? tls : undefined
            }

		}
	}

    class VlessParser {
        parse(url) {
          const { addressPart, params, name } = parseUrlParams(url);
          const [uuid, serverInfo] = addressPart.split('@');
          const { host, port } = parseServerInfo(serverInfo);
      
          const tls = createTlsConfig(params);
          const transport = params.type !== 'tcp' ? createTransportConfig(params) : undefined;
      
          return {
            type: "vless",
            tag: name,
            server: host,
            server_port: port,
            uuid: uuid,
            tcp_fast_open: false,
            tls: tls,
            transport: transport,
            network: "tcp",
            flow: params.flow ?? undefined
          };
        }
      }
      
      class Hysteria2Parser {
    /**
     * 解析 Hysteria2 代理 URL
     * @param {string} url - 待解析的 URL
     * @returns {Object} 解析后的代理配置对象
     */
    parse(url) {
        // 调用 parseUrlParams 函数解析 URL，获取地址部分、参数和名称
        const { addressPart, params, name } = parseUrlParams(url);
        // 将地址部分按 @ 符号分割，获取 UUID 和服务器信息
        const [uuid, serverInfo] = addressPart.split('@');
        // 调用 parseServerInfo 方法解析服务器信息，获取主机、端口和端口范围
        const { host, port, portRange } = this.parseServerInfo(serverInfo);

        // 配置 TLS 信息
        const tls = {
            enabled: true,
            server_name: params.sni,
            insecure: true,
            alpn: ["h3"],
        };

        // 配置混淆信息，如果 URL 参数中包含 obfs-password 则设置混淆类型和密码
        const obfs = {};
        if (params['obfs-password']) {
            obfs.type = params.obfs;
            obfs.password = params['obfs-password'];
        }

        // 定义结果对象，包含基本的代理配置信息
        let result = {
            tag: name,
            type: "hysteria2",
            server: host,
            server_port: port,
            password: uuid,
            tls: tls,
            obfs: obfs,
            up_mbps: 100,
            down_mbps: 100
        };

        // 如果存在端口范围，则将其添加到结果对象中
        if (portRange) {
            result.port_range = portRange;
        }

        return result;
    }

    /**
     * 解析服务器信息，提取主机、端口和端口范围
     * @param {string} serverInfo - 服务器信息字符串
     * @returns {Object} 包含主机、端口和端口范围的对象
     */
    parseServerInfo(serverInfo) {
        // 将服务器信息按 : 符号分割成数组
        const parts = serverInfo.split(':');
        // 主机为数组的第一个元素
        const host = parts[0];
        let port;
        let portRange;

        if (parts.length > 1) {
            // 获取端口部分
            const portPart = parts[1];
            // 查找端口范围分隔符 , 的位置
            const portRangeIndex = portPart.indexOf(',');
            if (portRangeIndex !== -1) {
                // 存在端口范围，提取端口并转换为整数
                port = parseInt(portPart.substring(0, portRangeIndex));
                // 提取端口范围
                portRange = portPart.substring(portRangeIndex + 1);
            } else {
                // 只有端口，将其转换为整数
                port = parseInt(portPart);
            }
        }

        return { host, port, portRange };
    }
}

      class TrojanParser {
	      
        parse(url) {
          const { addressPart, params, name } = parseUrlParams(url);
          const [password, serverInfo] = addressPart.split('@');
          const { host, port } = parseServerInfo(serverInfo);

          const parsedURL = parseServerInfo(addressPart);
          const tls = createTlsConfig(params);
          const transport = params.type !== 'tcp' ? createTransportConfig(params) : undefined;
          return {
            type: 'trojan',
            tag: name,
            server: host,
            server_port: port,
            password: password || parsedURL.username,
            network: "tcp",
            tcp_fast_open: false,
            tls: tls,
            transport: transport,
            flow: params.flow ?? undefined
          };
        }
      }

      class TuicParser {
        
        parse(url) {
          const { addressPart, params, name } = parseUrlParams(url);
          const [userinfo, serverInfo] = addressPart.split('@');
          const { host, port } = parseServerInfo(serverInfo);
          const tls = {
            enabled: true,
            server_name: params.sni,
            alpn: [params.alpn],
            insecure: true,
          };
      
          return {
            tag: name,
            type: "tuic",
            server: host,
            server_port: port,
            uuid: userinfo.split(':')[0],
            password: userinfo.split(':')[1],
            congestion_control: params.congestion_control,
            tls: tls,
            flow: params.flow ?? undefined
          };
        }
      }
      

      class HttpParser {
        static async parse(url) {
            try {
                const response = await fetch(url);
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                const text = await response.text();
                let decodedText;
                try {
                    decodedText = decodeBase64(text.trim());
                    // Check if the decoded text needs URL decoding
                    if (decodedText.includes('%')) {
                        decodedText = decodeURIComponent(decodedText);
                    }
                } catch (e) {
                    decodedText = text;
                    // Check if the original text needs URL decoding
                    if (decodedText.includes('%')) {
                        try {
                            decodedText = decodeURIComponent(decodedText);
                        } catch (urlError) {
                            console.warn('Failed to URL decode the text:', urlError);
                        }
                    }
                }
                return decodedText.split('\n').filter(line => line.trim() !== '');
            } catch (error) {
                console.error('Error fetching or parsing HTTP(S) content:', error);
                return null;
            }
        }
    }
