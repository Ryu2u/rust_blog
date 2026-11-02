import "./PostListItem.scss"
import {useNavigate} from "react-router";
import {useEffect, useState} from "react";
import {Post} from "../../common/Structs";
import {formatDate} from "../../common/utils";

interface PostListItemProps {
    postItemJson: string;
}

export function PostListItem({postItemJson}: PostListItemProps) {
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
            <article className={"post-list-item"}>
                <div className="post-list-item__meta">
                    <span className="post-list-item__category">{post.category || '未分类'}</span>
                    <span>{post.created_time ? formatDate(post.created_time as Date, 'yyyy-MM-dd') : ''}</span>
                </div>
                <h3 className={"post-list-item__title"}>
                    <button type="button" onClick={postClick}>
                        {post.title}
                    </button>
                </h3>
                <p className={"post-list-item__summary"}>
                    {post.summary || '这篇文章暂时没有摘要，可以点进去继续阅读全文。'}
                </p>
                <div className="post-list-item__footer">
                    {post.word_count ? <span>{post.word_count.toLocaleString()} 字</span> : null}
                    <span>更新于 {post.update_time ? formatDate(post.update_time as Date, 'yyyy-MM-dd') : ''}</span>
                    <button type="button" className="post-list-item__more" onClick={postClick}>
                        阅读全文 →
                    </button>
                </div>
            </article>
        </>
    )
}
