export class PageInfo {
    page_num!: number;
    page_size!: number;
    total!: number;
    list!: any[];

    constructor() {
        this.page_num = 1;
        this.page_size = 10;
        this.total = 0;
        this.list = [];
    }

}

export class Result {
    code!: number;
    msg!: string;
    obj!: any;
}

export class User {
    id!: number;
    username!: string;
    password?: string;
    nick_name!: string;
    gender!: number;
    avatar_path?: string;
    signature?: string;
    created_time!: number;
    locked!: number;
}

export class Post {
    id?: number;
    title!: string;
    author!: string;
    is_view!: number;
    original_content!: string;
    format_content!: string;
    summary?: string;
    cover_img?: string;
    visits!: number;
    disallow_comment!: number;
    password?: string;
    top_priority!: number;
    likes!: number;
    word_count!: number;
    created_time?: number | Date;
    update_time?: number | Date;
    ////////////////////////////////////////////////
    category?: string;
    tags: PostTag[] = []
}


export class PostTag {
    id?: number;
    name?: string;
    slug?: string;
    description?: string;
}
