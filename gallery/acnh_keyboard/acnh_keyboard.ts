import * as fs from 'fs'

import axios from 'axios'
import { Client } from 'cchook'
import { BotUtils } from 'telegram-bot-utils/dist/bot'

const OPT = {
    name: 'acnh',
    description: 'Utils for Animal Crossing: New Horizons',
    commands: {
        init: {
            str: 'acnh_init',
            description: '',
        },
        help: {
            str: 'acnh_help',
            description: '',
        },
        keyboard: {
            str: 'acnh_keyboard',
            description: '',
        },
        stop: {
            str: 'acnh_stop',
            description: '',
        },
    },
    actions: {
        keyboarListener: {
            str: 'acnh_keyboard',
            description: '',
        },
    },
    maxMsgLen: 10,
    hookCliOptions: {
        user: 'USERID',
        address: 'https://cchook.youraddress',
        port: 8030,
        password: 'password',
        action: 'acnh_token',
    },
    scriptPath: './acnh_token_getter.js',
    text: {
        dataMissing: `User info not found, using MITM tool to get your token, or using help command to get help.`,
        tokenUpdate: `Token has been updated.`,
        tokenExpire: `Token expired, using MITM tool to renew your token, or using help command to get help.`,
        gamingOffline: `You can only send messages when your AC:NH is online.`,
        userMention: `This script only for user: `,
        keyboardStart: `Keyboard listener for AC:NH has been started.`,
        keyboardStop: `Keyboard listener for AC:NH has been stopped.`,
        version: 'version: ',
    },
}

type appData = {
    initChat?: number
    expireTS: number
    listenerId?: string
    headers: {
        authorization: string
        cookie: string | string[]
    }
}

const checkData = (bot: BotUtils, userId: number, chatId?: number): boolean => {
    const app = bot.application.get(OPT.name)
    const userData = app.dataMan({
        user_id: userId,
    })
    const _data = userData.get() as appData
    if (
        typeof _data == 'undefined' ||
        typeof _data.headers.cookie == 'undefined' ||
        typeof _data.headers.authorization == 'undefined'
    ) {
        bot.api.sendMessage(chatId || userId, OPT.text['dataMissing'])
        userData.clean()
        return false
    }
    if (Date.now() > _data.expireTS) {
        userData.clean()
        bot.api.sendMessage(
            chatId || _data.initChat || userId,
            OPT.text['tokenExpire']
        )
        return false
    }
    return true
}

const sendMessage = async (
    bot: BotUtils,
    text: string,
    userId: number,
    chatId?: number
): Promise<boolean> => {
    if (!checkData(bot, userId, chatId)) return false
    const app = bot.application.get(OPT.name)
    const userData = app.dataMan({
        user_id: userId,
    })
    const _data = userData.get() as appData
    const _cookie =
        typeof _data.headers.cookie == 'string'
            ? _data.headers.cookie
            : Array.isArray(_data.headers.cookie)
            ? _data.headers.cookie.join(';')
            : undefined
    const _text = [text.substr(0, OPT.maxMsgLen), text.substr(OPT.maxMsgLen)]
    return new Promise((resolve) => {
        axios({
            baseURL:
                'https://web.sd.lp1.acbaa.srv.nintendo.net/api/sd/v1/messages',
            method: 'POST',
            data: {
                type: 'keyboard',
                body: _text[0],
            },
            headers: {
                Accept: 'application/json',
                Authorization: _data.headers.authorization,
                Cookie: _cookie,
                'Content-Type': 'application/json',
                'User-Agent':
                    'Mozilla/5.0 (iPhone; CPU iPhone OS 12_4_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
            },
        })
            .then(async (res) => {
                _data.headers.cookie =
                    res.headers['set-cookie'] || res.headers['Set-Cookie']
                userData.set(_data)
                if (_text[1] !== '') {
                    await wait(1500)
                    const _res = await sendMessage(
                        bot,
                        _text[1],
                        userId,
                        chatId
                    )
                    resolve(_res)
                }
                resolve(true)
            })
            .catch((err) => {
                if (err['response']['data']['code'] == 1001) {
                    bot.api.sendMessage(
                        chatId || userId,
                        OPT.text['gamingOffline']
                    )
                    resolve(true)
                }
                resolve(false)
            })
    })
}

const wait = async (timeout: number): Promise<void> => {
    return new Promise((resolve) => {
        setTimeout(() => {
            resolve()
        }, timeout)
    })
}

const ACNH = (bot: BotUtils, options: Optional<typeof OPT>) => {
    assign(OPT, options)
    bot.event.on('ready', () => {
        const cli = new Client({
            user: OPT.hookCliOptions.user,
            address: OPT.hookCliOptions.address,
            port: OPT.hookCliOptions.port,
            password: OPT.hookCliOptions.password,
        })
        cli.start()
        cli.action.on(OPT.hookCliOptions.action, (data) => {
            const _data = { ...data } as {
                request: {
                    body: {
                        [key: string]: string | number | boolean | null
                    }
                    headers: {
                        [key: string]: string
                    }
                }
            }
            const _info = {
                expireTS: 0,
                headers: {
                    authorization: undefined,
                    cookie: undefined,
                },
            } as appData
            const tokenRes = _data.request.body['data']
            const userId = _data.request.body['user_id']
            if (typeof tokenRes == 'string' && typeof userId == 'number') {
                try {
                    const _data = JSON.parse(tokenRes)
                    const _body = JSON.parse(_data['body'])
                    const _headers = _data['headers']
                    _info.headers['authorization'] = `Bearer ${_body['token']}`
                    _info.headers['cookie'] = _headers['Set-Cookie']
                    _info.expireTS = Date.now() + 7200 * 1000
                    const userData = bot.application.get('acnh').dataMan({
                        user_id: userId,
                    })
                    userData.set(_info)
                    bot.api.sendMessage(
                        _info.initChat || userId,
                        OPT.text.tokenUpdate
                    )
                } catch (err) {
                    //
                }
            }
        })
    })

    bot.application.add(OPT.name, {
        is_group_need_bind: true,
        data_bind_with_chat: false,
        data_bind_with_user: true,
    })

    bot.command.add(
        OPT.commands.help.str,
        (info) => {},
        { filter: 'public', description: OPT.commands.help.description },
        { application_name: OPT.name }
    )

    bot.command.add(
        OPT.commands.init.str,
        (info) => {
            const msg = info.message
            const script = fs.readFileSync(OPT.scriptPath).toString()
            const version =
                new RegExp(/const\sversion\s=\s'([\w|\.]{1,})'/, 'gm').exec(
                    script
                )[1] || 'unknown'
            const caption = [] as string[]
            caption.push(OPT.text.version + version)
            caption.push(OPT.text.userMention + msg.from.first_name)
            bot.api.sendDocument(
                msg.from.id,
                Buffer.from(
                    script.replace(
                        'const user_id = 0',
                        `const user_id = ${msg.from.id}`
                    )
                ),
                {
                    caption: caption.join('\n'),
                },
                { filename: 'acnh_token_getter.js' }
            )
        },
        { filter: 'public', description: OPT.commands.init.description },
        { application_name: OPT.name }
    )

    bot.command.add(
        OPT.commands.keyboard.str,
        (info) => {
            const msg = info.message
            if (!checkData(bot, msg.from.id)) return
            bot.messageAction.new(
                OPT.actions.keyboarListener.str,
                msg.chat.id,
                msg.from.id
            )
        },
        {
            filter: 'public',
            description: OPT.commands.keyboard.description,
        },
        { application_name: OPT.name }
    )

    bot.command.add(
        OPT.commands.stop.str,
        (info) => {
            const userData = info.data.user_data
            const _data = userData.get() as appData
            bot.messageAction.record.delete(_data.listenerId)
            bot.api.sendMessage(info.data.user_id, OPT.text.keyboardStop)
        },
        { filter: 'public', description: OPT.commands.stop.description },
        { application_name: OPT.name }
    )

    bot.messageAction.add(
        OPT.actions.keyboarListener.str,
        async (info) => {
            if (!checkData(bot, info.data.user_id)) return true
            const msg = info.message
            const text = msg.text
            if (typeof text != 'string') return false
            return !(await sendMessage(
                bot,
                text,
                info.data.user_id,
                info.data.chat_id
            ))
        },
        {
            init_function: async (info) => {
                bot.api.sendMessage(info.data.chat_id, OPT.text.keyboardStart)
            },
            duplicate_function: async (info) => {
                //
            },
            expire_function: async (info) => {
                bot.api.sendMessage(info.data.chat_id, OPT.text.keyboardStop)
            },
        },
        {
            application_name: OPT.name,
        }
    )
}

export { ACNH as run, OPT as options }

type Optional<T extends object> = {
    [key in keyof T]?: T[key] extends object ? Optional<T[key]> : T[key]
}
const assign = <T extends object>(
    target: Required<T>,
    input: Optional<T>
): void => {
    for (const key of Object.keys(target)) {
        const _val = input[key]
        if (typeof _val != 'undefined') {
            if (_val == null) {
                target[key] = null
                continue
            }
            if (Array.isArray(_val)) {
                for (const i in target[key]) {
                    const __val = _val[i]
                    if (typeof __val == 'undefined') continue
                    if (
                        typeof target[key][i] == 'object' &&
                        !Array.isArray(target) &&
                        target != null
                    ) {
                        assign(target[key][i], _val[i])
                    } else {
                        target[key][i] = __val
                    }
                }
                continue
            }
            if (typeof _val == 'object' && _val != {}) {
                assign(target[key], _val)
                continue
            }
            target[key] = _val
            continue
        }
    }
}
