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
    role!: string;
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

export class Comment {
    id!: number;
    post_id!: number;
    post_title?: string;
    user_id?: number;
    user_name!: string;
    user_email?: string;
    content!: string;
    parent_id?: number;
    parent_user_name?: string;
    status!: number; // 0: 待审核, 1: 已通过, 2: 已拒绝
    ip_address?: string;
    created_time!: number;
    children?: Comment[]; // 子评论列表
}

export class Moment {
    id!: number;
    content!: string;
    images?: string[]; // 图片URL数组
    is_public!: number; // 0: 私密, 1: 公开
    location?: string; // 位置信息
    likes!: number;
    comments!: number;
    created_time!: number;
    update_time?: number;
}

// POST /moment/admin/upload_sign 的返回：浏览器 PUT upload_url 直传对象存储
export class UploadSign {
    upload_url!: string; // 预签名上传链接，5 分钟内有效
    public_url!: string; // 上传成功后图片的公开地址，存进说说
    content_type!: string; // PUT 时的 Content-Type 必须与它完全一致
    expires_at!: number; // 链接过期时间，Unix 毫秒
}
