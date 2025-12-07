import got, { ExtendOptions, Got } from "got";
import { XMLParser } from "fast-xml-parser";
import { createHash } from "crypto";
import { CookieJar } from 'tough-cookie'
import { publicEncrypt, constants } from "crypto";


const parser = new XMLParser();


const PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAodPTerkUVCYmv28SOfRV\n7UKHVujx/HjCUTAWy9l0L5H0JV0LfDudTdMNPEKloZsNam3YrtEnq6jqMLJV4ASb\n1d6axmIgJ636wyTUS99gj4BKs6bQSTUSE8h/QkUYv4gEIt3saMS0pZpd90y6+B/9\nhZxZE/RKU8e+zgRqp1/762TB7vcjtjOwXRDEL0w71Jk9i8VUQ59MR1Uj5E8X3WIc\nfYSK5RWBkMhfaTRM6ozS9Bqhi40xlSOb3GBxCmliCifOJNLoO9kFoWgAIw5hkSIb\nGH+4Csop9Uy8VvmmB+B3ubFLN35qIa5OG5+SDXn4L7FeAA5lRiGxRi8tsWrtew8w\nnwIDAQAB\n-----END PUBLIC KEY-----`

export class ViettelModem {

    #client: Got
    #cookies = new Map<string, string>()

    constructor(private ip: string, cookie?: string) {
        cookie && cookie.split(";").forEach(c => {
            const [k, v] = c.split("=", 2)
            this.#cookies.set(k.trim(), v.trim())
        })
        const options: ExtendOptions = {
            prefixUrl: `https://${this.ip}/`,
            responseType: "json",
            https: {
                rejectUnauthorized: false
            },
            parseJson: t => {
                try {
                    return JSON.parse(t)
                } catch (e) {
                    try {
                        return parser.parse(t).ajax_response_xml_root
                    } catch (e) {
                        return null
                    }
                }
            },
            cookieJar: new CookieJar(),
            hooks: {
                beforeRequest: [
                    o => {
                        if (o.body) {
                            const deg = createHash("sha256").update(o.body.toString()).digest("hex")
                            const buffer = Buffer.from(deg, "utf8");
                            const encrypted = publicEncrypt(
                                {
                                    key: PUBLIC_KEY,
                                    // JSEncrypt mặc định dùng PKCS1 v1.5
                                    padding: constants.RSA_PKCS1_PADDING,
                                },
                                buffer
                            );
                            o.headers['check'] = encrypted.toString("base64")
                            const cookie = Array.from(this.#cookies.entries()).map(
                                ([k, v]) => `${k}=${v}`
                            ).join("; ")
                            o.headers.cookie = cookie
                        }
                    }
                ],
                afterResponse: [
                    r => {
                        for (const c of r.headers['set-cookie'] || []) {
                            const [k, v] = c.split(";", 1)[0].split("=")
                            this.#cookies.set(k.trim(), v.trim())
                        }
                        return r
                    }
                ]
            }
        }
        this.#client = got.extend(options)
    }

    async get<T>(type: string, tag: string, searchParams: Record<string, string | number> = {} = {}) {
        return await this.#client.get("", {
            searchParams: {
                _type: type,
                _tag: tag,
                __: Date.now(),
                ...searchParams
            }
        }).json<T & { sess_token: string }>()
    }

    async post<T>(type: string, tag: string, form: Record<string, string | number>) {
        return await this.#client.post("", {
            searchParams: {
                _type: type,
                _tag: tag
            },
            form
        }).json<T & { sess_token: string }>()
    }

    async login(username: string, password: string) { 

        const seq = await this.get<number>('loginData', 'login_token')
        const hash = createHash("sha256").update(`${password}${seq}`).digest("hex")

        const rs2 = await this.post<{
            sess_token: string
            loginErrMsg: string
        }>("loginData", "login_entry", {
            action: 'login',
            Password: hash,
            Username: username,
            _sessionTOKEN: ''
        })
        if (rs2.loginErrMsg) throw new Error(`Login failed: ${rs2.loginErrMsg}`)
    }


    async getArpTable() {


        await this.get('menuView', 'arpTable', { Menu3Location: 0 })
        await this.get('menuData', 'arp_arptable_lua.lua')

        const rs = await this.post<{
            IF_ERRORSTR: string
            IF_ERRORID: number
            OBJ_GETARPINST_ID: {
                Instance: Array<{
                    ParaName: string[]
                    ParaValue: string[]
                }>
            }
        }>('menuData', 'arp_arptable_lua.lua', {
            IF_ACTION: 'DISPALL'
        })

        const devices = (rs?.OBJ_GETARPINST_ID?.Instance || []).map(e => {
            return e.ParaName.reduce((p, c, i) => {
                return {
                    ...p,
                    [c.toLowerCase()]: e.ParaValue[i]
                }
            }, {})
        })

        if (rs.IF_ERRORID != 0) throw new Error(`Get ARP Table failed: ${rs.IF_ERRORSTR}`)
        return devices as Array<{
            status: number
            destip: string
            macaddr: string
            interface: string
        }>
    }
}