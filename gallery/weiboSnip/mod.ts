import { readFileSync, writeFileSync } from 'fs'

import { BotUtils } from 'telegram-bot-utils/dist/bot'
import { safeMDv2, safeTag, genRandomHex, jpegoptim, wait } from '../utils'

import fetch from 'node-fetch'
import { parse } from 'node-html-parser'

const OPT = {
    name: 'weiboSnip',
    description: 'Weibo link snippet generation',
    text: {
        tag: '微博',
        link: '📄 链接',
        statusDone: '已经完成',
        statusFailed: '失败',
    },
    config: {
        tester: undefined,
        timeout: 2500,
    },
}

type WeiboStatus = {
    text: string
    source: string
    pic_ids: string[]
    user: {
        id: number
        screen_name: string
    }
    page_info?: {
        type: 'article'
        object_type: 5 | number
        icon: string
        page_pic: { height: number; url: string; width: number }
        page_url: string
        page_title: string
        url_ori: string
        content1: string
        content2: string
        author: {
            profile_image_url: string
            screen_name: string
        }
    }
    pics?: {
        pid: string
        url: string
        size: 'orj360'
        geo: {
            width: number
            height: number
            croped: boolean
        }
        large: {
            size: 'large'
            url: string
            geo: {
                width: string
                height: string
                croped: boolean
            }
        }
    }[]
}

const fetchRemote = async (url: string) => {
    return fetch(url)
}

const _LOCAL: { [pendingID: string]: number } = {}

const queryInf = (total: number, done: number, failed: number = 0): string => {
    return (
        '*\\[ LOG \\]*' +
        `\n ${safeMDv2(OPT.text.statusDone + ` (${done}/${total})`)}` +
        `${
            failed > 0
                ? `\n ${safeMDv2(OPT.text.statusFailed + ' ' + failed)}`
                : ''
        }`
    )
}

const msgDel = (bot: BotUtils, _chatId: string | number, _msgId: string) => {
    try {
        bot.api.deleteMessage(_chatId, _msgId)
    } catch {
        bot.api.sendMessage(_chatId, 'unable to delete msg!')
    }
}

const tempSendMedia = async (
    chat_id: string | number,
    url: string,
    mediaType: 'photo' | 'video',
    OID: string,
    list: { [id: string]: string },
    total: number,
    bot: BotUtils,
    notifMsgId?: string
) => {
    const _inf = {
        isFailed: false,
        done: false,
        now: Date.now(),
    }
    try {
        try {
            const res = await bot.api.sendPhoto(
                OPT.config.tester || chat_id,
                url.replace(/\.jpg$/, ''),
                { disable_notification: true }
            )
            list[OID] =
                mediaType == 'photo'
                    ? res.photo.pop().file_id
                    : res.video.file_id

            msgDel(bot, OPT.config.tester || chat_id, res.message_id.toString())
            _inf.done = true
        } catch {
            const resp = await fetchRemote(url)
            const buf = await jpegoptim(await resp.buffer(), 4500)
            const res = await bot.api.sendPhoto(
                OPT.config.tester || chat_id,
                buf,
                {
                    disable_notification: true,
                }
            )
            list[OID] =
                mediaType == 'photo'
                    ? res.photo.pop().file_id
                    : res.video.file_id

            msgDel(bot, OPT.config.tester || chat_id, res.message_id.toString())
            _inf.done = true
        }
    } catch (e) {
        _inf.isFailed = true
        list[OID] = '_'
        _inf.done = true
        bot.api.sendMessage(
            chat_id,
            `*\\[ ERR \\]* weiboSnip: skipped, which was very failed\n${safeMDv2(
                url
            )}\n\`${safeMDv2(e.toString())}\``,
            {
                parse_mode: 'MarkdownV2',
            }
        )
    }
    if (notifMsgId && Date.now() - _LOCAL[notifMsgId] > 400) {
        _LOCAL[notifMsgId] = Date.now()
        const edited = await bot.api.editMessageText(
            queryInf(
                Object.keys(list).length,
                Object.values(list).filter((url) => typeof url == 'string')
                    .length,
                Object.values(list).filter((url) => url == '_').length
            ),
            {
                chat_id: chat_id,
                message_id: parseInt(notifMsgId),
                parse_mode: 'MarkdownV2',
            }
        )
    }
    if (
        Object.values(list).filter((val) => typeof val == 'string').length ==
        total
    ) {
        sendMedia(chat_id, mediaType, list, bot, notifMsgId)
    }
}

const sendMedia = async (
    chat_id: string | number,
    mediaType: 'photo' | 'video',
    list: { [id: string]: string },
    bot: BotUtils,
    notifMsgId?: string
) => {
    if (notifMsgId) {
        setTimeout(() => {
            msgDel(bot, chat_id, notifMsgId)
        }, 1500)
    }
    const pending = Object.values(list).filter((val) => val != '_')
    while (true) {
        await wait(500)
        if (pending.length > 1) {
            const group = pending.splice(0, 10)
            bot.api.sendMediaGroup(
                chat_id,
                group.map((id) => {
                    return {
                        type: mediaType,
                        media: id,
                    }
                })
            )
        } else if (pending.length == 1) {
            bot.api.sendPhoto(chat_id, pending.pop())
        } else {
            break
        }
    }
}

const WBSnip = (bot: BotUtils, options: Optional<typeof OPT> = {}) => {
    assign(OPT, options)
    bot.event.on('ready', () => {
        bot.application.add(OPT.name, {
            is_group_need_bind: false,
            // data_bind_with_user: true,
        })
        bot.api.on('message', async (msg) => {
            const url = msg.text || ''
            const match = url.match(/http[s]?:\/\/m.weibo.cn\/(\d+)\/(\d+)/)
            if (match == null) return
            const resp = await fetch(`https://m.weibo.cn/status/${match[2]}`, {
                method: 'GET',
                headers: {
                    'User-Agent':
                        'Mozilla/5.0 (iPhone; CPU iPhone OS 12_4_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
                },
            })
            const html = await resp.text()
            writeFileSync('dl.html', html)
            try {
                const _script = (
                    html.match(/<script>[\S\s]*?<\/script>/gm) || []
                ).filter((match) => {
                    return match.match(/\$render_data/gm) != null
                })
                if (_script.length != 1) {
                    bot.api.sendMessage(
                        msg.chat.id,
                        `[LOG] weiboSnip: fetch failed\n\`${safeMDv2(
                            'Multiple script matched'
                        )}\``,
                        {
                            parse_mode: 'MarkdownV2',
                        }
                    )
                    return
                }
                const script = _script[0].match(
                    /<script>([\S\s]*?)<\/script>/m
                )[1]
                let _data = {} as { status: WeiboStatus }
                eval(script.replace('var $render_data', '_data'))
                await bot.api.sendMessage(
                    msg.chat.id,
                    `*\\[ ${safeTag(OPT.text.tag)} \\]*\n${safeMDv2(
                        parse(_data.status.text).innerText
                    )}\n[@${safeMDv2(
                        _data.status.user.screen_name
                    )}](https://m.weibo.cn/profile/${_data.status.user.id})`,
                    {
                        parse_mode: 'MarkdownV2',
                        disable_web_page_preview: true,
                        reply_to_message_id: msg.message_id,
                    }
                )
                if (_data.status.page_info) {
                    const page = _data.status.page_info
                    let url: string
                    {
                        const match = page.page_url.match(
                            /weibo\.com\/ttarticle\/p\/show\?id=([^&]+)/
                        )
                        url =
                            match == null
                                ? undefined
                                : match[1]
                                ? `https://card.weibo.com/article/m/show/id/${match[1]}`
                                : undefined
                    }
                    url = url || page.page_url
                    const preview = page.page_pic.url
                    const text = `*${safeMDv2(page.content1)}*${
                        page.content2 ? '\n' + safeMDv2(page.content2) : ''
                    }\n[${safeMDv2(OPT.text.link)}](${url})`
                    if (preview) {
                        bot.api.sendPhoto(msg.chat.id, preview, {
                            caption: text,
                            parse_mode: 'MarkdownV2',
                            disable_notification: false,
                        })
                    } else {
                        bot.api.sendMessage(msg.chat.id, text, {
                            parse_mode: 'MarkdownV2',
                            disable_notification: false,
                        })
                    }
                }
                if (
                    Array.isArray(_data.status.pics) &&
                    _data.status.pics.length
                ) {
                    const pics = _data.status.pics.map((pic) => {
                        const _p = pic.large || pic
                        return {
                            pid: pic.pid,
                            url: _p.url,
                        }
                    })
                    const _INF = await bot.api.sendMessage(
                        msg.chat.id,
                        queryInf(pics.length, 0, 0),
                        {
                            parse_mode: 'MarkdownV2',
                            disable_notification: true,
                        }
                    )
                    const notiID = _INF.message_id.toString()
                    _LOCAL[notiID] = 0
                    const list = {} as { [OID: string]: string }
                    let _pending = 1
                    for (const pic of pics) {
                        const OID = (_pending + 1).toString()
                        _pending += 1
                        list[OID] = undefined
                        setTimeout(() => {
                            tempSendMedia(
                                msg.chat.id,
                                pic.url,
                                'photo',
                                OID,
                                list,
                                pics.length,
                                bot,
                                notiID
                            )
                        }, 50)
                    }
                }
            } catch (e) {
                bot.api.sendMessage(
                    msg.chat.id,
                    `*\\[ LOG \\]* weiboSnip: fetch failed\n\`${safeMDv2(
                        e.toString()
                    )}\``,
                    {
                        parse_mode: 'MarkdownV2',
                    }
                )
            }
        })
    })
}

export { WBSnip as run }

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
