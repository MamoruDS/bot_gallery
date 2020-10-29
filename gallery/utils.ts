import * as fs from 'fs'
import { exec, execSync } from 'child_process'

type Cookie = {
    name: string
    value: string
    Expires?: Date
    'Max-Age'?: string
    Domain?: string
    Path?: string
    Secure?: boolean
    HttpOnly?: boolean
    SameSite?: 'Strict' | 'Lax' | 'None'
}

export type Session = Cookie[]

export const cookieParse = (cookie: string): Cookie => {
    const res = {} as Cookie
    const _cookie = cookie
    const re = new RegExp(/\s?([\w|_|-]+)=([^;]+)/gm)
    const fields = [
        'name',
        'value',
        'Expires',
        'Max-Age',
        'Domain',
        'Path',
        'Secure',
        'HttpOnly',
        'SameSite',
    ]
    while (true) {
        const match = re.exec(_cookie)
        if (match == null) break
        const key = match[1]
        const val = match[2]
        const _field = fields
            .map((_f) => _f.toLocaleLowerCase())
            .indexOf(key.toLocaleLowerCase())
        if (_field == -1) {
            res.name = key
            res.value = val
        } else {
            if (fields[_field] == 'Expires') {
                res[fields[_field]] = Date.parse(val)
            } else {
                res[fields[_field]] = val
            }
        }
    }
    return res
}

const safeMDv2 = (input: string): string => {
    return input.replace(
        /(?<!\\)[\_\*\[\]\(\)\~\`\>\#\+\-\=\|\{\}\.\!]/gm,
        (match, ...M) => {
            return '\\' + match
        }
    )
}

const safeTag = (input: string, nonMD?: boolean): string => {
    input = input.replace(/[\ |\.|\-|\|:|：]/gm, '_')
    input = input.replace(/[\uff00-\uffff|\u0000-\u00ff]/g, (m: string) => {
        return /\w/.exec(m) == null ? '' : m
    })
    const output = '#' + input
    return nonMD ? output : safeMDv2(output)
}

const genRandomChar = (radix: number): string => {
    return Math.floor(Math.random() * radix)
        .toString(radix)
        .toLocaleUpperCase()
}

const genRandomHex = (len: number): string => {
    const id = []
    for (const _ of ' '.repeat(len)) {
        id.push(genRandomChar(16))
    }
    return id.join('')
}

const jpegoptim = async (
    input: Buffer,
    maxSize: number = 4500,
    step: number = 150
): Promise<Buffer> => {
    const name = genRandomHex(12)
    let output: Buffer
    let fix: number = 0
    while (true) {
        try {
            fs.writeFileSync(name, input)
            execSync(`jpegoptim ${name} --size=${Math.round(maxSize + fix)}K`)
            output = fs.readFileSync(name)
        } finally {
            fs.unlinkSync(name)
        }
        if (output.length <= maxSize * 1000) break
        console.log('shrink +1')
        fix -= step
    }
    return output
}

export { jpegoptim }

export { safeMDv2, safeTag, genRandomHex }
