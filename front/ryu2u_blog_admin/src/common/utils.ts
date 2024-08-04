export const formatDate = (date: Date, format = 'yyyy-MM-dd HH:mm:ss'): string => {
    const year = date.getFullYear()
    const month = date.getMonth() + 1
    const day = date.getDate()
    const hour = date.getHours()
    const minute = date.getMinutes()
    const second = date.getSeconds()
    const formatMap: { [key: string]: any } = {
        yyyy: year.toString(),
        MM: month.toString().padStart(2, '0'),
        dd: day.toString().padStart(2, '0'),
        HH: hour.toString().padStart(2, '0'),
        mm: minute.toString().padStart(2, '0'),
        ss: second.toString().padStart(2, '0')
    }
    return format.replace(/yyyy|MM|dd|HH|mm|ss/g, (match) => formatMap[match])
}

export function getUuid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        var r = (Math.random() * 16) | 0,
            v = c == 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    });
}