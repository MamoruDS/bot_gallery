import * as fs from 'fs'

import axios from 'axios'
import { Client } from 'cchook'
import { BotUtils } from 'telegram-bot-utils/dist/bot'

const appInfo = {
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
}

const hookAction = 'acnh_token'
const scriptPath = './acnh_token_getter.js'
const infoStr = {
    dataMissing: `User info not found, using MITM tool to get your token, or using command /${appInfo.commands.help.str} to get help.`,
    tokenExpire: `Token expired, using MITM tool to renew your token, or using command /${appInfo.commands.help.str} to get help.`,
    gamingOffline: `You can only send messages when your AC:NH is online.`,
    userMention: `This script only for user: `,
    keyboardStart: `Keyboard listener for AC:NH has been started.`,
    keyboardStop: `Keyboard listener for AC:NH has been stopped.`,
    version: 'version: ',
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

const cchookCli = new Client({
    user: 'USERID',
    address: 'https://cchook.youraddress',
    port: 8030,
    password: 'password',
})

const checkData = (bot: BotUtils, userId: number, chatId?: number): boolean => {
    const app = bot.application.get(appInfo.name)
    const userData = app.dataMan({
        user_id: userId,
    })
    const _data = userData.get() as appData
    if (
        typeof _data == 'undefined' ||
        typeof _data.headers.cookie == 'undefined' ||
        typeof _data.headers.authorization == 'undefined'
    ) {
        bot.api.sendMessage(chatId || userId, infoStr['dataMissing'])
        userData.clean()
        return false
    }
    if (Date.now() > _data.expireTS) {
        userData.clean()
        bot.api.sendMessage(
            chatId || _data.initChat || userId,
            infoStr['tokenExpire']
        )
        return false
    }
}

const sendMessage = async (
    bot: BotUtils,
    text: string,
    userId: number,
    chatId?: number
): Promise<boolean> => {
    if (!checkData(bot, userId, chatId)) return false
    const app = bot.application.get(appInfo.name)
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
    return new Promise((resolve) => {
        axios({
            baseURL:
                'https://web.sd.lp1.acbaa.srv.nintendo.net/api/sd/v1/messages',
            method: 'POST',
            data: {
                type: 'keyboard',
                body: text[0],
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
                if (text[1] !== '') {
                    await wait(1000)
                    const _res = await sendMessage(bot, text[1], userId, chatId)
                    resolve(_res)
                }
                resolve(true)
            })
            .catch((err) => {
                if (err['response']['data']['code'] == 1001) {
                    bot.api.sendMessage(
                        chatId || userId,
                        infoStr['gamingOffline']
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

const ACNH = (bot: BotUtils) => {
    bot.event.on('ready', () => {
        cchookCli.start()
        cchookCli.action.on(hookAction, (data) => {
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
                    userData.set(_info, ['tokenInfo'])
                } catch (err) {
                    //
                }
            }
        })
    })

    bot.application.add(appInfo.name, {
        is_group_need_bind: true,
        data_bind_with_chat: false,
        data_bind_with_user: true,
    })

    bot.command.add(
        appInfo.commands.help.str,
        (info) => {},
        { filter: 'public', description: appInfo.commands.help.description },
        { application_name: appInfo.name }
    )

    bot.command.add(
        appInfo.commands.init.str,
        (info) => {
            const msg = info.message
            const script = fs.readFileSync(scriptPath).toString()
            const version =
                new RegExp(/const\sversion\s=\s'([\w|\.]{1,})'/, 'gm').exec(
                    script
                )[1] || 'unknown'
            const caption = [] as string[]
            caption.push(infoStr.version + version)
            caption.push(infoStr.userMention + msg.from.first_name)
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
        { filter: 'public', description: appInfo.commands.init.description },
        { application_name: appInfo.name }
    )

    bot.command.add(
        appInfo.commands.keyboard.str,
        (info) => {
            const msg = info.message
            if (!checkData(bot, msg.from.id)) return
            bot.messageAction.new(
                appInfo.actions.keyboarListener.str,
                msg.chat.id,
                msg.from.id
            )
        },
        {
            filter: 'public',
            description: appInfo.commands.keyboard.description,
        },
        { application_name: appInfo.name }
    )

    bot.command.add(
        appInfo.commands.stop.str,
        (info) => {
            const userData = info.data.user_data
            const _data = userData.get() as appData
            bot.messageAction.record.delete(_data.listenerId)
            bot.api.sendMessage(info.data.user_id, infoStr.keyboardStop)
        },
        { filter: 'public', description: appInfo.commands.stop.description },
        { application_name: appInfo.name }
    )

    bot.messageAction.add(
        appInfo.actions.keyboarListener.str,
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
                bot.api.sendMessage(info.data.chat_id, infoStr.keyboardStart)
            },
            duplicate_function: async (info) => {
                //
            },
            expire_function: async (info) => {
                bot.api.sendMessage(info.data.chat_id, infoStr.keyboardStop)
            },
        },
        {
            application_name: appInfo.name,
        }
    )
}

export { ACNH }
