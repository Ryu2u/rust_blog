
export class PageInfo{
    page_num:number;
    page_size:number;
    total: number;
    list: any[];
}
export class Result{
    code: number;
    msg: string;
    obj: any;
}

export class User {
    id: number;
    username: string;
    password: string;
    nick_name: string;
    gender: number;
    avatar_path?: string;
    signature?: string;
    created_time: number;
    locked: number;
}

export class Post {
    id: number;
    title: string;
    author: string;
    is_view: number;
    original_content: string;
    format_content: string;
    summary?: string;
    cover_img?:string;
    visits: number;
    disallow_comment: number;
    password?: string;
    top_priority: number;
    likes: number;
    word_count: number;
    created_time: number | Date;
    update_time: number | Date;

    ////////////////////////////////////////////////
    category: string;
    tag: string;

}

export interface PoetryData {
    id: string
    content: string
    popularity: number
    origin: {
        title: string
        dynasty: string
        author: string
        content: string[]
        translate: string[]
    },
    matchTags: string[]
    recommendedReason: string
    cacheAt: string
}

export interface PoetryRequestData {
    status: string
    data: PoetryData
    token: string
    ipAddress: string
    warning: null | string
}