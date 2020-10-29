import { readFileSync, writeFileSync } from 'fs'

import { BotUtils } from 'telegram-bot-utils/dist/bot'
import { safeMDv2, safeTag, genRandomHex, jpegoptim } from '../utils'

import fetch from 'node-fetch'
import { parse } from 'node-html-parser'

const OPT = {
    name: 'weiboSnip',
    description: 'Weibo link snippet generation',
    text: {
        tag: '微博',
    },
    config: {
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
    pics: {
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

const tempSendMedia = async (
    chat_id: string | number,
    // message_id: string | number,
    url: string,
    mediaType: 'photo' | 'video',
    list: string[],
    total: number,
    bot: BotUtils
) => {
    const _TEMPID = genRandomHex(4)
    const _inf = {
        isFailed: false,
        done: false,
        now: Date.now(),
    }
    console.log(`[LOG] {${_TEMPID}} checking: ${url}`)
    const _tempDel = (_chatId: string | number, _msgId: string) => {
        try {
            bot.api.deleteMessage(_chatId, _msgId)
        } catch {
            bot.api.sendMessage(_chatId, 'unable to delete msg!')
        }
    }
    // const _send = mediaType == 'photo' ? bot.api.sendPhoto : bot.api.sendVideo
    try {
        try {
            // const res = await _send(chat_id, url)
            const res = await bot.api.sendPhoto(
                chat_id,
                url.replace(/\.jpg$/, '')
            )
            list.push(
                mediaType == 'photo'
                    ? res.photo.pop().file_id
                    : res.video.file_id
            )
            _tempDel(chat_id, res.message_id.toString())
            _inf.done = true
        } catch {
            _inf.isFailed = true
            const resp = await fetchRemote(url)
            console.log('downloaded...')
            const buf = await jpegoptim(await resp.buffer(), 4500)
            console.log('compressed...')
            const res = await bot.api.sendPhoto(chat_id, buf)
            list.push(
                mediaType == 'photo'
                    ? res.photo.pop().file_id
                    : res.video.file_id
            )
            _tempDel(chat_id, res.message_id.toString())
            _inf.done = true
            console.log(
                `[LOG] {${_TEMPID}} done${
                    _inf.isFailed ? ', which once failed' : ''
                }`
            )
        }
    } catch (e) {
        list.push('_')
        _inf.done = true
        console.log(`[LOG] {${_TEMPID}} done, which was very failed`)
    }
    if (list.length == total) {
        console.log(`[LOG] {${_TEMPID}} finally`)
        sendMedia(chat_id, mediaType, list, bot)
    }
}

const sendMedia = async (
    chat_id: string | number,
    mediaType: 'photo' | 'video',
    list: string[],
    bot: BotUtils
) => {
    list = list.filter((id) => {
        return id != '_'
    })
    while (true) {
        if (list.length > 1) {
            const group = list.splice(0, 10)
            bot.api.sendMediaGroup(
                chat_id,
                group.map((id) => {
                    return {
                        type: mediaType,
                        media: id,
                    }
                })
            )
        } else if (list.length == 1) {
            // const _send =
            //     mediaType == 'photo' ? bot.api.sendPhoto : bot.api.sendVideo
            // _send(chat_id, list.pop())
            bot.api.sendPhoto(chat_id, list.pop())
        } else {
            break
        }
    }
}

const WBSnip = (bot: BotUtils) => {
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
                bot.api.sendMessage(
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
                const pics = _data.status.pics.map((pic) => {
                    const _p = pic.large || pic
                    return _p.url
                })
                const list = []
                // for (const _url of pics.slice(0, 1)) {
                for (const _url of pics) {
                    tempSendMedia(
                        msg.chat.id,
                        _url,
                        'photo',
                        list,
                        pics.length,
                        bot
                    )
                }
            } catch (e) {
                bot.api.sendMessage(
                    msg.chat.id,
                    `[LOG] weiboSnip: fetch failed\n\`${safeMDv2(
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
