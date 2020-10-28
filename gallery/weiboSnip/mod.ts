import { BotUtils } from 'telegram-bot-utils/dist/bot'
import fetch from 'node-fetch'
import { parse } from 'node-html-parser'
import { safeMDv2, safeTag } from '../utils'
import { writeFileSync } from 'fs'

const OPT = {
    name: 'weiboSnip',
    description: 'Weibo link snippet generation',
    text: {
        tag: '微博',
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

export const fetchRemote2Buf = async (url) => {
    const res = await fetch(url)
    return await res.buffer()
}

const WBSnip = (bot: BotUtils) => {
    bot.event.on('ready', () => {
        bot.application.add(OPT.name, {
            is_group_need_bind: false,
            // data_bind_with_user: true,
        })
        bot.api.on('message', async (msg) => {
            const url = msg.text || ''
            const match = url.match(/https:\/\/m.weibo.cn\/(\d+)\/(\d+)/)
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
                const photos = _data.status.pics.slice(0, 10).map((pic) => {
                    const _p = pic.large || pic
                    return {
                        type: 'photo',
                        media: _p.url,
                    }
                })
                const _cached: Buffer[] = []
                for (const _p of photos) {
                    console.log(_p)
                    _cached.push(await fetchRemote2Buf(_p.media))
                }
                const ids: string[] = []
                for (const buf of _cached) {
                    const res = await bot.api.sendPhoto(msg.chat.id, buf)
                    ids.push(res.photo.pop().file_id)
                    bot.api.deleteMessage(
                        msg.chat.id,
                        res.message_id.toString()
                    )
                }
                if (ids.length > 1) {
                    bot.api.sendMediaGroup(
                        msg.chat.id,
                        ids.slice(0, 10).map((_id) => {
                            return {
                                type: 'photo',
                                media: _id,
                            }
                        })
                    )
                } else {
                    bot.api.sendPhoto(msg.chat.id, ids[0])
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
