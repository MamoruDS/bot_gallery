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
