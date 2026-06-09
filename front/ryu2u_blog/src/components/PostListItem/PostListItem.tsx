import "./PostListItem.scss"
import {useNavigate} from "react-router";
import {useEffect, useState} from "react";
import {Post} from "../../common/Structs";
import {formatDate} from "../../common/utils";

interface PostListItemProps {
    dir: boolean;
    postItemJson: string;
}

export function PostListItem({dir, postItemJson}: PostListItemProps) {
    const navigate = useNavigate();
    const [post, setPost] = useState(new Post());

    useEffect(() => {
        if (postItemJson) {
            let data = JSON.parse(postItemJson);
            data.created_time = new Date(data.created_time);
            data.update_time = new Date(data.update_time);
            setPost(data);
        }
    }, []);


    const postClick = () => {
        navigate(`/post/${post.id}`);
    }

    return (
        <>
            <div className={dir ? 'post-list-item' : 'post-list-item post-left'}>
                <div className={"post-bg"}>
                    <a onClick={postClick} href={""}>
                        <img alt={"post-alt"} src={post.cover_img ? post.cover_img : "https://ryu2u-1305537946.cos.ap-nanjing.myqcloud.com//5.jpg"}/>
                    </a>
                </div>
                <div className={"recent-post-info"}>
                    <div className="recent-post-kicker">dispatch #{post.id}</div>
                    <div className={"recent-post-title"}>
                        <button type="button" onClick={postClick} className={"recent-post-title-a"}>
                            {post.title}
                        </button>
                    </div>
                    <div className="recent-post-time">
                        <span>发表于 {post.created_time ? formatDate(post.created_time as Date) : ''}</span>
                        <span>更新于 {post.update_time ? formatDate(post.update_time as Date) : ''}</span>
                        <span>{post.category || '未分类'}</span>
                    </div>
                    <div className={"recent-post-summary"}>
                        {post.summary || '这篇文章暂时没有摘要，可以点进去继续阅读全文。'}
                    </div>
                    <button type="button" className="recent-post-readmore" onClick={postClick}>
                        read article
                    </button>
                </div>

            </div>
        </>
    )
}
